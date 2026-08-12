import { describe, expect, it } from "vitest";

import { createGameDocumentDraft, type Clock, type IdFactory } from "./model";

describe("createGameDocumentDraft", () => {
  it("creates deterministic defaults with exactly two IDs and one clock read", () => {
    const ids = ["game-1", "root-1"];
    let idCalls = 0;
    const idFactory: IdFactory = () => {
      const value = ids[idCalls];
      idCalls += 1;
      return value ?? "unused";
    };
    let clockCalls = 0;
    const clock: Clock = () => {
      clockCalls += 1;
      return "2026-08-12T18:00:00.000Z";
    };

    const result = createGameDocumentDraft({
      rootFen: "opaque-root-fen",
      idFactory,
      clock,
    });

    expect(result).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        id: "game-1",
        title: "Partida sin título",
        headers: { Result: "*" },
        rootNodeId: "root-1",
        nodesById: {
          "root-1": {
            kind: "root",
            id: "root-1",
            parentId: null,
            childIds: [],
            fen: "opaque-root-fen",
          },
        },
        cursorNodeId: "root-1",
        result: "*",
        revision: 0,
        createdAt: "2026-08-12T18:00:00.000Z",
        updatedAt: "2026-08-12T18:00:00.000Z",
      },
    });
    expect(idCalls).toBe(2);
    expect(clockCalls).toBe(1);
  });

  it("accepts a supplied title without validating the opaque FEN", () => {
    const ids = ["game-2", "root-2"];
    let idIndex = 0;
    const result = createGameDocumentDraft({
      rootFen: "not-a-fen-yet",
      title: "  Estudio  ",
      idFactory: () => ids[idIndex++] ?? "unused",
      clock: () => "2026-08-12T18:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("  Estudio  ");
      expect(result.value.nodesById[result.value.rootNodeId].fen).toBe(
        "not-a-fen-yet",
      );
    }
  });

  it("returns ID_COLLISION without creating a partial document", () => {
    let clockCalls = 0;
    const result = createGameDocumentDraft({
      rootFen: "opaque-root-fen",
      idFactory: () => "same-id",
      clock: () => {
        clockCalls += 1;
        return "2026-08-12T18:00:00.000Z";
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "ID_COLLISION" },
    });
    expect(clockCalls).toBe(0);
  });

  it("rejects an invalid injected clock value", () => {
    const result = createGameDocumentDraft({
      rootFen: "opaque-root-fen",
      idFactory: (() => {
        const ids = ["game-3", "root-3"];
        let index = 0;
        return () => ids[index++] ?? "unused";
      })(),
      clock: () => "not-a-timestamp",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_DOCUMENT" },
    });
  });
});
