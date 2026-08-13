import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { GameSessionController } from "./useGameSession";
import { GameImportExport, sanitizePgnFilename } from "./GameImportExport";

function controller(
  overrides: Partial<GameSessionController> = {},
): GameSessionController {
  return {
    state: { status: "ready", session: null, busy: false, error: null },
    session: null,
    document: {
      schemaVersion: 1,
      id: "game",
      title: "Árbol de prueba",
      headers: { Result: "*" },
      rootNodeId: "root",
      nodesById: {
        root: {
          kind: "root",
          id: "root",
          parentId: null,
          childIds: [],
          fen: "start",
        },
      },
      cursorNodeId: "root",
      result: "*",
      revision: 0,
      createdAt: "2026-08-12T18:00:00.000Z",
      updatedAt: "2026-08-12T18:00:00.000Z",
    },
    dirty: false,
    error: null,
    savedGames: [],
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
    inspectText: vi.fn(() => ({
      ok: true as const,
      value: [
        {
          index: 0,
          title: "Prueba",
          white: "?",
          black: "?",
          result: "*" as const,
          moveCount: 1,
        },
      ],
    })),
    exportText: vi.fn(() => '[Result "*"]\n\n*'),
    refreshSavedGames: vi.fn(async () => undefined),
    openSaved: vi.fn(async () => true),
    deleteSaved: vi.fn(async () => true),
    ...overrides,
  };
}

describe("GameImportExport", () => {
  it("normaliza el nombre de descarga y conserva fallback", () => {
    expect(sanitizePgnFilename("  Ánalisis / variante  ")).toBe(
      "Analisis-variante.pgn",
    );
    expect(sanitizePgnFilename("...")).toBe("....pgn");
    expect(sanitizePgnFilename("   ")).toBe("chess-mentor-game.pgn");
  });

  it("pide aceptación explícita para warnings antes de reemplazar", async () => {
    const importText = vi
      .fn()
      .mockReturnValueOnce({
        ok: true,
        warnings: [{ message: "Move number mismatch" }],
      })
      .mockReturnValueOnce({
        ok: true,
        warnings: [{ message: "Move number mismatch" }],
      });
    const fake = controller({ importText });
    render(<GameImportExport controller={fake} />);
    const file = new File(['[Result "*"]\n\n1. e4 *'], "game.pgn", {
      type: "application/x-chess-pgn",
    });
    fireEvent.change(screen.getByLabelText("Archivo PGN"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("advertencias"),
    );
    expect(importText).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Aceptar importación" }),
    );
    expect(importText).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("exporta Blob UTF-8 y revoca URL", () => {
    const fake = controller();
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    render(<GameImportExport controller={fake} />);
    fireEvent.click(screen.getByRole("button", { name: "Exportar PGN" }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:test");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it("permite elegir una partida dentro de una colecciÃ³n", async () => {
    const importText = vi.fn(() => ({ ok: true, warnings: [] }));
    const fake = controller({
      importText,
      inspectText: vi.fn(() => ({
        ok: true as const,
        value: [
          {
            index: 0,
            title: "Primera",
            white: "A",
            black: "B",
            result: "*" as const,
            moveCount: 20,
          },
          {
            index: 1,
            title: "Segunda",
            white: "C",
            black: "D",
            result: "*" as const,
            moveCount: 30,
          },
        ],
      })),
    });
    render(<GameImportExport controller={fake} />);
    const file = new File(["collection"], "games.pgn", {
      type: "application/x-chess-pgn",
    });
    fireEvent.change(screen.getByLabelText("Archivo PGN"), {
      target: { files: [file] },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Seleccionar partida" }),
      ).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /Segunda/ }));
    expect(importText).toHaveBeenNthCalledWith(2, "collection", true, 1);
  });
});
