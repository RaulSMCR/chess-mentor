import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import positions from "../../../fixtures/phase1/positions.json";

import { validateGameDocument } from "./invariants";
import {
  createGameDocument,
  getGameState,
  getPromotionOptions,
  replayToNode,
} from "./replay";
import type { GameDocumentV1, MoveInput, MoveNode, RootNode } from "./model";

const TIMESTAMP = "2026-08-12T18:00:00.000Z";

function createDocument(rootFen: string): GameDocumentV1 {
  let idIndex = 0;
  const result = createGameDocument({
    rootFen,
    idFactory: () => ["game-test", "root-test"][idIndex++] ?? "unused",
    clock: () => TIMESTAMP,
  });
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

function addLine(
  document: GameDocumentV1,
  entries: readonly Readonly<{ id: string; move: MoveInput }>[],
): GameDocumentV1 {
  const chess = new Chess(document.nodesById[document.rootNodeId].fen);
  const nodes = { ...document.nodesById } as Record<
    string,
    RootNode | MoveNode
  >;
  let parentId = document.rootNodeId;

  for (const entry of entries) {
    const applied = chess.move(
      entry.move.promotion === undefined
        ? { from: entry.move.from, to: entry.move.to }
        : entry.move,
    );
    const parent = nodes[parentId];
    if (parent === undefined) throw new Error(`Missing parent ${parentId}`);
    const node: MoveNode = {
      kind: "move",
      id: entry.id,
      parentId,
      childIds: [],
      move:
        applied.promotion === undefined
          ? { from: applied.from, to: applied.to }
          : {
              from: applied.from,
              to: applied.to,
              promotion: applied.promotion as "q" | "r" | "b" | "n",
            },
      uci: `${applied.from}${applied.to}${applied.promotion ?? ""}`,
      san: applied.san,
      fen: applied.after,
      comment: null,
      nags: [],
    };
    nodes[parentId] = { ...parent, childIds: [...parent.childIds, entry.id] };
    nodes[entry.id] = node;
    parentId = entry.id;
  }

  return { ...document, nodesById: nodes, cursorNodeId: parentId };
}

function addTwoBranches(document: GameDocumentV1): GameDocumentV1 {
  const chess = new Chess(document.nodesById[document.rootNodeId].fen);
  const root = document.nodesById[document.rootNodeId] as RootNode;
  const e4 = chess.move({ from: "e2", to: "e4" });
  const d4Chess = new Chess(document.nodesById[document.rootNodeId].fen);
  const d4 = d4Chess.move({ from: "d2", to: "d4" });
  const nodes: Record<string, RootNode | MoveNode> = {
    ...document.nodesById,
    [root.id]: { ...root, childIds: ["e4", "d4"] },
    e4: {
      kind: "move",
      id: "e4",
      parentId: root.id,
      childIds: [],
      move: { from: e4.from, to: e4.to },
      uci: "e2e4",
      san: e4.san,
      fen: e4.after,
      comment: null,
      nags: [],
    },
    d4: {
      kind: "move",
      id: "d4",
      parentId: root.id,
      childIds: [],
      move: { from: d4.from, to: d4.to },
      uci: "d2d4",
      san: d4.san,
      fen: d4.after,
      comment: null,
      nags: [],
    },
  };
  return { ...document, nodesById: nodes, cursorNodeId: "e4" };
}

describe("createGameDocument and replay", () => {
  it("normalizes a valid FEN and rejects invalid FEN without IDs or clock reads", () => {
    let idCalls = 0;
    let clockCalls = 0;
    const valid = createGameDocument({
      rootFen: positions.standard.fen,
      idFactory: () => {
        idCalls += 1;
        return ["game", "root"][idCalls - 1] ?? "unused";
      },
      clock: () => {
        clockCalls += 1;
        return TIMESTAMP;
      },
    });
    expect(valid.ok).toBe(true);
    expect(idCalls).toBe(2);
    expect(clockCalls).toBe(1);

    const invalid = createGameDocument({
      rootFen: positions.invalidMissingKing.fen,
      idFactory: () => {
        throw new Error("must not allocate IDs");
      },
      clock: () => {
        throw new Error("must not read clock");
      },
    });
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: "INVALID_FEN" },
    });
  });

  it("replays a legal line and returns normalized SAN/UCI/FEN and state", () => {
    const document = addLine(createDocument(positions.standard.fen), [
      { id: "e4", move: { from: "e2", to: "e4" } },
      { id: "e5", move: { from: "e7", to: "e5" } },
      { id: "nf3", move: { from: "g1", to: "f3" } },
    ]);

    const result = replayToNode(document, "nf3");
    expect(result).toMatchObject({
      ok: true,
      value: {
        path: ["root-test", "e4", "e5", "nf3"],
        uci: "g1f3",
        san: "Nf3",
        status: "ongoing",
        turn: "b",
        gameOver: false,
      },
    });
    if (result.ok) expect(result.value.fen).toBe(document.nodesById.nf3.fen);
  });

  it("applies terminal-state precedence for all position fixtures", () => {
    const expected = [
      ["standard", "ongoing"],
      ["checkmate", "checkmate"],
      ["stalemate", "stalemate"],
      ["castling", "ongoing"],
      ["promotion", "ongoing"],
      ["enPassant", "ongoing"],
      ["fiftyMove", "fiftyMove"],
    ] as const;
    for (const [name, status] of expected) {
      const result = getGameState(createDocument(positions[name].fen));
      expect(result).toEqual({
        ok: true,
        value: expect.objectContaining({ status }),
      });
    }
  });

  it("detects threefold repetition from the complete replay history", () => {
    const cycle = [
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
      ["f6", "g8"],
    ] as const;
    const entries = [...cycle, ...cycle].map(([from, to], index) => ({
      id: `move-${index}`,
      move: { from, to },
    }));
    const document = addLine(createDocument(positions.standard.fen), entries);
    const result = getGameState(document, "move-7");
    expect(result).toEqual({
      ok: true,
      value: expect.objectContaining({ status: "threefold", gameOver: true }),
    });
  });

  it("returns promotion candidates in q,r,b,n order", () => {
    const document = createDocument(positions.promotion.fen);
    const result = getPromotionOptions(
      document,
      document.rootNodeId,
      "a7",
      "a8",
    );
    expect(result).toEqual({ ok: true, value: ["q", "r", "b", "n"] });

    for (const promotion of ["q", "r", "b", "n"] as const) {
      const normalized = replayToNode(
        addLine(document, [
          {
            id: `promotion-${promotion}`,
            move: { from: "a7", to: "a8", promotion },
          },
        ]),
        `promotion-${promotion}`,
      );
      expect(normalized.ok).toBe(true);
    }
  });

  it("rejects illegal paths without mutating the document", () => {
    const document = createDocument(positions.standard.fen);
    const root = document.nodesById[document.rootNodeId] as RootNode;
    const corrupted: GameDocumentV1 = {
      ...document,
      nodesById: {
        ...document.nodesById,
        [root.id]: { ...root, childIds: ["illegal"] },
        illegal: {
          kind: "move",
          id: "illegal",
          parentId: root.id,
          childIds: [],
          move: { from: "e2", to: "e5" },
          uci: "e2e5",
          san: "e5",
          fen: "opaque",
          comment: null,
          nags: [],
        },
      },
      cursorNodeId: "illegal",
    };
    const before = JSON.stringify(corrupted);
    const result = replayToNode(corrupted, "illegal");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "ILLEGAL_MOVE" },
    });
    expect(JSON.stringify(corrupted)).toBe(before);
  });

  it("validates a corrupted branch even when the cursor is on a healthy branch", () => {
    const document = addTwoBranches(createDocument(positions.standard.fen));
    const corrupted = structuredClone(document) as GameDocumentV1 & {
      nodesById: Record<string, RootNode | MoveNode>;
    };
    const d4 = corrupted.nodesById.d4 as MoveNode;
    corrupted.nodesById.d4 = { ...d4, fen: "corrupt-cache" };

    const errors = validateGameDocument(corrupted);
    expect(
      errors.some((error) => error.context?.path === "nodesById.d4.fen"),
    ).toBe(true);
  });
});
