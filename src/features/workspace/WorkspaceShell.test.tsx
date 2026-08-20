import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceShell } from "./WorkspaceShell";

vi.mock("@/features/analysis-board/AnalysisBoard", () => ({
  AnalysisBoard: () => <div data-testid="practice-workspace">Práctica</div>,
}));

const localCapabilitiesPayload = {
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

describe("WorkspaceShell", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => localCapabilitiesPayload,
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("consults same-origin capabilities and returns from each mode", async () => {
    render(<WorkspaceShell />);

    const fetchMock = vi.mocked(globalThis.fetch);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Entrar en Instructor" }),
      ).toBeEnabled(),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/instructor/capabilities", {
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    fireEvent.click(screen.getByRole("button", { name: "Entrar en Práctica" }));
    expect(screen.getByTestId("practice-workspace")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver al menú" }));
    expect(
      screen.getByRole("heading", { name: "Chess Mentor" }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Entrar en Instructor" }),
    );
    expect(
      screen.getByRole("heading", { name: "Instructor" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver al menú" }));
    expect(
      screen.getByRole("heading", { name: "Práctica" }),
    ).toBeInTheDocument();
  });

  it("falls back safely when the capability request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("private detail")),
    );
    render(<WorkspaceShell />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "No se pudo confirmar la disponibilidad del instructor.",
        ),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Instructor no disponible" }),
    ).toBeDisabled();
    expect(screen.queryByText("private detail")).not.toBeInTheDocument();
  });
});
