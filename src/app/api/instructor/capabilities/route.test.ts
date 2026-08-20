import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInstructorCapabilities: vi.fn(),
}));

vi.mock("@/server/instructor/service", () => mocks);

import { GET } from "./route";

describe("GET /api/instructor/capabilities", () => {
  it("returns capabilities with no-store and no cross-origin exposure", async () => {
    mocks.getInstructorCapabilities.mockReturnValue({
      deployment: "cloud",
      capabilities: {
        instructor: {
          status: "degraded",
          reason: "La demo cloud no alcanza recursos locales del equipo.",
        },
        sources: { status: "available", reason: null },
        respond: {
          status: "degraded",
          reason: "La demo cloud no alcanza recursos locales del equipo.",
        },
      },
      security: { sameOrigin: true, privateServicesExposed: false },
    });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(await response.json()).toMatchObject({
      ok: true,
      contractVersion: "instructor-http-v1",
      data: { deployment: "cloud" },
    });
  });
});
