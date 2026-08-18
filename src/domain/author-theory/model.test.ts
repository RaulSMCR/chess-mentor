import { describe, expect, it } from "vitest";

import {
  applyAuthorTheoryReview,
  createAuthorTheoryRecord,
  validateAuthorTheoryRecord,
} from "./model";

const REVIEWED_AT = "2026-08-18T18:46:55.727Z";

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "record-1",
    authorId: "author-1",
    authorName: "Autora ficticia",
    conceptId: "concept-1",
    conceptLabel: "Control del centro",
    statement: "La actividad central mejora la coordinacion de las piezas.",
    claimType: "paraphrase" as const,
    citationIds: ["citation-1"],
    ...overrides,
  };
}

describe("author theory domain model", () => {
  it("crea un registro normalizado y pendiente sin mutar la entrada", () => {
    const input = record({
      id: " record-1 ",
      authorName: " Autora ficticia ",
      citationIds: [" citation-1 "],
    });
    const result = createAuthorTheoryRecord(input);

    expect(result).toEqual({
      ok: true,
      value: {
        schemaVersion: 1,
        recordVersion: "author-theory-v1",
        id: "record-1",
        authorId: "author-1",
        authorName: "Autora ficticia",
        conceptId: "concept-1",
        conceptLabel: "Control del centro",
        statement: "La actividad central mejora la coordinacion de las piezas.",
        claimType: "paraphrase",
        citationIds: ["citation-1"],
        review: { status: "pending" },
        reviewHistory: [],
      },
    });
    expect(input).toEqual(
      record({
        id: " record-1 ",
        authorName: " Autora ficticia ",
        citationIds: [" citation-1 "],
      }),
    );
  });

  it("acepta unsupported sin respaldo y rechaza tipos no atribuibles", () => {
    const unsupported = createAuthorTheoryRecord(
      record({ claimType: "unsupported", citationIds: [] }),
    );
    expect(unsupported.ok).toBe(true);

    const engine = createAuthorTheoryRecord(record({ claimType: "engine" }));
    const hypothesis = createAuthorTheoryRecord(
      record({ claimType: "user_hypothesis" }),
    );
    expect(engine).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_DISALLOWED_CLAIM_TYPE" },
    });
    expect(hypothesis).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_DISALLOWED_CLAIM_TYPE" },
    });
  });

  it("exige citas unicas para una postura bibliografica", () => {
    expect(createAuthorTheoryRecord(record({ citationIds: [] }))).toMatchObject(
      {
        ok: false,
        error: { code: "AUTHOR_THEORY_INVALID_CITATION_REFERENCE" },
      },
    );
    expect(
      createAuthorTheoryRecord(
        record({ citationIds: ["citation-1", "citation-1"] }),
      ),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_INVALID_CITATION_REFERENCE" },
    });
  });

  it("aplica una aprobacion y luego una correccion con historial auditable", () => {
    const created = createAuthorTheoryRecord(record());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const approved = applyAuthorTheoryReview(created.value, {
      status: "approved",
      reviewerId: "reviewer-1",
      reviewedAt: REVIEWED_AT,
      reason: "La cita ficticia respalda la reformulacion.",
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;

    const corrected = applyAuthorTheoryReview(approved.value, {
      status: "corrected",
      reviewerId: "reviewer-2",
      reviewedAt: "2026-08-18T18:47:55Z",
      reason: "Se precisa el alcance de la postura.",
      correctedText:
        "La actividad central mejora la coordinacion en esta posicion.",
    });
    expect(corrected).toMatchObject({
      ok: true,
      value: {
        statement: "La actividad central mejora la coordinacion de las piezas.",
        review: {
          status: "corrected",
          reviewerId: "reviewer-2",
          correctedText:
            "La actividad central mejora la coordinacion en esta posicion.",
        },
        reviewHistory: [
          { from: "pending", to: "approved", reviewerId: "reviewer-1" },
          { from: "approved", to: "corrected", reviewerId: "reviewer-2" },
        ],
      },
    });
    expect(approved.value.reviewHistory).toHaveLength(1);
  });

  it("rechaza decisiones incompletas y timestamps no UTC", () => {
    const created = createAuthorTheoryRecord(record());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    expect(
      applyAuthorTheoryReview(created.value, {
        status: "approved",
        reviewerId: "reviewer-1",
        reviewedAt: "2026-08-18T18:46:55-03:00",
        reason: "No es UTC.",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_INVALID_REVIEW" },
    });
    expect(
      applyAuthorTheoryReview(created.value, {
        status: "corrected",
        reviewerId: "reviewer-1",
        reviewedAt: REVIEWED_AT,
        reason: "Falta la correccion.",
        correctedText: " ",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_INVALID_REVIEW" },
    });
  });

  it("valida una copia serializada y rechaza un historial roto", () => {
    const created = createAuthorTheoryRecord(record());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const serialized = JSON.parse(JSON.stringify(created.value)) as unknown;
    expect(validateAuthorTheoryRecord(serialized)).toEqual(created);
    expect(
      validateAuthorTheoryRecord({
        ...created.value,
        review: {
          status: "approved",
          reviewerId: "reviewer-1",
          reviewedAt: REVIEWED_AT,
          reason: "Sin evento.",
        },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "AUTHOR_THEORY_INVALID_REVIEW" },
    });
  });
});
