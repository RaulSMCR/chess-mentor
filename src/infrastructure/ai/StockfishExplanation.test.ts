import { describe, expect, it } from "vitest";

import type { EngineLine } from "../../engine/EngineAdapter";
import { verifyStructuredResponse } from "./StructuredClaimsVerifier";
import {
  createStockfishExplanation,
  type StockfishExplanationInput,
} from "./StockfishExplanation";

const baseLine: EngineLine = {
  multipv: 1,
  depth: 12,
  score: { kind: "cp", value: 42 },
  pv: ["e2e4", "e7e5", "g1f3"],
  bestmove: "e2e4",
};

function input(overrides: Partial<StockfishExplanationInput> = {}) {
  return {
    responseId: "fixture-engine-explanation",
    sideToMove: "w" as const,
    line: baseLine,
    ...overrides,
  };
}

describe("StockfishExplanation", () => {
  it("produce claims engine sin citas bibliograficas y conserva la PV", () => {
    const explanation = createStockfishExplanation(input());

    expect(explanation).toMatchObject({
      version: "stockfish-explanation-v1",
      source: "engine",
      line: baseLine,
    });
    expect(explanation.response.citations).toEqual([]);
    expect(explanation.response.claims).toHaveLength(3);
    expect(explanation.response.claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "engine", citationIds: [] }),
      ]),
    );
    expect(explanation.response.answer).toContain("e2-e4");
    expect(explanation.response.claims[0]?.text).toContain("42 centipeones");
    expect(verifyStructuredResponse(explanation.response, [])).toMatchObject({
      status: "verified",
      issues: [],
    });
  });

  it("interpreta mate y perspectiva negra sin atribuirlo a una fuente", () => {
    const explanation = createStockfishExplanation(
      input({
        responseId: "fixture-mate-black",
        sideToMove: "b",
        line: {
          ...baseLine,
          score: { kind: "mate", value: -3 },
          pv: ["e7e5", "g1f3"],
          bestmove: "e7e5",
        },
      }),
    );

    expect(explanation.response.claims[0]?.text).toContain(
      "mate en 3 para negras",
    );
    expect(explanation.response.claims[0]?.text).toContain(
      "El turno es de negras",
    );
    expect(
      explanation.response.claims.every((claim) => claim.type === "engine"),
    ).toBe(true);
  });

  it("devuelve unsupported si Stockfish no entrega una PV utilizable", () => {
    const explanation = createStockfishExplanation(
      input({
        responseId: "fixture-no-line",
        line: { ...baseLine, pv: [], bestmove: "0000" },
      }),
    );

    expect(explanation.response).toMatchObject({
      answer:
        "No hay una linea utilizable de Stockfish para construir una explicacion pedagogica.",
      citations: [],
    });
    expect(explanation.response.claims).toEqual([
      expect.objectContaining({ type: "unsupported", citationIds: [] }),
    ]);
  });

  it("es determinista, no muta la entrada y rechaza lineas invalidas", () => {
    const original = JSON.parse(
      JSON.stringify(input()),
    ) as StockfishExplanationInput;
    const first = createStockfishExplanation(input());
    const second = createStockfishExplanation(input());

    expect(first).toEqual(second);
    expect(input()).toEqual(original);
    expect(() =>
      createStockfishExplanation(
        input({ line: { ...baseLine, bestmove: "e2e9" } }),
      ),
    ).toThrowError(
      expect.objectContaining({
        code: "STOCKFISH_EXPLANATION_INVALID_INPUT",
      }),
    );
  });
});
