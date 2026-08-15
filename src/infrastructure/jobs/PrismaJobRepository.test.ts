import { JobStatus as PrismaJobStatus, Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import { JobRepositoryError } from "./JobRepository";
import {
  PrismaJobRepository,
  type JobRecordRow,
  type JobRecordStore,
} from "./PrismaJobRepository";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonValue(value: Prisma.JsonValue | null): Prisma.JsonValue | null {
  return clone(value);
}

function storedJson(
  value: Prisma.InputJsonValue | typeof Prisma.JsonNull,
): Prisma.JsonValue | null {
  return value === Prisma.JsonNull ? null : clone(value as Prisma.JsonValue);
}

type MutableJobRecordRow = {
  -readonly [Key in keyof JobRecordRow]: JobRecordRow[Key];
};

function cloneRow(row: JobRecordRow): JobRecordRow {
  return {
    ...row,
    leaseUntil: row.leaseUntil === null ? null : new Date(row.leaseUntil),
    checkpoint: jsonValue(row.checkpoint),
    result: jsonValue(row.result),
    error: jsonValue(row.error),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

class FakeJobRecordStore implements JobRecordStore {
  readonly rows = new Map<string, MutableJobRecordRow>();
  failure: Error | null = null;
  writes = 0;

  private failIfConfigured(): void {
    if (this.failure !== null) throw this.failure;
  }

  async findUnique({
    where,
  }: {
    where: { id: string } | { idempotencyKey: string };
  }): Promise<JobRecordRow | null> {
    this.failIfConfigured();
    const row =
      "id" in where
        ? this.rows.get(where.id)
        : [...this.rows.values()].find(
            (candidate) => candidate.idempotencyKey === where.idempotencyKey,
          );
    return row === undefined ? null : cloneRow(row);
  }

  async create({
    data,
  }: Parameters<JobRecordStore["create"]>[0]): Promise<JobRecordRow> {
    this.failIfConfigured();
    this.writes += 1;
    const now = new Date();
    const id = `job-${this.rows.size + 1}`;
    const row: MutableJobRecordRow = {
      id,
      kind: data.kind,
      status: data.status ?? PrismaJobStatus.QUEUED,
      attemptCount: data.attemptCount ?? 0,
      leaseUntil: data.leaseUntil instanceof Date ? data.leaseUntil : null,
      checkpoint:
        data.checkpoint === Prisma.JsonNull
          ? null
          : ((data.checkpoint ?? null) as Prisma.JsonValue),
      idempotencyKey: data.idempotencyKey,
      result:
        data.result === Prisma.JsonNull
          ? null
          : ((data.result ?? null) as Prisma.JsonValue),
      error:
        data.error === Prisma.JsonNull
          ? null
          : ((data.error ?? null) as Prisma.JsonValue),
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(id, row);
    return cloneRow(row);
  }

  async claim({
    now,
    leaseUntil,
    maxAttempts,
  }: Parameters<JobRecordStore["claim"]>[0]): Promise<JobRecordRow | null> {
    this.failIfConfigured();
    const candidate = [...this.rows.values()]
      .filter(
        (row) =>
          row.attemptCount < maxAttempts &&
          (row.status === PrismaJobStatus.QUEUED ||
            (row.status === PrismaJobStatus.RUNNING &&
              row.leaseUntil !== null &&
              row.leaseUntil.getTime() < now.getTime())),
      )
      .sort((left, right) => {
        const created = left.createdAt.getTime() - right.createdAt.getTime();
        return created !== 0 ? created : left.id.localeCompare(right.id);
      })[0];
    if (candidate === undefined) return null;

    candidate.status = PrismaJobStatus.RUNNING;
    candidate.attemptCount += 1;
    candidate.leaseUntil = new Date(leaseUntil);
    candidate.updatedAt = new Date();
    return cloneRow(candidate);
  }

  async checkpoint({
    id,
    attemptCount,
    value,
  }: Parameters<
    JobRecordStore["checkpoint"]
  >[0]): Promise<JobRecordRow | null> {
    this.failIfConfigured();
    const row = this.rows.get(id);
    if (
      row === undefined ||
      row.status !== PrismaJobStatus.RUNNING ||
      row.attemptCount !== attemptCount
    ) {
      return null;
    }
    row.checkpoint = storedJson(value);
    row.updatedAt = new Date();
    return cloneRow(row);
  }

  async finish({
    id,
    attemptCount,
    status,
    result,
    error,
  }: Parameters<JobRecordStore["finish"]>[0]): Promise<JobRecordRow | null> {
    this.failIfConfigured();
    const row = this.rows.get(id);
    if (
      row === undefined ||
      row.status !== PrismaJobStatus.RUNNING ||
      row.attemptCount !== attemptCount
    ) {
      return null;
    }
    row.status = status;
    row.leaseUntil = null;
    row.result = storedJson(result);
    row.error = storedJson(error);
    row.updatedAt = new Date();
    return cloneRow(row);
  }

  async cancel({ id }: { id: string }): Promise<JobRecordRow | null> {
    this.failIfConfigured();
    const row = this.rows.get(id);
    if (
      row === undefined ||
      (row.status !== PrismaJobStatus.QUEUED &&
        row.status !== PrismaJobStatus.RUNNING)
    ) {
      return null;
    }
    row.status = PrismaJobStatus.CANCELLED;
    row.leaseUntil = null;
    row.updatedAt = new Date();
    return cloneRow(row);
  }
}

const NOW = "2026-08-15T12:00:00.000Z";
const LEASE = "2026-08-15T12:05:00.000Z";
const AFTER_LEASE = "2026-08-15T12:06:00.000Z";

let store: FakeJobRecordStore;
const makeRepository = () => new PrismaJobRepository(store);

beforeEach(() => {
  store = new FakeJobRecordStore();
});

describe("PrismaJobRepository", () => {
  it("encola de forma idempotente y detecta una clave reutilizada por otro tipo", async () => {
    const repository = makeRepository();
    const first = await repository.enqueue({
      kind: "analysis",
      idempotencyKey: "same-key",
      checkpoint: { position: "root" },
    });
    const duplicate = await repository.enqueue({
      kind: "analysis",
      idempotencyKey: "same-key",
    });

    expect(duplicate).toEqual(first);
    expect(store.writes).toBe(1);
    await expect(
      repository.enqueue({ kind: "import", idempotencyKey: "same-key" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(store.writes).toBe(1);
  });

  it("reclama en orden, recupera un lease vencido y respeta maxAttempts", async () => {
    const repository = makeRepository();
    await repository.enqueue({ kind: "analysis", idempotencyKey: "one" });
    await repository.enqueue({ kind: "analysis", idempotencyKey: "two" });

    const first = await repository.claim({
      now: NOW,
      leaseUntil: LEASE,
      maxAttempts: 2,
    });
    const second = await repository.claim({
      now: NOW,
      leaseUntil: LEASE,
      maxAttempts: 2,
    });
    expect(first?.id).toBe("job-1");
    expect(first?.attemptCount).toBe(1);
    expect(second?.id).toBe("job-2");

    const recovered = await repository.claim({
      now: AFTER_LEASE,
      leaseUntil: "2026-08-15T12:10:00.000Z",
      maxAttempts: 2,
    });
    expect(recovered?.id).toBe("job-1");
    expect(recovered?.attemptCount).toBe(2);
    const secondRecovered = await repository.claim({
      now: "2026-08-15T12:11:00.000Z",
      leaseUntil: "2026-08-15T12:15:00.000Z",
      maxAttempts: 2,
    });
    expect(secondRecovered?.id).toBe("job-2");
    expect(secondRecovered?.attemptCount).toBe(2);
    expect(
      await repository.claim({
        now: "2026-08-15T12:16:00.000Z",
        leaseUntil: "2026-08-15T12:20:00.000Z",
        maxAttempts: 2,
      }),
    ).toBeNull();
  });

  it("impide que un worker obsoleto escriba y hace succeed idempotente", async () => {
    const repository = makeRepository();
    const queued = await repository.enqueue({
      kind: "analysis",
      idempotencyKey: "analysis-1",
    });
    const first = await repository.claim({
      now: NOW,
      leaseUntil: LEASE,
      maxAttempts: 2,
    });
    expect(first?.id).toBe(queued.id);
    await repository.claim({
      now: AFTER_LEASE,
      leaseUntil: "2026-08-15T12:10:00.000Z",
      maxAttempts: 2,
    });

    await expect(
      repository.checkpoint(queued.id, 1, { stale: true }),
    ).rejects.toMatchObject({ code: "JOB_CONFLICT" });
    await repository.checkpoint(queued.id, 2, { ply: 12 });
    await expect(
      repository.succeed(queued.id, 1, { score: 4 }),
    ).rejects.toMatchObject({ code: "JOB_CONFLICT" });

    const done = await repository.succeed(queued.id, 2, { score: 4 });
    expect(done.status).toBe("succeeded");
    expect(await repository.succeed(queued.id, 2, { score: 4 })).toEqual(done);
    await expect(
      repository.succeed(queued.id, 2, { score: 5 }),
    ).rejects.toMatchObject({ code: "JOB_CONFLICT" });
  });

  it("cancela sin reabrir estados terminales y mapea corrupción/fallos", async () => {
    const repository = makeRepository();
    const queued = await repository.enqueue({
      kind: "import",
      idempotencyKey: "cancel-1",
    });
    expect((await repository.cancel(queued.id)).status).toBe("cancelled");
    expect((await repository.cancel(queued.id)).status).toBe("cancelled");
    await expect(repository.get("missing")).resolves.toBeNull();
    await expect(repository.cancel("missing")).rejects.toMatchObject({
      code: "JOB_NOT_FOUND",
    });

    store.rows.set("broken", {
      ...store.rows.get(queued.id)!,
      id: "broken",
      status: "BROKEN" as never,
    });
    await expect(repository.get("broken")).rejects.toMatchObject({
      code: "STORAGE_CORRUPT",
    });

    store.failure = new Error("connection refused");
    await expect(repository.get(queued.id)).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });

  it("valida entradas antes de tocar el store", async () => {
    const repository = makeRepository();
    await expect(
      repository.enqueue({ kind: "", idempotencyKey: "x" }),
    ).rejects.toBeInstanceOf(JobRepositoryError);
    await expect(
      repository.claim({ now: NOW, leaseUntil: NOW, maxAttempts: 2 }),
    ).rejects.toMatchObject({ code: "INVALID_JOB" });
    expect(store.writes).toBe(0);
  });
});
