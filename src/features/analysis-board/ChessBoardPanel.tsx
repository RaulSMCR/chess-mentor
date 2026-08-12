"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { Chessboard } from "react-chessboard";

import type { GameDocumentV1, MoveInput } from "@/domain/game-tree/model";

import { PromotionDialog } from "./PromotionDialog";

type PendingPromotion = Readonly<{
  from: string;
  to: string;
  options: readonly string[];
}>;

export type ChessBoardPanelProps = Readonly<{
  document: GameDocumentV1 | null;
  orientation: "white" | "black";
  onFlip: () => void;
  onPlay: (move: MoveInput) => boolean;
  getPromotionOptions: (
    from: string,
    to: string,
  ) =>
    | { ok: true; value: readonly string[] }
    | { ok: false; error: { code: string; message: string } };
  onError: (message: string) => void;
}>;

export function ChessBoardPanel({
  document,
  orientation,
  onFlip,
  onPlay,
  getPromotionOptions,
  onError,
}: ChessBoardPanelProps) {
  const [pending, setPending] = useState<PendingPromotion | null>(null);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const position = document?.nodesById[document.cursorNodeId]?.fen ?? "start";

  const handleDrop = useCallback(
    ({
      sourceSquare,
      targetSquare,
    }: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => {
      if (targetSquare === null) return false;
      const promotions = getPromotionOptions(sourceSquare, targetSquare);
      if (!promotions.ok) {
        onError(`${promotions.error.code}: ${promotions.error.message}`);
        return false;
      }
      if (promotions.value.length > 0) {
        setPending({
          from: sourceSquare,
          to: targetSquare,
          options: promotions.value,
        });
        return false;
      }
      return onPlay({ from: sourceSquare, to: targetSquare });
    },
    [getPromotionOptions, onError, onPlay],
  );

  const confirmPromotion = useCallback(
    (promotion: string) => {
      if (pending === null) return;
      onPlay({
        from: pending.from,
        to: pending.to,
        promotion: promotion as MoveInput["promotion"],
      });
      setPending(null);
    },
    [onPlay, pending],
  );

  return (
    <section className="board-panel" aria-label="Tablero de ajedrez">
      <div className="board-frame">
        {mounted ? (
          <Chessboard
            options={{
              position,
              boardOrientation: orientation,
              allowDragging: document !== null,
              onPieceDrop: handleDrop,
            }}
          />
        ) : (
          <div aria-label="Tablero cargando" className="board-placeholder" />
        )}
      </div>
      <button type="button" onClick={onFlip}>
        Voltear tablero
      </button>
      {pending === null ? null : (
        <PromotionDialog
          options={pending.options}
          onSelect={confirmPromotion}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}
