import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/infrastructure/db/prisma";

import {
  TrainerRepositoryError,
  validateTrainerRecord,
  type TrainerExerciseRecordV1,
  type TrainerRepository,
} from "./TrainerRepository";

export type TrainerRecordRow = Readonly<{
  id: string;
  nextDueAt: Date;
  payload: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}>;

export type TrainerRecordCreate = Readonly<{
  id: string;
  nextDueAt: Date;
  payload: Prisma.InputJsonValue;
  createdAt: Date;
  updatedAt: Date;
}>;

export type TrainerRecordUpdate = Readonly<{
  nextDueAt: Date;
  payload: Prisma.InputJsonValue;
  updatedAt: Date;
}>;

export type TrainerRecordStore = Readonly<{
  findMany(args: {
    orderBy: ({ nextDueAt: "asc" } | { id: "asc" })[];
  }): Promise<readonly TrainerRecordRow[]>;
  findUnique(args: { where: { id: string } }): Promise<TrainerRecordRow | null>;
  upsert(args: {
    where: { id: string };
    create: TrainerRecordCreate;
    update: TrainerRecordUpdate;
  }): Promise<TrainerRecordRow>;
  deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
}>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function unavailable(cause: unknown): TrainerRepositoryError {
  return new TrainerRepositoryError(
    "STORAGE_UNAVAILABLE",
    `Base de datos no disponible: ${causeMessage(cause)}`,
    { cause },
  );
}

function corrupt(message: string, cause?: unknown): TrainerRepositoryError {
  return new TrainerRepositoryError("STORAGE_CORRUPT", message, { cause });
}

function toInputJson(record: TrainerExerciseRecordV1): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue;
}

function toRecord(row: TrainerRecordRow): TrainerExerciseRecordV1 {
  let nextDueAt: string;
  try {
    nextDueAt = row.nextDueAt.toISOString();
  } catch (cause) {
    throw corrupt(`El ejercicio ${row.id} tiene una fecha inválida.`, cause);
  }

  let record: TrainerExerciseRecordV1;
  try {
    record = validateTrainerRecord(row.payload);
  } catch (cause) {
    if (cause instanceof TrainerRepositoryError) {
      throw corrupt(
        `El ejercicio ${row.id} contiene un payload inválido.`,
        cause,
      );
    }
    throw corrupt(
      `El ejercicio ${row.id} contiene un payload inválido.`,
      cause,
    );
  }

  if (
    record.exercise.id !== row.id ||
    record.schedule.nextDueAt !== nextDueAt
  ) {
    throw corrupt(
      `La metadata SQL del ejercicio ${row.id} no coincide con su payload.`,
    );
  }

  return clone(record);
}

export function createPrismaTrainerRecordStore(
  client: PrismaClient,
): TrainerRecordStore {
  return {
    findMany: ({ orderBy }) =>
      client.trainerExerciseRecord.findMany({ orderBy }),
    findUnique: ({ where }) =>
      client.trainerExerciseRecord.findUnique({ where }),
    upsert: ({ where, create, update }) =>
      client.trainerExerciseRecord.upsert({ where, create, update }),
    deleteMany: ({ where }) =>
      client.trainerExerciseRecord.deleteMany({ where }),
  };
}

export class PrismaTrainerRepository implements TrainerRepository {
  constructor(
    private readonly store: TrainerRecordStore = createPrismaTrainerRecordStore(
      prisma,
    ),
  ) {}

  async list(): Promise<TrainerExerciseRecordV1[]> {
    try {
      const rows = await this.store.findMany({
        orderBy: [{ nextDueAt: "asc" }, { id: "asc" }],
      });
      return rows.map(toRecord).map(clone);
    } catch (cause) {
      if (cause instanceof TrainerRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async get(id: string): Promise<TrainerExerciseRecordV1 | null> {
    try {
      const row = await this.store.findUnique({ where: { id } });
      return row === null ? null : clone(toRecord(row));
    } catch (cause) {
      if (cause instanceof TrainerRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async save(record: TrainerExerciseRecordV1): Promise<void> {
    const validated = validateTrainerRecord(record);
    const now = new Date();
    const create: TrainerRecordCreate = {
      id: validated.exercise.id,
      nextDueAt: new Date(validated.schedule.nextDueAt),
      payload: toInputJson(validated),
      createdAt: now,
      updatedAt: now,
    };
    const update: TrainerRecordUpdate = {
      nextDueAt: create.nextDueAt,
      payload: create.payload,
      updatedAt: now,
    };

    try {
      await this.store.upsert({
        where: { id: create.id },
        create,
        update,
      });
    } catch (cause) {
      if (cause instanceof TrainerRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.store.deleteMany({ where: { id } });
    } catch (cause) {
      if (cause instanceof TrainerRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }
}
