import { describe, expect, it } from "vitest";

import { createExercise, type ExerciseV1 } from "@/domain/trainer/model";
import { createExerciseV2, type ExerciseV2 } from "@/domain/trainer/model-v2";
import {
  EXERCISE_V2_REPOSITORY_VERSION,
  EXERCISE_V2_STORAGE_KEY,
  ExerciseV2RepositoryError,
  migrateExerciseV1ToV2,
  type ExerciseV2KeyValueStorage,
} from "./ExerciseV2Repository";
import {
  LocalStorageExerciseV2Repository,
  MemoryExerciseV2Repository,
} from "./ExerciseV2Repository";
import { TRAINER_STORAGE_KEY } from "./TrainerRepository";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

class FakeStorage implements ExerciseV2KeyValueStorage {
  private readonly values = new Map<string, string>();

  writes = 0;

  failRead = false;

  failWrite: Error | null = null;

  getItem(key: string): string | null {
    if (this.failRead) throw new Error("read unavailable");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    if (this.failWrite !== null) throw this.failWrite;
    this.values.set(key, value);
  }

  putRaw(key: string, value: string): void {
    this.values.set(key, value);
  }

  raw(key: string = EXERCISE_V2_STORAGE_KEY): string | null {
    return this.values.get(key) ?? null;
  }
}

function makeExercise(id = "exercise-1"): ExerciseV2 {
  const result = createExerciseV2({
    id,
    title: `Ejercicio V2 ${id}`,
    fen: STANDARD_FEN,
    acceptedMoves: ["e2e4"],
    hints: { concept: "Controla el centro", destination: "e4" },
    difficulty: 2,
    origin: "manual",
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function makeLegacyExercise(id = "legacy-1"): ExerciseV1 {
  const result = createExercise({
    id,
    title: `Ejercicio V1 ${id}`,
    fen: STANDARD_FEN,
    acceptedMoves: ["e2e4"],
    hints: { concept: "Controla el centro", destination: "e4" },
    difficulty: 2,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function quotaError(): Error {
  const error = new Error("quota");
  Object.defineProperty(error, "name", { value: "QuotaExceededError" });
  return error;
}

function expectRepositoryError(
  promise: Promise<unknown>,
  code: ExerciseV2RepositoryError["code"],
) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe("MemoryExerciseV2Repository", () => {
  it("guarda, lista ordenadamente, clona y elimina ejercicios V2", async () => {
    const repository = new MemoryExerciseV2Repository();
    await repository.save(makeExercise("exercise-2"));
    await repository.save(makeExercise("exercise-1"));

    const listed = await repository.list();
    expect(listed.map((exercise) => exercise.id)).toEqual([
      "exercise-1",
      "exercise-2",
    ]);
    expect(listed[0]).not.toBe(await repository.get("exercise-1"));
    (listed[0] as { title: string }).title = "mutated outside repository";
    expect((await repository.get("exercise-1"))?.title).toBe(
      "Ejercicio V2 exercise-1",
    );

    await repository.remove("exercise-1");
    await repository.remove("missing");
    await expect(repository.get("exercise-1")).resolves.toBeNull();
  });

  it("rechaza un documento V2 invalido sin mutar el ejercicio anterior", async () => {
    const repository = new MemoryExerciseV2Repository();
    await repository.save(makeExercise());
    const invalid = { ...makeExercise(), fen: "not-a-fen" };

    await expectRepositoryError(repository.save(invalid), "INVALID_DOCUMENT");
    await expect(repository.get("exercise-1")).resolves.toMatchObject({
      fen: STANDARD_FEN,
    });
  });
});

describe("LocalStorageExerciseV2Repository", () => {
  it("usa una clave y envelope V2 separados de la persistencia V1", async () => {
    const storage = new FakeStorage();
    storage.putRaw(TRAINER_STORAGE_KEY, "legacy-v1-payload");
    const repository = new LocalStorageExerciseV2Repository(() => storage);
    await repository.save(makeExercise());

    const parsed = JSON.parse(storage.raw() ?? "{}") as Record<string, unknown>;
    expect(parsed.repositoryVersion).toBe(EXERCISE_V2_REPOSITORY_VERSION);
    expect(parsed.exerciseVersion).toBe("exercise-v2");
    expect(storage.raw(TRAINER_STORAGE_KEY)).toBe("legacy-v1-payload");

    const reloaded = new LocalStorageExerciseV2Repository(() => storage);
    await expect(reloaded.get("exercise-1")).resolves.toMatchObject({
      exerciseVersion: "exercise-v2",
      review: { status: "draft" },
    });
  });

  it("preserva el payload corrupto y no lo sobrescribe", async () => {
    const storage = new FakeStorage();
    const repository = new LocalStorageExerciseV2Repository(() => storage);
    await repository.save(makeExercise());
    storage.putRaw(EXERCISE_V2_STORAGE_KEY, "{broken");
    const original = storage.raw();

    await expectRepositoryError(repository.list(), "STORAGE_CORRUPT");
    await expectRepositoryError(
      repository.save(makeExercise("exercise-2")),
      "STORAGE_CORRUPT",
    );
    expect(storage.raw()).toBe(original);
    expect(storage.writes).toBe(1);
  });

  it("rechaza versiones desconocidas y claves inconsistentes", async () => {
    const storage = new FakeStorage();
    storage.putRaw(
      EXERCISE_V2_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 99,
        repositoryVersion: EXERCISE_V2_REPOSITORY_VERSION,
        exerciseVersion: "exercise-v2",
        exercises: {},
      }),
    );
    const repository = new LocalStorageExerciseV2Repository(() => storage);
    await expectRepositoryError(repository.list(), "STORAGE_CORRUPT");

    storage.putRaw(
      EXERCISE_V2_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        repositoryVersion: EXERCISE_V2_REPOSITORY_VERSION,
        exerciseVersion: "exercise-v2",
        exercises: { wrong: makeExercise("exercise-1") },
      }),
    );
    await expectRepositoryError(repository.list(), "STORAGE_CORRUPT");
  });

  it("mapea indisponibilidad y cuota sin perder el payload anterior", async () => {
    const unavailable = new FakeStorage();
    unavailable.failRead = true;
    const unavailableRepository = new LocalStorageExerciseV2Repository(
      () => unavailable,
    );
    await expectRepositoryError(
      unavailableRepository.list(),
      "STORAGE_UNAVAILABLE",
    );

    const storage = new FakeStorage();
    const repository = new LocalStorageExerciseV2Repository(() => storage);
    await repository.save(makeExercise());
    const original = storage.raw();
    storage.failWrite = quotaError();
    await expectRepositoryError(
      repository.save(makeExercise("exercise-2")),
      "STORAGE_QUOTA",
    );
    expect(storage.raw()).toBe(original);
  });

  it("migra V1 solo cuando se solicita explicitamente", async () => {
    const legacy = makeLegacyExercise();
    const migration = migrateExerciseV1ToV2(legacy);
    expect(migration.ok).toBe(true);
    if (!migration.ok) return;
    expect(migration.value).toMatchObject({
      id: "legacy-1",
      origin: "legacy_manual",
      originRefId: null,
      originNodeId: null,
      sourceRefs: [],
      counterpartReplies: [],
      review: { status: "draft" },
    });

    const storage = new FakeStorage();
    const repository = new LocalStorageExerciseV2Repository(() => storage);
    await expect(repository.get("legacy-1")).resolves.toBeNull();
    await repository.save(migration.value);
    await expect(repository.get("legacy-1")).resolves.toMatchObject({
      origin: "legacy_manual",
    });
  });

  it("devuelve siempre el error tipado ante un documento almacenado invalido", async () => {
    const storage = new FakeStorage();
    storage.putRaw(
      EXERCISE_V2_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        repositoryVersion: EXERCISE_V2_REPOSITORY_VERSION,
        exerciseVersion: "exercise-v2",
        exercises: { broken: { id: "broken" } },
      }),
    );
    try {
      await new LocalStorageExerciseV2Repository(() => storage).list();
      throw new Error("Se esperaba un rechazo.");
    } catch (error) {
      expect(error).toBeInstanceOf(ExerciseV2RepositoryError);
      expect((error as ExerciseV2RepositoryError).code).toBe("STORAGE_CORRUPT");
    }
  });
});
