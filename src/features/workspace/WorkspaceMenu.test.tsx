import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceMenu } from "./WorkspaceMenu";

describe("WorkspaceMenu", () => {
  it("describes both modes and enables Instructor when available", () => {
    render(
      <WorkspaceMenu
        capability={{ status: "available", reason: null }}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Chess Mentor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Práctica" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Instructor" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar en Instructor" }),
    ).toBeEnabled();
    expect(
      screen.getByText("Disponible en esta instancia."),
    ).toBeInTheDocument();
  });

  it("does not claim Instructor is available in a degraded deployment", () => {
    render(
      <WorkspaceMenu
        capability={{
          status: "degraded",
          reason: "La demo cloud no alcanza recursos locales del equipo.",
        }}
        onSelect={vi.fn()}
      />,
    );

    const instructorButton = screen.getByRole("button", {
      name: "Instructor no disponible",
    });
    expect(instructorButton).toBeDisabled();
    expect(
      screen.getByText("La demo cloud no alcanza recursos locales del equipo."),
    ).toBeInTheDocument();
  });
});
