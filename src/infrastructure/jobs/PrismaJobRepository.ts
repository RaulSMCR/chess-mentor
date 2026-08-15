import { JobStatus as PrismaJobStatus, Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/infrastructure/db/prisma";

import {
  JobRepositoryError,
  type ClaimJobInput,
  type EnqueueJobInput,
  type JobJsonValue,
  type JobRecordV1,
  type JobRepository,
  type JobStatus,
  sameJobJson,
  validateClaimInput,
  validateEnqueueInput,
  validateJobRecord,
} from "./JobRepository";

type PrismaJobStatusValue =
  (typeof PrismaJobStatus)[keyof typeof PrismaJobStatus];

export type JobRecordRow = Readonly<{
  id: string;
  kind: string;
  status: PrismaJobStatusValue;
  attemptCount: number;
  leaseUntil: Date | null;
  checkpoint: Prisma.JsonValue | null;
  idempotencyKey: string;
  result: Prisma.JsonValue | null;
  error: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
}>;

export type JobRecordStore = Readonly<{
  findUnique(args: {
    where: { id: string } | { idempotencyKey: string };
  }): Promise<JobRecordRow | null>;
  create(args: { data: Prisma.JobRecordCreateInput }): Promise<JobRecordRow>;
  claim(args: {
    now: Date;
    leaseUntil: Date;
    maxAttempts: number;
  }): Promise<JobRecordRow | null>;
  checkpoint(args: {
    id: string;
    attemptCount: number;
    value: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }): Promise<JobRecordRow | null>;
  finish(args: {
    id: string;
    attemptCount: number;
    status: PrismaJobStatusValue;
    result: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    error: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  }): Promise<JobRecordRow | null>;
  cancel(args: { id: string }): Promise<JobRecordRow | null>;
}>;

const STATUS_TO_PRISMA: Record<JobStatus, PrismaJobStatusValue> = {
  queued: PrismaJobStatus.QUEUED,
  running: PrismaJobStatus.RUNNING,
  succeeded: PrismaJobStatus.SUCCEEDED,
  failed: PrismaJobStatus.FAILED,
  cancelled: PrismaJobStatus.CANCELLED,
};

const STATUS_FROM_PRISMA: Record<PrismaJobStatusValue, JobStatus> = {
  [PrismaJobStatus.QUEUED]: "queued",
  [PrismaJobStatus.RUNNING]: "running",
  [PrismaJobStatus.SUCCEEDED]: "succeeded",
  [PrismaJobStatus.FAILED]: "failed",
  [PrismaJobStatus.CANCELLED]: "cancelled",
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function unavailable(cause: unknown): JobRepositoryError {
  return new JobRepositoryError(
    "STORAGE_UNAVAILABLE",
    `Base de datos no disponible: ${causeMessage(cause)}`,
    { cause },
  );
}

function corrupt(message: string, cause?: unknown): JobRepositoryError {
  return new JobRepositoryError("STORAGE_CORRUPT", message, { cause });
}

function toInputJson(
  value: JobJsonValue,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null
    ? Prisma.JsonNull
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

function toDate(value: string, field: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new JobRepositoryError(
      "INVALID_JOB",
      `${field} no es una fecha válida.`,
    );
  }
  return date;
}

function toJobRecord(row: JobRecordRow): JobRecordV1 {
  let leaseUntil: string | null;
  let createdAt: string;
  let updatedAt: string;
  try {
    leaseUntil = row.leaseUntil?.toISOString() ?? null;
    createdAt = row.createdAt.toISOString();
    updatedAt = row.updatedAt.toISOString();
  } catch (cause) {
    throw corrupt(`El job ${row.id} contiene una fecha inválida.`, cause);
  }

  const status = STATUS_FROM_PRISMA[row.status];
  if (status === undefined) {
    throw corrupt(`El job ${row.id} contiene un estado desconocido.`);
  }

  try {
    return validateJobRecord({
      id: row.id,
      kind: row.kind,
      status,
      attemptCount: row.attemptCount,
      leaseUntil,
      checkpoint: row.checkpoint ?? null,
      idempotencyKey: row.idempotencyKey,
      result: row.result ?? null,
      error: row.error ?? null,
      createdAt,
      updatedAt,
    });
  } catch (cause) {
    if (cause instanceof JobRepositoryError) {
      throw corrupt(`El job ${row.id} está corrupto.`, cause);
    }
    throw corrupt(`El job ${row.id} está corrupto.`, cause);
  }
}

export function createPrismaJobRecordStore(
  client: PrismaClient,
): JobRecordStore {
  return {
    findUnique: ({ where }) => client.jobRecord.findUnique({ where }),
    create: ({ data }) => client.jobRecord.create({ data }),
    claim: async ({ now, leaseUntil, maxAttempts }) =>
      client.$transaction(async (tx) => {
        const candidate = await tx.jobRecord.findFirst({
          where: {
            OR: [
              {
                status: PrismaJobStatus.QUEUED,
                attemptCount: { lt: maxAttempts },
              },
              {
                status: PrismaJobStatus.RUNNING,
                attemptCount: { lt: maxAttempts },
                leaseUntil: { lt: now },
              },
            ],
          },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        if (candidate === null) return null;

        const updated = await tx.jobRecord.updateMany({
          where: {
            id: candidate.id,
            status: candidate.status,
            attemptCount: candidate.attemptCount,
            ...(candidate.status === PrismaJobStatus.RUNNING
              ? { leaseUntil: candidate.leaseUntil }
              : {}),
          },
          data: {
            status: PrismaJobStatus.RUNNING,
            attemptCount: { increment: 1 },
            leaseUntil,
          },
        });
        if (updated.count !== 1) return null;
        return tx.jobRecord.findUnique({ where: { id: candidate.id } });
      }),
    checkpoint: async ({ id, attemptCount, value }) => {
      const updated = await client.jobRecord.updateMany({
        where: {
          id,
          status: PrismaJobStatus.RUNNING,
          attemptCount,
        },
        data: { checkpoint: value },
      });
      return updated.count === 1
        ? client.jobRecord.findUnique({ where: { id } })
        : null;
    },
    finish: async ({ id, attemptCount, status, result, error }) => {
      const updated = await client.jobRecord.updateMany({
        where: {
          id,
          status: PrismaJobStatus.RUNNING,
          attemptCount,
        },
        data: {
          status,
          leaseUntil: null,
          result,
          error,
        },
      });
      return updated.count === 1
        ? client.jobRecord.findUnique({ where: { id } })
        : null;
    },
    cancel: async ({ id }) => {
      const updated = await client.jobRecord.updateMany({
        where: {
          id,
          status: { in: [PrismaJobStatus.QUEUED, PrismaJobStatus.RUNNING] },
        },
        data: { status: PrismaJobStatus.CANCELLED, leaseUntil: null },
      });
      return updated.count === 1
        ? client.jobRecord.findUnique({ where: { id } })
        : null;
    },
  };
}

export class PrismaJobRepository implements JobRepository {
  constructor(
    private readonly store: JobRecordStore = createPrismaJobRecordStore(prisma),
  ) {}

  async enqueue(input: EnqueueJobInput): Promise<JobRecordV1> {
    validateEnqueueInput(input);
    try {
      const existing = await this.store.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing !== null) {
        const record = toJobRecord(existing);
        if (record.kind !== input.kind) {
          throw new JobRepositoryError(
            "IDEMPOTENCY_CONFLICT",
            `La clave ${input.idempotencyKey} ya pertenece a otro tipo de job.`,
          );
        }
        return clone(record);
      }

      const row = await this.store.create({
        data: {
          kind: input.kind,
          status: STATUS_TO_PRISMA.queued,
          attemptCount: 0,
          leaseUntil: null,
          checkpoint: toInputJson(input.checkpoint ?? null),
          idempotencyKey: input.idempotencyKey,
          result: Prisma.JsonNull,
          error: Prisma.JsonNull,
        },
      });
      return clone(toJobRecord(row));
    } catch (cause) {
      if (cause instanceof JobRepositoryError) throw cause;

      try {
        const raced = await this.store.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (raced !== null) {
          const record = toJobRecord(raced);
          if (record.kind !== input.kind) {
            throw new JobRepositoryError(
              "IDEMPOTENCY_CONFLICT",
              `La clave ${input.idempotencyKey} ya pertenece a otro tipo de job.`,
            );
          }
          return clone(record);
        }
      } catch (lookupCause) {
        if (lookupCause instanceof JobRepositoryError) throw lookupCause;
        throw unavailable(lookupCause);
      }
      throw unavailable(cause);
    }
  }

  async get(id: string): Promise<JobRecordV1 | null> {
    try {
      const row = await this.store.findUnique({ where: { id } });
      return row === null ? null : clone(toJobRecord(row));
    } catch (cause) {
      if (cause instanceof JobRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async claim(input: ClaimJobInput): Promise<JobRecordV1 | null> {
    validateClaimInput(input);
    try {
      const row = await this.store.claim({
        now: toDate(input.now, "now"),
        leaseUntil: toDate(input.leaseUntil, "leaseUntil"),
        maxAttempts: input.maxAttempts,
      });
      return row === null ? null : clone(toJobRecord(row));
    } catch (cause) {
      if (cause instanceof JobRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async checkpoint(
    id: string,
    attemptCount: number,
    checkpoint: JobJsonValue,
  ): Promise<JobRecordV1> {
    if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
      throw new JobRepositoryError(
        "INVALID_JOB",
        "attemptCount debe ser un entero positivo.",
      );
    }
    if (!validateJobJsonOrThrow(checkpoint)) {
      throw new JobRepositoryError(
        "INVALID_JOB",
        "checkpoint debe ser JSON serializable.",
      );
    }
    try {
      const row = await this.store.checkpoint({
        id,
        attemptCount,
        value: toInputJson(checkpoint),
      });
      if (row !== null) return clone(toJobRecord(row));
      throw await this.conflictFor(id, "No se pudo guardar el checkpoint.");
    } catch (cause) {
      if (cause instanceof JobRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async succeed(
    id: string,
    attemptCount: number,
    result: JobJsonValue,
  ): Promise<JobRecordV1> {
    return this.finish(id, attemptCount, "succeeded", result, null);
  }

  async fail(
    id: string,
    attemptCount: number,
    error: JobJsonValue,
  ): Promise<JobRecordV1> {
    return this.finish(id, attemptCount, "failed", null, error);
  }

  private async finish(
    id: string,
    attemptCount: number,
    status: "succeeded" | "failed",
    result: JobJsonValue,
    error: JobJsonValue,
  ): Promise<JobRecordV1> {
    if (!Number.isSafeInteger(attemptCount) || attemptCount < 1) {
      throw new JobRepositoryError(
        "INVALID_JOB",
        "attemptCount debe ser un entero positivo.",
      );
    }
    if (!validateJobJsonOrThrow(result) || !validateJobJsonOrThrow(error)) {
      throw new JobRepositoryError(
        "INVALID_JOB",
        "result y error deben ser JSON serializables.",
      );
    }
    try {
      const row = await this.store.finish({
        id,
        attemptCount,
        status: STATUS_TO_PRISMA[status],
        result: toInputJson(result),
        error: toInputJson(error),
      });
      if (row !== null) return clone(toJobRecord(row));

      const current = await this.store.findUnique({ where: { id } });
      if (current === null) {
        throw new JobRepositoryError(
          "JOB_NOT_FOUND",
          `No existe el job ${id}.`,
        );
      }
      const record = toJobRecord(current);
      if (
        status === "succeeded" &&
        record.status === "succeeded" &&
        sameJobJson(record.result, result)
      ) {
        return clone(record);
      }
      throw new JobRepositoryError(
        "JOB_CONFLICT",
        `El job ${id} ya no pertenece al intento ${attemptCount}.`,
      );
    } catch (cause) {
      if (cause instanceof JobRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async cancel(id: string): Promise<JobRecordV1> {
    try {
      const row = await this.store.cancel({ id });
      if (row !== null) return clone(toJobRecord(row));

      const current = await this.store.findUnique({ where: { id } });
      if (current === null) {
        throw new JobRepositoryError(
          "JOB_NOT_FOUND",
          `No existe el job ${id}.`,
        );
      }
      return clone(toJobRecord(current));
    } catch (cause) {
      if (cause instanceof JobRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  private async conflictFor(
    id: string,
    message: string,
  ): Promise<JobRepositoryError> {
    const current = await this.store.findUnique({ where: { id } });
    if (current === null) {
      return new JobRepositoryError("JOB_NOT_FOUND", `No existe el job ${id}.`);
    }
    return new JobRepositoryError("JOB_CONFLICT", message);
  }
}

function validateJobJsonOrThrow(value: JobJsonValue): boolean {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}
