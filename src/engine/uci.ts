import type { AnalysisRequest, EngineLine, EngineScore } from "./EngineAdapter";

const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/u;

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
): EngineScore | null {
  const kind = tokens[index + 1];
  const value = integerAt(tokens, index + 2);
  if (value === null) return null;
  if (kind === "cp") return { kind: "cp", value };
  if (kind === "mate") return { kind: "mate", value };
  return null;
}

function parseInfo(
  tokens: readonly string[],
  raw: string,
): UciInfoMessage | null {
  const depthIndex = tokens.indexOf("depth");
  const scoreIndex = tokens.indexOf("score");
  if (depthIndex < 0 || scoreIndex < 0) return null;

  const depth = integerAt(tokens, depthIndex + 1);
  const score = parseScore(tokens, scoreIndex);
  if (depth === null || depth < 1 || score === null) return null;

  const multipvIndex = tokens.indexOf("multipv");
  const multipv = multipvIndex < 0 ? 1 : integerAt(tokens, multipvIndex + 1);
  if (multipv === null || multipv < 1) return null;

  const pvIndex = tokens.indexOf("pv");
  const pv =
    pvIndex < 0
      ? []
      : tokens.slice(pvIndex + 1).filter((move) => UCI_MOVE_PATTERN.test(move));

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
  return {
    kind: "bestmove",
    bestmove,
    ...(ponder !== undefined && UCI_MOVE_PATTERN.test(ponder)
      ? { ponder }
      : {}),
    raw,
  };
}

export function parseUciLine(line: string): ParsedUciLine | null {
  const raw = line.trim();
  if (raw.length === 0) return null;
  const tokens = raw.split(/\s+/u);
  if (tokens[0] === "info") return parseInfo(tokens, raw);
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
