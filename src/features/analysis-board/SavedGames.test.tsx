import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GameSessionController } from "./useGameSession";
import { SavedGames } from "./SavedGames";

function fakeController(): GameSessionController {
  return {
    state: { status: "ready", session: null, busy: false, error: null },
    session: null,
    document: null,
    dirty: false,
    error: null,
    savedGames: [
      {
        id: "game-1",
        title: "Partida guardada",
        result: "*",
        revision: 2,
        updatedAt: "2026-08-12T18:00:00.000Z",
      },
    ],
    newGame: vi.fn(),
    save: vi.fn(async () => undefined),
    play: vi.fn(() => true),
    promotionOptions: vi.fn(() => ({
      ok: true as const,
      value: [] as readonly string[],
    })),
    reportError: vi.fn(),
    setComment: vi.fn(() => true),
    setNags: vi.fn(() => true),
    navigate: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    importText: vi.fn(() => ({ ok: true, warnings: [] })),
    inspectText: vi.fn(() => ({ ok: true as const, value: [] })),
    exportText: vi.fn(() => null),
    refreshSavedGames: vi.fn(async () => undefined),
    openSaved: vi.fn(async () => true),
    deleteSaved: vi.fn(async () => true),
  };
}

describe("SavedGames", () => {
  it("refresca, abre y elimina con confirmación", async () => {
    const controller = fakeController();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SavedGames controller={controller} />);
    await waitFor(() =>
      expect(controller.refreshSavedGames).toHaveBeenCalled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir" }));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(controller.openSaved).toHaveBeenCalledWith("game-1");
    expect(controller.deleteSaved).toHaveBeenCalledWith("game-1");
  });
});
