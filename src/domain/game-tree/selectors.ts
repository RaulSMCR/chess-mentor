import type {
  DomainError,
  GameDocumentV1,
  GameNode,
  NodeId,
  Result,
} from "./model";
import { validateGameStructure } from "./invariants";

export type FlattenedNode = Readonly<{
  node: GameNode;
  depth: number;
  path: readonly NodeId[];
}>;

function failure<T>(error: DomainError): Result<T> {
  return { ok: false, error };
}

function validDocument(document: GameDocumentV1): Result<GameDocumentV1> {
  const errors = validateGameStructure(document);
  return errors.length === 0
    ? { ok: true, value: document }
    : failure(errors[0]);
}

function nodeResult(
  document: GameDocumentV1,
  nodeId: NodeId,
): Result<GameNode> {
  const valid = validDocument(document);
  if (!valid.ok) return valid;
  const node = document.nodesById[nodeId];
  return node === undefined
    ? failure({
        code: "NODE_NOT_FOUND",
        message: "El nodo no existe.",
        context: { nodeId },
      })
    : { ok: true, value: node };
}

export function selectCurrentNode(document: GameDocumentV1): Result<GameNode> {
  return nodeResult(document, document.cursorNodeId);
}

export function selectCurrentFen(document: GameDocumentV1): Result<string> {
  const current = selectCurrentNode(document);
  return current.ok ? { ok: true, value: current.value.fen } : current;
}

export function selectPath(
  document: GameDocumentV1,
  nodeId: NodeId = document.cursorNodeId,
): Result<readonly GameNode[]> {
  const valid = validDocument(document);
  if (!valid.ok) return valid;
  const path: GameNode[] = [];
  const seen = new Set<NodeId>();
  let currentId: NodeId | null = nodeId;
  while (currentId !== null) {
    if (seen.has(currentId)) {
      return failure({
        code: "CORRUPT_TREE",
        message: "La ruta contiene un ciclo.",
        context: { nodeId },
      });
    }
    seen.add(currentId);
    const node: GameNode | undefined = document.nodesById[currentId];
    if (node === undefined) {
      return failure({
        code: "NODE_NOT_FOUND",
        message: "La ruta contiene un nodo inexistente.",
        context: { nodeId: currentId },
      });
    }
    path.unshift(node);
    currentId = node.kind === "root" ? null : node.parentId;
  }
  if (path[0]?.id !== document.rootNodeId) {
    return failure({
      code: "CORRUPT_TREE",
      message: "La ruta no alcanza el root.",
      context: { nodeId },
    });
  }
  return { ok: true, value: path };
}

export function selectChildren(
  document: GameDocumentV1,
  nodeId: NodeId = document.cursorNodeId,
): Result<readonly GameNode[]> {
  const node = nodeResult(document, nodeId);
  if (!node.ok) return node;
  return {
    ok: true,
    value: node.value.childIds.flatMap((childId) => {
      const child = document.nodesById[childId];
      return child === undefined ? [] : [child];
    }),
  };
}

export function canBack(document: GameDocumentV1): boolean {
  const current = selectCurrentNode(document);
  return current.ok && current.value.kind === "move";
}

export function canForward(document: GameDocumentV1): boolean {
  const current = selectCurrentNode(document);
  return current.ok && current.value.childIds.length > 0;
}

export function flattenTree(
  document: GameDocumentV1,
): Result<readonly FlattenedNode[]> {
  const valid = validDocument(document);
  if (!valid.ok) return valid;
  const output: FlattenedNode[] = [];
  const walk = (
    nodeId: NodeId,
    depth: number,
    path: readonly NodeId[],
  ): void => {
    const node = document.nodesById[nodeId];
    if (node === undefined) return;
    const nextPath = [...path, nodeId];
    output.push({ node, depth, path: nextPath });
    for (const childId of node.childIds) walk(childId, depth + 1, nextPath);
  };
  walk(document.rootNodeId, 0, []);
  return { ok: true, value: output };
}

export const currentNode = selectCurrentNode;
export const currentFen = selectCurrentFen;
export const pathToNode = selectPath;
export const childrenOf = selectChildren;
