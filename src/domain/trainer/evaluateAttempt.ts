import {
  isLegalTrainerUci,
  normalizeTrainerUci,
  type ExerciseV1,
  type TrainerResult,
} from "./model";

export type EvaluateAttemptInput = Readonly<{
  exercise: ExerciseV1;
  move: string;
  elapsedMs: number;
}>;

export type AttemptEvaluation = Readonly<{
  move: string | null;
  legal: boolean;
  correct: boolean;
  timedOut: boolean;
  elapsedMs: number;
  quality: 0 | 2 | 5;
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

  const move = normalizeTrainerUci(input.move);
  const legal = move !== null && isLegalTrainerUci(input.exercise.fen, move);
  const timedOut =
    input.exercise.timeLimitMs !== null &&
    input.elapsedMs >= input.exercise.timeLimitMs;
  const correct =
    legal && !timedOut && input.exercise.acceptedMoves.includes(move);

  return {
    ok: true,
    value: {
      move,
      legal,
      correct,
      timedOut,
      elapsedMs: input.elapsedMs,
      quality: correct ? 5 : timedOut ? 2 : 0,
    },
  };
}
