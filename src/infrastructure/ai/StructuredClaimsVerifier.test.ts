import { describe, expect, it } from "vitest";

import goldenEntries from "../../../fixtures/phase4/catalog/golden.entries.json";

import { buildLibraryIndexFromEntries } from "../library/index/LibraryCatalogIndex";
import {
  searchLibraryIndex,
  type LibrarySearchResultV1,
} from "../library/index/LibraryIndex";
import type { LibraryCatalogEntryV1 } from "../library/catalog/LibraryCatalogRepository";
import {
  createCitationFromSearchResult,
  createStructuredResponse,
} from "./StructuredClaims";
import { verifyStructuredResponse } from "./StructuredClaimsVerifier";

const entries = goldenEntries as unknown as readonly LibraryCatalogEntryV1[];

function fixtureResult(): LibrarySearchResultV1 {
  const index = buildLibraryIndexFromEntries(entries);
  const result = searchLibraryIndex(index, "evaluacion posicional")[0];
  if (result === undefined) throw new Error("fixture result missing");
  return result;
}

function fixtureCitation(result: LibrarySearchResultV1) {
  return createCitationFromSearchResult(result, {
    citationId: "fixture-citation-1",
    work: "Obra de fixture",
    edition: "Edicion de fixture",
  });
}

describe("StructuredClaimsVerifier", () => {
  it("verifica un direct_quote cuyo hash, localizador y fragmento coinciden", () => {
    const evidence = fixtureResult();
    const citation = fixtureCitation(evidence);
    const response = createStructuredResponse({
      responseId: "fixture-response-verified",
      answer: "La evidencia respalda el fragmento.",
      claims: [
        {
          id: "claim-quote",
          text: "La evaluacion posicional",
          type: "direct_quote",
          citationIds: [citation.citationId],
        },
      ],
      citations: [citation],
    });

    const result = verifyStructuredResponse(response, [evidence]);

    expect(result).toMatchObject({
      verifierVersion: "structured-claims-verifier-v1",
      status: "verified",
      issues: [],
    });
    expect(result.response).toEqual(response);
  });

  it("convierte a unsupported un claim bibliografico sin evidencia", () => {
    const evidence = fixtureResult();
    const citation = fixtureCitation(evidence);
    const response = createStructuredResponse({
      responseId: "fixture-response-empty-corpus",
      answer: "Respuesta que no debe presentarse como respaldada.",
      claims: [
        {
          id: "claim-paraphrase",
          text: "El texto explica una idea.",
          type: "paraphrase",
          citationIds: [citation.citationId],
        },
      ],
      citations: [citation],
    });

    const result = verifyStructuredResponse(response, []);

    expect(result.status).toBe("unsupported");
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "CITATION_NOT_IN_CORPUS",
        claimId: "claim-paraphrase",
      }),
    ]);
    expect(result.response.answer).toBe(
      "No hay evidencia suficiente para respaldar todos los claims.",
    );
    expect(result.response.claims[0]).toMatchObject({
      type: "unsupported",
      citationIds: [],
    });
    expect(result.response.citations).toEqual([]);
  });

  it("rechaza procedencia con hash o localizador que no coincide con el corpus", () => {
    const evidence = fixtureResult();
    const citation = fixtureCitation(evidence);
    const response = createStructuredResponse({
      responseId: "fixture-response-mismatch",
      answer: "Respuesta de fixture.",
      claims: [
        {
          id: "claim-inference",
          text: "La posicion concede espacio.",
          type: "inference",
          citationIds: [citation.citationId],
        },
      ],
      citations: [
        {
          ...citation,
          sourceSha256: "c".repeat(64),
          locator: { ...citation.locator, startByte: 999 },
        },
      ],
    });
    const before = JSON.parse(JSON.stringify(response));
    const evidenceBefore = JSON.parse(JSON.stringify(evidence));

    const result = verifyStructuredResponse(response, [evidence]);

    expect(result.status).toBe("unsupported");
    expect(result.issues[0]).toMatchObject({
      code: "CITATION_NOT_IN_CORPUS",
      citationId: citation.citationId,
    });
    expect(result.response.claims[0]?.type).toBe("unsupported");
    expect(response).toEqual(before);
    expect(evidence).toEqual(evidenceBefore);
  });

  it("rechaza una cita directa cuyo texto no aparece en el fragmento", () => {
    const evidence = fixtureResult();
    const citation = fixtureCitation(evidence);
    const response = createStructuredResponse({
      responseId: "fixture-response-quote-mismatch",
      answer: "Respuesta de fixture.",
      claims: [
        {
          id: "claim-quote-mismatch",
          text: "El autor afirma otra cosa.",
          type: "direct_quote",
          citationIds: [citation.citationId],
        },
      ],
      citations: [citation],
    });

    const result = verifyStructuredResponse(response, [evidence]);

    expect(result).toMatchObject({ status: "unsupported" });
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "DIRECT_QUOTE_NOT_FOUND" }),
    ]);
    expect(result.response.claims[0]?.type).toBe("unsupported");
  });

  it("no exige corpus bibliografico para engine ni user_hypothesis", () => {
    const response = createStructuredResponse({
      responseId: "fixture-response-non-bibliographic",
      answer: "Respuesta separada de la biblioteca.",
      claims: [
        {
          id: "claim-engine",
          text: "El motor evalua la posicion.",
          type: "engine",
          citationIds: [],
        },
        {
          id: "claim-user",
          text: "Esta es una hipotesis del usuario.",
          type: "user_hypothesis",
          citationIds: [],
        },
      ],
      citations: [],
    });

    const result = verifyStructuredResponse(response, []);

    expect(result.status).toBe("verified");
    expect(result.issues).toEqual([]);
    expect(result.response).toEqual(response);
  });
});
