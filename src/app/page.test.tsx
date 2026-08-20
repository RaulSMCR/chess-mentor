import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Home from "./page";

const capabilitiesPayload = {
  ok: true,
  data: {
    deployment: "local",
    capabilities: {
      instructor: { status: "available", reason: null },
      sources: { status: "available", reason: null },
      respond: { status: "available", reason: null },
    },
    security: { sameOrigin: true, privateServicesExposed: false },
  },
};

describe("Chess Mentor entry", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => capabilitiesPayload,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens with an accessible menu for both modes", async () => {
    render(<Home />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Chess Mentor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Práctica" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Instructor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar en Práctica" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Entrar en Instructor" }),
    ).toBeInTheDocument();
  });
});
