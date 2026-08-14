import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import type { AnalysisRequest, EngineLine } from "./EngineAdapter";
import { FakeEngineAdapter } from "./FakeEngineAdapter";
import { compareMove, isLegalUciMove, normalizeUciMove } from "./compareMove";

const STANDARD_FEN = new Chess().fen();

async function collect(
  iterable: AsyncIterable<EngineLine>,
): Promise<EngineLine[]> {
  const lines: EngineLine[] = [];
  for await (const line of iterable) lines.push(line);
  return lines;
}

function request(fen: string, requestId = "compare-1"): AnalysisRequest {
  return { requestId, fen, depth: 4, multiPv: 3 };
}

describe("compareMove", () => {
  it("normaliza UCI, valida la jugada humana y detecta el bestmove", async () => {
    const adapter = new FakeEngineAdapter();
    const [best] = await collect(adapter.analyze(request(STANDARD_FEN)));
    if (best === undefined) throw new Error("El fake no produjo bestmove");

    const result = compareMove({
      fen: STANDARD_FEN,
      humanMove: best.bestmove.toUpperCase(),
      engineLine: best,
    });

    expect(result).toEqual({
      bestmove: best.bestmove,
      legal: true,
      sameAsBestmove: true,
      score: best.score,
    });
  });

  it("mantiene la promoción en la comparación y rechaza una jugada ilegal", () => {
    const fen = "4k3/P7/8/8/8/8/8/4K3 w - - 0 1";
    const engineLine: EngineLine = {
      multipv: 1,
      depth: 8,
      score: { kind: "cp", value: 120 },
      pv: ["a7a8q"],
      bestmove: "a7a8q",
    };

    expect(compareMove({ fen, humanMove: "A7A8Q", engineLine })).toMatchObject({
      bestmove: "a7a8q",
      legal: true,
      sameAsBestmove: true,
    });
    expect(compareMove({ fen, humanMove: "a7a8k", engineLine })).toMatchObject({
      bestmove: "a7a8q",
      legal: false,
      sameAsBestmove: false,
    });
  });

  it("separa score CP y mate y conserva null cuando el motor no tiene jugada", () => {
    const mateLine: EngineLine = {
      multipv: 1,
      depth: 12,
      score: { kind: "mate", value: 3 },
      pv: ["f7g7"],
      bestmove: "f7g7",
    };
    const cpLine: EngineLine = {
      ...mateLine,
      score: { kind: "cp", value: -42 },
    };

    expect(
      compareMove({
        fen: "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",
        humanMove: "h8g8",
        engineLine: null,
      }),
    ).toEqual({
      bestmove: null,
      legal: false,
      sameAsBestmove: false,
      score: null,
    });
    expect(mateLine.score).toEqual({ kind: "mate", value: 3 });
    expect(cpLine.score).toEqual({ kind: "cp", value: -42 });
  });

  it("expone solo bestmoves legales en FENs dorados del fake", async () => {
    const fens = [
      STANDARD_FEN,
      "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
      "8/P7/8/8/8/8/7p/4K2k w - - 0 1",
      "rnbqkbnr/1pp1pppp/p7/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3",
      "8/8/8/8/8/8/4k3/7K b - - 0 2",
    ];
    const adapter = new FakeEngineAdapter();

    for (const [index, fen] of fens.entries()) {
      const lines = await collect(
        adapter.analyze(request(fen, `golden-${index}`)),
      );
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(isLegalUciMove(fen, line.bestmove)).toBe(true);
      }
    }
  });

  it("normaliza únicamente movimientos UCI válidos", () => {
    expect(normalizeUciMove(" E2E4 ")).toBe("e2e4");
    expect(normalizeUciMove("a7a8N")).toBe("a7a8n");
    expect(normalizeUciMove("0000")).toBeNull();
    expect(normalizeUciMove("e2e9")).toBeNull();
  });
});
