import { describe, expect, it } from "vitest";

import { evaluateAttempt } from "./evaluateAttempt";
import type { ExerciseV1 } from "./model";

const exercise: ExerciseV1 = {
  schemaVersion: 1,
  id: "exercise-1",
  title: "Centro",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  acceptedMoves: ["e2e4", "d2d4"],
  hints: { concept: "Controla el centro.", destination: "Mira e4." },
  difficulty: 3,
  timeLimitMs: 60_000,
};

describe("evaluateAttempt", () => {
  it("acepta UCI equivalente normalizada y produce calidad máxima", () => {
    const result = evaluateAttempt({
      exercise,
      move: "E2E4",
      elapsedMs: 1_000,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        move: "e2e4",
        legal: true,
        correct: true,
        timedOut: false,
        elapsedMs: 1_000,
        hintsUsed: [],
        penalty: 0,
        score: 5,
        quality: 5,
      },
    });
  });

  it("distingue jugada legal incorrecta, ilegal y timeout", () => {
    const wrong = evaluateAttempt({ exercise, move: "e2e3", elapsedMs: 1_000 });
    const illegal = evaluateAttempt({
      exercise,
      move: "e2e5",
      elapsedMs: 1_000,
    });
    const timeout = evaluateAttempt({
      exercise,
      move: "e2e4",
      elapsedMs: 60_000,
    });

    expect(wrong).toMatchObject({
      ok: true,
      value: { legal: true, correct: false, score: 0, quality: 0 },
    });
    expect(illegal).toMatchObject({
      ok: true,
      value: { legal: false, correct: false, quality: 0 },
    });
    expect(timeout).toMatchObject({
      ok: true,
      value: { timedOut: true, correct: false, quality: 2 },
    });
  });

  it("descuenta una unidad por cada pista y conserva la calidad del scheduler", () => {
    const result = evaluateAttempt({
      exercise,
      move: "e2e4",
      elapsedMs: 1_000,
      hintsUsed: ["concept", "destination"],
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        correct: true,
        hintsUsed: ["concept", "destination"],
        penalty: 2,
        score: 3,
        quality: 3,
      },
    });
  });

  it("rechaza una secuencia de pistas inválida", () => {
    const result = evaluateAttempt({
      exercise,
      move: "e2e4",
      elapsedMs: 1_000,
      hintsUsed: ["engine", "concept"],
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_ATTEMPT" },
    });
  });

  it("rechaza tiempo negativo sin cambiar el ejercicio", () => {
    const result = evaluateAttempt({ exercise, move: "e2e4", elapsedMs: -1 });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_ATTEMPT" },
    });
    expect(exercise.acceptedMoves).toEqual(["e2e4", "d2d4"]);
  });
});
