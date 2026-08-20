import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listInstructorSources: vi.fn(),
  importInstructorSource: vi.fn(),
}));

vi.mock("@/server/instructor/service", () => mocks);

import { GET, POST } from "./route";

const source = {
  id: "fixture:instructor-opening-v1",
  title: "Fixture de instructor",
  kind: "fixture",
  status: "available",
  sourceSha256: "f".repeat(64),
};

describe("/api/instructor/sources", () => {
  it("lists the supported fixture with no-store", async () => {
    mocks.listInstructorSources.mockReturnValue({ sources: [source] });
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      ok: true,
      data: { sources: [{ id: source.id }] },
    });
  });

  it("imports a fixture and validates malformed JSON or source IDs", async () => {
    mocks.importInstructorSource.mockImplementation((sourceId: string) =>
      sourceId === source.id
        ? { ok: true, value: source }
        : {
            ok: false,
            error: { code: "SOURCE_NOT_FOUND", message: "not found" },
          },
    );
    const valid = await POST(
      new Request("http://localhost/api/instructor/sources", {
        method: "POST",
        body: JSON.stringify({ sourceId: source.id }),
      }),
    );
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({
      ok: true,
      data: { imported: { id: source.id } },
    });

    const invalid = await POST(
      new Request("http://localhost/api/instructor/sources", {
        method: "POST",
        body: "{broken",
      }),
    );
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error).toEqual({
      code: "INVALID_JSON",
      message: "El payload no contiene JSON valido.",
    });

    const missing = await POST(
      new Request("http://localhost/api/instructor/sources", {
        method: "POST",
        body: JSON.stringify({ sourceId: "missing" }),
      }),
    );
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe("SOURCE_NOT_FOUND");
  });
});
