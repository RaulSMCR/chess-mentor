import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";

import { FakeEngineAdapter } from "@/engine/FakeEngineAdapter";
import { FakeAIProvider } from "@/infrastructure/ai/FakeAIProvider";
import type {
  LibraryRetrievalResponseV1,
  LibraryRetrievalResultV1,
} from "@/infrastructure/ai/LibraryRetrieval";
import {
  createInstructorResponseService,
  type InstructorPositionSnapshotV1,
  type InstructorResponseRequestV1,
} from "./InstructorResponseService";

const START_FEN = new Chess().fen();
const REVIEWED_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

const SNAPSHOT: InstructorPositionSnapshotV1 = {
  snapshotId: "snapshot-fixture-1",
  fen: START_FEN,
  sideToMove: "w",
  revision: 4,
};

function request(
  overrides: Partial<InstructorResponseRequestV1> = {},
): InstructorResponseRequestV1 {
  return {
    requestId: "request-fixture-1",
    question: "Que planes tiene el turno?",
    snapshot: SNAPSHOT,
    ...overrides,
  };
}

function result(
  overrides: Partial<LibraryRetrievalResultV1> = {},
): LibraryRetrievalResultV1 {
  return {
    importKey: "fixture-book-v1",
    sourceSha256: "a".repeat(64),
    mediaType: "text/plain",
    fileName: "fixture-book.txt",
    title: "Libro de ejercicios ficticio",
    chunkId: "chunk-1",
    ordinal: 0,
    text: "La ocupacion del centro prepara las rupturas.",
    locator: { kind: "paragraph", ordinal: 0 },
    score: 0.9,
    matchedTerms: ["centro"],
    mode: "textual_fallback",
    ...overrides,
  };
}

function retrieval(
  results: readonly LibraryRetrievalResultV1[] = [result()],
): LibraryRetrievalResponseV1 {
  return {
    version: "library-retrieval-v1",
    mode: results.length === 0 ? "textual_fallback" : "semantic",
    reason: results.length === 0 ? "no_semantic_results" : null,
    results,
  };
}

function service(
  options: {
    results?: readonly LibraryRetrievalResultV1[];
    ai?: FakeAIProvider;
    engine?: FakeEngineAdapter;
    retrieve?: (
      input: Parameters<
        NonNullable<
          Parameters<typeof createInstructorResponseService>[0]["retrieve"]
        >
      >[0],
    ) => Promise<LibraryRetrievalResponseV1>;
  } = {},
) {
  return createInstructorResponseService({
    retrieve:
      options.retrieve ??
      (async () => retrieval(options.results ?? [result()])),
    engine: "engine" in options ? options.engine : new FakeEngineAdapter(),
    ai: options.ai,
    engineOptions: { depth: 4, multiPv: 2 },
  });
}

describe("InstructorResponseService", () => {
  it("composes cited sources, Stockfish and optional AI as separate origins", async () => {
    const response = await service({
      ai: new FakeAIProvider({
        providerId: "fixture-ai",
        model: "fixture-model",
        generationPrefix: "Sintesis fixture: ",
      }),
    }).respond(request());

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.value).toMatchObject({
      version: "instructor-response-service-v1",
      requestId: "request-fixture-1",
      response: {
        responseId: "request-fixture-1",
        support: "sufficient",
      },
      verification: { status: "verified" },
      retrieval: { status: "used", resultCount: 1 },
      engine: { status: "used" },
      ai: {
        status: "used",
        providerId: "fixture-ai",
        model: "fixture-model",
      },
    });
    expect(response.value.structuredResponse.citations).toHaveLength(1);
    expect(
      response.value.structuredResponse.claims.map((claim) => claim.type),
    ).toEqual(
      expect.arrayContaining(["direct_quote", "engine", "ai_synthesis"]),
    );
    expect(response.value.prospectiva[0]).toMatchObject({
      origin: "engine",
    });
    expect(response.value.prospectiva[0]?.moves.length).toBeGreaterThan(0);
    expect(Object.isFrozen(response.value)).toBe(true);
    expect(Object.isFrozen(response.value.snapshot)).toBe(true);
    expect(() => JSON.stringify(response.value)).not.toThrow();
  });

  it("degrades without AI to verified sources and engine with partial support", async () => {
    const response = await service().respond(request());

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.value.response.support).toBe("partial");
    expect(response.value.ai).toMatchObject({
      status: "not_configured",
      text: null,
    });
    expect(response.value.verification.status).toBe("verified");
    expect(
      response.value.response.claims.some(
        (claim) => claim.type === "ai_synthesis",
      ),
    ).toBe(false);
  });

  it("degrades an unavailable AI provider without hiding sources or engine", async () => {
    const response = await service({
      ai: new FakeAIProvider({
        available: false,
        unavailableReason: "fixture offline",
      }),
    }).respond(request());

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.value.ai).toMatchObject({
      status: "unavailable",
      error: "fixture offline",
    });
    expect(response.value.response.support).toBe("partial");
    expect(response.value.structuredResponse.citations).toHaveLength(1);
  });

  it("returns explicit unsupported when no source, engine or AI can answer", async () => {
    const response = await service({
      results: [],
      engine: undefined,
    }).respond(request());

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.value.response.support).toBe("unsupported");
    expect(response.value.verification.status).toBe("unsupported");
    expect(response.value.structuredResponse.citations).toEqual([]);
    expect(response.value.response.claims).toEqual([
      expect.objectContaining({ type: "unsupported", citationIds: [] }),
    ]);
    expect(response.value.prospectiva).toEqual([
      expect.objectContaining({ origin: "unsupported", moves: [] }),
    ]);
  });

  it("discards a cancelled request and superseded results", async () => {
    const controller = new AbortController();
    let releaseFirst: (() => void) | undefined;
    let calls = 0;
    const firstPending = new Promise<LibraryRetrievalResponseV1>((resolve) => {
      releaseFirst = () => resolve(retrieval());
    });
    const instructor = service({
      retrieve: async ({ signal }) => {
        calls += 1;
        if (calls === 1) {
          signal.addEventListener("abort", () => releaseFirst?.(), {
            once: true,
          });
          return firstPending;
        }
        return retrieval();
      },
    });
    const cancelledPromise = instructor.respond(
      request({ signal: controller.signal }),
    );
    controller.abort();
    const cancelled = await cancelledPromise;
    expect(cancelled).toEqual({
      ok: false,
      discarded: {
        requestId: "request-fixture-1",
        reason: "cancelled",
      },
    });

    const first = instructor.respond(request());
    const second = instructor.respond(
      request({ requestId: "request-fixture-2" }),
    );
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual({
      ok: false,
      discarded: {
        requestId: "request-fixture-1",
        reason: "superseded",
      },
    });
    expect(secondResult).toMatchObject({
      ok: true,
      value: { requestId: "request-fixture-2" },
    });
  });

  it("rejects a snapshot whose side does not match its FEN", async () => {
    const response = await service().respond(
      request({
        snapshot: {
          ...SNAPSHOT,
          fen: REVIEWED_FEN,
          sideToMove: "w",
        },
      }),
    );

    expect(response).toMatchObject({
      ok: false,
      error: { code: "INSTRUCTOR_RESPONSE_INVALID_REQUEST" },
    });
  });
});
