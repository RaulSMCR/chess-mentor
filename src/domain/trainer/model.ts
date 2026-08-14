import { Chess } from "chess.js";

export const TRAINER_SCHEMA_VERSION = 1 as const;
export const DEFAULT_TRAINER_TIME_LIMIT_MS = 60_000 as const;

const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/u;

export type TrainerDifficulty = 1 | 2 | 3 | 4 | 5;

export type ExerciseHints = Readonly<{
  concept: string;
  destination: string;
}>;

export type ExerciseV1 = Readonly<{
  schemaVersion: typeof TRAINER_SCHEMA_VERSION;
  id: string;
  title: string;
  fen: string;
  acceptedMoves: readonly string[];
  hints: ExerciseHints;
  difficulty: TrainerDifficulty;
  timeLimitMs: number | null;
}>;

export type CreateExerciseInput = Omit<
  ExerciseV1,
  "schemaVersion" | "timeLimitMs"
> &
  Readonly<{ timeLimitMs?: number | null }>;

export type TrainerErrorCode =
  | "INVALID_EXERCISE"
  | "INVALID_FEN"
  | "INVALID_UCI_MOVE"
  | "ILLEGAL_EXERCISE_MOVE"
  | "INVALID_ATTEMPT";

export type TrainerError = Readonly<{
  code: TrainerErrorCode;
  message: string;
  context?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type TrainerResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: TrainerError }>;

function failure<T>(
  code: TrainerErrorCode,
  message: string,
  context?: Readonly<Record<string, string | number | boolean | null>>,
): TrainerResult<T> {
  return context === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, context } };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDifficulty(value: unknown): value is TrainerDifficulty {
  return (
    value === 1 || value === 2 || value === 3 || value === 4 || value === 5
  );
}

function isValidTimeLimit(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= 3_600_000)
  );
}

export function normalizeTrainerUci(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return UCI_MOVE_PATTERN.test(normalized) ? normalized : null;
}

export function isLegalTrainerUci(fen: string, move: string): boolean {
  const normalized = normalizeTrainerUci(move);
  if (normalized === null) return false;
  try {
    const chess = new Chess(fen);
    const promotion = normalized.slice(4) || undefined;
    chess.move({
      from: normalized.slice(0, 2),
      to: normalized.slice(2, 4),
      ...(promotion === undefined ? {} : { promotion }),
    });
    return true;
  } catch {
    return false;
  }
}

function canonicalFen(value: unknown): TrainerResult<string> {
  if (!nonEmptyString(value)) {
    return failure("INVALID_FEN", "El FEN del ejercicio es obligatorio.");
  }
  try {
    return { ok: true, value: new Chess(value).fen() };
  } catch (error) {
    return failure(
      "INVALID_FEN",
      "El FEN del ejercicio no es válido.",
      error instanceof Error ? { detail: error.message } : undefined,
    );
  }
}

export function validateExercise(value: unknown): TrainerResult<ExerciseV1> {
  if (typeof value !== "object" || value === null) {
    return failure("INVALID_EXERCISE", "El ejercicio debe ser un objeto.");
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.schemaVersion !== TRAINER_SCHEMA_VERSION) {
    return failure(
      "INVALID_EXERCISE",
      "schemaVersion de ejercicio no soportada.",
    );
  }
  if (!nonEmptyString(candidate.id) || !nonEmptyString(candidate.title)) {
    return failure(
      "INVALID_EXERCISE",
      "id y title deben ser strings no vacíos.",
    );
  }
  if (!isDifficulty(candidate.difficulty)) {
    return failure(
      "INVALID_EXERCISE",
      "difficulty debe ser un entero entre 1 y 5.",
    );
  }
  if (!isValidTimeLimit(candidate.timeLimitMs)) {
    return failure(
      "INVALID_EXERCISE",
      "timeLimitMs debe ser null o un entero entre 1 y 3600000.",
    );
  }
  const hints = candidate.hints;
  if (
    typeof hints !== "object" ||
    hints === null ||
    !nonEmptyString((hints as Record<string, unknown>).concept) ||
    !nonEmptyString((hints as Record<string, unknown>).destination)
  ) {
    return failure(
      "INVALID_EXERCISE",
      "concept y destination deben ser pistas no vacías.",
    );
  }
  if (
    !Array.isArray(candidate.acceptedMoves) ||
    candidate.acceptedMoves.length === 0
  ) {
    return failure(
      "INVALID_EXERCISE",
      "acceptedMoves debe contener al menos una jugada.",
    );
  }
  const fenResult = canonicalFen(candidate.fen);
  if (!fenResult.ok) return fenResult;

  const acceptedMoves: string[] = [];
  for (const [index, rawMove] of candidate.acceptedMoves.entries()) {
    if (typeof rawMove !== "string") {
      return failure(
        "INVALID_UCI_MOVE",
        "acceptedMoves contiene un valor no textual.",
        {
          index,
        },
      );
    }
    const move = normalizeTrainerUci(rawMove);
    if (move === null) {
      return failure(
        "INVALID_UCI_MOVE",
        "acceptedMoves contiene UCI inválido.",
        {
          index,
          move: rawMove,
        },
      );
    }
    if (acceptedMoves.includes(move)) {
      return failure(
        "INVALID_EXERCISE",
        "acceptedMoves no puede repetir jugadas.",
        {
          move,
        },
      );
    }
    if (!isLegalTrainerUci(fenResult.value, move)) {
      return failure(
        "ILLEGAL_EXERCISE_MOVE",
        "acceptedMoves contiene una jugada ilegal para el FEN.",
        { index, move },
      );
    }
    acceptedMoves.push(move);
  }

  const rawHints = hints as Record<string, unknown>;
  return {
    ok: true,
    value: {
      schemaVersion: TRAINER_SCHEMA_VERSION,
      id: candidate.id.trim(),
      title: candidate.title.trim(),
      fen: fenResult.value,
      acceptedMoves: acceptedMoves.sort((left, right) =>
        left.localeCompare(right),
      ),
      hints: {
        concept: (rawHints.concept as string).trim(),
        destination: (rawHints.destination as string).trim(),
      },
      difficulty: candidate.difficulty,
      timeLimitMs:
        candidate.timeLimitMs === undefined
          ? DEFAULT_TRAINER_TIME_LIMIT_MS
          : candidate.timeLimitMs,
    },
  };
}

export function createExercise(
  input: CreateExerciseInput,
): TrainerResult<ExerciseV1> {
  return validateExercise({
    ...input,
    schemaVersion: TRAINER_SCHEMA_VERSION,
    timeLimitMs:
      input.timeLimitMs === undefined
        ? DEFAULT_TRAINER_TIME_LIMIT_MS
        : input.timeLimitMs,
  });
}
