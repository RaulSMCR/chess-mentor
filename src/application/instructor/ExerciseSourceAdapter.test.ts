import { describe, expect, it } from "vitest";

import { createExercise } from "@/domain/trainer/model";
import { createInitialSchedule } from "@/domain/trainer/scheduler";
import { extractPgnDocument } from "@/infrastructure/library/pgn/PgnDocumentExtractor";
import type { TrainerExerciseRecordV1 } from "@/infrastructure/trainer/TrainerRepository";
import {
  adaptExerciseSource,
  adaptLibraryEntry,
  adaptPgnDocument,
  adaptTrainerRecord,
} from "./ExerciseSourceAdapter";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const TIMESTAMP = "2026-08-19T12:00:00.000Z";

function libraryEntry() {
  return {
    importKey: "txt-v1:fixture-hash",
    extractorVersion: "txt-v1",
    source: {
      sha256: "a".repeat(64),
      sizeBytes: 123,
      mediaType: "text/plain",
      fileName: "fixture.txt",
    },
    title: "Fixture bibliografica",
    confidence: "high" as const,
    reviewStatus: "approved" as const,
    chunks: [],
  };
}

function pgnDocument() {
  const input = new TextEncoder().encode(
    [
      '[Event "Fixture PGN"]',
      '[Site "Local"]',
      '[Date "2026.08.19"]',
      '[Round "1"]',
      '[White "Alice"]',
      '[Black "Bob"]',
      '[Result "*"]',
      '[Source "Fixture book"]',
      '[SourceVersion "1"]',
      "",
      "1. e4 (1. d4 d5) e5 *",
    ].join("\n"),
  );
  let id = 0;
  return extractPgnDocument(
    input,
    {
      idFactory: () => `pgn-${id++}`,
      clock: () => TIMESTAMP,
    },
    { fileName: "fixture.pgn" },
  );
}

function trainerRecord(): TrainerExerciseRecordV1 {
  const exercise = createExercise({
    id: "exercise-1",
    title: "Desarrollo",
    fen: AFTER_E4_FEN,
    acceptedMoves: ["b8c6"],
    hints: { concept: "Desarrolla.", destination: "Mira f3." },
    difficulty: 2,
  });
  const schedule = createInitialSchedule(() => TIMESTAMP);
  if (!exercise.ok || !schedule.ok) throw new Error("fixture invalida");
  return { exercise: exercise.value, schedule: schedule.value, attempts: [] };
}

describe("ExerciseSourceAdapter", () => {
  it("normaliza una entrada bibliografica sin aprobar el candidato", () => {
    const input = {
      entry: libraryEntry(),
      candidateId: "candidate-1",
      rootFen: STANDARD_FEN,
      fen: AFTER_E4_FEN,
      line: ["E2E4"],
      locator: { chapter: "opening", offset: 42 },
    };
    const result = adaptLibraryEntry(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      schemaVersion: 1,
      candidateVersion: "exercise-source-candidate-v1",
      id: "candidate-1",
      title: "Fixture bibliografica",
      fen: AFTER_E4_FEN,
      line: ["e2e4"],
      status: "draft",
      locator: {
        kind: "library-entry",
        importKey: "txt-v1:fixture-hash",
        locator: { chapter: "opening", offset: 42 },
      },
      source: {
        kind: "library",
        id: "txt-v1:fixture-hash",
        version: "txt-v1",
        sha256: "a".repeat(64),
      },
    });
    expect(Object.isFrozen(result.value[0])).toBe(true);
    expect(input.line).toEqual(["E2E4"]);
  });

  it("rechaza una linea que no reproduce el FEN declarado", () => {
    const result = adaptLibraryEntry({
      entry: libraryEntry(),
      candidateId: "candidate-1",
      rootFen: STANDARD_FEN,
      fen: STANDARD_FEN,
      line: ["e2e4"],
      locator: { chapter: "opening" },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "EXERCISE_SOURCE_INVALID_LINE" },
    });
  });

  it("expande el PGN en posiciones y conserva el orden de variantes, hash y locator", () => {
    const document = pgnDocument();
    const result = adaptPgnDocument(document);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(1);
    expect(result.value[0]).toMatchObject({ line: [], locator: { ply: 0 } });
    expect(result.value.map((candidate) => candidate.line.join(" "))).toEqual([
      "",
      "e2e4",
      "e2e4 e7e5",
      "d2d4",
      "d2d4 d7d5",
    ]);
    expect(
      result.value.every(
        (candidate) =>
          candidate.status === "draft" &&
          candidate.source.kind === "pgn_repository" &&
          candidate.source.sha256 === document.source.sha256,
      ),
    ).toBe(true);
    expect(result.value[3]?.locator).toMatchObject({
      kind: "pgn-game-position",
      gameIndex: 0,
      ply: 1,
    });
  });

  it("conserva identidad, version y ejercicio del repositorio del entrenador", () => {
    const result = adaptTrainerRecord(trainerRecord());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toMatchObject({
      id: "trainer:exercise-1",
      fen: AFTER_E4_FEN,
      line: [],
      status: "draft",
      locator: { kind: "trainer-exercise", exerciseId: "exercise-1" },
      source: {
        kind: "trainer_repository",
        id: "exercise-1",
        version: "trainer-v1",
        schemaVersion: 1,
        sha256: null,
        exercise: { id: "exercise-1", schemaVersion: 1 },
      },
    });
  });

  it("expone una frontera extensible y errores tipados", () => {
    const library = adaptExerciseSource({
      kind: "library",
      input: {
        entry: libraryEntry(),
        candidateId: "candidate-2",
        rootFen: STANDARD_FEN,
        fen: AFTER_E4_FEN,
        line: ["e2e4"],
        locator: { chapter: "opening" },
      },
    });
    expect(library.ok).toBe(true);

    const unsupported = adaptExerciseSource({
      kind: "unknown",
    } as unknown as Parameters<typeof adaptExerciseSource>[0]);
    expect(unsupported).toMatchObject({
      ok: false,
      error: { code: "EXERCISE_SOURCE_INVALID_INPUT" },
    });

    const invalidTrainer = adaptTrainerRecord({
      ...trainerRecord(),
      exercise: { ...trainerRecord().exercise, fen: "not-a-fen" },
    });
    expect(invalidTrainer).toMatchObject({
      ok: false,
      error: { code: "EXERCISE_SOURCE_INVALID_TRAINER" },
    });
  });
});
