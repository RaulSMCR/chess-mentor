import { describe, expect, it } from "vitest";

import positions from "../../../fixtures/phase1/positions.json";

import { createGameDocument } from "./replay";
import {
  canBack,
  canForward,
  flattenTree,
  selectChildren,
  selectCurrentFen,
  selectCurrentNode,
  selectPath,
} from "./selectors";

function document() {
  let index = 0;
  const result = createGameDocument({
    rootFen: positions.standard.fen,
    idFactory: () => ["game-selectors", "root-selectors"][index++] ?? "unused",
    clock: () => "2026-08-12T18:00:00.000Z",
  });
  if (!result.ok) throw new Error("factory failed");
  return result.value;
}

describe("game-tree selectors", () => {
  it("selects current node and FEN", () => {
    const value = document();
    expect(selectCurrentNode(value)).toMatchObject({
      ok: true,
      value: { kind: "root" },
    });
    expect(selectCurrentFen(value)).toEqual({
      ok: true,
      value: value.nodesById[value.rootNodeId].fen,
    });
    expect(canBack(value)).toBe(false);
    expect(canForward(value)).toBe(false);
  });

  it("returns path and children in canonical order", () => {
    const value = document();
    const root = value.nodesById[value.rootNodeId];
    const child = {
      kind: "move" as const,
      id: "e4",
      parentId: root.id,
      childIds: [],
      move: { from: "e2", to: "e4" },
      uci: "e2e4",
      san: "e4",
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      comment: null,
      nags: [],
    };
    const withChild = {
      ...value,
      nodesById: {
        ...value.nodesById,
        [root.id]: { ...root, childIds: [child.id] },
        [child.id]: child,
      },
      cursorNodeId: child.id,
    };
    expect(selectPath(withChild)).toMatchObject({
      ok: true,
      value: [{ id: root.id }, { id: "e4" }],
    });
    expect(selectChildren(withChild, root.id)).toEqual({
      ok: true,
      value: [child],
    });
    expect(canBack(withChild)).toBe(true);
    expect(canForward(withChild)).toBe(false);
  });

  it("flattens the tree preorder while retaining depth and path", () => {
    const value = document();
    const root = value.nodesById[value.rootNodeId];
    const e4 = {
      kind: "move" as const,
      id: "e4",
      parentId: root.id,
      childIds: [],
      move: { from: "e2", to: "e4" },
      uci: "e2e4",
      san: "e4",
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      comment: null,
      nags: [],
    };
    const flat = flattenTree({
      ...value,
      nodesById: {
        ...value.nodesById,
        [root.id]: { ...root, childIds: [e4.id] },
        e4,
      },
      cursorNodeId: e4.id,
    });
    expect(flat).toMatchObject({
      ok: true,
      value: [{ depth: 0 }, { depth: 1, path: [root.id, "e4"] }],
    });
  });
});
