import { Chess, validateFen, type Move } from "chess.js";

import {
  createGameDocumentDraft,
  type CreateGameDocumentDraftInput,
  type DomainError,
  type GameDocumentV1,
  type GameNode,
  type MoveInput,
  type NodeId,
  type Promotion,
  type Result,
} from "./model";
import { validateGameDocument } from "./invariants";

export type CreateGameDocumentInput = CreateGameDocumentDraftInput;

export type GameStatus =
  | "checkmate"
  | "stalemate"
  | "threefold"
  | "fiftyMove"
  | "insufficientMaterial"
  | "ongoing";

export type ReplayState = Readonly<{
  status: GameStatus;
  turn: "w" | "b";
  inCheck: boolean;
  gameOver: boolean;
}>;

export type NormalizedMove = Readonly<{
  move: MoveInput;
  uci: string;
  san: string;
  fen: string;
}>;

export type ReplayResult = Readonly<{
  nodeId: NodeId;
  path: readonly NodeId[];
  move: MoveInput | null;
  uci: string | null;
  san: string | null;
  fen: string;
  state: ReplayState;
  status: GameStatus;
  turn: "w" | "b";
  inCheck: boolean;
  gameOver: boolean;
  position: Readonly<{
    fen: string;
    state: ReplayState;
  }>;
}>;

function domainError(
  code: DomainError["code"],
  message: string,
  path?: string,
  extra?: Readonly<Record<string, string | number | boolean | null>>,
): DomainError {
  const context = path === undefined ? extra : { path, ...(extra ?? {}) };
  return context === undefined ? { code, message } : { code, message, context };
}

function resultError<T>(error: DomainError): Result<T> {
  return { ok: false, error };
}

function chessMoveInput(move: MoveInput): {
  from: string;
  to: string;
  promotion?: string;
} {
  return move.promotion === undefined
    ? { from: move.from, to: move.to }
    : { from: move.from, to: move.to, promotion: move.promotion };
}

function toNormalizedMove(applied: Move): NormalizedMove {
  const move: MoveInput =
    applied.promotion === undefined
      ? { from: applied.from, to: applied.to }
      : {
          from: applied.from,
          to: applied.to,
          promotion: applied.promotion as Promotion,
        };
  return {
    move,
    uci: `${applied.from}${applied.to}${applied.promotion ?? ""}`,
    san: applied.san,
    fen: applied.after,
  };
}

function stateOf(chess: Chess): ReplayState {
  const status: GameStatus = chess.isCheckmate()
    ? "checkmate"
    : chess.isStalemate()
      ? "stalemate"
      : chess.isThreefoldRepetition()
        ? "threefold"
        : Number(chess.fen().split(/\s+/)[4] ?? "0") >= 100
          ? "fiftyMove"
          : chess.isInsufficientMaterial()
            ? "insufficientMaterial"
            : "ongoing";

  return {
    status,
    turn: chess.turn(),
    inCheck: chess.isCheck(),
    gameOver: status !== "ongoing",
  };
}

function pathToNode(
  document: GameDocumentV1,
  nodeId: NodeId,
): Result<readonly NodeId[]> {
  const path: NodeId[] = [];
  const seen = new Set<NodeId>();
  let current: NodeId | null = nodeId;

  while (current !== null) {
    if (seen.has(current)) {
      return resultError(
        domainError(
          "CORRUPT_TREE",
          "La ruta del nodo contiene un ciclo.",
          "cursorNodeId",
          {
            nodeId,
          },
        ),
      );
    }
    seen.add(current);
    const node: GameNode | undefined = document.nodesById[current];
    if (node === undefined) {
      return resultError(
        domainError(
          "NODE_NOT_FOUND",
          "El nodo solicitado no existe.",
          "nodeId",
          { nodeId: current },
        ),
      );
    }
    path.unshift(current);
    if (node.kind === "root") {
      if (current !== document.rootNodeId) {
        return resultError(
          domainError(
            "CORRUPT_TREE",
            "La ruta termina en un root inesperado.",
            "nodeId",
            {
              nodeId: current,
            },
          ),
        );
      }
      return { ok: true, value: path };
    }
    current = node.parentId;
  }

  return resultError(
    domainError("CORRUPT_TREE", "La ruta no alcanza el root.", "nodeId", {
      nodeId,
    }),
  );
}

function replayChess(
  document: GameDocumentV1,
  path: readonly NodeId[],
): Result<{ chess: Chess; lastMove: NormalizedMove | null }> {
  const root = document.nodesById[document.rootNodeId];
  if (root === undefined || root.kind !== "root") {
    return resultError(
      domainError("CORRUPT_TREE", "El root no existe.", "rootNodeId"),
    );
  }

  let chess: Chess;
  try {
    chess = new Chess(root.fen);
  } catch (cause) {
    return resultError(
      domainError(
        "INVALID_FEN",
        "El FEN del root no pudo cargarse.",
        "root.fen",
        {
          reason: cause instanceof Error ? cause.message : String(cause),
        },
      ),
    );
  }

  let lastMove: NormalizedMove | null = null;
  for (const nodeId of path.slice(1)) {
    const node = document.nodesById[nodeId];
    if (node === undefined || node.kind !== "move") {
      return resultError(
        domainError(
          "CORRUPT_TREE",
          "La ruta contiene un nodo que no es movimiento.",
          "path",
          {
            nodeId,
          },
        ),
      );
    }
    try {
      lastMove = toNormalizedMove(chess.move(chessMoveInput(node.move)));
    } catch (cause) {
      return resultError(
        domainError(
          "ILLEGAL_MOVE",
          "La ruta contiene una jugada ilegal.",
          "path",
          {
            nodeId,
            reason: cause instanceof Error ? cause.message : String(cause),
          },
        ),
      );
    }
  }

  return { ok: true, value: { chess, lastMove } };
}

function replayInternal(
  document: GameDocumentV1,
  nodeId: NodeId,
): Result<{ result: ReplayResult; chess: Chess }> {
  const validationErrors = validateGameDocument(document);
  if (validationErrors.length > 0) return resultError(validationErrors[0]);

  const pathResult = pathToNode(document, nodeId);
  if (!pathResult.ok) return pathResult;
  const replayed = replayChess(document, pathResult.value);
  if (!replayed.ok) return replayed;

  const node = document.nodesById[nodeId];
  if (node === undefined) {
    return resultError(
      domainError("NODE_NOT_FOUND", "El nodo solicitado no existe.", "nodeId", {
        nodeId,
      }),
    );
  }
  const state = stateOf(replayed.value.chess);
  const result: ReplayResult = {
    nodeId,
    path: pathResult.value,
    move: node.kind === "move" ? node.move : null,
    uci: node.kind === "move" ? node.uci : null,
    san: node.kind === "move" ? node.san : null,
    fen: replayed.value.chess.fen(),
    state,
    status: state.status,
    turn: state.turn,
    inCheck: state.inCheck,
    gameOver: state.gameOver,
    position: { fen: replayed.value.chess.fen(), state },
  };
  return { ok: true, value: { result, chess: replayed.value.chess } };
}

export function createGameDocument(
  input: CreateGameDocumentInput,
): Result<GameDocumentV1> {
  if (typeof input.rootFen !== "string") {
    return resultError(
      domainError("INVALID_FEN", "rootFen debe ser un string."),
    );
  }
  const validation = validateFen(input.rootFen);
  if (!validation.ok) {
    return resultError(
      domainError(
        "INVALID_FEN",
        "El FEN proporcionado no es válido.",
        "rootFen",
        {
          reason: validation.error ?? "unknown",
        },
      ),
    );
  }

  let normalizedFen: string;
  try {
    normalizedFen = new Chess(input.rootFen).fen();
  } catch (cause) {
    return resultError(
      domainError(
        "INVALID_FEN",
        "El FEN proporcionado no pudo cargarse.",
        "rootFen",
        {
          reason: cause instanceof Error ? cause.message : String(cause),
        },
      ),
    );
  }

  return createGameDocumentDraft({ ...input, rootFen: normalizedFen });
}

export function replayToNode(
  document: GameDocumentV1,
  nodeId: NodeId = document.cursorNodeId,
): Result<ReplayResult> {
  const replayed = replayInternal(document, nodeId);
  return replayed.ok ? { ok: true, value: replayed.value.result } : replayed;
}

export const replayGame = replayToNode;

export const replayPath = replayToNode;

export function getGameState(
  document: GameDocumentV1,
  nodeId: NodeId = document.cursorNodeId,
): Result<ReplayState> {
  const replayed = replayToNode(document, nodeId);
  return replayed.ok ? { ok: true, value: replayed.value.state } : replayed;
}

export function normalizeMoveAt(
  document: GameDocumentV1,
  nodeId: NodeId,
  move: MoveInput,
): Result<NormalizedMove> {
  const replayed = replayInternal(document, nodeId);
  if (!replayed.ok) return replayed;
  try {
    return {
      ok: true,
      value: toNormalizedMove(replayed.value.chess.move(chessMoveInput(move))),
    };
  } catch (cause) {
    return resultError(
      domainError(
        "ILLEGAL_MOVE",
        "El movimiento no es legal en la posición indicada.",
        "move",
        {
          nodeId,
          reason: cause instanceof Error ? cause.message : String(cause),
        },
      ),
    );
  }
}

export function getPromotionOptions(
  document: GameDocumentV1,
  nodeId: NodeId,
  from: string,
  to: string,
): Result<readonly Promotion[]> {
  const replayed = replayInternal(document, nodeId);
  if (!replayed.ok) return replayed;

  const options = new Set<Promotion>();
  const moves = replayed.value.chess.moves({ verbose: true });
  for (const move of moves) {
    if (move.from === from && move.to === to && move.promotion !== undefined) {
      options.add(move.promotion as Promotion);
    }
  }
  const order: readonly Promotion[] = ["q", "r", "b", "n"];
  return {
    ok: true,
    value: order.filter((promotion) => options.has(promotion)),
  };
}
