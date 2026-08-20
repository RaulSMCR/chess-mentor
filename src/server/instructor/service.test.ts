import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
  getInstructorCapabilities,
  importInstructorSource,
  listInstructorSources,
  respondInstructor,
} from "./service";

const request = {
  requestId: "request-fixture-1",
  question: "Que plan tiene el turno?",
  snapshot: {
    snapshotId: "snapshot-fixture-1",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    sideToMove: "w" as const,
    revision: 0,
  },
};

describe("server instructor composition", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports local capabilities without private URLs or secrets", () => {
    const capabilities = getInstructorCapabilities();
    const serialized = JSON.stringify(capabilities);

    expect(capabilities).toMatchObject({
      deployment: "local",
      capabilities: {
        instructor: { status: "available" },
        sources: { status: "available" },
        respond: { status: "available" },
      },
      security: { sameOrigin: true, privateServicesExposed: false },
    });
    expect(serialized).not.toContain("127.0.0.1");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("secret");
  });

  it("lists and imports only the supported fictitious fixture", () => {
    const listed = listInstructorSources();
    expect(listed.sources).toHaveLength(1);
    expect(listed.sources[0]).toMatchObject({
      id: "fixture:instructor-opening-v1",
      kind: "fixture",
      status: "available",
    });
    expect(
      importInstructorSource("fixture:instructor-opening-v1"),
    ).toMatchObject({ ok: true });
    expect(importInstructorSource("private-book")).toMatchObject({
      ok: false,
      error: { code: "SOURCE_NOT_FOUND" },
    });
  });

  it("composes local fixture and engine response without contacting a service", async () => {
    const response = await respondInstructor(request);

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.value).toMatchObject({
      deployment: "local",
      degraded: false,
      response: {
        retrieval: { status: "used", resultCount: 1 },
        engine: { status: "used" },
        ai: { status: "not_configured" },
      },
    });
    expect(response.value.response.response.support).toBe("partial");
    expect(response.value.response.citations[0]?.sourceSha256).toBe(
      "f".repeat(64),
    );
  });

  it("degrades on Vercel without attempting to reach the PC", async () => {
    vi.stubEnv("VERCEL", "1");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(getInstructorCapabilities()).toMatchObject({
      deployment: "cloud",
      capabilities: {
        instructor: { status: "degraded" },
        respond: { status: "degraded" },
      },
    });
    const response = await respondInstructor(request);

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.value).toMatchObject({
      deployment: "cloud",
      degraded: true,
      response: {
        engine: { status: "not_configured" },
        retrieval: { status: "empty", resultCount: 0 },
      },
    });
    expect(response.value.response.response.support).toBe("unsupported");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
