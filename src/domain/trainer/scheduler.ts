import type { TrainerQuality } from "./evaluateAttempt";

export const INITIAL_EASE_FACTOR = 2.5 as const;
export const MIN_EASE_FACTOR = 1.3 as const;

export type TrainerScheduleV1 = Readonly<{
  repetitions: number;
  intervalDays: number;
  easeFactor: number;
  nextDueAt: string;
}>;

export type SchedulerClock = () => string;

export type SchedulerErrorCode =
  "INVALID_CLOCK" | "INVALID_QUALITY" | "INVALID_SCHEDULE";

export type SchedulerError = Readonly<{
  code: SchedulerErrorCode;
  message: string;
}>;

export type SchedulerResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: SchedulerError }>;

function failure<T>(
  code: SchedulerErrorCode,
  message: string,
): SchedulerResult<T> {
  return { ok: false, error: { code, message } };
}

function canonicalUtc(value: unknown): string | null {
  if (typeof value !== "string" || !value.endsWith("Z")) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function clockNow(clock: SchedulerClock): SchedulerResult<string> {
  try {
    const value = canonicalUtc(clock());
    return value === null
      ? failure("INVALID_CLOCK", "El reloj debe devolver ISO-8601 UTC válido.")
      : { ok: true, value };
  } catch {
    return failure("INVALID_CLOCK", "El reloj no pudo producir una fecha.");
  }
}

function isQuality(value: number): value is TrainerQuality {
  return Number.isInteger(value) && value >= 0 && value <= 5;
}

function isSchedule(value: TrainerScheduleV1): boolean {
  return (
    Number.isSafeInteger(value.repetitions) &&
    value.repetitions >= 0 &&
    Number.isSafeInteger(value.intervalDays) &&
    value.intervalDays >= 0 &&
    Number.isFinite(value.easeFactor) &&
    value.easeFactor >= MIN_EASE_FACTOR &&
    canonicalUtc(value.nextDueAt) !== null
  );
}

function nextEaseFactor(current: number, quality: TrainerQuality): number {
  const difference = 5 - quality;
  const adjustment = 0.1 - difference * (0.08 + difference * 0.02);
  return Math.max(MIN_EASE_FACTOR, current + adjustment);
}

function addUtcDays(iso: string, days: number): string {
  const timestamp = Date.parse(iso) + days * 86_400_000;
  return new Date(timestamp).toISOString();
}

export function createInitialSchedule(
  clock: SchedulerClock,
): SchedulerResult<TrainerScheduleV1> {
  const now = clockNow(clock);
  if (!now.ok) return now;
  return {
    ok: true,
    value: {
      repetitions: 0,
      intervalDays: 0,
      easeFactor: INITIAL_EASE_FACTOR,
      nextDueAt: now.value,
    },
  };
}

export function scheduleReview(
  current: TrainerScheduleV1,
  quality: TrainerQuality,
  clock: SchedulerClock,
): SchedulerResult<TrainerScheduleV1> {
  if (!isQuality(quality)) {
    return failure(
      "INVALID_QUALITY",
      "quality debe ser un entero entre 0 y 5.",
    );
  }
  if (!isSchedule(current)) {
    return failure("INVALID_SCHEDULE", "El estado SM-2 no es válido.");
  }

  const now = clockNow(clock);
  if (!now.ok) return now;

  const easeFactor = nextEaseFactor(current.easeFactor, quality);
  if (quality < 3) {
    return {
      ok: true,
      value: {
        repetitions: 0,
        intervalDays: 0,
        easeFactor,
        nextDueAt: now.value,
      },
    };
  }

  const repetitions = current.repetitions + 1;
  const intervalDays =
    repetitions === 1
      ? 1
      : repetitions === 2
        ? 6
        : Math.max(1, Math.round(current.intervalDays * easeFactor));

  return {
    ok: true,
    value: {
      repetitions,
      intervalDays,
      easeFactor,
      nextDueAt: addUtcDays(now.value, intervalDays),
    },
  };
}
