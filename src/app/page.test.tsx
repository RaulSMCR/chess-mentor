import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Home from "./page";

describe("Chess Mentor baseline page", () => {
  it("renders the stable heading and baseline marker", () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Chess Mentor" }),
    ).toBeInTheDocument();
    expect(screen.getByText("baseline")).toBeInTheDocument();
  });
});
