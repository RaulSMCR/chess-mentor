import {
  TrainerRepositoryError,
  validateTrainerRecord,
  type TrainerExerciseRecordV1,
  type TrainerRepository,
} from "./TrainerRepository";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class MemoryTrainerRepository implements TrainerRepository {
  private readonly records = new Map<string, TrainerExerciseRecordV1>();

  async list(): Promise<TrainerExerciseRecordV1[]> {
    return [...this.records.values()]
      .sort((left, right) => left.exercise.id.localeCompare(right.exercise.id))
      .map((record) => clone(record));
  }

  async get(id: string): Promise<TrainerExerciseRecordV1 | null> {
    const record = this.records.get(id);
    return record === undefined ? null : clone(record);
  }

  async save(record: TrainerExerciseRecordV1): Promise<void> {
    let validated: TrainerExerciseRecordV1;
    try {
      validated = validateTrainerRecord(record);
    } catch (error) {
      if (error instanceof TrainerRepositoryError) throw error;
      throw new TrainerRepositoryError(
        "INVALID_DOCUMENT",
        "El registro de ejercicio no es vÃ¡lido.",
        { cause: error },
      );
    }
    this.records.set(validated.exercise.id, clone(validated));
  }

  async remove(id: string): Promise<void> {
    this.records.delete(id);
  }
}
