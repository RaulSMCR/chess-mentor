import type { ExerciseV1 } from "./model";

export const HINT_LEVELS = ["concept", "destination", "engine"] as const;

export type HintLevel = (typeof HINT_LEVELS)[number];

export type HintErrorCode = "INVALID_HINT_SEQUENCE" | "INVALID_EXERCISE_HINTS";

export type HintError = Readonly<{
  code: HintErrorCode;
  message: string;
}>;

export type HintResult = Readonly<{
  level: HintLevel;
  text: string;
  penalty: 1;
  totalPenalty: number;
  hintsUsed: readonly HintLevel[];
}>;

export type HintOutcome =
  | Readonly<{ ok: true; value: HintResult }>
  | Readonly<{ ok: false; error: HintError }>;

function isHintLevel(value: unknown): value is HintLevel {
  return HINT_LEVELS.includes(value as HintLevel);
}

export function isValidHintSequence(value: readonly HintLevel[]): boolean {
  return value.every(
    (level, index) => isHintLevel(level) && level === HINT_LEVELS[index],
  );
}

export function calculateHintPenalty(hintsUsed: readonly HintLevel[]): number {
  return hintsUsed.length;
}

export function requestHint(
  exercise: ExerciseV1,
  level: HintLevel,
  hintsUsed: readonly HintLevel[] = [],
): HintOutcome {
  const levelIndex = HINT_LEVELS.indexOf(level);
  if (
    levelIndex < 0 ||
    !isValidHintSequence(hintsUsed) ||
    hintsUsed.length !== levelIndex
  ) {
    return {
      ok: false,
      error: {
        code: "INVALID_HINT_SEQUENCE",
        message: "Las pistas deben solicitarse en orden y sin repetir.",
      },
    };
  }

  const text =
    level === "concept"
      ? exercise.hints.concept
      : level === "destination"
        ? exercise.hints.destination
        : `Mejor jugada aceptada: ${exercise.acceptedMoves[0] ?? "—"}`;
  if (text.trim().length === 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_EXERCISE_HINTS",
        message: "La plantilla de la pista está vacía.",
      },
    };
  }

  const nextHints = [...hintsUsed, level] as readonly HintLevel[];
  return {
    ok: true,
    value: {
      level,
      text,
      penalty: 1,
      totalPenalty: calculateHintPenalty(nextHints),
      hintsUsed: nextHints,
    },
  };
}
