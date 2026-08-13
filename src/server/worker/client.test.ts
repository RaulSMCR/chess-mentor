import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createWorkerClient, workerErrorResponse } from "./client";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("server-only worker client", () => {
  it("calls health without a token and parses a typed response", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response({ ok: true, service: "chess-mentor-worker", version: "test" }),
      );
    const health = await createWorkerClient({
      baseUrl: "http://127.0.0.1:3210/",
      fetchImpl,
    }).getHealth();
    expect(health.version).toBe("test");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:3210/health",
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).not.toHaveProperty(
      "x-chess-mentor-worker-token",
    );
  });

  it("sends the token only for diagnostics", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ok: true,
        service: "chess-mentor-worker",
        version: "test",
        capabilities: ["health"],
      }),
    );
    await createWorkerClient({
      token: "secret-token",
      fetchImpl,
    }).getDiagnostics();
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({
      accept: "application/json",
      "x-chess-mentor-worker-token": "secret-token",
    });
  });

  it("maps connection failures and timeouts to WORKER_UNAVAILABLE", async () => {
    const rejectedFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    await expect(
      createWorkerClient({ fetchImpl: rejectedFetch }).getHealth(),
    ).rejects.toMatchObject({ code: "WORKER_UNAVAILABLE", status: 503 });

    const hangingFetch = vi.fn<typeof fetch>().mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            ),
          );
        }),
    );
    await expect(
      createWorkerClient({ fetchImpl: hangingFetch, timeoutMs: 5 }).getHealth(),
    ).rejects.toMatchObject({ code: "WORKER_UNAVAILABLE", status: 503 });
  });

  it("rejects malformed worker responses without leaking implementation details", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      response({
        ok: true,
        service: "chess-mentor-worker",
        version: "test",
        stack: "secret",
      }),
    );
    await expect(
      createWorkerClient({ fetchImpl }).getHealth(),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 500 });
    const mapped = workerErrorResponse(new Error("private path /secret"));
    expect(mapped).toEqual({
      status: 500,
      body: {
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Worker internal error." },
      },
    });
  });

  it("does not let client components import the server-only bridge", () => {
    const sourceRoot = resolve(process.cwd(), "src");
    const files: string[] = [];
    const visit = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) visit(path);
        else if (/\.(?:ts|tsx)$/u.test(entry.name)) files.push(path);
      }
    };
    visit(sourceRoot);
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      if (content.includes('"use client"')) {
        expect(content).not.toMatch(
          /(?:@\/server\/worker\/client|server\/worker\/client)/u,
        );
      }
    }
  });
});
