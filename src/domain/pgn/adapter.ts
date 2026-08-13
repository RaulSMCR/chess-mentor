import { Chess, validateFen } from "chess.js";
import { parse as parseSan } from "@echecs/san";
import {
  parse as parsePgn,
  stringify,
  type Meta,
  type Notation,
  type NotationList,
  type PGN,
  type ParseError,
  type ParseWarning,
} from "@echecs/pgn";

import { createGameDocument } from "@/domain/game-tree/replay";
import type { GameDocumentV1, GameNode } from "@/domain/game-tree/model";
import type {
  Clock,
  DomainError,
  GameResult,
  IdFactory,
  MoveInput,
  Promotion,
  Result,
} from "@/domain/game-tree/model";
import { assertGameDocument } from "@/domain/game-tree/invariants";

export const MAX_PGN_INPUT_BYTES = 1_048_576;

export type PgnWarning = Readonly<{
  code: "CUSTOM_START_MOVE_NUMBER_REVALIDATED" | "MISSING_OPTIONAL_STR_TAG";
  message: string;
  line: number;
  column: number;
  offset: number;
}>;

export type PgnAdapterDependencies = Readonly<{
  idFactory: IdFactory;
  clock: Clock;
}>;

export type ImportPgnSuccess = Readonly<{
  document: GameDocumentV1;
  warnings: readonly PgnWarning[];
}>;

export type ImportPgnResult = Result<ImportPgnSuccess>;

type RuntimeMeta = Omit<Meta, "Result"> & { Result?: GameResult };
type RuntimePgn = Omit<PGN, "meta"> & { meta: RuntimeMeta };

const stringifyRuntime = stringify as unknown as (game: RuntimePgn) => string;

const STANDARD_FEN = new Chess().fen();

const DOMAIN_RESULTS: readonly GameResult[] = ["1-0", "0-1", "1/2-1/2", "*"];

function failure(
  code: DomainError["code"],
  message: string,
  context?: Readonly<Record<string, string | number | boolean | null>>,
): Result<never> {
  return context === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, context } };
}

function parserContext(
  item: ParseError | ParseWarning,
): Readonly<Record<string, number>> {
  return { line: item.line, column: item.column, offset: item.offset };
}

function terminationToDomain(value: PGN["result"]): GameResult {
  if (value === 1) return "1-0";
  if (value === 0) return "0-1";
  if (value === 0.5) return "1/2-1/2";
  return "*";
}

function domainToTermination(value: GameResult): PGN["result"] {
  if (value === "1-0") return 1;
  if (value === "0-1") return 0;
  if (value === "1/2-1/2") return 0.5;
  return "?";
}

function isDomainResult(value: unknown): value is GameResult {
  return (
    typeof value === "string" && DOMAIN_RESULTS.includes(value as GameResult)
  );
}

function normalizeComment(comment: string | undefined): string | null {
  if (comment === undefined) return null;
  const value = comment.trim();
  return value === "" ? null : value;
}

function normalizeNags(
  annotations: readonly string[] | undefined,
): Result<number[]> {
  const result: number[] = [];
  const seen = new Set<number>();
  const symbolic: Record<string, number> = {
    "!": 1,
    "?": 2,
    "!!": 3,
    "??": 4,
    "!?": 5,
    "?!": 6,
  };
  for (const annotation of annotations ?? []) {
    const raw = annotation.startsWith("$") ? annotation.slice(1) : annotation;
    const parsed = symbolic[raw] ?? Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 255) {
      return failure(
        "PGN_PARSE_ERROR",
        `NAG fuera del rango 1..255: ${annotation}`,
      );
    }
    if (!seen.has(parsed)) {
      seen.add(parsed);
      result.push(parsed);
    }
  }
  return { ok: true, value: result };
}

function unsupportedNotation(notation: Notation): boolean {
  return (
    (notation.arrows?.length ?? 0) > 0 ||
    (notation.squares?.length ?? 0) > 0 ||
    notation.clock !== undefined ||
    notation.eval !== undefined
  );
}

function notationToSan(notation: Notation): string {
  if (notation.castling) return notation.long ? "O-O-O" : "O-O";
  const pieceMap: Record<string, string> = {
    king: "K",
    queen: "Q",
    rook: "R",
    bishop: "B",
    knight: "N",
    pawn: "",
  };
  const piece = pieceMap[notation.piece] ?? "";
  const from = notation.from ?? "";
  const to = notation.to ?? "";
  const capture = notation.capture ? "x" : "";
  const promotion =
    notation.promotion === undefined
      ? ""
      : `=${String(notation.promotion).toUpperCase()}`;
  const suffix = notation.checkmate ? "#" : notation.check ? "+" : "";
  if (notation.piece === "pawn") {
    const pawnPrefix = notation.capture ? from.slice(0, 1) : "";
    return `${pawnPrefix}${capture}${to}${promotion}${suffix}`;
  }
  return `${piece}${from}${capture}${to}${promotion}${suffix}`;
}

function parseNotationMove(
  chess: Chess,
  notation: Notation,
): Result<{ move: MoveInput; san: string; fen: string; uci: string }> {
  const san = notationToSan(notation);
  try {
    const applied = chess.move(san, { strict: true });
    const move: MoveInput =
      applied.promotion === undefined
        ? { from: applied.from, to: applied.to }
        : {
            from: applied.from,
            to: applied.to,
            promotion: applied.promotion as Promotion,
          };
    return {
      ok: true,
      value: {
        move,
        san: applied.san,
        fen: applied.after,
        uci: `${applied.from}${applied.to}${applied.promotion ?? ""}`,
      },
    };
  } catch (cause) {
    return failure("PGN_PARSE_ERROR", `SAN ilegal: ${san}`, {
      san,
      reason: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

function collectUnsupported(line: NotationList): Notation | null {
  for (const pair of line) {
    for (const index of [1, 2] as const) {
      const notation = pair[index];
      if (notation !== undefined) {
        if (unsupportedNotation(notation)) return notation;
        for (const variant of notation.variants ?? []) {
          const nested = collectUnsupported(variant);
          if (nested !== null) return nested;
        }
      }
    }
  }
  return null;
}

function parseResultHeader(
  meta: RuntimeMeta,
  termination: GameResult,
): Result<GameResult> {
  const header: unknown = meta.Result;
  if (!isDomainResult(header)) {
    return failure(
      "PGN_PARSE_ERROR",
      "El header Result es obligatorio y válido.",
    );
  }
  if (header !== termination) {
    return failure(
      "PGN_PARSE_ERROR",
      "El header Result no coincide con el terminador.",
      { header, termination },
    );
  }
  return { ok: true, value: termination };
}

function customRoot(
  meta: RuntimeMeta,
): Result<{ fen: string; custom: boolean }> {
  const setup = meta.SetUp;
  const fen = meta.FEN;
  if (setup === undefined && fen === undefined)
    return { ok: true, value: { fen: STANDARD_FEN, custom: false } };
  if (setup !== "1" || typeof fen !== "string" || !validateFen(fen).ok) {
    return failure(
      "PGN_PARSE_ERROR",
      "SetUp/FEN debe ser SetUp=1 con FEN válido.",
    );
  }
  return { ok: true, value: { fen: new Chess(fen).fen(), custom: true } };
}

export function importPgn(
  input: string,
  dependencies: PgnAdapterDependencies,
): ImportPgnResult {
  if (typeof input !== "string" || input.trim() === "")
    return failure("PGN_PARSE_ERROR", "El PGN no puede estar vacío.");
  const bytes = new TextEncoder().encode(input).byteLength;
  if (bytes > MAX_PGN_INPUT_BYTES)
    return failure("PGN_PARSE_ERROR", "El PGN supera el límite de 1 MiB.", {
      bytes,
      limit: MAX_PGN_INPUT_BYTES,
    });

  const errors: ParseError[] = [];
  const warningsRaw: ParseWarning[] = [];
  const games = parsePgn(input, {
    onError: (item) => errors.push(item),
    onWarning: (item) => warningsRaw.push(item),
  });
  if (errors.length > 0) {
    return failure(
      "PGN_PARSE_ERROR",
      errors[0].message,
      parserContext(errors[0]),
    );
  }
  if (games.length !== 1)
    return failure(
      "PGN_PARSE_ERROR",
      "Fase 1 admite una partida por importación.",
      { games: games.length },
    );

  const game = games[0];
  const runtimeMeta = game.meta as RuntimeMeta;
  const termination = terminationToDomain(game.result);
  const resultHeader = parseResultHeader(runtimeMeta, termination);
  if (!resultHeader.ok) return resultHeader;
  const rootResult = customRoot(runtimeMeta);
  if (!rootResult.ok) return rootResult;

  const allowedWarnings: PgnWarning[] = [];
  for (const warning of warningsRaw) {
    const match = /^Move number mismatch: expected \d+, got \d+$/.test(
      warning.message,
    );
    if (match && rootResult.value.custom) {
      allowedWarnings.push({
        code: "CUSTOM_START_MOVE_NUMBER_REVALIDATED",
        ...warning,
      });
      continue;
    }
    if (
      /^Missing STR tag: (Event|Site|Date|Round|White|Black)$/.test(
        warning.message,
      )
    ) {
      allowedWarnings.push({
        code: "MISSING_OPTIONAL_STR_TAG",
        ...warning,
      });
      continue;
    }
    return failure("PGN_PARSE_ERROR", warning.message, parserContext(warning));
  }

  const unsupported = collectUnsupported(game.moves);
  if (unsupported !== null)
    return failure(
      "UNSUPPORTED_PGN_FEATURE",
      "El PGN contiene directivas no soportadas.",
    );

  const titleValue =
    typeof runtimeMeta.Event === "string" ? runtimeMeta.Event.trim() : "";
  const title =
    titleValue !== "" && titleValue !== "?" ? titleValue : "Partida importada";
  const created = createGameDocument({
    rootFen: rootResult.value.fen,
    idFactory: dependencies.idFactory,
    clock: dependencies.clock,
    title,
  });
  if (!created.ok) return created;

  let document = created.value;
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(runtimeMeta))
    if (typeof value === "string") headers[key] = value;
  headers.Result = termination;
  if (rootResult.value.custom) {
    headers.SetUp = "1";
    headers.FEN = rootResult.value.fen;
  } else {
    delete headers.SetUp;
    delete headers.FEN;
  }
  document = { ...document, headers, result: termination };
  const nodes = { ...document.nodesById } as Record<
    string,
    GameDocumentV1["nodesById"][string]
  >;
  const rootId = document.rootNodeId;

  const walk = (
    line: NotationList,
    parentId: string,
    pathMoves: readonly MoveInput[],
  ): Result<void> => {
    let currentParent = parentId;
    let currentPath = [...pathMoves];
    for (const pair of line) {
      for (const index of [1, 2] as const) {
        const notation = pair[index];
        if (notation === undefined) continue;
        const chess = new Chess(rootResult.value.fen);
        try {
          for (const previous of currentPath) chess.move(previous);
        } catch (cause) {
          return failure("PGN_PARSE_ERROR", "La ruta PGN no es legal.", {
            reason: cause instanceof Error ? cause.message : String(cause),
          });
        }
        const parsed = parseNotationMove(chess, notation);
        if (!parsed.ok) return parsed;
        const nags = normalizeNags(notation.annotations);
        if (!nags.ok) return nags;
        const id = dependencies.idFactory();
        if (
          typeof id !== "string" ||
          id.trim() === "" ||
          id === document.id ||
          Object.prototype.hasOwnProperty.call(nodes, id)
        )
          return failure(
            "ID_COLLISION",
            "ID de nodo duplicado durante importación.",
            { id },
          );
        const parent = nodes[currentParent];
        if (parent === undefined)
          return failure("CORRUPT_TREE", "Padre PGN inexistente.", {
            parentId: currentParent,
          });
        nodes[currentParent] = {
          ...parent,
          childIds: [...parent.childIds, id],
        };
        nodes[id] = {
          kind: "move",
          id,
          parentId: currentParent,
          childIds: [],
          move: parsed.value.move,
          uci: parsed.value.uci,
          san: parsed.value.san,
          fen: parsed.value.fen,
          comment: normalizeComment(notation.comment),
          nags: nags.value,
        };
        const variants = notation.variants ?? [];
        for (const variant of variants) {
          const variantResult = walk(variant, currentParent, currentPath);
          if (!variantResult.ok) return variantResult;
        }
        currentParent = id;
        currentPath = [...currentPath, parsed.value.move];
      }
    }
    return { ok: true, value: undefined };
  };

  const walked = walk(game.moves, rootId, []);
  if (!walked.ok) return walked;
  document = { ...document, nodesById: nodes, cursorNodeId: rootId };
  try {
    assertGameDocument(document);
  } catch (cause) {
    return failure(
      "PGN_PARSE_ERROR",
      cause instanceof Error ? cause.message : String(cause),
    );
  }
  return { ok: true, value: { document, warnings: allowedWarnings } };
}

function nodeNotation(node: GameDocumentV1["nodesById"][string]): Notation {
  if (node.kind !== "move") throw new Error("root cannot become notation");
  const parsed = parseSan(node.san);
  const notation: Notation = { ...parsed };
  if (node.comment !== null) notation.comment = node.comment;
  if (node.nags.length > 0) notation.annotations = node.nags.map(String);
  return notation;
}

function exportLine(
  document: GameDocumentV1,
  firstChildId: string,
  parentPath: readonly MoveInput[],
): NotationList {
  const root = document.nodesById[document.rootNodeId];
  if (root === undefined || root.kind !== "root")
    throw new Error("root missing");
  const output: NotationList = [];
  const chess = new Chess(root.fen);
  for (const move of parentPath) chess.move(move);
  let currentPath = [...parentPath];
  let currentId: string | undefined = firstChildId;
  let previousPair: [number, Notation | undefined, Notation?] | undefined;
  while (currentId !== undefined) {
    const node: GameNode | undefined = document.nodesById[currentId];
    if (node === undefined || node.kind !== "move") break;
    const notation = nodeNotation(node);
    const moveNumber = chess.moveNumber();
    const turn = chess.turn();
    if (turn === "w") {
      previousPair = [moveNumber, notation];
      output.push(previousPair);
    } else if (
      previousPair !== undefined &&
      previousPair[0] === moveNumber &&
      previousPair[2] === undefined
    ) {
      previousPair[2] = notation;
    } else {
      previousPair = [moveNumber, undefined, notation];
      output.push(previousPair);
    }
    const parent = document.nodesById[node.parentId];
    if (parent !== undefined && parent.kind !== "root") {
      const siblingIds = parent.childIds.slice(1);
      if (parent.childIds[0] === node.id && siblingIds.length > 0) {
        notation.variants = siblingIds.map((siblingId) =>
          exportLine(document, siblingId, currentPath),
        );
      }
    } else if (
      parent !== undefined &&
      parent.kind === "root" &&
      parent.childIds[0] === node.id &&
      parent.childIds.length > 1
    ) {
      notation.variants = parent.childIds
        .slice(1)
        .map((siblingId) => exportLine(document, siblingId, currentPath));
    }
    chess.move(node.move);
    currentPath = [...currentPath, node.move];
    currentId = node.childIds[0];
  }
  return output;
}

export function exportPgn(document: GameDocumentV1): Result<string> {
  try {
    assertGameDocument(document);
    const root = document.nodesById[document.rootNodeId];
    if (root === undefined || root.kind !== "root")
      return failure("INVALID_DOCUMENT", "Root inexistente.");
    const meta: Record<string, string> = {
      Event: document.headers.Event ?? "Chess Mentor",
      Site: document.headers.Site ?? "Local",
      Date: document.headers.Date ?? "????.??.??",
      Round: document.headers.Round ?? "?",
      White: document.headers.White ?? "?",
      Black: document.headers.Black ?? "?",
      ...document.headers,
      Result: document.result,
    };
    if (root.fen !== STANDARD_FEN) {
      meta.SetUp = "1";
      meta.FEN = root.fen;
    } else {
      delete meta.SetUp;
      delete meta.FEN;
    }
    const game: RuntimePgn = {
      meta,
      moves:
        root.childIds.length === 0
          ? []
          : exportLine(document, root.childIds[0], []),
      result: domainToTermination(document.result),
    };
    return { ok: true, value: stringifyRuntime(game) };
  } catch (cause) {
    return failure(
      "INVALID_DOCUMENT",
      cause instanceof Error ? cause.message : String(cause),
    );
  }
}

export const importToGameDocument = importPgn;
export const parsePgnToGameDocument = importPgn;
export const importGameDocument = importPgn;
export const gameDocumentToPgn = exportPgn;
export const exportGameDocument = exportPgn;
export const formatNotation = notationToSan;
export const formatSanNotation = notationToSan;

export { notationToSan, terminationToDomain, domainToTermination };
