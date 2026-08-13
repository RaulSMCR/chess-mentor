import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  WORKER_HOST,
  WORKER_PORT,
  WORKER_ROUTES,
  WORKER_TOKEN_HEADER,
  diagnosticsResponse,
  errorResponse,
  healthResponse,
  serializeWorkerResponse,
  type WorkerErrorCode,
} from "./protocol";
import { resolveWorkerToken, tokensEqual } from "./token";

const DEFAULT_VERSION = "0.1.0";
const DEFAULT_CAPABILITIES = ["health", "diagnostics"] as const;

export type WorkerServerOptions = Readonly<{
  host?: string;
  port?: number;
  token?: string;
  version?: string;
  capabilities?: readonly string[];
  cwd?: string;
}>;

export type WorkerServerHandle = Readonly<{
  server: Server;
  host: string;
  port: number;
  token: string;
  start: () => Promise<number>;
  close: () => Promise<void>;
}>;

function assertOptions(options: WorkerServerOptions): void {
  const host = options.host ?? WORKER_HOST;
  const port = options.port ?? WORKER_PORT;
  const version = options.version ?? DEFAULT_VERSION;
  if (host !== WORKER_HOST) {
    throw new Error(`Worker host must be ${WORKER_HOST}.`);
  }
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Worker port must be an integer between 0 and 65535.");
  }
  if (version.trim() === "" || version.length > 80) {
    throw new Error(
      "Worker version must be non-empty and at most 80 characters.",
    );
  }
  if (options.token !== undefined && options.token.trim() === "") {
    throw new Error("Worker token must be non-empty.");
  }
}

function headerToken(request: IncomingMessage): string {
  const value = request.headers[WORKER_TOKEN_HEADER];
  return typeof value === "string" ? value : "";
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: Parameters<typeof serializeWorkerResponse>[0],
): void {
  const payload = serializeWorkerResponse(body);
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(payload);
}

function writeError(
  response: ServerResponse,
  status: number,
  code: WorkerErrorCode,
  message: string,
): void {
  writeJson(response, status, errorResponse(code, message));
}

function requestPath(request: IncomingMessage): string {
  const raw = request.url ?? "/";
  try {
    return new URL(raw, `http://${WORKER_HOST}`).pathname;
  } catch {
    return "";
  }
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  token: string,
  version: string,
  capabilities: readonly string[],
): void {
  const path = requestPath(request);
  const method = request.method ?? "";
  if (path === WORKER_ROUTES.health) {
    if (method !== "GET") {
      writeError(response, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
      return;
    }
    writeJson(response, 200, healthResponse(version));
    return;
  }
  if (path === WORKER_ROUTES.diagnostics) {
    if (method !== "GET") {
      writeError(response, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
      return;
    }
    if (!tokensEqual(token, headerToken(request))) {
      writeError(response, 401, "UNAUTHORIZED", "Worker token required.");
      return;
    }
    writeJson(response, 200, diagnosticsResponse(version, capabilities));
    return;
  }
  writeError(response, 404, "NOT_FOUND", "Worker route not found.");
}

export async function createWorkerServer(
  options: WorkerServerOptions = {},
): Promise<WorkerServerHandle> {
  assertOptions(options);
  const host = options.host ?? WORKER_HOST;
  const port = options.port ?? WORKER_PORT;
  const version = options.version ?? DEFAULT_VERSION;
  const capabilities = options.capabilities ?? DEFAULT_CAPABILITIES;
  const token = options.token ?? (await resolveWorkerToken(options.cwd)).token;
  const server = createServer((request, response) => {
    try {
      handleRequest(request, response, token, version, capabilities);
    } catch {
      if (!response.headersSent) {
        writeError(response, 500, "INTERNAL_ERROR", "Worker internal error.");
      } else {
        response.destroy();
      }
    }
  });
  let started = false;
  return {
    server,
    host,
    port,
    token,
    start: () =>
      new Promise<number>((resolveStart, rejectStart) => {
        if (started) {
          const address = server.address();
          if (address !== null && typeof address !== "string")
            resolveStart(address.port);
          else rejectStart(new Error("Worker server is already started."));
          return;
        }
        const onError = (error: Error) => {
          server.off("listening", onListening);
          rejectStart(error);
        };
        const onListening = () => {
          server.off("error", onError);
          const address = server.address();
          if (address === null || typeof address === "string") {
            rejectStart(new Error("Worker did not expose an address."));
            return;
          }
          started = true;
          resolveStart(address.port);
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      }),
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        if (!started) {
          resolveClose();
          return;
        }
        server.close((error) => {
          if (error !== undefined) rejectClose(error);
          else {
            started = false;
            resolveClose();
          }
        });
      }),
  };
}

if (/worker[\\/]server\.js$/u.test(process.argv[1] ?? "")) {
  void createWorkerServer().then(async (worker) => {
    await worker.start();
  });
}
