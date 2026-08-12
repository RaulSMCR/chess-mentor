import type { GameDocumentV1, GameNode } from "@/domain/game-tree/model";

export type SemanticGameDocument = Readonly<{
  schemaVersion: 1;
  title: string;
  headers: Readonly<Record<string, string>>;
  tree: unknown;
  result: GameDocumentV1["result"];
}>;

function semanticNode(document: GameDocumentV1, node: GameNode): unknown {
  const children = node.childIds.map((childId) => {
    const child = document.nodesById[childId];
    return child === undefined ? null : semanticNode(document, child);
  });
  if (node.kind === "root")
    return {
      kind: node.kind,
      fen: node.fen,
      children,
    };
  return {
    kind: node.kind,
    move: node.move,
    uci: node.uci,
    san: node.san,
    fen: node.fen,
    comment: node.comment,
    nags: node.nags,
    children,
  };
}

export function normalizeGameDocument(
  document: GameDocumentV1,
): SemanticGameDocument {
  const root = document.nodesById[document.rootNodeId];
  return {
    schemaVersion: document.schemaVersion,
    title: document.title,
    headers: Object.fromEntries(
      Object.keys(document.headers)
        .sort()
        .map((key) => [key, document.headers[key]]),
    ),
    tree: root === undefined ? null : semanticNode(document, root),
    result: document.result,
  };
}

export function sameSemanticDocument(
  left: GameDocumentV1,
  right: GameDocumentV1,
): boolean {
  return (
    JSON.stringify(normalizeGameDocument(left)) ===
    JSON.stringify(normalizeGameDocument(right))
  );
}

export const normalizeSemantic = normalizeGameDocument;
export const semanticallyEqual = sameSemanticDocument;
