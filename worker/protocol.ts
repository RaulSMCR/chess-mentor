export const WORKER_HOST = "127.0.0.1" as const;
export const WORKER_PORT = 3210 as const;
export const WORKER_TOKEN_HEADER = "x-chess-mentor-worker-token" as const;

export const WORKER_ROUTES = {
  health: "/health",
  diagnostics: "/diagnostics",
} as const;

export const WORKER_HTTP_STATUS = {
  ok: 200,
  unauthorized: 401,
  notFound: 404,
  methodNotAllowed: 405,
  invalidRequest: 400,
  unavailable: 503,
  internalError: 500,
} as const;

export type WorkerErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "INVALID_REQUEST"
  | "WORKER_UNAVAILABLE"
  | "INTERNAL_ERROR";

export type WorkerHealth = Readonly<{
  ok: true;
  service: "chess-mentor-worker";
  version: string;
}>;

export type WorkerDiagnostics = WorkerHealth &
  Readonly<{
    capabilities: readonly string[];
  }>;

export type WorkerError = Readonly<{
  ok: false;
  error: Readonly<{
    code: WorkerErrorCode;
    message: string;
  }>;
}>;

export type WorkerResponse = WorkerHealth | WorkerDiagnostics | WorkerError;

export type WorkerParseResult<T> =
  Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; message: string }>;

const workerErrorCodes: readonly WorkerErrorCode[] = [
  "UNAUTHORIZED",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "INVALID_REQUEST",
  "WORKER_UNAVAILABLE",
  "INTERNAL_ERROR",
];

const sensitiveKeys = new Set([
  "argv",
  "cwd",
  "env",
  "path",
  "stack",
  "token",
  "userData",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  record: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(record).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === [...expected].sort()[index])
  );
}

function hasSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) => sensitiveKeys.has(key) || hasSensitiveKey(child),
  );
}

function isCapability(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 80 &&
    /^[a-z0-9][a-z0-9._-]*$/u.test(value)
  );
}

function parseJson(input: string): WorkerParseResult<unknown> {
  if (typeof input !== "string" || input.trim() === "") {
    return { ok: false, message: "Worker response must be non-empty JSON." };
  }
  try {
    const value: unknown = JSON.parse(input);
    if (hasSensitiveKey(value)) {
      return { ok: false, message: "Worker response contains sensitive data." };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, message: "Worker response is not valid JSON." };
  }
}

function parseHealth(value: unknown): WorkerParseResult<WorkerHealth> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["ok", "service", "version"]) ||
    value.ok !== true ||
    value.service !== "chess-mentor-worker" ||
    typeof value.version !== "string" ||
    value.version.length === 0 ||
    value.version.length > 80
  ) {
    return { ok: false, message: "Invalid worker health envelope." };
  }
  return {
    ok: true,
    value: {
      ok: true,
      service: "chess-mentor-worker",
      version: value.version,
    },
  };
}

function parseDiagnostics(
  value: unknown,
): WorkerParseResult<WorkerDiagnostics> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["capabilities", "ok", "service", "version"]) ||
    value.ok !== true ||
    value.service !== "chess-mentor-worker" ||
    typeof value.version !== "string" ||
    value.version.length === 0 ||
    value.version.length > 80 ||
    !Array.isArray(value.capabilities) ||
    !value.capabilities.every(isCapability)
  ) {
    return { ok: false, message: "Invalid worker diagnostics envelope." };
  }
  return {
    ok: true,
    value: {
      ok: true,
      service: "chess-mentor-worker",
      version: value.version,
      capabilities: [...value.capabilities],
    },
  };
}

function parseError(value: unknown): WorkerParseResult<WorkerError> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["error", "ok"]) ||
    value.ok !== false
  ) {
    return { ok: false, message: "Invalid worker error envelope." };
  }
  const error = value.error;
  if (
    !isRecord(error) ||
    !hasExactKeys(error, ["code", "message"]) ||
    typeof error.code !== "string" ||
    !workerErrorCodes.includes(error.code as WorkerErrorCode) ||
    typeof error.message !== "string" ||
    error.message.length === 0 ||
    error.message.length > 240
  ) {
    return { ok: false, message: "Invalid worker error envelope." };
  }
  return {
    ok: true,
    value: {
      ok: false,
      error: {
        code: error.code as WorkerErrorCode,
        message: error.message,
      },
    },
  };
}

export function healthResponse(version: string): WorkerHealth {
  return { ok: true, service: "chess-mentor-worker", version };
}

export function diagnosticsResponse(
  version: string,
  capabilities: readonly string[],
): WorkerDiagnostics {
  return { ...healthResponse(version), capabilities: [...capabilities] };
}

export function errorResponse(
  code: WorkerErrorCode,
  message: string,
): WorkerError {
  return { ok: false, error: { code, message } };
}

export function parseWorkerResponse(
  input: string,
): WorkerParseResult<WorkerResponse> {
  const parsed = parseJson(input);
  if (!parsed.ok) return parsed;
  if (isRecord(parsed.value) && parsed.value.ok === true) {
    if (Object.hasOwn(parsed.value, "capabilities"))
      return parseDiagnostics(parsed.value);
    return parseHealth(parsed.value);
  }
  return parseError(parsed.value);
}

export function serializeWorkerResponse(response: WorkerResponse): string {
  const parsed = parseWorkerResponse(JSON.stringify(response));
  if (!parsed.ok) throw new Error(parsed.message);
  return JSON.stringify(parsed.value);
}
