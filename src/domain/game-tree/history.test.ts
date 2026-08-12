import { describe, expect, it } from "vitest";

import positions from "../../../fixtures/phase1/positions.json";

import { playMove } from "./commands";
import {
  applyMutation,
  applyNavigation,
  isDirty,
  markSaved,
  redo,
  samePersistableContent,
  startSession,
  undo,
} from "./history";
import { createGameDocument } from "./replay";
import type { GameDocumentV1 } from "./model";

function document(): GameDocumentV1 {
  let index = 0;
  const result = createGameDocument({
    rootFen: positions.standard.fen,
    idFactory: () => ["game-history", "root-history"][index++] ?? "unused",
    clock: () => "2026-08-12T18:00:00.000Z",
  });
  if (!result.ok) throw new Error("factory failed");
  return result.value;
}

function move(
  documentValue: GameDocumentV1,
  from: string,
  to: string,
  id: string,
) {
  const result = playMove(
    documentValue,
    { from, to },
    {
      idFactory: () => id,
      clock: () => "2026-08-12T18:01:00.000Z",
    },
  );
  if (!result.ok)
    throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
}

describe("game-tree history", () => {
  it("starts a session with empty undo/redo and no saved snapshot", () => {
    const session = startSession(document());
    expect(session.past).toEqual([]);
    expect(session.future).toEqual([]);
    expect(session.savedSnapshot).toBeNull();
    expect(isDirty(session)).toBe(true);
  });

  it("records a real mutation, undo restores the exact snapshot, and redo restores it", () => {
    const initial = document();
    const session = startSession(initial);
    const changed = applyMutation(session, (present) =>
      move(present, "e2", "e4", "e4"),
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) return;
    expect(changed.value.past).toHaveLength(1);
    expect(changed.value.present.cursorNodeId).toBe("e4");
    const undone = undo(changed.value);
    expect(undone).toMatchObject({
      ok: true,
      value: { present: initial, past: [], future: [{ cursorNodeId: "e4" }] },
    });
    if (!undone.ok) return;
    const redone = redo(undone.value);
    expect(redone).toMatchObject({
      ok: true,
      value: {
        present: { cursorNodeId: "e4" },
        past: [{ cursorNodeId: initial.rootNodeId }],
        future: [],
      },
    });
  });

  it("navigation does not create snapshots", () => {
    const initial = document();
    const session = startSession(initial);
    const navigated = applyNavigation(session, (present) => ({
      ...present,
      cursorNodeId: present.rootNodeId,
    }));
    expect(navigated).toEqual({ ok: true, value: session });
  });

  it("does not snapshot a semantic no-op and propagates expected errors", () => {
    const session = startSession(document());
    const noOp = applyMutation(session, (present) => ({
      ...present,
      cursorNodeId: present.rootNodeId,
    }));
    expect(noOp).toMatchObject({ ok: true, value: { past: [], future: [] } });
    const failed = applyMutation(session, () => ({
      ok: false,
      error: { code: "ILLEGAL_MOVE", message: "bad" },
    }));
    expect(failed).toEqual({
      ok: false,
      error: { code: "ILLEGAL_MOVE", message: "bad" },
    });
  });

  it("clears redo after a new mutation following undo", () => {
    const first = move(document(), "e2", "e4", "e4");
    const second = move(first, "e7", "e5", "e5");
    const session = startSession(document());
    const one = applyMutation(session, () => first);
    if (!one.ok) return;
    const two = applyMutation(one.value, () => second);
    if (!two.ok) return;
    const back = undo(two.value);
    if (!back.ok) return;
    const alternative = applyMutation(back.value, (present) =>
      move(present, "c7", "c6", "c6"),
    );
    expect(alternative).toMatchObject({ ok: true, value: { future: [] } });
  });

  it("keeps at most 100 past snapshots", () => {
    let session = startSession(document());
    for (let index = 0; index < 105; index += 1) {
      const next = applyMutation(session, (present) => ({
        ...present,
        revision: present.revision + 1,
        updatedAt: `2026-08-12T18:01:${String(index).padStart(2, "0")}Z`,
      }));
      if (!next.ok) throw new Error("mutation failed");
      session = next.value;
    }
    expect(session.past).toHaveLength(100);
  });

  it("compares persistable content by value, ignoring only cursor and ordering records", () => {
    const initial = document();
    const moved = { ...initial, cursorNodeId: "other" };
    expect(samePersistableContent(initial, moved)).toBe(true);
    const saved = markSaved(startSession(initial));
    expect(isDirty(saved)).toBe(false);
    const edited = applyMutation(saved, (present) => ({
      ...present,
      title: "Edited",
      revision: 1,
    }));
    expect(edited).toMatchObject({ ok: true });
    if (edited.ok) expect(isDirty(edited.value)).toBe(true);
  });
});
