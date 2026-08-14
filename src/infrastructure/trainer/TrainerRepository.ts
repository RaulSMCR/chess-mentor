import { z } from "zod";

import { isValidHintSequence, type HintLevel } from "@/domain/trainer/hints";
import {
  normalizeTrainerUci,
  TRAINER_SCHEMA_VERSION,
  validateExercise,
  type ExerciseV1,
} from "@/domain/trainer/model";
import type { TrainerQuality } from "@/domain/trainer/evaluateAttempt";
import type { TrainerScheduleV1 } from "@/domain/trainer/scheduler";

export const TRAINER_STORAGE_KEY = "chess-mentor.trainer.v1";

export type TrainerAttemptRecordV1 = Readonly<{
  id: string;
  move: string | null;
  legal: boolean;
  correct: boolean;
  timedOut: boolean;
  elapsedMs: number;
  hintsUsed: readonly HintLevel[];
  penalty: number;
  score: number;
  quality: TrainerQuality;
  reviewedAt: string;
}>;

export type TrainerExerciseRecordV1 = Readonly<{
  exercise: ExerciseV1;
  schedule: TrainerScheduleV1;
  attempts: readonly TrainerAttemptRecordV1[];
}>;

export type StoredTrainerV1 = Readonly<{
  schemaVersion: typeof TRAINER_SCHEMA_VERSION;
  exercises: Readonly<Record<string, TrainerExerciseRecordV1>>;
}>;

export type TrainerRepositoryErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_CORRUPT"
  | "STORAGE_QUOTA"
  | "INVALID_DOCUMENT";

export class TrainerRepositoryError extends Error {
  readonly name = "TrainerRepositoryError";

  constructor(
    readonly code: TrainerRepositoryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface TrainerRepository {
  list(): Promise<TrainerExerciseRecordV1[]>;
  get(id: string): Promise<TrainerExerciseRecordV1 | null>;
  save(record: TrainerExerciseRecordV1): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface TrainerKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type TrainerStorageProvider = () => TrainerKeyValueStorage;

const hintsSchema = z
  .object({
    concept: z.string(),
    destination: z.string(),
  })
  .strict();

const exerciseSchema = z
  .object({
    schemaVersion: z.literal(TRAINER_SCHEMA_VERSION),
    id: z.string(),
    title: z.string(),
    fen: z.string(),
    acceptedMoves: z.array(z.string()),
    hints: hintsSchema,
    difficulty: z.number().int().min(1).max(5),
    timeLimitMs: z.number().int().positive().max(3_600_000).nullable(),
  })
  .strict();

const scheduleSchema = z
  .object({
    repetitions: z.number().int().nonnegative(),
    intervalDays: z.number().int().nonnegative(),
    easeFactor: z.number().min(1.3),
    nextDueAt: z.string(),
  })
  .strict();

const attemptSchema = z
  .object({
    id: z.string(),
    move: z.string().nullable(),
    legal: z.boolean(),
    correct: z.boolean(),
    timedOut: z.boolean(),
    elapsedMs: z.number().int().nonnegative(),
    hintsUsed: z.enum(["concept", "destination", "engine"]).array(),
    penalty: z.number().int().nonnegative(),
    score: z.number().int().min(0).max(5),
    quality: z.number().int().min(0).max(5),
    reviewedAt: z.string(),
  })
  .strict();

const recordSchema = z
  .object({
    exercise: exerciseSchema,
    schedule: scheduleSchema,
    attempts: attemptSchema.array(),
  })
  .strict();

const envelopeSchema = z
  .object({
    schemaVersion: z.literal(TRAINER_SCHEMA_VERSION),
    exercises: z.record(z.string(), recordSchema),
  })
  .strict();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isUtcIso(value: string): boolean {
  return value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

function invalid(message: string, cause?: unknown): TrainerRepositoryError {
  return new TrainerRepositoryError("INVALID_DOCUMENT", message, { cause });
}

function validateSchedule(value: TrainerScheduleV1): void {
  if (
    !Number.isSafeInteger(value.repetitions) ||
    value.repetitions < 0 ||
    !Number.isSafeInteger(value.intervalDays) ||
    value.intervalDays < 0 ||
    !Number.isFinite(value.easeFactor) ||
    value.easeFactor < 1.3 ||
    !isUtcIso(value.nextDueAt)
  ) {
    throw invalid("El estado SM-2 del ejercicio no es vÃ¡lido.");
  }
}

function validateAttempt(value: TrainerAttemptRecordV1): void {
  if (value.id.trim().length === 0) {
    throw invalid("Cada intento debe tener un id no vacÃ­o.");
  }
  if (value.move !== null) {
    const normalized = normalizeTrainerUci(value.move);
    if (normalized === null || normalized !== value.move) {
      throw invalid("El movimiento guardado del intento no es UCI canÃ³nico.");
    }
  }
  if (!isValidHintSequence(value.hintsUsed)) {
    throw invalid("Las pistas del intento no siguen el orden permitido.");
  }
  if (value.correct && !value.legal) {
    throw invalid("Un intento correcto debe ser legal.");
  }
  if (value.timedOut && value.correct) {
    throw invalid("Un intento agotado no puede ser correcto.");
  }
  if (value.penalty !== value.hintsUsed.length) {
    throw invalid("La penalizaciÃ³n debe coincidir con las pistas usadas.");
  }
  if (!value.correct && value.score !== 0) {
    throw invalid("Un intento incorrecto debe tener score cero.");
  }
  if (value.correct && value.score !== Math.max(0, 5 - value.penalty)) {
    throw invalid("El score del intento no coincide con sus pistas.");
  }
  if (!isUtcIso(value.reviewedAt)) {
    throw invalid("reviewedAt debe ser una fecha ISO UTC.");
  }
}

export function validateTrainerRecord(value: unknown): TrainerExerciseRecordV1 {
  const parsed = recordSchema.safeParse(value);
  if (!parsed.success) {
    throw invalid(
      "El registro de ejercicio no cumple el esquema.",
      parsed.error,
    );
  }

  const exercise = validateExercise(parsed.data.exercise);
  if (!exercise.ok) {
    throw invalid(exercise.error.message, exercise.error);
  }
  const record = parsed.data as unknown as TrainerExerciseRecordV1;
  validateSchedule(record.schedule);
  const attemptIds = new Set<string>();
  for (const attempt of record.attempts) {
    if (attemptIds.has(attempt.id)) {
      throw invalid("Los intentos de un ejercicio no pueden repetir id.");
    }
    attemptIds.add(attempt.id);
    validateAttempt(attempt);
  }

  return {
    exercise: exercise.value,
    schedule: clone(record.schedule),
    attempts: clone(record.attempts),
  };
}

export function emptyTrainerEnvelope(): StoredTrainerV1 {
  return { schemaVersion: TRAINER_SCHEMA_VERSION, exercises: {} };
}

export function validateTrainerEnvelope(value: unknown): StoredTrainerV1 {
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) {
    throw new TrainerRepositoryError(
      "STORAGE_CORRUPT",
      "El repositorio de ejercicios estÃ¡ corrupto.",
      { cause: parsed.error },
    );
  }

  const exercises: Record<string, TrainerExerciseRecordV1> = {};
  for (const [id, rawRecord] of Object.entries(parsed.data.exercises)) {
    try {
      const record = validateTrainerRecord(rawRecord);
      if (record.exercise.id !== id) {
        throw invalid("La clave del ejercicio no coincide con su id.");
      }
      exercises[id] = record;
    } catch (error) {
      if (error instanceof TrainerRepositoryError) {
        throw new TrainerRepositoryError(
          "STORAGE_CORRUPT",
          "El repositorio de ejercicios contiene un registro invÃ¡lido.",
          { cause: error },
        );
      }
      throw new TrainerRepositoryError(
        "STORAGE_CORRUPT",
        "El repositorio de ejercicios contiene un registro invÃ¡lido.",
        { cause: error },
      );
    }
  }
  return { schemaVersion: TRAINER_SCHEMA_VERSION, exercises };
}
