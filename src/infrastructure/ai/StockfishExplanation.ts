import type { EngineLine, EngineScore } from "../../engine/EngineAdapter";
import {
  createStructuredResponse,
  type StructuredResponseV1,
} from "./StructuredClaims";

export const STOCKFISH_EXPLANATION_VERSION =
  "stockfish-explanation-v1" as const;

export type StockfishSideToMove = "w" | "b";

export type StockfishExplanationInput = Readonly<{
  responseId: string;
  sideToMove: StockfishSideToMove;
  line: EngineLine;
}>;

export type StockfishExplanationV1 = Readonly<{
  version: typeof STOCKFISH_EXPLANATION_VERSION;
  source: "engine";
  line: EngineLine;
  response: StructuredResponseV1;
}>;

export type StockfishExplanationErrorCode =
  "STOCKFISH_EXPLANATION_INVALID_INPUT";

export class StockfishExplanationError extends Error {
  readonly name = "StockfishExplanationError";

  constructor(
    readonly code: StockfishExplanationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function invalid(message: string): never {
  throw new StockfishExplanationError(
    "STOCKFISH_EXPLANATION_INVALID_INPUT",
    message,
  );
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    invalid(`${field} debe ser un texto no vacio.`);
  }
  return value.trim();
}

function validateScore(value: unknown): asserts value is EngineScore {
  if (!isRecord(value) || (value.kind !== "cp" && value.kind !== "mate")) {
    invalid("score no cumple el contrato del engine.");
  }
  if (typeof value.value !== "number" || !Number.isSafeInteger(value.value)) {
    invalid("score.value debe ser un entero seguro.");
  }
}

function validateLine(value: unknown): asserts value is EngineLine {
  if (!isRecord(value) || !Array.isArray(value.pv)) {
    invalid("La linea del engine es invalida.");
  }
  if (
    typeof value.multipv !== "number" ||
    !Number.isSafeInteger(value.multipv) ||
    value.multipv < 1 ||
    typeof value.depth !== "number" ||
    !Number.isSafeInteger(value.depth) ||
    value.depth < 1
  ) {
    invalid("multipv y depth deben ser enteros positivos.");
  }
  validateScore(value.score);
  if (typeof value.bestmove !== "string") {
    invalid("bestmove debe ser texto.");
  }
  if (value.bestmove !== "0000" && !UCI_MOVE_PATTERN.test(value.bestmove)) {
    invalid("bestmove no cumple el formato UCI.");
  }
  for (const move of value.pv) {
    if (typeof move !== "string" || !UCI_MOVE_PATTERN.test(move)) {
      invalid("La PV contiene una jugada que no cumple el formato UCI.");
    }
  }
}

function sideLabel(sideToMove: StockfishSideToMove): string {
  return sideToMove === "w" ? "blancas" : "negras";
}

function scoreText(
  score: EngineScore,
  sideToMove: StockfishSideToMove,
): string {
  const side = sideLabel(sideToMove);
  if (score.kind === "mate") {
    if (score.value === 0) {
      return `El turno es de ${side}. Stockfish informa una posicion de mate sin distancia declarada.`;
    }
    const winner = score.value > 0 ? "blancas" : "negras";
    return `El turno es de ${side}. Stockfish detecta mate en ${Math.abs(score.value)} para ${winner}.`;
  }

  const pawns = Math.abs(score.value) / 100;
  if (Math.abs(score.value) < 20) {
    return `El turno es de ${side}. Stockfish evalua la posicion como equilibrada (${score.value} centipeones desde la perspectiva de blancas).`;
  }
  const advantagedSide = score.value > 0 ? "blancas" : "negras";
  return `El turno es de ${side}. Stockfish evalua una ventaja de ${pawns.toFixed(2)} peones para ${advantagedSide} (${score.value} centipeones desde la perspectiva de blancas).`;
}

function formatUciMove(move: string): string {
  const promotion = move.length === 5 ? `=${move.slice(4).toUpperCase()}` : "";
  return `${move.slice(0, 2)}-${move.slice(2, 4)}${promotion}`;
}

function unsupportedResponse(responseId: string): StructuredResponseV1 {
  const text =
    "No hay una linea utilizable de Stockfish para construir una explicacion pedagogica.";
  return createStructuredResponse({
    responseId,
    answer: text,
    claims: [
      {
        id: `${responseId}:unsupported`,
        text,
        type: "unsupported",
        citationIds: [],
      },
    ],
    citations: [],
  });
}

export function createStockfishExplanation(
  input: StockfishExplanationInput,
): StockfishExplanationV1 {
  if (!isRecord(input)) invalid("La entrada de explicacion es invalida.");
  const responseId = requiredText(input.responseId, "responseId");
  if (input.sideToMove !== "w" && input.sideToMove !== "b") {
    invalid("sideToMove debe ser w o b.");
  }
  validateLine(input.line);

  const line = clone(input.line);
  const response =
    line.bestmove === "0000" || line.pv.length === 0
      ? unsupportedResponse(responseId)
      : createStructuredResponse({
          responseId,
          answer: `Stockfish propone ${formatUciMove(line.bestmove)}. La secuencia se muestra en UCI y no modifica la partida.`,
          claims: [
            {
              id: `${responseId}:score`,
              text: scoreText(line.score, input.sideToMove),
              type: "engine",
              citationIds: [],
            },
            {
              id: `${responseId}:line`,
              text: `Stockfish propone ${formatUciMove(line.bestmove)}. La PV UCI continua: ${line.pv.map(formatUciMove).join(" ")}.`,
              type: "engine",
              citationIds: [],
            },
            {
              id: `${responseId}:depth`,
              text: `Esta propuesta corresponde a la linea MultiPV ${line.multipv}, calculada a profundidad ${line.depth}.`,
              type: "engine",
              citationIds: [],
            },
          ],
          citations: [],
        });

  return {
    version: STOCKFISH_EXPLANATION_VERSION,
    source: "engine",
    line,
    response,
  };
}
