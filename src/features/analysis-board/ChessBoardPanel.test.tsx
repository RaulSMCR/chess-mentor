import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createGameDocument } from "@/domain/game-tree/replay";

import { ChessBoardPanel } from "./ChessBoardPanel";

vi.mock("react-chessboard", () => ({
  Chessboard: ({
    options,
  }: {
    options: { onPieceDrop: (args: unknown) => boolean };
  }) => (
    <div>
      <button
        type="button"
        data-testid="drop-legal"
        onClick={() =>
          options.onPieceDrop({ sourceSquare: "e2", targetSquare: "e4" })
        }
      >
        drop legal
      </button>
      <button
        type="button"
        data-testid="drop-null"
        onClick={() =>
          options.onPieceDrop({ sourceSquare: "e2", targetSquare: null })
        }
      >
        drop null
      </button>
    </div>
  ),
}));

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function validDocument() {
  const result = createGameDocument({
    rootFen: FEN,
    idFactory: (() => {
      let index = 0;
      return () => `board-${++index}`;
    })(),
    clock: () => "2026-08-12T18:00:00.000Z",
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("ChessBoardPanel", () => {
  it("envía un drop legal, rechaza target null y permite flip", () => {
    const onPlay = vi.fn(() => true);
    const onFlip = vi.fn();
    const onError = vi.fn();
    render(
      <ChessBoardPanel
        document={validDocument()}
        orientation="white"
        onFlip={onFlip}
        onPlay={onPlay}
        getPromotionOptions={() => ({ ok: true, value: [] })}
        onError={onError}
      />,
    );

    fireEvent.click(screen.getByTestId("drop-legal"));
    expect(onPlay).toHaveBeenCalledWith({ from: "e2", to: "e4" });
    fireEvent.click(screen.getByTestId("drop-null"));
    expect(onPlay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Voltear tablero" }));
    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("abre promoción sin mutar y ejecuta una única elección", () => {
    const onPlay = vi.fn(() => true);
    render(
      <ChessBoardPanel
        document={validDocument()}
        orientation="white"
        onFlip={vi.fn()}
        onPlay={onPlay}
        getPromotionOptions={() => ({ ok: true, value: ["q", "r", "b", "n"] })}
        onError={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("drop-legal"));
    expect(onPlay).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Elegir promoción" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dama" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onPlay).toHaveBeenCalledWith({
      from: "e2",
      to: "e4",
      promotion: "q",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
