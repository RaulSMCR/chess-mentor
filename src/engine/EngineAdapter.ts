export const ENGINE_LIMITS = {
  minDepth: 1,
  maxDepth: 30,
  minMultiPv: 1,
  maxMultiPv: 5,
  maxMovetimeMs: 120_000,
} as const;

export type EngineScore =
  | Readonly<{ kind: "cp"; value: number }>
  | Readonly<{ kind: "mate"; value: number }>;

export type EngineLine = Readonly<{
  multipv: number;
  depth: number;
  score: EngineScore;
  pv: readonly string[];
  bestmove: string;
}>;

export type AnalysisRequest = Readonly<{
  requestId: string;
  fen: string;
  depth: number;
  movetimeMs?: number;
  multiPv: number;
}>;

export interface EngineAdapter {
  analyze(request: AnalysisRequest): AsyncIterable<EngineLine>;
  cancel(requestId: string): Promise<void>;
  dispose(): Promise<void>;
}

export type EngineAdapterErrorCode =
  | "DISPOSED"
  | "INVALID_FEN"
  | "INVALID_REQUEST"
  | "INVALID_DEPTH"
  | "INVALID_MULTIPV"
  | "INVALID_MOVETIME"
  | "REQUEST_ID_IN_USE";

export class EngineAdapterError extends Error {
  readonly code: EngineAdapterErrorCode;

  constructor(code: EngineAdapterErrorCode, message: string) {
    super(message);
    this.name = "EngineAdapterError";
    this.code = code;
  }
}

export function validateAnalysisRequest(request: AnalysisRequest): void {
  if (
    request.requestId.trim().length === 0 ||
    request.fen.trim().length === 0
  ) {
    throw new EngineAdapterError(
      "INVALID_REQUEST",
      "requestId y fen son obligatorios",
    );
  }

  if (
    !Number.isInteger(request.depth) ||
    request.depth < ENGINE_LIMITS.minDepth ||
    request.depth > ENGINE_LIMITS.maxDepth
  ) {
    throw new EngineAdapterError(
      "INVALID_DEPTH",
      `depth debe ser un entero entre ${ENGINE_LIMITS.minDepth} y ${ENGINE_LIMITS.maxDepth}`,
    );
  }

  if (
    !Number.isInteger(request.multiPv) ||
    request.multiPv < ENGINE_LIMITS.minMultiPv ||
    request.multiPv > ENGINE_LIMITS.maxMultiPv
  ) {
    throw new EngineAdapterError(
      "INVALID_MULTIPV",
      `multiPv debe ser un entero entre ${ENGINE_LIMITS.minMultiPv} y ${ENGINE_LIMITS.maxMultiPv}`,
    );
  }

  if (
    request.movetimeMs !== undefined &&
    (!Number.isInteger(request.movetimeMs) ||
      request.movetimeMs <= 0 ||
      request.movetimeMs > ENGINE_LIMITS.maxMovetimeMs)
  ) {
    throw new EngineAdapterError(
      "INVALID_MOVETIME",
      `movetimeMs debe ser un entero positivo de hasta ${ENGINE_LIMITS.maxMovetimeMs}`,
    );
  }
}
