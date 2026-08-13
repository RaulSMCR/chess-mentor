import { Chess, type Move } from "chess.js";

import {
  ENGINE_LIMITS,
  EngineAdapterError,
  type AnalysisRequest,
  type EngineAdapter,
  type EngineLine,
  validateAnalysisRequest,
} from "./EngineAdapter";

type RequestState = { cancelled: boolean };

const MAX_FAKE_PV_PLIES = 8;

function toUci(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function sortedLegalMoves(chess: Chess): Move[] {
  return chess
    .moves({ verbose: true })
    .slice()
    .sort((left, right) => toUci(left).localeCompare(toUci(right)));
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function createLine(
  request: AnalysisRequest,
  firstMove: Move,
  multipv: number,
): EngineLine {
  const chess = new Chess(request.fen);
  const pv: string[] = [];

  for (
    let ply = 0;
    ply < Math.min(request.depth, MAX_FAKE_PV_PLIES);
    ply += 1
  ) {
    const legalMoves = sortedLegalMoves(chess);
    const move = ply === 0 ? firstMove : legalMoves[0];
    if (!move) {
      break;
    }

    const played = chess.move({
      from: move.from,
      to: move.to,
      ...(move.promotion === undefined ? {} : { promotion: move.promotion }),
    });
    pv.push(toUci(played));
  }

  const scoreSeed = stableHash(
    `${request.fen}|${request.depth}|${toUci(firstMove)}`,
  );
  const score = (scoreSeed % 801) - 400;

  return {
    multipv,
    depth: request.depth,
    score: { kind: "cp", value: score },
    pv,
    bestmove: pv[0] ?? "0000",
  };
}

function validateFen(fen: string): void {
  try {
    new Chess(fen);
  } catch (error) {
    const detail = error instanceof Error ? `: ${error.message}` : "";
    throw new EngineAdapterError("INVALID_FEN", `FEN inválido${detail}`);
  }
}

export class FakeEngineAdapter implements EngineAdapter {
  private disposed = false;

  private readonly requests = new Map<string, RequestState>();

  analyze(request: AnalysisRequest): AsyncIterable<EngineLine> {
    if (this.disposed) {
      throw new EngineAdapterError("DISPOSED", "el adaptador ya fue liberado");
    }

    validateAnalysisRequest(request);
    validateFen(request.fen);

    if (this.requests.has(request.requestId)) {
      throw new EngineAdapterError(
        "REQUEST_ID_IN_USE",
        `requestId ya está activo: ${request.requestId}`,
      );
    }

    const state: RequestState = { cancelled: false };
    this.requests.set(request.requestId, state);
    const lines = this.createLines(request);
    const requests = this.requests;

    return (async function* (): AsyncGenerator<EngineLine> {
      try {
        for (const line of lines) {
          await Promise.resolve();
          if (state.cancelled) {
            return;
          }
          yield line;
        }
      } finally {
        requests.delete(request.requestId);
      }
    })();
  }

  async cancel(requestId: string): Promise<void> {
    const state = this.requests.get(requestId);
    if (state) {
      state.cancelled = true;
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const state of this.requests.values()) {
      state.cancelled = true;
    }
    this.requests.clear();
  }

  private createLines(request: AnalysisRequest): EngineLine[] {
    const chess = new Chess(request.fen);
    const legalMoves = sortedLegalMoves(chess);
    const requestedCount = Math.min(request.multiPv, ENGINE_LIMITS.maxMultiPv);

    return legalMoves
      .slice(0, requestedCount)
      .map((move, index) => createLine(request, move, index + 1));
  }
}
