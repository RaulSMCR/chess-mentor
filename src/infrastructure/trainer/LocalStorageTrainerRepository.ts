import {
  emptyTrainerEnvelope,
  TRAINER_STORAGE_KEY,
  TrainerRepositoryError,
  validateTrainerEnvelope,
  validateTrainerRecord,
  type StoredTrainerV1,
  type TrainerExerciseRecordV1,
  type TrainerRepository,
  type TrainerStorageProvider,
} from "./TrainerRepository";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function storage(provider: TrainerStorageProvider) {
  try {
    return provider();
  } catch (error) {
    throw new TrainerRepositoryError(
      "STORAGE_UNAVAILABLE",
      "El almacenamiento local no estÃ¡ disponible.",
      { cause: error },
    );
  }
}

function readEnvelope(provider: TrainerStorageProvider): StoredTrainerV1 {
  const target = storage(provider);
  let raw: string | null;
  try {
    raw = target.getItem(TRAINER_STORAGE_KEY);
  } catch (error) {
    throw new TrainerRepositoryError(
      "STORAGE_UNAVAILABLE",
      "No se pudo leer el almacenamiento local.",
      { cause: error },
    );
  }
  if (raw === null) return emptyTrainerEnvelope();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new TrainerRepositoryError(
      "STORAGE_CORRUPT",
      "El repositorio de ejercicios no contiene JSON vÃ¡lido.",
      { cause: error },
    );
  }
  return validateTrainerEnvelope(parsed);
}

function writeEnvelope(
  provider: TrainerStorageProvider,
  envelope: StoredTrainerV1,
): void {
  const target = storage(provider);
  try {
    target.setItem(TRAINER_STORAGE_KEY, JSON.stringify(envelope));
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const quota =
      error instanceof DOMException && error.name === "QuotaExceededError";
    throw new TrainerRepositoryError(
      quota || message.includes("quota")
        ? "STORAGE_QUOTA"
        : "STORAGE_UNAVAILABLE",
      quota
        ? "Se superÃ³ la cuota del almacenamiento local."
        : "No se pudo escribir el almacenamiento local.",
      { cause: error },
    );
  }
}

export class LocalStorageTrainerRepository implements TrainerRepository {
  constructor(private readonly provider: TrainerStorageProvider) {}

  async list(): Promise<TrainerExerciseRecordV1[]> {
    const envelope = readEnvelope(this.provider);
    return Object.values(envelope.exercises)
      .sort((left, right) => left.exercise.id.localeCompare(right.exercise.id))
      .map((record) => clone(record));
  }

  async get(id: string): Promise<TrainerExerciseRecordV1 | null> {
    const envelope = readEnvelope(this.provider);
    const record = envelope.exercises[id];
    return record === undefined ? null : clone(record);
  }

  async save(record: TrainerExerciseRecordV1): Promise<void> {
    const validated = validateTrainerRecord(record);
    const envelope = readEnvelope(this.provider);
    const next: StoredTrainerV1 = {
      schemaVersion: envelope.schemaVersion,
      exercises: {
        ...envelope.exercises,
        [validated.exercise.id]: validated,
      },
    };
    writeEnvelope(this.provider, next);
  }

  async remove(id: string): Promise<void> {
    const envelope = readEnvelope(this.provider);
    if (envelope.exercises[id] === undefined) return;
    const remaining = Object.fromEntries(
      Object.entries(envelope.exercises).filter(([key]) => key !== id),
    );
    writeEnvelope(this.provider, {
      schemaVersion: envelope.schemaVersion,
      exercises: remaining,
    });
  }
}
