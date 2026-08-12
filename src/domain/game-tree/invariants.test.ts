import { describe, expect, it } from "vitest";

import { makeGameDocument } from "@/test/factories";

import { type GameDocumentV1, type MoveNode, type RootNode } from "./model";
import { validateGameStructure } from "./invariants";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function addMove(document: GameDocumentV1, id = "move-1"): GameDocumentV1 {
  const next = clone(document) as {
    rootNodeId: string;
    nodesById: Record<string, RootNode | MoveNode>;
    cursorNodeId: string;
  };
  const root = next.nodesById[next.rootNodeId] as RootNode;
  next.nodesById[id] = {
    kind: "move",
    id,
    parentId: root.id,
    childIds: [],
    move: { from: "e2", to: "e4" },
    uci: "e2e4",
    san: "e4",
    fen: "opaque-after-e4",
    comment: null,
    nags: [],
  };
  next.nodesById[root.id] = { ...root, childIds: [id] };
  next.cursorNodeId = id;
  return next as GameDocumentV1;
}

function codes(document: unknown): string[] {
  return validateGameStructure(document).map((error) => error.code);
}

describe("validateGameStructure", () => {
  it("accepts a healthy root-only document", () => {
    expect(validateGameStructure(makeGameDocument())).toEqual([]);
  });

  it("accepts a structurally valid move without checking chess legality", () => {
    expect(validateGameStructure(addMove(makeGameDocument()))).toEqual([]);
  });

  it("detects a cycle", () => {
    const document = addMove(makeGameDocument());
    const move = document.nodesById["move-1"] as MoveNode;
    const corrupted = clone(document) as {
      nodesById: Record<string, RootNode | MoveNode>;
    };
    corrupted.nodesById[move.id] = { ...move, childIds: [move.id] };

    expect(codes(corrupted)).toContain("CORRUPT_TREE");
  });

  it("detects an orphan and an inconsistent parent", () => {
    const document = makeGameDocument();
    const corrupted = clone(document) as {
      nodesById: Record<string, RootNode | MoveNode>;
    };
    corrupted.nodesById["orphan"] = {
      kind: "move",
      id: "orphan",
      parentId: "missing-parent",
      childIds: [],
      move: { from: "e2", to: "e4" },
      uci: "e2e4",
      san: "e4",
      fen: "opaque-after-e4",
      comment: null,
      nags: [],
    };

    const errors = validateGameStructure(corrupted);
    expect(errors.some((error) => error.message.includes("huérfano"))).toBe(
      true,
    );
    expect(errors.some((error) => error.message.includes("padre"))).toBe(true);
  });

  it("detects a missing cursor", () => {
    const corrupted = clone(makeGameDocument()) as { cursorNodeId: string };
    corrupted.cursorNodeId = "missing";

    expect(codes(corrupted)).toContain("NODE_NOT_FOUND");
  });

  it("detects invalid and duplicate NAG values", () => {
    const document = addMove(makeGameDocument());
    const corrupted = clone(document) as {
      nodesById: Record<string, MoveNode | RootNode>;
    };
    const move = corrupted.nodesById["move-1"] as MoveNode;
    corrupted.nodesById["move-1"] = { ...move, nags: [0, 1, 1, 256] };

    expect(
      codes(corrupted).filter((code) => code === "INVALID_NAG").length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("detects key/id incoherence and duplicate logical node IDs", () => {
    const document = addMove(makeGameDocument());
    const corrupted = clone(document) as {
      nodesById: Record<string, MoveNode | RootNode>;
    };
    const move = corrupted.nodesById["move-1"] as MoveNode;
    delete corrupted.nodesById["move-1"];
    corrupted.nodesById.alias = { ...move, id: "move-1" };
    corrupted.nodesById.duplicate = { ...move, id: "move-1" };

    const errors = validateGameStructure(corrupted);
    expect(errors.some((error) => error.message.includes("clave"))).toBe(true);
    expect(errors.some((error) => error.code === "ID_COLLISION")).toBe(true);
  });

  it("detects a game/root ID collision", () => {
    const document = makeGameDocument();
    const corrupted = clone(document) as { id: string; rootNodeId: string };
    corrupted.id = corrupted.rootNodeId;

    expect(codes(corrupted)).toContain("ID_COLLISION");
  });

  it("requires Result to be present and synchronized", () => {
    const corrupted = clone(makeGameDocument()) as {
      result: GameDocumentV1["result"];
      headers: Record<string, string>;
    };
    corrupted.result = "1-0";

    expect(codes(corrupted)).toContain("INVALID_DOCUMENT");
  });
});
