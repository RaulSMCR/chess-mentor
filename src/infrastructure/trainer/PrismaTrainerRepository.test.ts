import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import { createExercise } from "@/domain/trainer/model";
import { createInitialSchedule } from "@/domain/trainer/scheduler";

import {
  TrainerRepositoryError,
  type TrainerExerciseRecordV1,
  type TrainerRepository,
} from "./TrainerRepository";
import {
  PrismaTrainerRepository,
  type TrainerRecordCreate,
  type TrainerRecordRow,
  type TrainerRecordStore,
  type TrainerRecordUpdate,
} from "./PrismaTrainerRepository";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneRow(row: TrainerRecordRow): TrainerRecordRow {
  return {
    ...row,
    nextDueAt: new Date(row.nextDueAt),
    payload: clone(row.payload) as Prisma.JsonValue,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function makeRecord(
  id = "exercise-1",
  nextDueAt = "2026-01-01T00:00:00.000Z",
): TrainerExerciseRecordV1 {
  const exercise = createExercise({
    id,
    title: `Ejercicio ${id}`,
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    acceptedMoves: ["f1b5"],
    hints: { concept: "Desarrolla una pieza", destination: "b5" },
    difficulty: 2,
  });
  const schedule = createInitialSchedule(() => nextDueAt);
  if (!exercise.ok || !schedule.ok) throw new Error("Fixture inválida");
  return { exercise: exercise.value, schedule: schedule.value, attempts: [] };
}

class FakeTrainerRecordStore implements TrainerRecordStore {
  readonly rows = new Map<string, TrainerRecordRow>();
  failure: Error | null = null;
  writes = 0;

  private failIfConfigured(): void {
    if (this.failure !== null) throw this.failure;
  }

  async findMany(): Promise<readonly TrainerRecordRow[]> {
    this.failIfConfigured();
    return [...this.rows.values()]
      .sort((left, right) => {
        const due = left.nextDueAt.getTime() - right.nextDueAt.getTime();
        return due !== 0 ? due : left.id.localeCompare(right.id);
      })
      .map(cloneRow);
  }

  async findUnique({
    where,
  }: {
    where: { id: string };
  }): Promise<TrainerRecordRow | null> {
    this.failIfConfigured();
    const row = this.rows.get(where.id);
    return row === undefined ? null : cloneRow(row);
  }

  async upsert({
    create,
    update,
  }: {
    where: { id: string };
    create: TrainerRecordCreate;
    update: TrainerRecordUpdate;
  }): Promise<TrainerRecordRow> {
    this.failIfConfigured();
    this.writes += 1;
    const existing = this.rows.get(create.id);
    const stored: TrainerRecordRow =
      existing === undefined
        ? {
            ...create,
            payload: clone(create.payload) as Prisma.JsonValue,
          }
        : {
            ...existing,
            ...update,
            payload: clone(update.payload) as Prisma.JsonValue,
          };
    this.rows.set(stored.id, stored);
    return cloneRow(stored);
  }

  async deleteMany({
    where,
  }: {
    where: { id: string };
  }): Promise<{ count: number }> {
    this.failIfConfigured();
    return { count: this.rows.delete(where.id) ? 1 : 0 };
  }
}

let store: FakeTrainerRecordStore;
const makeRepository = (): TrainerRepository =>
  new PrismaTrainerRepository(store);

beforeEach(() => {
  store = new FakeTrainerRecordStore();
});

describe("PrismaTrainerRepository", () => {
  it("guarda, lista en orden, clona y elimina ejercicios", async () => {
    const repository = makeRepository();
    await repository.save(makeRecord("exercise-2", "2026-01-03T00:00:00.000Z"));
    await repository.save(makeRecord("exercise-1", "2026-01-02T00:00:00.000Z"));

    const listed = await repository.list();
    expect(listed.map((record) => record.exercise.id)).toEqual([
      "exercise-1",
      "exercise-2",
    ]);
    expect(listed[0]).not.toBe(await repository.get("exercise-1"));
    expect(
      (await repository.get("exercise-1"))?.exercise.acceptedMoves,
    ).toEqual(["f1b5"]);

    await repository.remove("exercise-1");
    await repository.remove("missing");
    expect(await repository.get("exercise-1")).toBeNull();
  });

  it("valida antes de escribir y conserva el registro anterior", async () => {
    const repository = makeRepository();
    await repository.save(makeRecord());
    const invalid: TrainerExerciseRecordV1 = {
      ...makeRecord(),
      exercise: { ...makeRecord().exercise, fen: "not a fen" },
    };

    await expect(repository.save(invalid)).rejects.toMatchObject({
      code: "INVALID_DOCUMENT",
    });
    expect(store.writes).toBe(1);
    expect((await repository.get("exercise-1"))?.exercise.fen).toContain(
      "r1bqkbnr",
    );
  });

  it("rechaza payload y metadata SQL inconsistentes", async () => {
    const record = makeRecord();
    store.rows.set("exercise-1", {
      id: "exercise-1",
      nextDueAt: new Date("2026-01-02T00:00:00.000Z"),
      payload: clone(record) as unknown as Prisma.JsonValue,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await expect(makeRepository().get("exercise-1")).rejects.toMatchObject({
      code: "STORAGE_CORRUPT",
    });

    store.rows.set("exercise-1", {
      ...store.rows.get("exercise-1")!,
      nextDueAt: new Date(record.schedule.nextDueAt),
      payload: { broken: true } as unknown as Prisma.JsonValue,
    });
    await expect(makeRepository().list()).rejects.toMatchObject({
      code: "STORAGE_CORRUPT",
    });
  });

  it("mapea fallos del store a STORAGE_UNAVAILABLE", async () => {
    store.failure = new Error("connection refused");

    await expect(makeRepository().list()).rejects.toBeInstanceOf(
      TrainerRepositoryError,
    );
    await expect(makeRepository().get("missing")).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });
});
