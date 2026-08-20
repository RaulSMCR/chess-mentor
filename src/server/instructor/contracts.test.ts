import { describe, expect, it } from "vitest";

import {
  INSTRUCTOR_HTTP_MAX_BODY_BYTES,
  parseRespondRequest,
  parseSourcesRequest,
  readJsonBody,
} from "./contracts";

const validRequest = {
  requestId: "request-fixture-1",
  question: "Que plan tiene el turno?",
  snapshot: {
    snapshotId: "snapshot-fixture-1",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    sideToMove: "w" as const,
    revision: 0,
  },
};

describe("instructor HTTP contracts", () => {
  it("normaliza requests validos y rechaza campos o limites inesperados", () => {
    expect(parseRespondRequest(validRequest)).toEqual({
      ok: true,
      value: validRequest,
    });
    expect(
      parseRespondRequest({ ...validRequest, unexpected: true }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", status: 400 },
    });
    expect(
      parseRespondRequest({
        ...validRequest,
        question: "q".repeat(2_001),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", status: 400 },
    });
    expect(
      parseSourcesRequest({ sourceId: "fixture:source", extra: "ignored" }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", status: 400 },
    });
  });

  it("comprueba que el lado declarado coincide con el FEN", () => {
    expect(
      parseRespondRequest({
        ...validRequest,
        snapshot: { ...validRequest.snapshot, sideToMove: "b" },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST", status: 400 },
    });
  });

  it("lee JSON y aplica el limite de bytes sin filtrar el payload", async () => {
    await expect(
      readJsonBody(
        new Request("http://localhost/api/instructor/respond", {
          method: "POST",
          body: JSON.stringify(validRequest),
        }),
      ),
    ).resolves.toEqual({ ok: true, value: validRequest });

    await expect(
      readJsonBody(
        new Request("http://localhost/api/instructor/respond", {
          method: "POST",
          body: "{broken",
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_JSON", status: 400 },
    });

    const oversized = "x".repeat(INSTRUCTOR_HTTP_MAX_BODY_BYTES + 1);
    await expect(
      readJsonBody(
        new Request("http://localhost/api/instructor/respond", {
          method: "POST",
          body: JSON.stringify(oversized),
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "PAYLOAD_TOO_LARGE", status: 413 },
    });
  });
});
