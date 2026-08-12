export type NodeId = string;

export type Color = "w" | "b";

export type Promotion = "q" | "r" | "b" | "n";

export type GameResult = "1-0" | "0-1" | "1/2-1/2" | "*";

export type MoveInput = Readonly<{
  from: string;
  to: string;
  promotion?: Promotion;
}>;

export type RootNode = Readonly<{
  kind: "root";
  id: NodeId;
  parentId: null;
  childIds: readonly NodeId[];
  fen: string;
}>;

export type MoveNode = Readonly<{
  kind: "move";
  id: NodeId;
  parentId: NodeId;
  childIds: readonly NodeId[];
  move: MoveInput;
  uci: string;
  san: string;
  fen: string;
  comment: string | null;
  nags: readonly number[];
}>;

export type GameNode = RootNode | MoveNode;

export type GameDocumentV1 = Readonly<{
  schemaVersion: 1;
  id: string;
  title: string;
  headers: Readonly<Record<string, string>>;
  rootNodeId: NodeId;
  nodesById: Readonly<Record<NodeId, GameNode>>;
  cursorNodeId: NodeId;
  result: GameResult;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type ErrorContext = Readonly<
  Record<string, string | number | boolean | null>
>;

export type DomainErrorCode =
  | "INVALID_FEN"
  | "ILLEGAL_MOVE"
  | "NODE_NOT_FOUND"
  | "CORRUPT_TREE"
  | "ID_COLLISION"
  | "INVALID_NAG"
  | "PGN_PARSE_ERROR"
  | "UNSUPPORTED_PGN_FEATURE"
  | "INVALID_DOCUMENT";

export type DomainError = Readonly<{
  code: DomainErrorCode;
  message: string;
  context?: ErrorContext;
}>;

export type Result<T, E = DomainError> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: E }>;

export type IdFactory = () => string;

export type Clock = () => string;

export type CreateGameDocumentDraftInput = Readonly<{
  rootFen: string;
  idFactory: IdFactory;
  clock: Clock;
  title?: string;
}>;

export const DEFAULT_GAME_TITLE = "Partida sin título";

export const DEFAULT_GAME_RESULT: GameResult = "*";

export function isGameResult(value: unknown): value is GameResult {
  return (
    value === "1-0" || value === "0-1" || value === "1/2-1/2" || value === "*"
  );
}

export function isPromotion(value: unknown): value is Promotion {
  return value === "q" || value === "r" || value === "b" || value === "n";
}

function error(
  code: DomainErrorCode,
  message: string,
  context?: ErrorContext,
): DomainError {
  return context === undefined ? { code, message } : { code, message, context };
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

export function createGameDocumentDraft(
  input: CreateGameDocumentDraftInput,
): Result<GameDocumentV1> {
  if (!isNonEmptyString(input.rootFen)) {
    return {
      ok: false,
      error: error("INVALID_DOCUMENT", "rootFen debe ser un string no vacío."),
    };
  }

  if (typeof input.idFactory !== "function") {
    return {
      ok: false,
      error: error("INVALID_DOCUMENT", "idFactory debe ser una función."),
    };
  }

  if (typeof input.clock !== "function") {
    return {
      ok: false,
      error: error("INVALID_DOCUMENT", "clock debe ser una función."),
    };
  }

  const gameId: unknown = input.idFactory();
  const rootId: unknown = input.idFactory();

  if (!isNonEmptyString(gameId) || !isNonEmptyString(rootId)) {
    return {
      ok: false,
      error: error(
        "INVALID_DOCUMENT",
        "Los IDs generados no pueden estar vacíos.",
      ),
    };
  }

  if (gameId === rootId) {
    return {
      ok: false,
      error: error(
        "ID_COLLISION",
        "El ID de la partida colisiona con el root.",
        {
          gameId,
          rootId,
        },
      ),
    };
  }

  const timestamp: unknown = input.clock();
  const title = input.title ?? DEFAULT_GAME_TITLE;

  if (!isNonEmptyString(title)) {
    return {
      ok: false,
      error: error(
        "INVALID_DOCUMENT",
        "El título debe ser un string no vacío.",
      ),
    };
  }

  if (!isIsoUtc(timestamp)) {
    return {
      ok: false,
      error: error(
        "INVALID_DOCUMENT",
        "clock debe devolver ISO-8601 UTC válido.",
      ),
    };
  }

  const document: GameDocumentV1 = {
    schemaVersion: 1,
    id: gameId,
    title,
    headers: { Result: DEFAULT_GAME_RESULT },
    rootNodeId: rootId,
    nodesById: {
      [rootId]: {
        kind: "root",
        id: rootId,
        parentId: null,
        childIds: [],
        fen: input.rootFen,
      },
    },
    cursorNodeId: rootId,
    result: DEFAULT_GAME_RESULT,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return { ok: true, value: document };
}
