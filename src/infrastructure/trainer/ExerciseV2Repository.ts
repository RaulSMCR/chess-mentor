import {
  migrateExerciseV1,
  validateExerciseV2,
  type ExerciseV2,
  type ExerciseV2Result,
} from "@/domain/trainer/model-v2";

export const EXERCISE_V2_STORAGE_KEY = "chess-mentor.trainer.v2" as const;
export const EXERCISE_V2_REPOSITORY_SCHEMA_VERSION = 1 as const;
export const EXERCISE_V2_REPOSITORY_VERSION =
  "exercise-v2-repository-v1" as const;

export type StoredExercisesV2 = Readonly<{
  schemaVersion: typeof EXERCISE_V2_REPOSITORY_SCHEMA_VERSION;
  repositoryVersion: typeof EXERCISE_V2_REPOSITORY_VERSION;
  exerciseVersion: "exercise-v2";
  exercises: Readonly<Record<string, ExerciseV2>>;
}>;

export type ExerciseV2RepositoryErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_CORRUPT"
  | "STORAGE_QUOTA"
  | "INVALID_DOCUMENT"
  | "INVALID_LEGACY_DOCUMENT";

export class ExerciseV2RepositoryError extends Error {
  readonly name = "ExerciseV2RepositoryError";

  constructor(
    readonly code: ExerciseV2RepositoryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface ExerciseV2Repository {
  list(): Promise<ExerciseV2[]>;
  get(id: string): Promise<ExerciseV2 | null>;
  save(exercise: ExerciseV2): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface ExerciseV2KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type ExerciseV2StorageProvider = () => ExerciseV2KeyValueStorage | null;

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function invalid(message: string, cause?: unknown): ExerciseV2RepositoryError {
  return new ExerciseV2RepositoryError("INVALID_DOCUMENT", message, { cause });
}

export function validateForSave(exercise: ExerciseV2): ExerciseV2 {
  const result = validateExerciseV2(exercise);
  if (!result.ok) {
    throw invalid(`El ejercicio V2 no es valido: ${result.error.message}`);
  }
  return clone(result.value);
}

export function migrateExerciseV1ToV2(
  value: unknown,
): ExerciseV2Result<ExerciseV2> {
  return migrateExerciseV1(value);
}

export function emptyExerciseV2Envelope(): StoredExercisesV2 {
  return {
    schemaVersion: EXERCISE_V2_REPOSITORY_SCHEMA_VERSION,
    repositoryVersion: EXERCISE_V2_REPOSITORY_VERSION,
    exerciseVersion: "exercise-v2",
    exercises: {},
  };
}

function corrupt(message: string, cause?: unknown): ExerciseV2RepositoryError {
  return new ExerciseV2RepositoryError("STORAGE_CORRUPT", message, { cause });
}

export function validateExerciseV2Envelope(value: unknown): StoredExercisesV2 {
  if (!isRecord(value))
    throw corrupt("El envelope de ejercicios no es un objeto.");
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 4 ||
    keys[0] !== "exerciseVersion" ||
    keys[1] !== "exercises" ||
    keys[2] !== "repositoryVersion" ||
    keys[3] !== "schemaVersion"
  ) {
    throw corrupt("El envelope de ejercicios tiene campos inesperados.");
  }
  if (
    value.schemaVersion !== EXERCISE_V2_REPOSITORY_SCHEMA_VERSION ||
    value.repositoryVersion !== EXERCISE_V2_REPOSITORY_VERSION ||
    value.exerciseVersion !== "exercise-v2"
  ) {
    throw corrupt("La version del envelope de ejercicios no es soportada.");
  }
  if (!isRecord(value.exercises)) {
    throw corrupt("exercises debe ser un objeto indexado por id.");
  }

  const exercises: Record<string, ExerciseV2> = {};
  for (const [id, rawExercise] of Object.entries(value.exercises)) {
    const result = validateExerciseV2(rawExercise);
    if (!result.ok) {
      throw corrupt(
        `El ejercicio ${id} almacenado no es valido: ${result.error.message}`,
      );
    }
    if (result.value.id !== id) {
      throw corrupt(
        `La clave ${id} no coincide con exercise.id ${result.value.id}.`,
      );
    }
    exercises[id] = result.value;
  }
  return {
    schemaVersion: EXERCISE_V2_REPOSITORY_SCHEMA_VERSION,
    repositoryVersion: EXERCISE_V2_REPOSITORY_VERSION,
    exerciseVersion: "exercise-v2",
    exercises,
  };
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function readStorage(
  provider: ExerciseV2StorageProvider,
): ExerciseV2KeyValueStorage {
  try {
    const storage = provider();
    if (
      storage === null ||
      typeof storage !== "object" ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function"
    ) {
      throw new Error("El proveedor no expone una interfaz valida.");
    }
    return storage;
  } catch (cause) {
    throw new ExerciseV2RepositoryError(
      "STORAGE_UNAVAILABLE",
      `Storage no disponible: ${causeMessage(cause)}`,
      { cause },
    );
  }
}

export function readExerciseV2Envelope(provider: ExerciseV2StorageProvider): {
  storage: ExerciseV2KeyValueStorage;
  envelope: StoredExercisesV2;
} {
  const storage = readStorage(provider);
  let raw: string | null;
  try {
    raw = storage.getItem(EXERCISE_V2_STORAGE_KEY);
  } catch (cause) {
    throw new ExerciseV2RepositoryError(
      "STORAGE_UNAVAILABLE",
      `No se pudo leer storage: ${causeMessage(cause)}`,
      { cause },
    );
  }
  if (raw === null) return { storage, envelope: emptyExerciseV2Envelope() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw corrupt("El payload de ejercicios no es JSON valido.", cause);
  }
  return { storage, envelope: validateExerciseV2Envelope(parsed) };
}

export function writeExerciseV2Envelope(
  storage: ExerciseV2KeyValueStorage,
  envelope: StoredExercisesV2,
): void {
  try {
    storage.setItem(EXERCISE_V2_STORAGE_KEY, JSON.stringify(envelope));
  } catch (cause) {
    const candidate = cause as { code?: string | number; name?: string };
    const isQuota =
      candidate.name === "QuotaExceededError" ||
      candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      candidate.code === 22 ||
      candidate.code === 1014;
    throw new ExerciseV2RepositoryError(
      isQuota ? "STORAGE_QUOTA" : "STORAGE_UNAVAILABLE",
      isQuota
        ? "Storage sin cuota disponible."
        : `No se pudo escribir storage: ${causeMessage(cause)}`,
      { cause },
    );
  }
}

export class MemoryExerciseV2Repository implements ExerciseV2Repository {
  private readonly exercises = new Map<string, ExerciseV2>();

  async list(): Promise<ExerciseV2[]> {
    return [...this.exercises.values()]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone);
  }

  async get(id: string): Promise<ExerciseV2 | null> {
    const exercise = this.exercises.get(id);
    return exercise === undefined ? null : clone(exercise);
  }

  async save(exercise: ExerciseV2): Promise<void> {
    try {
      const validated = validateForSave(exercise);
      this.exercises.set(validated.id, validated);
    } catch (cause) {
      if (cause instanceof ExerciseV2RepositoryError) throw cause;
      throw new ExerciseV2RepositoryError(
        "INVALID_DOCUMENT",
        "El ejercicio V2 no es valido.",
        { cause },
      );
    }
  }

  async remove(id: string): Promise<void> {
    this.exercises.delete(id);
  }
}

export class LocalStorageExerciseV2Repository implements ExerciseV2Repository {
  constructor(private readonly provider: ExerciseV2StorageProvider) {}

  async list(): Promise<ExerciseV2[]> {
    const { envelope } = readExerciseV2Envelope(this.provider);
    return Object.values(envelope.exercises)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(clone);
  }

  async get(id: string): Promise<ExerciseV2 | null> {
    const { envelope } = readExerciseV2Envelope(this.provider);
    const exercise = envelope.exercises[id];
    return exercise === undefined ? null : clone(exercise);
  }

  async save(exercise: ExerciseV2): Promise<void> {
    const validated = validateForSave(exercise);
    const { storage, envelope } = readExerciseV2Envelope(this.provider);
    writeExerciseV2Envelope(storage, {
      ...envelope,
      exercises: { ...envelope.exercises, [validated.id]: validated },
    });
  }

  async remove(id: string): Promise<void> {
    const { storage, envelope } = readExerciseV2Envelope(this.provider);
    if (envelope.exercises[id] === undefined) return;
    const exercises = { ...envelope.exercises };
    delete exercises[id];
    writeExerciseV2Envelope(storage, { ...envelope, exercises });
  }
}
