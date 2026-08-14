import { Chess } from "chess.js";

import type { EngineLine, EngineScore } from "./EngineAdapter";

const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/u;

export type CompareMoveInput = Readonly<{
  fen: string;
  humanMove: string;
  engineLine: Pick<EngineLine, "bestmove" | "score"> | null;
}>;

export type MoveComparison = Readonly<{
  bestmove: string | null;
  legal: boolean;
  sameAsBestmove: boolean;
  score: EngineScore | null;
}>;

/** Normaliza UCI a minúsculas y conserva la promoción cuando está presente. */
export function normalizeUciMove(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return UCI_MOVE_PATTERN.test(normalized) ? normalized : null;
}

function isLegalNormalizedMove(fen: string, move: string | null): boolean {
  if (move === null) return false;
  try {
    const chess = new Chess(fen);
    const from = move.slice(0, 2);
    const to = move.slice(2, 4);
    const promotion = move.slice(4) || undefined;
    chess.move({
      from,
      to,
      ...(promotion === undefined ? {} : { promotion }),
    });
    return true;
  } catch {
    return false;
  }
}

/** Comprueba una jugada UCI contra el FEN sin mutar el documento de partida. */
export function isLegalUciMove(fen: string, move: string): boolean {
  return isLegalNormalizedMove(fen, normalizeUciMove(move));
}

/**
 * Compara una jugada humana con la línea recibida del motor.
 * `legal` describe la jugada humana; el motor puede devolver `0000` cuando no
 * existe una jugada legal y en ese caso `bestmove` se expone como null.
 */
export function compareMove(input: CompareMoveInput): MoveComparison {
  const humanMove = normalizeUciMove(input.humanMove);
  const bestmove =
    input.engineLine === null
      ? null
      : normalizeUciMove(input.engineLine.bestmove);
  const legal = isLegalNormalizedMove(input.fen, humanMove);

  return {
    bestmove,
    legal,
    sameAsBestmove: legal && bestmove !== null && humanMove === bestmove,
    score: input.engineLine?.score ?? null,
  };
}
