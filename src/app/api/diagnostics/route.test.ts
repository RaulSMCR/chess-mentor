import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkerDiagnostics: vi.fn(),
  workerErrorResponse: vi.fn(),
}));

vi.mock("@/server/worker/client", () => mocks);

import { GET } from "./route";

describe("GET /api/diagnostics", () => {
  it("returns safe capabilities from the worker", async () => {
    mocks.getWorkerDiagnostics.mockResolvedValue({
      ok: true,
      service: "chess-mentor-worker",
      version: "test",
      capabilities: ["health", "diagnostics"],
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "chess-mentor-worker",
      version: "test",
      capabilities: ["health", "diagnostics"],
    });
  });

  it("does not expose the token when diagnostics fails", async () => {
    const error = new Error("private token");
    mocks.getWorkerDiagnostics.mockRejectedValue(error);
    mocks.workerErrorResponse.mockReturnValue({
      status: 503,
      body: {
        ok: false,
        error: { code: "WORKER_UNAVAILABLE", message: "Worker unavailable." },
      },
    });
    const response = await GET();
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain("private token");
    expect(body).not.toContain("secret");
  });
});
