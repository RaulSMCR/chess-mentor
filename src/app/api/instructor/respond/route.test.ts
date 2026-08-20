import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  respondInstructor: vi.fn(),
}));

vi.mock("@/server/instructor/service", () => mocks);

import { POST } from "./route";

const requestBody = {
  requestId: "request-fixture-1",
  question: "Que plan tiene el turno?",
  snapshot: {
    snapshotId: "snapshot-fixture-1",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    sideToMove: "w",
    revision: 0,
  },
};

describe("POST /api/instructor/respond", () => {
  it("validates the request and returns a no-store response", async () => {
    mocks.respondInstructor.mockResolvedValue({
      ok: true,
      value: {
        deployment: "cloud",
        degraded: true,
        response: { response: { support: "unsupported" } },
      },
    });
    const response = await POST(
      new Request("http://localhost/api/instructor/respond", {
        method: "POST",
        body: JSON.stringify(requestBody),
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      contractVersion: "instructor-http-v1",
      data: { degraded: true },
    });
    expect(mocks.respondInstructor).toHaveBeenCalledWith(requestBody);
  });

  it("rejects malformed JSON or a FEN/side mismatch without leaking internals", async () => {
    const invalidJson = await POST(
      new Request("http://localhost/api/instructor/respond", {
        method: "POST",
        body: "{broken",
      }),
    );
    expect(invalidJson.status).toBe(400);
    expect((await invalidJson.json()).error.code).toBe("INVALID_JSON");

    const invalidPosition = await POST(
      new Request("http://localhost/api/instructor/respond", {
        method: "POST",
        body: JSON.stringify({
          ...requestBody,
          snapshot: { ...requestBody.snapshot, sideToMove: "b" },
        }),
      }),
    );
    expect(invalidPosition.status).toBe(400);
    const invalidBody = await invalidPosition.json();
    expect(invalidBody.error).toEqual({
      code: "INVALID_REQUEST",
      message: "La solicitud de respuesta no es valida.",
    });
    expect(JSON.stringify(invalidBody)).not.toContain("private");
  });
});
