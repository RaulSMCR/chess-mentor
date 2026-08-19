import { describe, expect, it } from "vitest";

import {
  createAuthorTheoryCatalog,
  type AuthorTheoryCatalogV1,
} from "@/domain/author-theory/catalog";
import {
  applyAuthorTheoryReview,
  createAuthorTheoryRecord,
  type AuthorTheoryRecordV1,
} from "@/domain/author-theory/model";
import {
  adaptAuthorTheoryRecord,
  bindAuthorExerciseSource,
} from "./AuthorExerciseSource";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const REVIEWED_AT = "2026-08-19T12:00:00.000Z";

function catalog(): AuthorTheoryCatalogV1 {
  const result = createAuthorTheoryCatalog({
    authors: [
      {
        id: "author-ada",
        canonicalName: "Ada Chess",
        aliases: ["A. Chess"],
        schoolIds: ["school-fixture"],
        conceptIds: ["concept-central-control"],
      },
    ],
    schools: [{ id: "school-fixture", name: "Escuela Fixture" }],
    concepts: [{ id: "concept-central-control", label: "Control central" }],
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function pendingRecord(
  overrides: Partial<Parameters<typeof createAuthorTheoryRecord>[0]> = {},
): AuthorTheoryRecordV1 {
  const result = createAuthorTheoryRecord({
    id: "record-central-control",
    authorId: "author-ada",
    authorName: "Ada Chess",
    conceptId: "concept-central-control",
    conceptLabel: "Control central",
    statement: "La ocupacion central condiciona las rupturas.",
    claimType: "paraphrase",
    citationIds: ["citation-fixture-1"],
    ...overrides,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function reviewedRecord(
  decision: Parameters<typeof applyAuthorTheoryReview>[1] = {
    status: "approved",
    reviewerId: "reviewer-fixture",
    reviewedAt: REVIEWED_AT,
    reason: "Cita y postura verificadas.",
  },
): AuthorTheoryRecordV1 {
  const result = applyAuthorTheoryReview(pendingRecord(), decision);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function evidence(
  overrides: Partial<{
    citationId: string;
    sourceId: string;
    sourceSha256: string;
    locator: Record<string, string | number>;
    fen: string;
    line: readonly string[];
  }> = {},
) {
  return {
    citationId: "citation-fixture-1",
    sourceId: "source-fixture-pgn",
    sourceSha256: "b".repeat(64),
    locator: { kind: "pgn-game-position", gameIndex: 0, ply: 0 },
    fen: STANDARD_FEN,
    line: [],
    ...overrides,
  };
}

describe("bindAuthorExerciseSource", () => {
  it("creates a frozen draft with canonical catalog data and conserved evidence", () => {
    const result = bindAuthorExerciseSource({
      record: reviewedRecord(),
      catalog: catalog(),
      evidence: [evidence()],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: "author:record-central-control",
      title: "Ada Chess: Control central",
      statement: "La ocupacion central condiciona las rupturas.",
      claimType: "paraphrase",
      citationIds: ["citation-fixture-1"],
      fen: STANDARD_FEN,
      line: [],
      status: "draft",
      source: {
        kind: "author_theory",
        id: "record-central-control",
        version: "author-theory-v1",
        schemaVersion: 1,
      },
    });
    expect(result.value.evidence[0]).toMatchObject({
      citationId: "citation-fixture-1",
      sourceId: "source-fixture-pgn",
      sourceSha256: "b".repeat(64),
      fen: STANDARD_FEN,
    });
    expect(result.value.source.author.canonicalName).toBe("Ada Chess");
    expect(result.value.source.concept.label).toBe("Control central");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.evidence)).toBe(true);
    expect(() => JSON.stringify(result.value)).not.toThrow();
  });

  it("uses corrected text while keeping the reviewed source as draft", () => {
    const result = bindAuthorExerciseSource({
      record: reviewedRecord({
        status: "corrected",
        reviewerId: "reviewer-fixture",
        reviewedAt: REVIEWED_AT,
        reason: "Se ajusto el texto a la fuente.",
        correctedText: "La ocupacion central orienta las rupturas.",
      }),
      catalog: catalog(),
      evidence: [evidence()],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.statement).toBe(
      "La ocupacion central orienta las rupturas.",
    );
    expect(result.value.source.record.statement).toBe(
      "La ocupacion central condiciona las rupturas.",
    );
    expect(result.value.source.record.review.status).toBe("corrected");
    expect(result.value.status).toBe("draft");
  });

  it.each([
    ["pending", pendingRecord(), "AUTHOR_EXERCISE_REVIEW_REQUIRED"],
    ["unsupported", reviewedRecord(), "AUTHOR_EXERCISE_UNSUPPORTED_CLAIM"],
  ])(
    "rejects %s records before creating a candidate",
    (_label, record, code) => {
      const candidateRecord =
        _label === "unsupported"
          ? pendingRecord({ claimType: "unsupported", citationIds: [] })
          : record;
      const reviewed =
        _label === "unsupported"
          ? (() => {
              const result = applyAuthorTheoryReview(candidateRecord, {
                status: "approved",
                reviewerId: "reviewer-fixture",
                reviewedAt: REVIEWED_AT,
                reason: "No se usa para generar ejercicios.",
              });
              if (!result.ok) throw new Error(result.error.message);
              return result.value;
            })()
          : candidateRecord;
      const result = bindAuthorExerciseSource({
        record: reviewed,
        catalog: catalog(),
        evidence: [evidence()],
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(code);
    },
  );

  it("rejects disallowed author attribution and unsupported catalog associations", () => {
    const disallowed = {
      ...reviewedRecord(),
      claimType: "engine",
    } as unknown as AuthorTheoryRecordV1;
    const disallowedResult = bindAuthorExerciseSource({
      record: disallowed,
      catalog: catalog(),
      evidence: [evidence()],
    });
    expect(disallowedResult.ok).toBe(false);
    if (!disallowedResult.ok) {
      expect(disallowedResult.error.code).toBe(
        "AUTHOR_EXERCISE_DISALLOWED_CLAIM",
      );
    }

    const associationResult = bindAuthorExerciseSource({
      record: reviewedRecord({
        status: "approved",
        reviewerId: "reviewer-fixture",
        reviewedAt: REVIEWED_AT,
        reason: "Revision fixture.",
      }),
      catalog: {
        ...catalog(),
        authors: [
          {
            ...catalog().authors[0],
            conceptIds: [],
          },
        ],
      },
      evidence: [evidence()],
    });
    expect(associationResult.ok).toBe(false);
    if (!associationResult.ok) {
      expect(associationResult.error.code).toBe(
        "AUTHOR_EXERCISE_INVALID_ASSOCIATION",
      );
    }
  });

  it.each([
    ["missing", [], "AUTHOR_EXERCISE_MISSING_EVIDENCE"],
    [
      "invalid FEN",
      [evidence({ fen: "not-a-fen" })],
      "AUTHOR_EXERCISE_INVALID_EVIDENCE",
    ],
    [
      "conflicting positions",
      [evidence({ fen: AFTER_E4_FEN })],
      "AUTHOR_EXERCISE_AMBIGUOUS_POSITION",
    ],
  ])("rejects %s evidence", (_label, entries, code) => {
    const record =
      _label === "conflicting positions"
        ? (() => {
            const result = createAuthorTheoryRecord({
              id: "record-two-citations",
              authorId: "author-ada",
              authorName: "Ada Chess",
              conceptId: "concept-central-control",
              conceptLabel: "Control central",
              statement: "Dos citas de fixture.",
              claimType: "paraphrase",
              citationIds: ["citation-fixture-1", "citation-fixture-2"],
            });
            if (!result.ok) throw new Error(result.error.message);
            const reviewed = applyAuthorTheoryReview(result.value, {
              status: "approved",
              reviewerId: "reviewer-fixture",
              reviewedAt: REVIEWED_AT,
              reason: "Dos posiciones para probar ambiguedad.",
            });
            if (!reviewed.ok) throw new Error(reviewed.error.message);
            return reviewed.value;
          })()
        : reviewedRecord();
    const evidenceEntries =
      _label === "conflicting positions"
        ? [
            evidence(),
            evidence({ citationId: "citation-fixture-2", fen: AFTER_E4_FEN }),
          ]
        : entries;
    const result = bindAuthorExerciseSource({
      record,
      catalog: catalog(),
      evidence: evidenceEntries,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(code);
  });

  it("requires all cited evidence and ignores unrelated citations", () => {
    const result = adaptAuthorTheoryRecord({
      record: reviewedRecord(),
      catalog: catalog(),
      evidence: [evidence(), evidence({ citationId: "unrelated-citation" })],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.evidence).toHaveLength(1);

    const missing = bindAuthorExerciseSource({
      record: reviewedRecord(),
      catalog: catalog(),
      evidence: [evidence({ citationId: "other-citation" })],
    });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe("AUTHOR_EXERCISE_MISSING_EVIDENCE");
    }
  });
});
