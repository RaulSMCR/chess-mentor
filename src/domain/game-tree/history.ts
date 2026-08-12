import type { GameDocumentV1, Result } from "./model";

export const MAX_HISTORY_SNAPSHOTS = 100;

export type GameSession = Readonly<{
  present: GameDocumentV1;
  past: readonly GameDocumentV1[];
  future: readonly GameDocumentV1[];
  savedSnapshot: GameDocumentV1 | null;
}>;

export type DocumentTransform = (
  document: GameDocumentV1,
) => Result<GameDocumentV1> | GameDocumentV1;

function cloneDocument(document: GameDocumentV1): GameDocumentV1 {
  return structuredClone(document) as GameDocumentV1;
}

function cloneSnapshots(
  documents: readonly GameDocumentV1[],
): readonly GameDocumentV1[] {
  return documents.map(cloneDocument);
}

function isResult<T>(value: Result<T> | T): value is Result<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "ok" in value &&
    typeof value.ok === "boolean"
  );
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableValue(record[key])]),
  );
}

function persistable(document: GameDocumentV1): unknown {
  const copy = structuredClone(document) as Record<string, unknown>;
  delete copy.cursorNodeId;
  return stableValue(copy);
}

export function samePersistableContent(
  left: GameDocumentV1,
  right: GameDocumentV1,
): boolean {
  return (
    JSON.stringify(persistable(left)) === JSON.stringify(persistable(right))
  );
}

export function startSession(document: GameDocumentV1): GameSession {
  return {
    present: cloneDocument(document),
    past: [],
    future: [],
    savedSnapshot: null,
  };
}

export const createSession = startSession;

export function markSaved(session: GameSession): GameSession {
  return { ...session, savedSnapshot: cloneDocument(session.present) };
}

export const saveSnapshot = markSaved;

export function clearSavedSnapshot(session: GameSession): GameSession {
  return { ...session, savedSnapshot: null };
}

export function isDirty(session: GameSession): boolean {
  return session.savedSnapshot === null
    ? true
    : !samePersistableContent(session.present, session.savedSnapshot);
}

function transformResult(
  transformation: Result<GameDocumentV1> | GameDocumentV1,
): Result<GameDocumentV1> {
  if (isResult(transformation)) return transformation;
  return { ok: true, value: transformation };
}

function appendSnapshot(
  snapshots: readonly GameDocumentV1[],
  document: GameDocumentV1,
): readonly GameDocumentV1[] {
  const next = [...cloneSnapshots(snapshots), cloneDocument(document)];
  return next.slice(-MAX_HISTORY_SNAPSHOTS);
}

export function applyMutation(
  session: GameSession,
  transform: DocumentTransform,
): Result<GameSession> {
  const transformed = transformResult(
    transform(cloneDocument(session.present)),
  );
  if (!transformed.ok) return transformed;
  if (samePersistableContent(session.present, transformed.value)) {
    return {
      ok: true,
      value: { ...session, present: cloneDocument(transformed.value) },
    };
  }

  return {
    ok: true,
    value: {
      present: cloneDocument(transformed.value),
      past: appendSnapshot(session.past, session.present),
      future: [],
      savedSnapshot:
        session.savedSnapshot === null
          ? null
          : cloneDocument(session.savedSnapshot),
    },
  };
}

export function applyNavigation(
  session: GameSession,
  transform: DocumentTransform,
): Result<GameSession> {
  const transformed = transformResult(
    transform(cloneDocument(session.present)),
  );
  if (!transformed.ok) return transformed;
  return {
    ok: true,
    value: {
      present: cloneDocument(transformed.value),
      past: cloneSnapshots(session.past),
      future: cloneSnapshots(session.future),
      savedSnapshot:
        session.savedSnapshot === null
          ? null
          : cloneDocument(session.savedSnapshot),
    },
  };
}

export function undo(session: GameSession): Result<GameSession> {
  const previous = session.past[session.past.length - 1];
  if (previous === undefined) return { ok: true, value: session };
  return {
    ok: true,
    value: {
      present: cloneDocument(previous),
      past: cloneSnapshots(session.past.slice(0, -1)),
      future: [
        cloneDocument(session.present),
        ...cloneSnapshots(session.future),
      ],
      savedSnapshot:
        session.savedSnapshot === null
          ? null
          : cloneDocument(session.savedSnapshot),
    },
  };
}

export function redo(session: GameSession): Result<GameSession> {
  const next = session.future[0];
  if (next === undefined) return { ok: true, value: session };
  return {
    ok: true,
    value: {
      present: cloneDocument(next),
      past: appendSnapshot(session.past, session.present),
      future: cloneSnapshots(session.future.slice(1)),
      savedSnapshot:
        session.savedSnapshot === null
          ? null
          : cloneDocument(session.savedSnapshot),
    },
  };
}

export const undoSession = undo;
export const redoSession = redo;
