import { describe, expect, it } from "vitest";

import { createUciCommands, parseUciLine, toEngineLine } from "./uci";

describe("UCI protocol", () => {
  it("parses a valid info line with score and PV", () => {
    const parsed = parseUciLine(
      "info depth 12 seldepth 18 multipv 2 score cp 34 nodes 100 pv e2e4 e7e5 g1f3",
    );

    expect(parsed).toEqual({
      kind: "info",
      depth: 12,
      multipv: 2,
      score: { kind: "cp", value: 34 },
      pv: ["e2e4", "e7e5", "g1f3"],
      raw: "info depth 12 seldepth 18 multipv 2 score cp 34 nodes 100 pv e2e4 e7e5 g1f3",
    });
  });

  it("parses mate scores and defaults multipv to one", () => {
    const parsed = parseUciLine("info depth 20 score mate -3 pv h7h8q");
    expect(parsed).toMatchObject({
      kind: "info",
      depth: 20,
      multipv: 1,
      score: { kind: "mate", value: -3 },
      pv: ["h7h8q"],
    });
  });

  it("parses bestmove and the no-legal-move sentinel", () => {
    expect(parseUciLine("bestmove e2e4 ponder e7e5")).toMatchObject({
      kind: "bestmove",
      bestmove: "e2e4",
      ponder: "e7e5",
    });
    expect(parseUciLine("bestmove 0000")).toMatchObject({
      kind: "bestmove",
      bestmove: "0000",
    });
  });

  it("ignora líneas desconocidas o incompletas", () => {
    expect(parseUciLine("uciok")).toBeNull();
    expect(parseUciLine("info depth 12 nodes 20")).toBeNull();
    expect(parseUciLine("bestmove nonsense")).toBeNull();
  });

  it("normaliza una línea al contrato del adaptador", () => {
    const parsed = parseUciLine("info depth 5 score cp -12 pv e2e4");
    if (parsed?.kind !== "info") throw new Error("expected info");
    expect(toEngineLine(parsed, "e2e4")).toEqual({
      multipv: 1,
      depth: 5,
      score: { kind: "cp", value: -12 },
      pv: ["e2e4"],
      bestmove: "e2e4",
    });
  });

  it("crea la secuencia UCI en orden y conserva la posición", () => {
    expect(
      createUciCommands({
        requestId: "r1",
        fen: "fen with spaces",
        depth: 8,
        multiPv: 2,
      }),
    ).toEqual([
      "uci",
      "isready",
      "ucinewgame",
      "setoption name MultiPV value 2",
      "position fen fen with spaces",
      "go depth 8",
    ]);
    expect(
      createUciCommands({
        requestId: "r2",
        fen: "startpos",
        depth: 8,
        movetimeMs: 250,
        multiPv: 1,
      })[5],
    ).toBe("go movetime 250");
  });
});
