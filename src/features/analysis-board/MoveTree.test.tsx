import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Chess } from "chess.js";

import { createGameDocument } from "@/domain/game-tree/replay";
import type {
  GameDocumentV1,
  MoveNode,
  RootNode,
} from "@/domain/game-tree/model";

import { MoveTree } from "./MoveTree";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function fixture(): GameDocumentV1 {
  const base = createGameDocument({
    rootFen: FEN,
    idFactory: (() => {
      let index = 0;
      return () => `tree-${++index}`;
    })(),
    clock: () => "2026-08-12T18:00:00.000Z",
  });
  if (!base.ok) throw new Error(base.error.message);
  const root = base.value.nodesById[base.value.rootNodeId] as RootNode;
  const chess = new Chess(FEN);
  const e4 = chess.move({ from: "e2", to: "e4" });
  const e5 = chess.move({ from: "e7", to: "e5" });
  const c5Chess = new Chess(e4.after);
  const c5 = c5Chess.move({ from: "c7", to: "c5" });
  const nodes: Record<string, RootNode | MoveNode> = {
    [root.id]: { ...root, childIds: ["e4"] },
    e4: {
      kind: "move",
      id: "e4",
      parentId: root.id,
      childIds: ["e5", "c5"],
      move: { from: "e2", to: "e4" },
      uci: "e2e4",
      san: e4.san,
      fen: e4.after,
      comment: null,
      nags: [],
    },
    e5: {
      kind: "move",
      id: "e5",
      parentId: "e4",
      childIds: [],
      move: { from: "e7", to: "e5" },
      uci: "e7e5",
      san: e5.san,
      fen: e5.after,
      comment: null,
      nags: [],
    },
    c5: {
      kind: "move",
      id: "c5",
      parentId: "e4",
      childIds: [],
      move: { from: "c7", to: "c5" },
      uci: "c7c5",
      san: c5.san,
      fen: c5.after,
      comment: null,
      nags: [],
    },
  };
  return { ...base.value, nodesById: nodes, cursorNodeId: "e5" };
}

describe("MoveTree", () => {
  it("conserva jerarquía, orden, variantes y cursor accesible", () => {
    const onNavigate = vi.fn();
    render(<MoveTree document={fixture()} onNavigate={onNavigate} />);

    expect(screen.getByRole("button", { name: "e4" })).not.toHaveAttribute(
      "aria-current",
    );
    expect(screen.getByRole("button", { name: "e5" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: /c5/i })).toHaveTextContent(
      "variante",
    );
    expect(
      screen.getByRole("list", { name: "Línea principal" }),
    ).toContainElement(screen.getByRole("button", { name: "e4" }));
    fireEvent.click(screen.getByRole("button", { name: /c5/i }));
    expect(onNavigate).toHaveBeenCalledWith("c5");
  });
});
