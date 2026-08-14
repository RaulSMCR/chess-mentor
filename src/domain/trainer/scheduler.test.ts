import { describe, expect, it } from "vitest";

import {
  INITIAL_EASE_FACTOR,
  MIN_EASE_FACTOR,
  createInitialSchedule,
  scheduleReview,
  type TrainerScheduleV1,
} from "./scheduler";

const clock = (value: string) => () => value;

function schedule(
  overrides: Partial<TrainerScheduleV1> = {},
): TrainerScheduleV1 {
  return {
    repetitions: 0,
    intervalDays: 0,
    easeFactor: INITIAL_EASE_FACTOR,
    nextDueAt: "2026-01-01T23:30:00.000Z",
    ...overrides,
  };
}

describe("deterministic SM-2 scheduler", () => {
  it("crea una entrada vencida ahora y avanza por intervalos 1 y 6", () => {
    const initial = createInitialSchedule(clock("2026-02-01T02:30:00Z"));
    expect(initial).toEqual({
      ok: true,
      value: {
        repetitions: 0,
        intervalDays: 0,
        easeFactor: INITIAL_EASE_FACTOR,
        nextDueAt: "2026-02-01T02:30:00.000Z",
      },
    });
    if (!initial.ok) return;

    const first = scheduleReview(
      initial.value,
      5,
      clock("2026-02-01T02:30:00Z"),
    );
    expect(first).toMatchObject({
      ok: true,
      value: {
        repetitions: 1,
        intervalDays: 1,
        nextDueAt: "2026-02-02T02:30:00.000Z",
      },
    });
    if (!first.ok) return;

    const second = scheduleReview(
      first.value,
      4,
      clock("2026-02-02T02:30:00Z"),
    );
    expect(second).toMatchObject({
      ok: true,
      value: {
        repetitions: 2,
        intervalDays: 6,
        nextDueAt: "2026-02-08T02:30:00.000Z",
      },
    });
  });

  it("reinicia con calidad menor que 3 y respeta el factor mínimo", () => {
    const current = schedule({
      repetitions: 8,
      intervalDays: 30,
      easeFactor: MIN_EASE_FACTOR,
    });
    const result = scheduleReview(current, 0, clock("2026-03-01T00:00:00Z"));

    expect(result).toEqual({
      ok: true,
      value: {
        repetitions: 0,
        intervalDays: 0,
        easeFactor: MIN_EASE_FACTOR,
        nextDueAt: "2026-03-01T00:00:00.000Z",
      },
    });
  });

  it("redondea intervalos posteriores y no muta la entrada", () => {
    const current = schedule({
      repetitions: 2,
      intervalDays: 6,
      easeFactor: 2.5,
    });
    const snapshot = { ...current };
    const result = scheduleReview(current, 5, clock("2026-04-30T12:00:00Z"));

    expect(result).toMatchObject({
      ok: true,
      value: { repetitions: 3, intervalDays: 16 },
    });
    expect(current).toEqual(snapshot);
  });

  it("produce el mismo resultado con el mismo reloj y rechaza entradas inválidas", () => {
    const current = schedule({ repetitions: 2, intervalDays: 6 });
    const first = scheduleReview(current, 4, clock("2026-05-01T00:00:00Z"));
    const second = scheduleReview(current, 4, clock("2026-05-01T00:00:00Z"));
    expect(first).toEqual(second);

    expect(
      scheduleReview(current, 6 as never, clock("2026-05-01T00:00:00Z")),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_QUALITY" },
    });
    expect(
      scheduleReview(current, 5, clock("2026-05-01T00:00:00")),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_CLOCK" },
    });
    expect(
      scheduleReview(
        { ...current, easeFactor: 1.2 },
        5,
        clock("2026-05-01T00:00:00Z"),
      ),
    ).toMatchObject({ ok: false, error: { code: "INVALID_SCHEDULE" } });
  });
});
