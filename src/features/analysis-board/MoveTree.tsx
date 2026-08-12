"use client";

import type { GameDocumentV1, GameNode } from "@/domain/game-tree/model";

type MoveTreeProps = Readonly<{
  document: GameDocumentV1;
  onNavigate: (nodeId: string) => void;
}>;

function childrenOf(document: GameDocumentV1, node: GameNode): GameNode[] {
  return node.childIds.flatMap((id) => {
    const child = document.nodesById[id];
    return child === undefined ? [] : [child];
  });
}

function renderChildren(
  document: GameDocumentV1,
  parent: GameNode,
  cursorNodeId: string,
  onNavigate: (nodeId: string) => void,
  label: string,
): React.ReactNode {
  const children = childrenOf(document, parent).filter(
    (child): child is Extract<GameNode, { kind: "move" }> =>
      child.kind === "move",
  );
  if (children.length === 0) return null;
  return (
    <ol className="move-list" aria-label={label}>
      {children.map((child, index) => (
        <li key={child.id} className={index > 0 ? "variation-item" : undefined}>
          <button
            aria-current={cursorNodeId === child.id ? "step" : undefined}
            className="move-button"
            type="button"
            onClick={() => onNavigate(child.id)}
          >
            <span>{child.san}</span>
            {index > 0 ? (
              <span className="variation-label">variante</span>
            ) : null}
          </button>
          {renderChildren(
            document,
            child,
            cursorNodeId,
            onNavigate,
            index > 0
              ? `Continuación de variante ${child.san}`
              : `Continuación de ${child.san}`,
          )}
        </li>
      ))}
    </ol>
  );
}

export function MoveTree({ document, onNavigate }: MoveTreeProps) {
  const root = document.nodesById[document.rootNodeId];
  if (root === undefined) return null;
  return (
    <section className="move-tree" aria-label="Árbol de movimientos">
      <h2>Movimientos</h2>
      {renderChildren(
        document,
        root,
        document.cursorNodeId,
        onNavigate,
        "Línea principal",
      )}
    </section>
  );
}
