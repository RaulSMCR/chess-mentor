import { describe, expect, it } from "vitest";

import {
  WORKER_HOST,
  WORKER_HTTP_STATUS,
  WORKER_PORT,
  WORKER_ROUTES,
  WORKER_TOKEN_HEADER,
  diagnosticsResponse,
  errorResponse,
  healthResponse,
  parseWorkerResponse,
  serializeWorkerResponse,
} from "./protocol";

describe("worker protocol", () => {
  it("freezes loopback topology, routes, token header and HTTP statuses", () => {
    expect(WORKER_HOST).toBe("127.0.0.1");
    expect(WORKER_PORT).toBe(3210);
    expect(WORKER_TOKEN_HEADER).toBe("x-chess-mentor-worker-token");
    expect(WORKER_ROUTES).toEqual({
      health: "/health",
      diagnostics: "/diagnostics",
    });
    expect(WORKER_HTTP_STATUS).toEqual({
      ok: 200,
      unauthorized: 401,
      notFound: 404,
      methodNotAllowed: 405,
      invalidRequest: 400,
      unavailable: 503,
      internalError: 500,
    });
  });

  it("round-trips health and diagnostics without undefined fields", () => {
    const health = healthResponse("0.1.0");
    const diagnostics = diagnosticsResponse("0.1.0", ["health", "diagnostics"]);
    expect(parseWorkerResponse(serializeWorkerResponse(health))).toEqual({
      ok: true,
      value: health,
    });
    expect(parseWorkerResponse(serializeWorkerResponse(diagnostics))).toEqual({
      ok: true,
      value: diagnostics,
    });
    expect(serializeWorkerResponse(diagnostics)).not.toContain("undefined");
  });

  it("round-trips the unauthorized, not-found and method errors", () => {
    for (const [code, status] of [
      ["UNAUTHORIZED", 401],
      ["NOT_FOUND", 404],
      ["METHOD_NOT_ALLOWED", 405],
    ] as const) {
      const response = errorResponse(code, `HTTP ${status}`);
      expect(parseWorkerResponse(serializeWorkerResponse(response))).toEqual({
        ok: true,
        value: response,
      });
    }
  });

  it("rejects malformed, extra and sensitive envelopes", () => {
    const invalid = [
      "",
      "not-json",
      JSON.stringify({ ok: true, service: "chess-mentor-worker" }),
      JSON.stringify({
        ok: true,
        service: "chess-mentor-worker",
        version: "1",
        token: "secret",
      }),
      JSON.stringify({
        ok: true,
        service: "chess-mentor-worker",
        version: "1",
        capabilities: ["/tmp"],
      }),
      JSON.stringify({
        ok: false,
        error: { code: "UNAUTHORIZED", message: "", stack: "secret" },
      }),
      JSON.stringify({ ok: false, error: { code: "NOPE", message: "bad" } }),
    ];
    for (const input of invalid)
      expect(parseWorkerResponse(input).ok).toBe(false);
  });

  it("rejects sensitive data nested in an otherwise valid envelope", () => {
    const input = JSON.stringify({
      ok: true,
      service: "chess-mentor-worker",
      version: "1",
      capabilities: ["health"],
      metadata: { env: "production" },
    });
    expect(parseWorkerResponse(input)).toEqual({
      ok: false,
      message: "Worker response contains sensitive data.",
    });
  });
});
