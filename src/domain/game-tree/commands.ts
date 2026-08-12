import type {
  Clock,
  DomainError,
  GameDocumentV1,
  GameNode,
  IdFactory,
  MoveInput,
  NodeId,
  Result,
} from "./model";
import { validateGameDocument } from "./invariants";
import { normalizeMoveAt } from "./replay";

export type CommandDependencies = Readonly<{
  idFactory: IdFactory;
  clock: Clock;
}>;

function commandError(
  code: DomainError["code"],
  message: string,
  path?: string,
  extra?: Readonly<Record<string, string | number | boolean | null>>,
): DomainError {
  const context = path === undefined ? extra : { path, ...(extra ?? {}) };
  return context === undefined ? { code, message } : { code, message, context };
}

function failure<T>(error: DomainError): Result<T> {
  return { ok: false, error };
}

function validateForCommand(document: GameDocumentV1): Result<GameDocumentV1> {
  const errors = validateGameDocument(document);
  return errors.length === 0
    ? { ok: true, value: document }
    : failure(errors[0]);
}

function validClock(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.endsWith("Z") &&
    Number.isFinite(Date.parse(value))
  );
}

function cloneWithCursor(
  document: GameDocumentV1,
  cursorNodeId: NodeId,
): GameDocumentV1 {
  return { ...document, cursorNodeId };
}

export function playMove(
  document: GameDocumentV1,
  input: MoveInput,
  dependencies: CommandDependencies,
): Result<GameDocumentV1> {
  const valid = validateForCommand(document);
  if (!valid.ok) return valid;

  const normalized = normalizeMoveAt(document, document.cursorNodeId, input);
  if (!normalized.ok) return normalized;

  const current = document.nodesById[document.cursorNodeId];
  if (current === undefined) {
    return failure(
      commandError(
        "NODE_NOT_FOUND",
        "El cursor apunta a un nodo inexistente.",
        "cursorNodeId",
      ),
    );
  }

  const existingChild = current.childIds
    .map((childId) => document.nodesById[childId])
    .find((child): child is Extract<GameNode, { kind: "move" }> => {
      return child?.kind === "move" && child.uci === normalized.value.uci;
    });

  if (existingChild !== undefined) {
    return { ok: true, value: cloneWithCursor(document, existingChild.id) };
  }

  const newId = dependencies.idFactory();
  if (typeof newId !== "string" || newId.trim().length === 0) {
    return failure(
      commandError("INVALID_DOCUMENT", "idFactory devolvió un ID vacío."),
    );
  }
  if (
    newId === document.id ||
    Object.prototype.hasOwnProperty.call(document.nodesById, newId)
  ) {
    return failure(
      commandError(
        "ID_COLLISION",
        "El ID generado ya existe en el documento.",
        "idFactory",
        {
          id: newId,
        },
      ),
    );
  }

  const timestamp = dependencies.clock();
  if (!validClock(timestamp)) {
    return failure(
      commandError(
        "INVALID_DOCUMENT",
        "clock debe devolver ISO-8601 UTC válido.",
      ),
    );
  }

  const newNode = {
    kind: "move" as const,
    id: newId,
    parentId: current.id,
    childIds: [],
    move: normalized.value.move,
    uci: normalized.value.uci,
    san: normalized.value.san,
    fen: normalized.value.fen,
    comment: null,
    nags: [],
  };
  const nodesById = {
    ...document.nodesById,
    [current.id]: { ...current, childIds: [...current.childIds, newId] },
    [newId]: newNode,
  };
  return {
    ok: true,
    value: {
      ...document,
      nodesById,
      cursorNodeId: newId,
      revision: document.revision + 1,
      updatedAt: timestamp,
    },
  };
}

export function navigateTo(
  document: GameDocumentV1,
  nodeId: NodeId,
): Result<GameDocumentV1> {
  const valid = validateForCommand(document);
  if (!valid.ok) return valid;
  if (document.nodesById[nodeId] === undefined) {
    return failure(
      commandError(
        "NODE_NOT_FOUND",
        "El nodo solicitado no existe.",
        "nodeId",
        { nodeId },
      ),
    );
  }
  return { ok: true, value: cloneWithCursor(document, nodeId) };
}

export function navigateBack(document: GameDocumentV1): Result<GameDocumentV1> {
  const valid = validateForCommand(document);
  if (!valid.ok) return valid;
  const current = document.nodesById[document.cursorNodeId];
  if (current === undefined)
    return failure(commandError("NODE_NOT_FOUND", "El cursor no existe."));
  return current.kind === "root"
    ? { ok: true, value: document }
    : { ok: true, value: cloneWithCursor(document, current.parentId) };
}

export function navigateForward(
  document: GameDocumentV1,
  childId?: NodeId,
): Result<GameDocumentV1> {
  const valid = validateForCommand(document);
  if (!valid.ok) return valid;
  const current = document.nodesById[document.cursorNodeId];
  if (current === undefined)
    return failure(commandError("NODE_NOT_FOUND", "El cursor no existe."));
  const nextId = childId ?? current.childIds[0];
  if (nextId === undefined) return { ok: true, value: document };
  if (!current.childIds.includes(nextId)) {
    return failure(
      commandError(
        "NODE_NOT_FOUND",
        "El hijo solicitado no pertenece al nodo actual.",
        "childId",
        {
          childId: nextId,
        },
      ),
    );
  }
  return { ok: true, value: cloneWithCursor(document, nextId) };
}

export const play = playMove;

export const back = navigateBack;

export const forward = navigateForward;
