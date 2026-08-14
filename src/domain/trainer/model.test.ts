import { describe, expect, it } from "vitest";

import {
  DEFAULT_TRAINER_TIME_LIMIT_MS,
  createExercise,
  isLegalTrainerUci,
  normalizeTrainerUci,
  validateExercise,
} from "./model";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function exercise(overrides: Record<string, unknown> = {}) {
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

describe("trainer exercise model", () => {
  it("canonicaliza FEN, IDs, título y orden del conjunto de jugadas", () => {
    const result = validateExercise(
      exercise({
        id: " exercise-1 ",
        title: " Centro ",
        acceptedMoves: ["D2D4", "e2e4"],
      }),
    );

    expect(result).toEqual({
      ok: true,
      value: {
        ...exercise({
          id: "exercise-1",
          title: "Centro",
          acceptedMoves: ["d2d4", "e2e4"],
        }),
      },
    });
  });

  it("aplica el límite predeterminado al crear un ejercicio", () => {
    const result = createExercise({
      id: "exercise-1",
      title: "Centro",
      fen: FEN,
      acceptedMoves: ["e2e4"],
      hints: { concept: "Centro.", destination: "e4." },
      difficulty: 1,
    });

    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value.timeLimitMs).toBe(DEFAULT_TRAINER_TIME_LIMIT_MS);
  });

  it("conserva null como ejercicio sin límite", () => {
    const result = createExercise({
      id: "exercise-1",
      title: "Centro",
      fen: FEN,
      acceptedMoves: ["e2e4"],
      hints: { concept: "Centro.", destination: "e4." },
      difficulty: 1,
      timeLimitMs: null,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.timeLimitMs).toBeNull();
  });

  it("rechaza FEN, dificultad, duplicados y jugadas ilegales", () => {
    expect(validateExercise(exercise({ fen: "not-a-fen" })).ok).toBe(false);
    expect(validateExercise(exercise({ difficulty: 6 })).ok).toBe(false);
    expect(
      validateExercise(exercise({ acceptedMoves: ["e2e4", "E2E4"] })).ok,
    ).toBe(false);
    expect(validateExercise(exercise({ acceptedMoves: ["e2e5"] })).ok).toBe(
      false,
    );
    expect(
      validateExercise(exercise({ hints: { concept: "", destination: "e4" } }))
        .ok,
    ).toBe(false);
  });

  it("normaliza promociones y comprueba legalidad desde el FEN", () => {
    const promotionFen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
    expect(normalizeTrainerUci(" A7A8N ")).toBe("a7a8n");
    expect(isLegalTrainerUci(promotionFen, "a7a8n")).toBe(true);
    expect(isLegalTrainerUci(promotionFen, "a7a8k")).toBe(false);
  });
});
