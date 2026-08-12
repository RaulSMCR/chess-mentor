import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import positions from "../../../fixtures/phase1/positions.json";

import { createGameDocument } from "./replay";
import {
  navigateBack,
  navigateForward,
  navigateTo,
  playMove,
} from "./commands";
import type { GameDocumentV1, MoveInput, MoveNode, RootNode } from "./model";

const TIMESTAMP = "2026-08-12T18:01:00.000Z";

function createDocument(): GameDocumentV1 {
  let index = 0;
  const result = createGameDocument({
    rootFen: positions.standard.fen,
    idFactory: () => ["game-commands", "root-commands"][index++] ?? "unused",
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
  const root = document.nodesById[document.rootNodeId] as RootNode;
  const chess = new Chess(root.fen);
  const nodes: Record<string, RootNode | MoveNode> = { ...document.nodesById };
  let parentId = root.id;
  for (const entry of entries) {
    const applied = chess.move(entry.move);
    const parent = nodes[parentId];
    if (parent === undefined) throw new Error("parent missing");
    nodes[parentId] = { ...parent, childIds: [...parent.childIds, entry.id] };
    nodes[entry.id] = {
      kind: "move",
      id: entry.id,
      parentId,
      childIds: [],
      move: {
        from: applied.from,
        to: applied.to,
        ...(applied.promotion === undefined
          ? {}
          : { promotion: applied.promotion as "q" | "r" | "b" | "n" }),
      },
      uci: `${applied.from}${applied.to}${applied.promotion ?? ""}`,
      san: applied.san,
      fen: applied.after,
      comment: null,
      nags: [],
    };
    parentId = entry.id;
  }
  return { ...document, nodesById: nodes, cursorNodeId: parentId };
}

describe("game-tree commands", () => {
  it("adds a new move as a secondary sibling without mutating the original line", () => {
    const document = addLine(createDocument(), [
      { id: "e4", move: { from: "e2", to: "e4" } },
      { id: "e5", move: { from: "e7", to: "e5" } },
      { id: "nf3", move: { from: "g1", to: "f3" } },
    ]);
    const atE4 = navigateTo(document, "e4");
    expect(atE4.ok).toBe(true);
    if (!atE4.ok) return;
    const before = JSON.stringify(atE4.value);
    let idCalls = 0;
    let clockCalls = 0;
    const result = playMove(
      atE4.value,
      { from: "c7", to: "c5" },
      {
        idFactory: () => {
          idCalls += 1;
          return "c5";
        },
        clock: () => {
          clockCalls += 1;
          return "2026-08-12T18:02:00.000Z";
        },
      },
    );

    expect(result.ok).toBe(true);
    expect(JSON.stringify(atE4.value)).toBe(before);
    expect(idCalls).toBe(1);
    expect(clockCalls).toBe(1);
    if (result.ok) {
      expect(result.value.nodesById.e4.childIds).toEqual(["e5", "c5"]);
      expect(result.value.cursorNodeId).toBe("c5");
      expect(result.value.revision).toBe(1);
      expect(result.value.updatedAt).toBe("2026-08-12T18:02:00.000Z");
    }
  });

  it("navigates to an existing child without revision, clock, or ID changes", () => {
    const document = addLine(createDocument(), [
      { id: "e4", move: { from: "e2", to: "e4" } },
    ]);
    const atRoot = navigateTo(document, document.rootNodeId);
    if (!atRoot.ok) throw new Error("root navigation failed");
    let idCalls = 0;
    let clockCalls = 0;
    const result = playMove(
      atRoot.value,
      { from: "e2", to: "e4" },
      {
        idFactory: () => {
          idCalls += 1;
          return "must-not-be-used";
        },
        clock: () => {
          clockCalls += 1;
          return "2026-08-12T18:03:00.000Z";
        },
      },
    );
    expect(result).toEqual({
      ok: true,
      value: { ...atRoot.value, cursorNodeId: "e4" },
    });
    expect(idCalls).toBe(0);
    expect(clockCalls).toBe(0);
    if (result.ok) expect(result.value.revision).toBe(0);
  });

  it("returns ID_COLLISION before reading Clock and leaves input unchanged", () => {
    const document = createDocument();
    const before = JSON.stringify(document);
    let clockCalls = 0;
    const result = playMove(
      document,
      { from: "e2", to: "e4" },
      {
        idFactory: () => document.rootNodeId,
        clock: () => {
          clockCalls += 1;
          return "2026-08-12T18:04:00.000Z";
        },
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "ID_COLLISION" },
    });
    expect(clockCalls).toBe(0);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("keeps navigation non-mutating and preserves revision/timestamp", () => {
    const document = addLine(createDocument(), [
      { id: "e4", move: { from: "e2", to: "e4" } },
      { id: "e5", move: { from: "e7", to: "e5" } },
    ]);
    const revision = document.revision;
    const updatedAt = document.updatedAt;
    const back = navigateBack(document);
    expect(back).toMatchObject({
      ok: true,
      value: { cursorNodeId: "e4", revision, updatedAt },
    });
    if (!back.ok) return;
    const forward = navigateForward(back.value);
    expect(forward).toMatchObject({
      ok: true,
      value: { cursorNodeId: "e5", revision, updatedAt },
    });
    const selected = navigateForward(back.value, "e5");
    expect(selected).toMatchObject({ ok: true, value: { cursorNodeId: "e5" } });
    expect(navigateBack(createDocument())).toEqual({
      ok: true,
      value: createDocument(),
    });
  });
});
