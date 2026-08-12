import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MemoryGameRepository } from "@/infrastructure/games/MemoryGameRepository";

import { AnalysisBoard } from "./AnalysisBoard";

vi.mock("react-chessboard", () => ({
  Chessboard: () => <div data-testid="mock-board">tablero</div>,
}));

describe("AnalysisBoard", () => {
  it("conserva el shell y muestra el tablero controlado", async () => {
    render(<AnalysisBoard repository={new MemoryGameRepository()} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Chess Mentor" }),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("mock-board")).toBeInTheDocument();
    expect(screen.getByTestId("current-fen")).toHaveTextContent("rnbqkbnr");
  });
});
