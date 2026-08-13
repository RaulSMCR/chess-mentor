import { request } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  WORKER_HOST,
  WORKER_TOKEN_HEADER,
  parseWorkerResponse,
} from "./protocol";
import { createWorkerServer } from "./server";
import { createRandomWorkerToken, tokensEqual } from "./token";

type RunningWorker = Awaited<ReturnType<typeof createWorkerServer>>;
const running: RunningWorker[] = [];

afterEach(async () => {
  await Promise.all(running.splice(0).map((worker) => worker.close()));
});

async function startWorker(): Promise<{ worker: RunningWorker; port: number }> {
  const worker = await createWorkerServer({
    port: 0,
    token: "test-worker-token",
    version: "test",
    capabilities: ["health", "diagnostics"],
  });
  running.push(worker);
  return { worker, port: await worker.start() };
}

async function get(
  port: number,
  path: string,
  token?: string,
): Promise<{ status: number; body: string; address: string }> {
  return new Promise((resolve, reject) => {
    const requestHeaders =
      token === undefined ? undefined : { [WORKER_TOKEN_HEADER]: token };
    const clientRequest = request(
      { host: WORKER_HOST, port, path, method: "GET", headers: requestHeaders },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            address: `${response.headers["content-type"] ?? ""}`,
          }),
        );
      },
    );
    clientRequest.on("error", reject);
    clientRequest.end();
  });
}

describe("worker loopback server", () => {
  it("rejects non-loopback hosts before starting", async () => {
    await expect(
      createWorkerServer({ host: "0.0.0.0", token: "test" }),
    ).rejects.toThrow("Worker host must be 127.0.0.1.");
  });

  it("serves health without a token and diagnostics only with the token", async () => {
    const { worker, port } = await startWorker();
    expect(worker.host).toBe("127.0.0.1");
    const health = await get(port, "/health");
    expect(health.status).toBe(200);
    expect(health.address).toContain("application/json");
    expect(parseWorkerResponse(health.body)).toEqual({
      ok: true,
      value: { ok: true, service: "chess-mentor-worker", version: "test" },
    });

    const unauthorized = await get(port, "/diagnostics");
    expect(unauthorized.status).toBe(401);
    expect(parseWorkerResponse(unauthorized.body)).toEqual({
      ok: true,
      value: {
        ok: false,
        error: { code: "UNAUTHORIZED", message: "Worker token required." },
      },
    });

    const diagnostics = await get(port, "/diagnostics", worker.token);
    expect(diagnostics.status).toBe(200);
    expect(parseWorkerResponse(diagnostics.body)).toEqual({
      ok: true,
      value: {
        ok: true,
        service: "chess-mentor-worker",
        version: "test",
        capabilities: ["health", "diagnostics"],
      },
    });
    expect(diagnostics.body).not.toContain(worker.token);
  });

  it("returns 404/405 envelopes without leaking implementation details", async () => {
    const { port } = await startWorker();
    const missing = await get(port, "/missing");
    expect(missing.status).toBe(404);
    expect(missing.body).not.toContain("stack");

    const method = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const clientRequest = request(
          { host: WORKER_HOST, port, path: "/health", method: "POST" },
          (response) => {
            const chunks: Buffer[] = [];
            response.on("data", (chunk: Buffer) => chunks.push(chunk));
            response.on("end", () =>
              resolve({
                status: response.statusCode ?? 0,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
          },
        );
        clientRequest.on("error", reject);
        clientRequest.end();
      },
    );
    expect(method.status).toBe(405);
    expect(parseWorkerResponse(method.body).ok).toBe(true);
  });

  it("compares tokens safely and generates 32-byte hex tokens", () => {
    const token = createRandomWorkerToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/u);
    expect(tokensEqual(token, token)).toBe(true);
    expect(tokensEqual(token, `${token}x`)).toBe(false);
    expect(tokensEqual(token, token.slice(0, -1))).toBe(false);
  });

  it("closes its listener cleanly", async () => {
    const { worker, port } = await startWorker();
    await worker.close();
    await expect(get(port, "/health")).rejects.toThrow();
    running.splice(running.indexOf(worker), 1);
  });
});
