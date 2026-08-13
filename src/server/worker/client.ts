import {
  WORKER_ROUTES,
  WORKER_TOKEN_HEADER,
  parseWorkerResponse,
  type WorkerDiagnostics,
  type WorkerError,
  type WorkerErrorCode,
  type WorkerHealth,
} from "../../../worker/protocol";
import { resolveWorkerToken } from "../../../worker/token";

const DEFAULT_WORKER_URL = "http://127.0.0.1:3210";
const DEFAULT_TIMEOUT_MS = 2_000;

export type WorkerClientErrorCode = WorkerErrorCode | "INVALID_RESPONSE";

export class WorkerClientError extends Error {
  readonly name = "WorkerClientError";

  constructor(
    readonly code: WorkerClientErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type WorkerClientOptions = Readonly<{
  baseUrl?: string;
  token?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  resolveToken?: () => Promise<string>;
}>;

function workerUrl(options: WorkerClientOptions): string {
  const configured = options.baseUrl ?? process.env.LOCAL_WORKER_URL;
  const base = configured?.trim() || DEFAULT_WORKER_URL;
  return base.replace(/\/$/u, "");
}

function errorStatus(code: WorkerClientErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "NOT_FOUND":
      return 404;
    case "METHOD_NOT_ALLOWED":
      return 405;
    case "WORKER_UNAVAILABLE":
      return 503;
    case "INVALID_REQUEST":
      return 400;
    case "INTERNAL_ERROR":
    case "INVALID_RESPONSE":
      return 500;
  }
}

function isWorkerClientError(error: unknown): error is WorkerClientError {
  return error instanceof WorkerClientError;
}

async function resolveToken(options: WorkerClientOptions): Promise<string> {
  if (options.token !== undefined) return options.token;
  if (options.resolveToken !== undefined) return options.resolveToken();
  return (await resolveWorkerToken()).token;
}

async function requestWorker<T extends WorkerHealth | WorkerDiagnostics>(
  path: string,
  authenticated: boolean,
  options: WorkerClientOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new WorkerClientError(
      "INVALID_REQUEST",
      "Worker timeout must be a positive integer.",
      400,
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = { accept: "application/json" };
  if (authenticated) headers[WORKER_TOKEN_HEADER] = await resolveToken(options);
  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(`${workerUrl(options)}${path}`, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
    } catch {
      throw new WorkerClientError(
        "WORKER_UNAVAILABLE",
        "Worker unavailable.",
        503,
      );
    }
    let body: string;
    try {
      body = await response.text();
    } catch {
      throw new WorkerClientError(
        "INVALID_RESPONSE",
        "Worker response could not be read.",
        500,
      );
    }
    const parsed = parseWorkerResponse(body);
    if (!parsed.ok) {
      throw new WorkerClientError(
        "INVALID_RESPONSE",
        "Invalid worker response.",
        500,
      );
    }
    if (!parsed.value.ok) {
      const workerError = parsed.value.error;
      throw new WorkerClientError(
        workerError.code,
        workerError.message,
        response.status,
      );
    }
    if (!response.ok) {
      throw new WorkerClientError(
        "WORKER_UNAVAILABLE",
        "Worker unavailable.",
        response.status >= 500 ? 503 : response.status,
      );
    }
    return parsed.value as T;
  } catch (error) {
    if (isWorkerClientError(error)) throw error;
    throw new WorkerClientError(
      "WORKER_UNAVAILABLE",
      "Worker unavailable.",
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function createWorkerClient(options: WorkerClientOptions = {}) {
  return {
    getHealth: () =>
      requestWorker<WorkerHealth>(WORKER_ROUTES.health, false, options),
    getDiagnostics: () =>
      requestWorker<WorkerDiagnostics>(
        WORKER_ROUTES.diagnostics,
        true,
        options,
      ),
  };
}

export async function getWorkerHealth(
  options: WorkerClientOptions = {},
): Promise<WorkerHealth> {
  return createWorkerClient(options).getHealth();
}

export async function getWorkerDiagnostics(
  options: WorkerClientOptions = {},
): Promise<WorkerDiagnostics> {
  return createWorkerClient(options).getDiagnostics();
}

export function workerErrorResponse(error: unknown): Readonly<{
  body: WorkerError;
  status: number;
}> {
  if (isWorkerClientError(error)) {
    const code =
      error.code === "INVALID_RESPONSE" ? "INTERNAL_ERROR" : error.code;
    return {
      body: {
        ok: false,
        error: { code, message: error.message },
      },
      status: errorStatus(code),
    };
  }
  return {
    body: {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Worker internal error." },
    },
    status: 500,
  };
}
