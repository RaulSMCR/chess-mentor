import type { DomainError, ErrorContext, GameNode } from "./model";
import { isGameResult, isPromotion } from "./model";

const SQUARE_PATTERN = /^[a-h][1-8]$/;
const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

type RecordLike = Record<string, unknown>;

function isRecordLike(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: RecordLike, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function context(path: string, extra?: ErrorContext): ErrorContext {
  return extra === undefined ? { path } : { path, ...extra };
}

function addError(
  errors: DomainError[],
  code: DomainError["code"],
  message: string,
  path: string,
  extra?: ErrorContext,
): void {
  errors.push({ code, message, context: context(path, extra) });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoUtc(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.endsWith("Z") &&
    Number.isFinite(Date.parse(value))
  );
}

function asNode(value: unknown): GameNode | null {
  return isRecordLike(value) ? (value as unknown as GameNode) : null;
}

function validateChildIds(
  errors: DomainError[],
  node: RecordLike,
  nodePath: string,
): string[] {
  const childIds = node.childIds;
  if (!Array.isArray(childIds)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "childIds debe ser un array.",
      `${nodePath}.childIds`,
    );
    return [];
  }

  const ids: string[] = [];
  const seen = new Set<string>();
  childIds.forEach((childId, index) => {
    const path = `${nodePath}.childIds[${index}]`;
    if (!isNonEmptyString(childId)) {
      addError(errors, "INVALID_DOCUMENT", "El ID de hijo no es válido.", path);
      return;
    }
    if (seen.has(childId)) {
      addError(
        errors,
        "CORRUPT_TREE",
        "Un hijo aparece más de una vez.",
        path,
        {
          childId,
        },
      );
      return;
    }
    seen.add(childId);
    ids.push(childId);
  });
  return ids;
}

function validateRootNode(
  errors: DomainError[],
  node: RecordLike,
  nodePath: string,
): string[] {
  if (node.parentId !== null) {
    addError(
      errors,
      "CORRUPT_TREE",
      "El root debe tener parentId null.",
      `${nodePath}.parentId`,
    );
  }
  if (!isNonEmptyString(node.fen)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "El FEN del root no es válido.",
      `${nodePath}.fen`,
    );
  }
  return validateChildIds(errors, node, nodePath);
}

function validateMoveNode(
  errors: DomainError[],
  node: RecordLike,
  nodePath: string,
): string[] {
  if (!isNonEmptyString(node.parentId)) {
    addError(
      errors,
      "CORRUPT_TREE",
      "Un nodo de movimiento debe tener un parentId.",
      `${nodePath}.parentId`,
    );
  }

  if (!isRecordLike(node.move)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "move debe ser un objeto.",
      `${nodePath}.move`,
    );
  } else {
    if (
      typeof node.move.from !== "string" ||
      !SQUARE_PATTERN.test(node.move.from)
    ) {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "move.from debe ser una casilla válida.",
        `${nodePath}.move.from`,
      );
    }
    if (
      typeof node.move.to !== "string" ||
      !SQUARE_PATTERN.test(node.move.to)
    ) {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "move.to debe ser una casilla válida.",
        `${nodePath}.move.to`,
      );
    }
    if (
      node.move.promotion !== undefined &&
      !isPromotion(node.move.promotion)
    ) {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "promotion no es válida.",
        `${nodePath}.move.promotion`,
      );
    }
  }

  if (typeof node.uci !== "string" || !UCI_PATTERN.test(node.uci)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "uci no tiene formato válido.",
      `${nodePath}.uci`,
    );
  }
  if (!isNonEmptyString(node.san)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "san no puede estar vacío.",
      `${nodePath}.san`,
    );
  }
  if (!isNonEmptyString(node.fen)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "El FEN cacheado no puede estar vacío.",
      `${nodePath}.fen`,
    );
  }
  if (node.comment !== null) {
    if (
      typeof node.comment !== "string" ||
      node.comment.trim() !== node.comment
    ) {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "comment debe estar trimmeado o ser null.",
        `${nodePath}.comment`,
      );
    }
    if (node.comment === "") {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "comment vacío debe representarse como null.",
        `${nodePath}.comment`,
      );
    }
  }
  if (!Array.isArray(node.nags)) {
    addError(
      errors,
      "INVALID_NAG",
      "nags debe ser un array.",
      `${nodePath}.nags`,
    );
  } else {
    const seen = new Set<number>();
    node.nags.forEach((nag, index) => {
      const path = `${nodePath}.nags[${index}]`;
      if (!Number.isInteger(nag) || nag < 1 || nag > 255) {
        addError(errors, "INVALID_NAG", "NAG fuera del rango 1..255.", path);
        return;
      }
      if (seen.has(nag)) {
        addError(errors, "INVALID_NAG", "Los NAG no pueden repetirse.", path, {
          nag,
        });
        return;
      }
      seen.add(nag);
    });
  }
  return validateChildIds(errors, node, nodePath);
}

function validateDocumentScalars(
  errors: DomainError[],
  document: RecordLike,
): void {
  if (document.schemaVersion !== 1) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "schemaVersion debe ser 1.",
      "schemaVersion",
    );
  }
  if (!isNonEmptyString(document.id)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "id debe ser un string no vacío.",
      "id",
    );
  }
  if (!isNonEmptyString(document.title)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "title debe ser un string no vacío.",
      "title",
    );
  }
  if (!isNonEmptyString(document.rootNodeId)) {
    addError(
      errors,
      "NODE_NOT_FOUND",
      "rootNodeId debe ser un string no vacío.",
      "rootNodeId",
    );
  }
  if (!isNonEmptyString(document.cursorNodeId)) {
    addError(
      errors,
      "NODE_NOT_FOUND",
      "cursorNodeId debe ser un string no vacío.",
      "cursorNodeId",
    );
  }
  if (!isGameResult(document.result)) {
    addError(errors, "INVALID_DOCUMENT", "result no es válido.", "result");
  }
  if (
    typeof document.revision !== "number" ||
    !Number.isInteger(document.revision) ||
    document.revision < 0
  ) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "revision debe ser un entero no negativo.",
      "revision",
    );
  }
  if (!isIsoUtc(document.createdAt)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "createdAt debe ser ISO-8601 UTC.",
      "createdAt",
    );
  }
  if (!isIsoUtc(document.updatedAt)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "updatedAt debe ser ISO-8601 UTC.",
      "updatedAt",
    );
  }

  if (!isRecordLike(document.headers)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "headers debe ser un objeto.",
      "headers",
    );
  } else {
    for (const [key, value] of Object.entries(document.headers)) {
      if (!isNonEmptyString(key)) {
        addError(
          errors,
          "INVALID_DOCUMENT",
          "Las claves de headers no pueden estar vacías.",
          "headers",
        );
      }
      if (typeof value !== "string") {
        addError(
          errors,
          "INVALID_DOCUMENT",
          "Los valores de headers deben ser strings.",
          `headers.${key}`,
        );
      }
    }
    if (!hasOwn(document.headers, "Result")) {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "headers.Result es obligatorio.",
        "headers.Result",
      );
    } else if (!isGameResult(document.headers.Result)) {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "headers.Result no es válido.",
        "headers.Result",
      );
    } else if (document.headers.Result !== document.result) {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "headers.Result debe coincidir con result.",
        "headers.Result",
      );
    }
  }
}

export function validateGameStructure(document: unknown): DomainError[] {
  const errors: DomainError[] = [];
  if (!isRecordLike(document)) {
    return [
      {
        code: "INVALID_DOCUMENT",
        message: "El documento debe ser un objeto.",
        context: { path: "$" },
      },
    ];
  }

  validateDocumentScalars(errors, document);

  if (!isRecordLike(document.nodesById)) {
    addError(
      errors,
      "INVALID_DOCUMENT",
      "nodesById debe ser un objeto.",
      "nodesById",
    );
    return errors;
  }

  const entries = Object.entries(document.nodesById);
  const nodes = new Map<string, GameNode>();
  const nodeIds = new Map<string, string>();
  const childIdsByNode = new Map<string, string[]>();
  const rootIds: string[] = [];

  for (const [key, rawNode] of entries) {
    const nodePath = `nodesById.${key}`;
    const node = asNode(rawNode);
    if (node === null) {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "Cada entrada debe ser un nodo.",
        nodePath,
      );
      continue;
    }

    if (!isNonEmptyString(node.id)) {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "node.id debe ser un string no vacío.",
        `${nodePath}.id`,
      );
    } else {
      if (key !== node.id) {
        addError(
          errors,
          "CORRUPT_TREE",
          "La clave debe coincidir con node.id.",
          nodePath,
          { key, nodeId: node.id },
        );
      }
      if (nodeIds.has(node.id)) {
        addError(
          errors,
          "ID_COLLISION",
          "Dos entradas contienen el mismo node.id.",
          nodePath,
          { nodeId: node.id, firstKey: nodeIds.get(node.id) ?? null },
        );
      } else {
        nodeIds.set(node.id, key);
      }
    }

    if (node.kind === "root") {
      rootIds.push(node.id);
      childIdsByNode.set(node.id, validateRootNode(errors, node, nodePath));
    } else if (node.kind === "move") {
      childIdsByNode.set(node.id, validateMoveNode(errors, node, nodePath));
    } else {
      addError(
        errors,
        "INVALID_DOCUMENT",
        "kind de nodo desconocido.",
        `${nodePath}.kind`,
      );
    }

    if (isNonEmptyString(node.id)) {
      nodes.set(node.id, node);
    }
  }

  if (rootIds.length !== 1) {
    addError(
      errors,
      "CORRUPT_TREE",
      "Debe existir exactamente un root.",
      "nodesById",
      {
        rootCount: rootIds.length,
      },
    );
  }

  if (isNonEmptyString(document.rootNodeId)) {
    const root = nodes.get(document.rootNodeId);
    if (root === undefined) {
      addError(
        errors,
        "NODE_NOT_FOUND",
        "rootNodeId no apunta a un nodo existente.",
        "rootNodeId",
        { nodeId: document.rootNodeId },
      );
    } else if (root.kind !== "root") {
      addError(
        errors,
        "CORRUPT_TREE",
        "rootNodeId debe apuntar a RootNode.",
        "rootNodeId",
      );
    }
  }

  if (
    isNonEmptyString(document.cursorNodeId) &&
    !nodes.has(document.cursorNodeId)
  ) {
    addError(
      errors,
      "NODE_NOT_FOUND",
      "cursorNodeId no apunta a un nodo existente.",
      "cursorNodeId",
      { nodeId: document.cursorNodeId },
    );
  }

  if (isNonEmptyString(document.id)) {
    const collidingNode = [...nodes.keys()].find(
      (nodeId) => nodeId === document.id,
    );
    if (collidingNode !== undefined) {
      addError(
        errors,
        "ID_COLLISION",
        "El ID de la partida no puede coincidir con un ID de nodo.",
        "id",
        { id: document.id },
      );
    }
  }

  for (const [nodeId, node] of nodes) {
    if (node.kind === "move") {
      if (!isNonEmptyString(node.parentId) || !nodes.has(node.parentId)) {
        addError(
          errors,
          "CORRUPT_TREE",
          "El padre del movimiento no existe.",
          `nodesById.${nodeId}.parentId`,
          { parentId: node.parentId },
        );
      }
    }

    const childIds = childIdsByNode.get(nodeId) ?? [];
    for (const childId of childIds) {
      const child = nodes.get(childId);
      if (child === undefined) {
        addError(
          errors,
          "CORRUPT_TREE",
          "childIds referencia un nodo inexistente.",
          `nodesById.${nodeId}.childIds`,
          { childId },
        );
      } else if (child.parentId !== nodeId) {
        addError(
          errors,
          "CORRUPT_TREE",
          "El hijo no referencia a su padre real.",
          `nodesById.${nodeId}.childIds`,
          { childId, actualParentId: child.parentId },
        );
      }
    }
  }

  const rootId = isNonEmptyString(document.rootNodeId)
    ? document.rootNodeId
    : null;
  if (rootId !== null && nodes.has(rootId)) {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (nodeId: string): void => {
      if (visiting.has(nodeId)) {
        addError(
          errors,
          "CORRUPT_TREE",
          "El árbol contiene un ciclo.",
          "nodesById",
          { nodeId },
        );
        return;
      }
      if (visited.has(nodeId)) return;
      visiting.add(nodeId);
      for (const childId of childIdsByNode.get(nodeId) ?? []) {
        if (nodes.has(childId)) visit(childId);
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
    };
    visit(rootId);

    for (const nodeId of nodes.keys()) {
      if (!visited.has(nodeId)) {
        addError(
          errors,
          "CORRUPT_TREE",
          "El nodo es huérfano del root.",
          "nodesById",
          {
            nodeId,
          },
        );
      }
    }
  }

  for (const [nodeId, node] of nodes) {
    if (node.kind !== "move" || !isNonEmptyString(node.parentId)) continue;
    const chain = new Set<string>();
    let current: string | null = nodeId;
    while (current !== null && current !== rootId) {
      if (chain.has(current)) {
        addError(
          errors,
          "CORRUPT_TREE",
          "La cadena de padres contiene un ciclo.",
          "nodesById",
          {
            nodeId,
          },
        );
        break;
      }
      chain.add(current);
      const currentNode = nodes.get(current);
      if (currentNode === undefined || currentNode.kind !== "move") break;
      current = isNonEmptyString(currentNode.parentId)
        ? currentNode.parentId
        : null;
    }
  }

  return errors;
}
