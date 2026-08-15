export const JOB_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JobJsonValue[]
  | { readonly [key: string]: JobJsonValue };

export type JobRecordV1 = Readonly<{
  id: string;
  kind: string;
  status: JobStatus;
  attemptCount: number;
  leaseUntil: string | null;
  checkpoint: JobJsonValue;
  idempotencyKey: string;
  result: JobJsonValue;
  error: JobJsonValue;
  createdAt: string;
  updatedAt: string;
}>;

export type EnqueueJobInput = Readonly<{
  kind: string;
  idempotencyKey: string;
  checkpoint?: JobJsonValue;
}>;

export type ClaimJobInput = Readonly<{
  now: string;
  leaseUntil: string;
  maxAttempts: number;
}>;

export type JobRepositoryErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_CORRUPT"
  | "INVALID_JOB"
  | "IDEMPOTENCY_CONFLICT"
  | "JOB_NOT_FOUND"
  | "JOB_CONFLICT";

export class JobRepositoryError extends Error {
  readonly name = "JobRepositoryError";

  constructor(
    readonly code: JobRepositoryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface JobRepository {
  enqueue(input: EnqueueJobInput): Promise<JobRecordV1>;
  get(id: string): Promise<JobRecordV1 | null>;
  claim(input: ClaimJobInput): Promise<JobRecordV1 | null>;
  checkpoint(
    id: string,
    attemptCount: number,
    checkpoint: JobJsonValue,
  ): Promise<JobRecordV1>;
  succeed(
    id: string,
    attemptCount: number,
    result: JobJsonValue,
  ): Promise<JobRecordV1>;
  fail(
    id: string,
    attemptCount: number,
    error: JobJsonValue,
  ): Promise<JobRecordV1>;
  cancel(id: string): Promise<JobRecordV1>;
}

export function isJobStatus(value: unknown): value is JobStatus {
  return (
    typeof value === "string" &&
    (JOB_STATUSES as readonly string[]).includes(value)
  );
}

export function isJobJsonValue(value: unknown): value is JobJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJobJsonValue);
  if (typeof value !== "object") return false;

  return Object.values(value).every(isJobJsonValue);
}

function cloneJson(value: JobJsonValue): JobJsonValue {
  return JSON.parse(JSON.stringify(value)) as JobJsonValue;
}

function cloneRecord(record: JobRecordV1): JobRecordV1 {
  return {
    ...record,
    checkpoint: cloneJson(record.checkpoint),
    result: cloneJson(record.result),
    error: cloneJson(record.error),
  };
}

function isUtcIso(value: string): boolean {
  return value.endsWith("Z") && Number.isFinite(Date.parse(value));
}

export function validateJobRecord(value: unknown): JobRecordV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new JobRepositoryError(
      "STORAGE_CORRUPT",
      "El registro del job no es un objeto.",
    );
  }

  const record = value as Record<string, unknown>;
  const stringFields = [
    "id",
    "kind",
    "idempotencyKey",
    "createdAt",
    "updatedAt",
  ];
  if (
    !stringFields.every(
      (field) =>
        typeof record[field] === "string" &&
        (record[field] as string).length > 0,
    ) ||
    !isJobStatus(record.status) ||
    !Number.isSafeInteger(record.attemptCount) ||
    (record.attemptCount as number) < 0 ||
    (record.leaseUntil !== null &&
      (typeof record.leaseUntil !== "string" ||
        !isUtcIso(record.leaseUntil))) ||
    !isJobJsonValue(record.checkpoint) ||
    !isJobJsonValue(record.result) ||
    !isJobJsonValue(record.error) ||
    !isUtcIso(record.createdAt as string) ||
    !isUtcIso(record.updatedAt as string)
  ) {
    throw new JobRepositoryError(
      "STORAGE_CORRUPT",
      "El registro del job no cumple el contrato.",
    );
  }

  return cloneRecord(record as JobRecordV1);
}

export function validateEnqueueInput(input: EnqueueJobInput): void {
  if (
    input.kind.trim().length === 0 ||
    input.idempotencyKey.trim().length === 0 ||
    (input.checkpoint !== undefined && !isJobJsonValue(input.checkpoint))
  ) {
    throw new JobRepositoryError(
      "INVALID_JOB",
      "kind, idempotencyKey y checkpoint deben ser valores JSON válidos.",
    );
  }
}

export function validateClaimInput(input: ClaimJobInput): void {
  if (
    !isUtcIso(input.now) ||
    !isUtcIso(input.leaseUntil) ||
    Date.parse(input.leaseUntil) <= Date.parse(input.now) ||
    !Number.isSafeInteger(input.maxAttempts) ||
    input.maxAttempts < 1
  ) {
    throw new JobRepositoryError(
      "INVALID_JOB",
      "now, leaseUntil y maxAttempts no cumplen el contrato de lease.",
    );
  }
}

function sameJson(left: JobJsonValue, right: JobJsonValue): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJson(value, right[index]!))
    );
  }
  if (typeof left === "object" && typeof right === "object") {
    const leftObject = left as { readonly [key: string]: JobJsonValue };
    const rightObject = right as { readonly [key: string]: JobJsonValue };
    const leftKeys = Object.keys(leftObject).sort();
    const rightKeys = Object.keys(rightObject).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] &&
          sameJson(leftObject[key]!, rightObject[key]!),
      )
    );
  }
  return false;
}

export function sameJobJson(left: JobJsonValue, right: JobJsonValue): boolean {
  return sameJson(left, right);
}
