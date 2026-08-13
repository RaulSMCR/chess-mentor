import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getWorkerHealth: vi.fn(),
  workerErrorResponse: vi.fn(),
}));

vi.mock("@/server/worker/client", () => mocks);

import { GET } from "./route";

describe("GET /api/health", () => {
  it("returns worker health without exposing configuration", async () => {
    mocks.getWorkerHealth.mockResolvedValue({
      ok: true,
      service: "chess-mentor-worker",
      version: "test",
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "chess-mentor-worker",
      version: "test",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("maps an unavailable worker to HTTP 503", async () => {
    const error = new Error("offline");
    mocks.getWorkerHealth.mockRejectedValue(error);
    mocks.workerErrorResponse.mockReturnValue({
      status: 503,
      body: {
        ok: false,
        error: { code: "WORKER_UNAVAILABLE", message: "Worker unavailable." },
      },
    });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "WORKER_UNAVAILABLE", message: "Worker unavailable." },
    });
  });
});
