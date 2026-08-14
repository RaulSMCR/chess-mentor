import { describe, expect, it } from "vitest";

import { calculateHintPenalty, requestHint, type HintLevel } from "./hints";
import type { ExerciseV1 } from "./model";

const exercise: ExerciseV1 = {
  schemaVersion: 1,
  id: "exercise-1",
  title: "Centro",
  fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  acceptedMoves: ["e2e4", "d2d4"],
  hints: {
    concept: "Mejora el control del centro.",
    destination: "Considera la casilla e4.",
  },
  difficulty: 3,
  timeLimitMs: 60_000,
};

describe("trainer hints", () => {
  it("sirve pistas en orden, penaliza una vez por nivel y solo engine revela UCI", () => {
    const concept = requestHint(exercise, "concept");
    expect(concept).toEqual({
      ok: true,
      value: {
        level: "concept",
        text: "Mejora el control del centro.",
        penalty: 1,
        totalPenalty: 1,
        hintsUsed: ["concept"],
      },
    });

    const destination = requestHint(exercise, "destination", ["concept"]);
    expect(destination).toMatchObject({
      ok: true,
      value: { totalPenalty: 2, hintsUsed: ["concept", "destination"] },
    });
    if (destination.ok) expect(destination.value.text).not.toContain("e2e4");

    const engine = requestHint(exercise, "engine", ["concept", "destination"]);
    expect(engine).toMatchObject({
      ok: true,
      value: {
        text: "Mejor jugada aceptada: e2e4",
        totalPenalty: 3,
      },
    });
  });

  it("rechaza saltos y repeticiones sin modificar la secuencia previa", () => {
    const previous: HintLevel[] = ["concept"];
    expect(requestHint(exercise, "engine", previous)).toMatchObject({
      ok: false,
      error: { code: "INVALID_HINT_SEQUENCE" },
    });
    expect(requestHint(exercise, "concept", previous)).toMatchObject({
      ok: false,
      error: { code: "INVALID_HINT_SEQUENCE" },
    });
    expect(previous).toEqual(["concept"]);
  });

  it("calcula penalización sin aleatoriedad", () => {
    expect(calculateHintPenalty([])).toBe(0);
    expect(calculateHintPenalty(["concept", "destination"])).toBe(2);
  });
});
