import {
  JobRepositoryError,
  isJobJsonValue,
  type JobJsonValue,
  type JobRecordV1,
  type JobRepository,
} from "./JobRepository";

export type JobHandlerContext = Readonly<{
  checkpoint(value: JobJsonValue): Promise<void>;
}>;

export type JobHandler = (
  job: JobRecordV1,
  context: JobHandlerContext,
) => Promise<JobJsonValue>;

export type JobRunnerOptions = Readonly<{
  handlers: Readonly<Record<string, JobHandler>>;
  clock?: () => Date;
  leaseDurationMs?: number;
  maxAttempts?: number;
}>;

export type JobRunResult =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "succeeded" | "failed";
      job: JobRecordV1;
      checkpoints: number;
    }>;

const DEFAULT_LEASE_DURATION_MS = 60_000;
const DEFAULT_MAX_ATTEMPTS = 3;

function invalid(message: string): JobRepositoryError {
  return new JobRepositoryError("INVALID_JOB", message);
}

function validatePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw invalid(`${field} debe ser un entero positivo.`);
  }
}

function handlerError(cause: unknown): JobJsonValue {
  const message =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "El handler terminó con un error desconocido.";
  return { code: "HANDLER_FAILED", message };
}

function handlerMissing(kind: string): JobJsonValue {
  return { code: "HANDLER_NOT_FOUND", kind };
}

export class JobRunner {
  private readonly clock: () => Date;
  private readonly leaseDurationMs: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly repository: JobRepository,
    private readonly options: JobRunnerOptions,
  ) {
    validatePositiveInteger(
      options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS,
      "leaseDurationMs",
    );
    validatePositiveInteger(
      options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      "maxAttempts",
    );
    this.clock = options.clock ?? (() => new Date());
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  async runOnce(): Promise<JobRunResult> {
    const now = this.clock();
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw invalid("clock debe devolver una fecha válida.");
    }
    const leaseUntil = new Date(now.getTime() + this.leaseDurationMs);
    const job = await this.repository.claim({
      now: now.toISOString(),
      leaseUntil: leaseUntil.toISOString(),
      maxAttempts: this.maxAttempts,
    });
    if (job === null) return { status: "idle" };

    const handler = this.options.handlers[job.kind];
    if (typeof handler !== "function") {
      const failed = await this.repository.fail(
        job.id,
        job.attemptCount,
        handlerMissing(job.kind),
      );
      return { status: "failed", job: failed, checkpoints: 0 };
    }

    let checkpoints = 0;
    try {
      const result = await handler(job, {
        checkpoint: async (value) => {
          if (!isJobJsonValue(value)) {
            throw new Error("El checkpoint del handler no es JSON válido.");
          }
          await this.repository.checkpoint(job.id, job.attemptCount, value);
          checkpoints += 1;
        },
      });
      if (!isJobJsonValue(result)) {
        throw new Error("El resultado del handler no es JSON válido.");
      }
      const succeeded = await this.repository.succeed(
        job.id,
        job.attemptCount,
        result,
      );
      return { status: "succeeded", job: succeeded, checkpoints };
    } catch (cause) {
      if (cause instanceof JobRepositoryError) throw cause;
      const failed = await this.repository.fail(
        job.id,
        job.attemptCount,
        handlerError(cause),
      );
      return { status: "failed", job: failed, checkpoints };
    }
  }
}
