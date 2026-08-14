import {
  isLegalTrainerUci,
  normalizeTrainerUci,
  type ExerciseV1,
  type TrainerResult,
} from "./model";
import {
  calculateHintPenalty,
  isValidHintSequence,
  type HintLevel,
} from "./hints";

export type EvaluateAttemptInput = Readonly<{
  exercise: ExerciseV1;
  move: string;
  elapsedMs: number;
  hintsUsed?: readonly HintLevel[];
}>;

export type TrainerQuality = 0 | 1 | 2 | 3 | 4 | 5;

export type AttemptEvaluation = Readonly<{
  move: string | null;
  legal: boolean;
  correct: boolean;
  timedOut: boolean;
  elapsedMs: number;
  hintsUsed: readonly HintLevel[];
  penalty: number;
  score: number;
  quality: TrainerQuality;
}>;

export function evaluateAttempt(
  input: EvaluateAttemptInput,
): TrainerResult<AttemptEvaluation> {
  if (!Number.isSafeInteger(input.elapsedMs) || input.elapsedMs < 0) {
    return {
      ok: false,
      error: {
        code: "INVALID_ATTEMPT",
        message: "elapsedMs debe ser un entero no negativo.",
      },
    };
  }

  const hintsUsed = input.hintsUsed ?? [];
  if (!isValidHintSequence(hintsUsed)) {
    return {
      ok: false,
      error: {
        code: "INVALID_ATTEMPT",
        message: "Las pistas usadas deben seguir el orden sin repetir.",
      },
    };
  }

  const move = normalizeTrainerUci(input.move);
  const legal = move !== null && isLegalTrainerUci(input.exercise.fen, move);
  const timedOut =
    input.exercise.timeLimitMs !== null &&
    input.elapsedMs >= input.exercise.timeLimitMs;
  const correct =
    legal && !timedOut && input.exercise.acceptedMoves.includes(move);
  const penalty = calculateHintPenalty(hintsUsed);
  const score = correct ? Math.max(0, 5 - penalty) : 0;
  const quality: TrainerQuality = correct
    ? (score as TrainerQuality)
    : timedOut
      ? 2
      : 0;

  return {
    ok: true,
    value: {
      move,
      legal,
      correct,
      timedOut,
      elapsedMs: input.elapsedMs,
      hintsUsed: [...hintsUsed],
      penalty,
      score,
      quality,
    },
  };
}
