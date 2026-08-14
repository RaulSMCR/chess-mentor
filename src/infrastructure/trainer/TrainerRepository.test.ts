import { describe, expect, it } from "vitest";

import { createExercise } from "@/domain/trainer/model";
import { createInitialSchedule } from "@/domain/trainer/scheduler";
import {
  TRAINER_STORAGE_KEY,
  TrainerRepositoryError,
  type TrainerExerciseRecordV1,
  type TrainerKeyValueStorage,
} from "./TrainerRepository";
import { LocalStorageTrainerRepository } from "./LocalStorageTrainerRepository";
import { MemoryTrainerRepository } from "./MemoryTrainerRepository";

class FakeStorage implements TrainerKeyValueStorage {
  private readonly values = new Map<string, string>();
  writes = 0;
  failRead = false;
  failWrite = false;
  quota = false;

  getItem(key: string): string | null {
    if (this.failRead) throw new Error("read unavailable");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    if (this.failWrite) {
      throw this.quota
        ? new DOMException("quota", "QuotaExceededError")
        : new Error("write unavailable");
    }
    this.values.set(key, value);
  }

  putRaw(value: string): void {
    this.values.set(TRAINER_STORAGE_KEY, value);
  }

  raw(): string | null {
    return this.values.get(TRAINER_STORAGE_KEY) ?? null;
  }
}

function makeRecord(
  id = "exercise-1",
  overrides: Partial<TrainerExerciseRecordV1> = {},
): TrainerExerciseRecordV1 {
  const exercise = createExercise({
    id,
    title: `Ejercicio ${id}`,
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
    acceptedMoves: ["f1b5"],
    hints: { concept: "Desarrolla una pieza", destination: "b5" },
    difficulty: 2,
  });
  const schedule = createInitialSchedule(() => "2026-01-01T00:00:00.000Z");
  if (!exercise.ok || !schedule.ok) throw new Error("fixture invÃ¡lida");
  return {
    exercise: exercise.value,
    schedule: schedule.value,
    attempts: [],
    ...overrides,
  };
}

function expectRepositoryError(
  promise: Promise<unknown>,
  code: TrainerRepositoryError["code"],
) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe("MemoryTrainerRepository", () => {
  it("valida, clona, ordena y elimina ejercicios", async () => {
    const repository = new MemoryTrainerRepository();
    const second = makeRecord("exercise-2");
    const first = makeRecord("exercise-1");

    await repository.save(second);
    await repository.save(first);
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

  it("rechaza un registro invÃ¡lido sin mutar el anterior", async () => {
    const repository = new MemoryTrainerRepository();
    await repository.save(makeRecord());
    const invalid = makeRecord("exercise-1", {
      exercise: { ...makeRecord().exercise, fen: "not a fen" },
    });

    await expectRepositoryError(repository.save(invalid), "INVALID_DOCUMENT");
    expect((await repository.get("exercise-1"))?.exercise.fen).toContain(
      "r1bqkbnr",
    );
  });
});

describe("LocalStorageTrainerRepository", () => {
  it("usa un envelope versionado y sobrevive a una nueva instancia", async () => {
    const storage = new FakeStorage();
    const provider = () => storage;
    const repository = new LocalStorageTrainerRepository(provider);
    await repository.save(makeRecord());
    const raw = storage.raw();
    expect(raw).toContain('"schemaVersion":1');
    expect(JSON.parse(raw ?? "{}").exercises["exercise-1"]).toBeDefined();

    const reloaded = new LocalStorageTrainerRepository(provider);
    expect((await reloaded.get("exercise-1"))?.exercise.title).toBe(
      "Ejercicio exercise-1",
    );
  });

  it("no sobrescribe un payload corrupto ni ante un documento invÃ¡lido", async () => {
    const storage = new FakeStorage();
    const repository = new LocalStorageTrainerRepository(() => storage);
    await repository.save(makeRecord());
    const before = storage.raw();
    storage.putRaw("{broken");

    await expectRepositoryError(repository.list(), "STORAGE_CORRUPT");
    await expectRepositoryError(
      repository.save(makeRecord("exercise-2")),
      "STORAGE_CORRUPT",
    );
    expect(storage.raw()).toBe("{broken");
    expect(storage.writes).toBe(1);
    expect(before).not.toBeNull();
  });

  it("mapea almacenamiento no disponible y cuota", async () => {
    const storage = new FakeStorage();
    storage.failRead = true;
    const repository = new LocalStorageTrainerRepository(() => storage);
    await expectRepositoryError(repository.list(), "STORAGE_UNAVAILABLE");

    const writable = new FakeStorage();
    writable.failWrite = true;
    writable.quota = true;
    const quotaRepository = new LocalStorageTrainerRepository(() => writable);
    await expectRepositoryError(
      quotaRepository.save(makeRecord()),
      "STORAGE_QUOTA",
    );
  });

  it("rechaza claves inconsistentes y conserva intentos válidos", async () => {
    const storage = new FakeStorage();
    storage.putRaw(
      JSON.stringify({
        schemaVersion: 1,
        exercises: { wrong: makeRecord("exercise-1") },
      }),
    );
    const repository = new LocalStorageTrainerRepository(() => storage);
    await expectRepositoryError(repository.list(), "STORAGE_CORRUPT");

    const valid = makeRecord("exercise-2", {
      attempts: [
        {
          id: "attempt-1",
          move: "f1b5",
          legal: true,
          correct: true,
          timedOut: false,
          elapsedMs: 1200,
          hintsUsed: ["concept"],
          penalty: 1,
          score: 4,
          quality: 4,
          reviewedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const memory = new MemoryTrainerRepository();
    await memory.save(valid);
    expect((await memory.get("exercise-2"))?.attempts[0]?.quality).toBe(4);
  });
});
