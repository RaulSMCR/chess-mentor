import { describe, expect, it } from "vitest";

import {
  createExerciseV2,
  isPracticeEligibleExerciseV2,
  migrateExerciseV1,
  validateExerciseV2,
} from "./model-v2";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const REVIEWED_AT = "2026-08-19T12:00:00.000Z";

function legacyExercise(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: "exercise-1",
    title: "Centro",
    fen: FEN,
    acceptedMoves: ["e2e4", "d2d4"],
    hints: { concept: "Controla el centro.", destination: "Mira e4." },
    difficulty: 3,
    timeLimitMs: 60_000,
    ...overrides,
  };
}

function sourcedInput() {
  return {
    id: "exercise-2",
    title: "Respuesta central",
    fen: FEN,
    acceptedMoves: ["e2e4"],
    hints: { concept: "Control del centro.", destination: "Casilla e4." },
    difficulty: 3 as const,
    origin: "library" as const,
    originRefId: "book-1",
    sourceRefs: [
      {
        id: "book-1",
        kind: "library" as const,
        title: "Fixture bibliografico",
        citationIds: ["citation-1"],
      },
    ],
    counterpartReplies: [
      {
        id: "reply-source",
        nodeId: "root-1",
        uci: "e2e4",
        origin: "source" as const,
        sourceRefId: "book-1",
      },
      {
        id: "reply-engine",
        nodeId: "root-1",
        uci: "e2e4",
        origin: "engine" as const,
        analysisId: "analysis-1",
      },
    ],
  };
}

describe("ExerciseV2", () => {
  it("crea un borrador inmutable con procedencia separada", () => {
    const input = sourcedInput();
    const result = createExerciseV2(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toMatchObject({
      schemaVersion: 2,
      exerciseVersion: "exercise-v2",
      origin: "library",
      originRefId: "book-1",
      review: { status: "draft" },
    });
    expect(result.value.counterpartReplies).toHaveLength(2);
    expect(result.value.counterpartReplies[0]?.origin).toBe("source");
    expect(result.value.counterpartReplies[1]?.origin).toBe("engine");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.sourceRefs)).toBe(true);
    expect(input.sourceRefs[0]?.title).toBe("Fixture bibliografico");
  });

  it("exige citas para autor y nodo para una sesion", () => {
    const author = sourcedInput();
    const authorResult = createExerciseV2({
      ...author,
      origin: "author_theory",
      sourceRefs: [
        { ...author.sourceRefs[0]!, kind: "author_theory", citationIds: [] },
      ],
    });
    expect(authorResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_EXERCISE_SOURCE" },
    });

    const sessionResult = createExerciseV2({
      ...sourcedInput(),
      origin: "instructor_session",
      originRefId: "session-1",
    });
    expect(sessionResult).toMatchObject({
      ok: false,
      error: { code: "INVALID_EXERCISE_ORIGIN" },
    });
  });

  it("valida respuestas legales sin fusionar su procedencia", () => {
    const valid = createExerciseV2(sourcedInput());
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;

    const approved = validateExerciseV2({
      ...valid.value,
      review: {
        status: "approved",
        reviewerId: "reviewer-1",
        reviewedAt: REVIEWED_AT,
        reason: "Revisado con la fuente conservada.",
      },
    });

    expect(approved.ok).toBe(true);
    if (approved.ok)
      expect(isPracticeEligibleExerciseV2(approved.value)).toBe(true);

    expect(
      validateExerciseV2({
        ...valid.value,
        counterpartReplies: [
          {
            id: "reply-source",
            nodeId: "root-1",
            uci: "e2e5",
            origin: "source",
            sourceRefId: "book-1",
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_EXERCISE_COUNTERPART" },
    });

    expect(
      validateExerciseV2({
        ...valid.value,
        counterpartReplies: [
          {
            id: "reply-source",
            nodeId: "root-1",
            uci: "e2e4",
            origin: "source",
            sourceRefId: "missing-book",
          },
        ],
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_EXERCISE_COUNTERPART" },
    });
  });

  it("no permite crear directamente un ejercicio aprobado", () => {
    expect(
      createExerciseV2({
        ...sourcedInput(),
        review: {
          status: "approved",
          reviewerId: "reviewer-1",
          reviewedAt: REVIEWED_AT,
          reason: "No debe aprobarse durante la creacion.",
        } as never,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_EXERCISE_REVIEW" },
    });
  });

  it("migra V1 sin mutarlo ni inventar fuentes o continuaciones", () => {
    const input = legacyExercise({
      id: " exercise-legacy ",
      title: " Centro legado ",
      acceptedMoves: ["D2D4", "e2e4"],
    });
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;

    const first = migrateExerciseV1(input);
    const second = migrateExerciseV1(input);

    expect(first).toEqual(second);
    expect(input).toEqual(snapshot);
    expect(first).toMatchObject({
      ok: true,
      value: {
        schemaVersion: 2,
        exerciseVersion: "exercise-v2",
        id: "exercise-legacy",
        title: "Centro legado",
        origin: "legacy_manual",
        originRefId: null,
        originNodeId: null,
        sourceRefs: [],
        counterpartReplies: [],
        review: { status: "draft" },
      },
    });
  });

  it("rechaza V1 invalido y conserva la compatibilidad del validador V1", () => {
    expect(
      migrateExerciseV1(legacyExercise({ acceptedMoves: ["e2e5"] })),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_LEGACY_EXERCISE" },
    });

    const legacy = legacyExercise();
    const migrated = migrateExerciseV1(legacy);
    expect(migrated.ok).toBe(true);
    if (migrated.ok) {
      expect(migrated.value.acceptedMoves).toEqual(["d2d4", "e2e4"]);
      expect(Object.isFrozen(migrated.value)).toBe(true);
    }
  });
});
