import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import Home from "./page";

vi.mock("react-chessboard", () => ({
  Chessboard: () => <div data-testid="mock-board">tablero</div>,
}));

describe("Chess Mentor analysis shell", () => {
  it("renders the stable heading and session actions", async () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Chess Mentor" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Partida sin título")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nueva" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /guardar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Modo LAN sin autenticación: usa solo datos ficticios."),
    ).toBeInTheDocument();
  });
});
