import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Chess Mentor analysis shell", () => {
  it("renders the stable heading and session actions", async () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Chess Mentor" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Partida sin título")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nueva/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /guardar/i }),
    ).toBeInTheDocument();
  });
});
