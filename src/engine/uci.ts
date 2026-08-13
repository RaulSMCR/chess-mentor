import type { AnalysisRequest, EngineLine, EngineScore } from "./EngineAdapter";

const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/u;

export type UciSideToMove = "w" | "b";

export type UciParseOptions = Readonly<{
  sideToMove?: UciSideToMove;
}>;

export type UciInfoMessage = Readonly<{
  kind: "info";
  depth: number;
  multipv: number;
  score: EngineScore;
  pv: readonly string[];
  raw: string;
}>;

export type UciBestmoveMessage = Readonly<{
  kind: "bestmove";
  bestmove: string;
  move: string | null;
  outcome: "move" | "no_legal_move";
  ponder?: string;
  raw: string;
}>;

export type ParsedUciLine = UciInfoMessage | UciBestmoveMessage;

function integerAt(tokens: readonly string[], index: number): number | null {
  const value = Number(tokens[index]);
  return Number.isSafeInteger(value) ? value : null;
}

function parseScore(
  tokens: readonly string[],
  index: number,
  sideToMove: UciSideToMove,
): EngineScore | null {
  const kind = tokens[index + 1];
  const value = integerAt(tokens, index + 2);
  if (value === null) return null;
  const whitePerspectiveValue = sideToMove === "b" ? -value : value;
  if (kind === "cp") return { kind: "cp", value: whitePerspectiveValue };
  if (kind === "mate") {
    return { kind: "mate", value: whitePerspectiveValue };
  }
  return null;
}

function parseInfo(
  tokens: readonly string[],
  raw: string,
  options: UciParseOptions,
): UciInfoMessage | null {
  const depthIndex = tokens.indexOf("depth");
  const scoreIndex = tokens.indexOf("score");
  if (depthIndex < 0 || scoreIndex < 0) return null;

  const depth = integerAt(tokens, depthIndex + 1);
  const score = parseScore(tokens, scoreIndex, options.sideToMove ?? "w");
  if (depth === null || depth < 1 || score === null) return null;

  const multipvIndex = tokens.indexOf("multipv");
  const multipv = multipvIndex < 0 ? 1 : integerAt(tokens, multipvIndex + 1);
  if (multipv === null || multipv < 1) return null;

  const pvIndex = tokens.indexOf("pv");
  const pv: string[] = [];
  if (pvIndex >= 0) {
    for (const move of tokens.slice(pvIndex + 1)) {
      if (!UCI_MOVE_PATTERN.test(move)) break;
      pv.push(move);
    }
  }

  return { kind: "info", depth, multipv, score, pv, raw };
}

function parseBestmove(
  tokens: readonly string[],
  raw: string,
): UciBestmoveMessage | null {
  const bestmove = tokens[1];
  if (
    bestmove === undefined ||
    (bestmove !== "0000" && !UCI_MOVE_PATTERN.test(bestmove))
  ) {
    return null;
  }

  const ponderIndex = tokens.indexOf("ponder");
  const ponder = tokens[ponderIndex + 1];
  const noLegalMove = bestmove === "0000";
  return {
    kind: "bestmove",
    bestmove,
    move: noLegalMove ? null : bestmove,
    outcome: noLegalMove ? "no_legal_move" : "move",
    ...(ponder !== undefined && UCI_MOVE_PATTERN.test(ponder)
      ? { ponder }
      : {}),
    raw,
  };
}

export function parseUciLine(
  line: string,
  options: UciParseOptions = {},
): ParsedUciLine | null {
  const raw = line.trim();
  if (raw.length === 0) return null;
  const tokens = raw.split(/\s+/u);
  if (tokens[0] === "info") return parseInfo(tokens, raw, options);
  if (tokens[0] === "bestmove") return parseBestmove(tokens, raw);
  return null;
}

export function toEngineLine(
  info: UciInfoMessage,
  bestmove = info.pv[0] ?? "0000",
): EngineLine {
  return {
    multipv: info.multipv,
    depth: info.depth,
    score: info.score,
    pv: [...info.pv],
    bestmove,
  };
}

export function toEngineLineWithBestmove(
  info: UciInfoMessage,
  bestmove: UciBestmoveMessage,
): EngineLine | null {
  if (bestmove.outcome === "no_legal_move" || bestmove.move === null) {
    return null;
  }
  return toEngineLine(info, bestmove.move);
}

export class UciAnalysisAccumulator {
  private readonly lines = new Map<string, EngineLine>();

  constructor(readonly requestId: string) {
    if (requestId.trim().length === 0) {
      throw new Error("requestId es obligatorio para acumular análisis UCI");
    }
  }

  upsert(info: UciInfoMessage, bestmove?: string): readonly EngineLine[] {
    const line = toEngineLine(info, bestmove);
    const key = `${this.requestId}\u0000${line.multipv}\u0000${line.depth}`;
    this.lines.set(key, line);
    return this.snapshot();
  }

  snapshot(): readonly EngineLine[] {
    return [...this.lines.values()]
      .sort(
        (left, right) =>
          left.multipv - right.multipv || right.depth - left.depth,
      )
      .map((line) => ({ ...line, pv: [...line.pv] }));
  }
}

export function createUciCommands(request: AnalysisRequest): readonly string[] {
  const go =
    request.movetimeMs === undefined
      ? `go depth ${request.depth}`
      : `go movetime ${request.movetimeMs}`;
  return [
    "uci",
    "isready",
    "ucinewgame",
    `setoption name MultiPV value ${request.multiPv}`,
    `position fen ${request.fen}`,
    go,
  ];
}
