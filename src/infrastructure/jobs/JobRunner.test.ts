import { beforeEach, describe, expect, it } from "vitest";

import {
  JobRepositoryError,
  type JobJsonValue,
  type JobRecordV1,
  type JobRepository,
} from "./JobRepository";
import { JobRunner, type JobHandler } from "./JobRunner";

const NOW = "2026-08-15T12:00:00.000Z";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeJob(kind = "analysis"): JobRecordV1 {
  return {
    id: "job-1",
    kind,
    status: "queued",
    attemptCount: 0,
    leaseUntil: null,
    checkpoint: null,
    idempotencyKey: `${kind}-1`,
    result: null,
    error: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

class FakeJobRepository implements JobRepository {
  readonly jobs = new Map<string, JobRecordV1>();
  claimError: JobRepositoryError | null = null;
  checkpointError: JobRepositoryError | null = null;
  failCalls = 0;

  async enqueue(): Promise<JobRecordV1> {
    throw new Error("No usado en este fake");
  }

  async get(id: string): Promise<JobRecordV1 | null> {
    const job = this.jobs.get(id);
    return job === undefined ? null : clone(job);
  }

  async claim({
    now,
    leaseUntil,
    maxAttempts,
  }: Parameters<JobRepository["claim"]>[0]): Promise<JobRecordV1 | null> {
    if (this.claimError !== null) throw this.claimError;
    const nowMs = Date.parse(now);
    const candidate = [...this.jobs.values()]
      .filter(
        (job) =>
          job.attemptCount < maxAttempts &&
          (job.status === "queued" ||
            (job.status === "running" &&
              job.leaseUntil !== null &&
              Date.parse(job.leaseUntil) < nowMs)),
      )
      .sort((left, right) => left.id.localeCompare(right.id))[0];
    if (candidate === undefined) return null;

    const running: JobRecordV1 = {
      ...candidate,
      status: "running",
      attemptCount: candidate.attemptCount + 1,
      leaseUntil,
      updatedAt: now,
    };
    this.jobs.set(running.id, running);
    return clone(running);
  }

  async checkpoint(
    id: string,
    attemptCount: number,
    checkpoint: JobJsonValue,
  ): Promise<JobRecordV1> {
    if (this.checkpointError !== null) throw this.checkpointError;
    const current = this.jobs.get(id);
    if (
      current === undefined ||
      current.status !== "running" ||
      current.attemptCount !== attemptCount
    ) {
      throw new JobRepositoryError("JOB_CONFLICT", "Intento obsoleto.");
    }
    const updated = { ...current, checkpoint, updatedAt: NOW };
    this.jobs.set(id, updated);
    return clone(updated);
  }

  async succeed(
    id: string,
    attemptCount: number,
    result: JobJsonValue,
  ): Promise<JobRecordV1> {
    const current = this.jobs.get(id);
    if (
      current === undefined ||
      current.status !== "running" ||
      current.attemptCount !== attemptCount
    ) {
      throw new JobRepositoryError("JOB_CONFLICT", "Intento obsoleto.");
    }
    const updated = {
      ...current,
      status: "succeeded" as const,
      leaseUntil: null,
      result,
      updatedAt: NOW,
    };
    this.jobs.set(id, updated);
    return clone(updated);
  }

  async fail(
    id: string,
    attemptCount: number,
    error: JobJsonValue,
  ): Promise<JobRecordV1> {
    this.failCalls += 1;
    const current = this.jobs.get(id);
    if (
      current === undefined ||
      current.status !== "running" ||
      current.attemptCount !== attemptCount
    ) {
      throw new JobRepositoryError("JOB_CONFLICT", "Intento obsoleto.");
    }
    const updated = {
      ...current,
      status: "failed" as const,
      leaseUntil: null,
      error,
      updatedAt: NOW,
    };
    this.jobs.set(id, updated);
    return clone(updated);
  }

  async cancel(id: string): Promise<JobRecordV1> {
    const current = this.jobs.get(id);
    if (current === undefined) {
      throw new JobRepositoryError("JOB_NOT_FOUND", "No existe.");
    }
    return clone(current);
  }
}

let repository: FakeJobRepository;
const clock = () => new Date(NOW);
const makeRunner = (
  handlers: Readonly<Record<string, JobHandler>> = {},
  options: { leaseDurationMs?: number; maxAttempts?: number } = {},
) => new JobRunner(repository, { handlers, clock, ...options });

beforeEach(() => {
  repository = new FakeJobRepository();
});

describe("JobRunner", () => {
  it("reclama un job, persiste checkpoints y termina con resultado", async () => {
    repository.jobs.set("job-1", makeJob());
    const seen: string[] = [];
    const result = await makeRunner({
      analysis: async (job, context) => {
        seen.push(`${job.status}:${job.attemptCount}`);
        await context.checkpoint({ ply: 4 });
        await context.checkpoint({ ply: 8 });
        return { score: 0.42 };
      },
    }).runOnce();

    expect(result.status).toBe("succeeded");
    if (result.status !== "succeeded") throw new Error("Resultado inesperado");
    expect(result.checkpoints).toBe(2);
    expect(result.job.status).toBe("succeeded");
    expect(result.job.result).toEqual({ score: 0.42 });
    expect(seen).toEqual(["running:1"]);
    expect(repository.failCalls).toBe(0);
  });

  it("devuelve idle cuando no hay jobs elegibles", async () => {
    const result = await makeRunner({ analysis: async () => ({}) }).runOnce();

    expect(result).toEqual({ status: "idle" });
  });

  it("marca fallo para handler ausente y para excepciones ordinarias", async () => {
    repository.jobs.set("job-1", makeJob("missing"));
    const missing = await makeRunner({}).runOnce();
    expect(missing.status).toBe("failed");
    expect(repository.jobs.get("job-1")?.error).toEqual({
      code: "HANDLER_NOT_FOUND",
      kind: "missing",
    });

    repository.jobs.set("job-2", { ...makeJob("broken"), id: "job-2" });
    const broken = await makeRunner({
      broken: async () => {
        throw new Error("motor detenido");
      },
    }).runOnce();
    expect(broken.status).toBe("failed");
    expect(repository.jobs.get("job-2")?.error).toEqual({
      code: "HANDLER_FAILED",
      message: "motor detenido",
    });
  });

  it("propaga conflictos del repositorio sin convertirlos en éxito o fallo falso", async () => {
    repository.jobs.set("job-1", makeJob());
    repository.checkpointError = new JobRepositoryError(
      "JOB_CONFLICT",
      "lease perdido",
    );

    await expect(
      makeRunner({
        analysis: async (_job, context) => {
          await context.checkpoint({ ply: 1 });
          return { unreachable: true };
        },
      }).runOnce(),
    ).rejects.toMatchObject({ code: "JOB_CONFLICT" });
    expect(repository.failCalls).toBe(0);
  });

  it("valida opciones y propaga errores de almacenamiento al reclamar", async () => {
    expect(() => makeRunner({}, { leaseDurationMs: 0 })).toThrow(
      "leaseDurationMs",
    );
    expect(() => makeRunner({}, { maxAttempts: 0 })).toThrow("maxAttempts");

    repository.claimError = new JobRepositoryError(
      "STORAGE_UNAVAILABLE",
      "connection refused",
    );
    await expect(makeRunner({}).runOnce()).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });
});
