import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createUciCommands,
  parseUciLine,
  toEngineLine,
  toEngineLineWithBestmove,
  UciAnalysisAccumulator,
} from "./uci";

describe("UCI protocol", () => {
  it("mantiene un fixture reproducible de info, bestmove y líneas ignoradas", () => {
    const fixture = readFileSync(
      resolve(process.cwd(), "fixtures/phase2/uci-lines.txt"),
      "utf8",
    );
    const parsed = fixture
      .split(/\r?\n/u)
      .map((line) => parseUciLine(line))
      .filter((line) => line !== null);

    expect(parsed).toHaveLength(7);
    expect(parsed.filter((line) => line.kind === "info")).toHaveLength(5);
    expect(parsed.filter((line) => line.kind === "bestmove")).toHaveLength(2);
  });

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
      move: "e2e4",
      outcome: "move",
      ponder: "e7e5",
    });
    expect(parseUciLine("bestmove 0000")).toMatchObject({
      kind: "bestmove",
      bestmove: "0000",
      move: null,
      outcome: "no_legal_move",
    });
  });

  it("normaliza cp y mate a perspectiva blanca cuando mueve negras", () => {
    expect(
      parseUciLine("info depth 10 score cp -45 pv e7e5", {
        sideToMove: "b",
      }),
    ).toMatchObject({
      score: { kind: "cp", value: 45 },
    });
    expect(
      parseUciLine("info depth 10 score mate 3 pv e7e5", {
        sideToMove: "b",
      }),
    ).toMatchObject({
      score: { kind: "mate", value: -3 },
    });
    expect(
      parseUciLine("info depth 10 score cp -45 pv e7e5", {
        sideToMove: "w",
      }),
    ).toMatchObject({
      score: { kind: "cp", value: -45 },
    });
  });

  it("ignora líneas desconocidas o incompletas", () => {
    expect(parseUciLine("uciok")).toBeNull();
    expect(parseUciLine("info depth 12 nodes 20")).toBeNull();
    expect(parseUciLine("bestmove nonsense")).toBeNull();
  });

  it("trunca la PV en el primer token que no es una jugada UCI", () => {
    expect(
      parseUciLine("info depth 8 score cp 12 pv e2e4 e7e5 string comentario"),
    ).toMatchObject({
      pv: ["e2e4", "e7e5"],
    });
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

  it("no convierte bestmove 0000 en una jugada de EngineLine", () => {
    const info = parseUciLine("info depth 5 score cp 0 pv");
    const bestmove = parseUciLine("bestmove 0000");
    if (info?.kind !== "info" || bestmove?.kind !== "bestmove") {
      throw new Error("expected info and bestmove");
    }
    expect(toEngineLineWithBestmove(info, bestmove)).toBeNull();
  });

  it("reemplaza duplicados por requestId, MultiPV y profundidad", () => {
    const accumulator = new UciAnalysisAccumulator("request-1");
    const first = parseUciLine("info depth 12 multipv 2 score cp 20 pv d2d4");
    const replacement = parseUciLine(
      "info depth 12 multipv 2 score cp 35 pv c2c4",
    );
    const otherLine = parseUciLine(
      "info depth 12 multipv 1 score cp 10 pv e2e4",
    );
    if (
      first?.kind !== "info" ||
      replacement?.kind !== "info" ||
      otherLine?.kind !== "info"
    ) {
      throw new Error("expected info lines");
    }

    accumulator.upsert(first);
    accumulator.upsert(replacement);
    const snapshot = accumulator.upsert(otherLine);

    expect(snapshot).toHaveLength(2);
    expect(snapshot.map((line) => line.multipv)).toEqual([1, 2]);
    expect(snapshot[1]).toMatchObject({
      score: { kind: "cp", value: 35 },
      pv: ["c2c4"],
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
