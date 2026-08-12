import { StrictMode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MemoryGameRepository } from "@/infrastructure/games/MemoryGameRepository";

import { STANDARD_ROOT_FEN, useGameSession } from "./useGameSession";

describe("useGameSession", () => {
  it("inicializa una sola sesión bajo StrictMode", async () => {
    let nextId = 0;
    let clockCalls = 0;
    const repository = new MemoryGameRepository();
    const { result } = renderHook(
      () =>
        useGameSession({
          repository,
          idFactory: () => `strict-${++nextId}`,
          clock: () => {
            clockCalls += 1;
            return "2026-08-12T18:00:00.000Z";
          },
        }),
      { wrapper: StrictMode },
    );

    await waitFor(() => expect(result.current.document).not.toBeNull());
    expect(result.current.document?.id).toBe("strict-1");
    expect(nextId).toBe(2);
    expect(clockCalls).toBe(1);
    await expect(repository.list()).resolves.toHaveLength(0);
  });

  it("mantiene dirty al iniciar, limpia al guardar y conserva el error", async () => {
    const repository = new MemoryGameRepository();
    const { result } = renderHook(() =>
      useGameSession({
        repository,
        idFactory: (() => {
          let index = 0;
          return () => `session-${++index}`;
        })(),
        clock: () => "2026-08-12T18:00:00.000Z",
      }),
    );

    await waitFor(() => expect(result.current.document).not.toBeNull());
    expect(result.current.dirty).toBe(true);
    await result.current.save();
    await waitFor(() => expect(result.current.dirty).toBe(false));
    expect(
      result.current.document?.nodesById[result.current.document.rootNodeId],
    ).toMatchObject({
      fen: STANDARD_ROOT_FEN,
    });
  });

  it("navegar no crea snapshots y undo/redo siguen siendo acciones separadas", async () => {
    const { result } = renderHook(() =>
      useGameSession({
        repository: new MemoryGameRepository(),
        idFactory: (() => {
          let index = 0;
          return () => `nav-${++index}`;
        })(),
        clock: () => "2026-08-12T18:00:00.000Z",
      }),
    );

    await waitFor(() => expect(result.current.document).not.toBeNull());
    const rootId = result.current.document?.rootNodeId;
    expect(rootId).toBeDefined();
    result.current.play({ from: "e2", to: "e4" });
    await waitFor(() => expect(result.current.session?.past).toHaveLength(1));
    const moveId = result.current.document?.cursorNodeId;
    expect(moveId).not.toBe(rootId);
    result.current.navigate(rootId as string);
    await waitFor(() =>
      expect(result.current.document?.cursorNodeId).toBe(rootId),
    );
    expect(result.current.session?.past).toHaveLength(1);
    result.current.navigate(moveId as string);
    await waitFor(() =>
      expect(result.current.document?.cursorNodeId).toBe(moveId),
    );
    result.current.undo();
    await waitFor(() => expect(result.current.session?.past).toHaveLength(0));
    expect(result.current.document?.cursorNodeId).toBe(rootId);
    result.current.redo();
    await waitFor(() =>
      expect(result.current.document?.cursorNodeId).toBe(moveId),
    );
  });
});
