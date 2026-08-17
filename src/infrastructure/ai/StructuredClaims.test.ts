import { describe, expect, it } from "vitest";

import goldenEntries from "../../../fixtures/phase4/catalog/golden.entries.json";

import { buildLibraryIndexFromEntries } from "../library/index/LibraryCatalogIndex";
import {
  searchLibraryIndex,
  type LibrarySearchResultV1,
} from "../library/index/LibraryIndex";
import type { LibraryCatalogEntryV1 } from "../library/catalog/LibraryCatalogRepository";
import {
  assertStructuredResponse,
  createCitationFromSearchResult,
  createStructuredResponse,
  parseStructuredResponse,
  type StructuredClaimType,
  type StructuredResponseInputV1,
} from "./StructuredClaims";

const entries = goldenEntries as unknown as readonly LibraryCatalogEntryV1[];

function fixtureResult(): LibrarySearchResultV1 {
  const index = buildLibraryIndexFromEntries(entries);
  const result = searchLibraryIndex(index, "evaluacion posicional")[0];
  if (result === undefined) throw new Error("fixture result missing");
  return result;
}

function fixtureResponseInput(
  overrides: Partial<StructuredResponseInputV1> = {},
): StructuredResponseInputV1 {
  const citation = createCitationFromSearchResult(fixtureResult(), {
    citationId: "fixture-citation-1",
    work: "Obra de fixture",
    edition: "Edicion de fixture",
    fen: "8/8/8/8/8/8/8/8 w - - 0 1",
    move: "e4",
  });
  return {
    responseId: "fixture-response-1",
    answer: "La respuesta de fixture conserva su respaldo.",
    claims: [
      {
        id: "claim-1",
        text: "El fragmento describe una evaluacion posicional.",
        type: "paraphrase",
        citationIds: [citation.citationId],
      },
    ],
    citations: [citation],
    ...overrides,
  };
}

describe("StructuredClaims", () => {
  it("deriva una cita estable y conserva hash, localizador y metadata opcional", () => {
    const result = fixtureResult();
    const citation = createCitationFromSearchResult(result, {
      citationId: "fixture-citation-1",
      work: "Obra de fixture",
      edition: "Edicion de fixture",
      fen: "8/8/8/8/8/8/8/8 w - - 0 1",
      move: "e4",
    });

    expect(citation).toEqual({
      citationId: "fixture-citation-1",
      importKey: result.importKey,
      sourceSha256: result.sourceSha256,
      mediaType: result.mediaType,
      fileName: result.fileName,
      title: result.title,
      work: "Obra de fixture",
      edition: "Edicion de fixture",
      locator: result.locator,
      fragment: result.text,
      fen: "8/8/8/8/8/8/8/8 w - - 0 1",
      move: "e4",
    });
  });

  it("crea y revalida una respuesta serializable sin mutar la entrada", () => {
    const input = fixtureResponseInput();
    const before = JSON.parse(
      JSON.stringify(input),
    ) as StructuredResponseInputV1;
    const response = createStructuredResponse(input);

    expect(input).toEqual(before);
    expect(response).toMatchObject({
      schemaVersion: 1,
      responseVersion: "structured-claims-v1",
      responseId: "fixture-response-1",
    });
    expect(
      parseStructuredResponse(JSON.parse(JSON.stringify(response))),
    ).toEqual(response);
    expect(() => assertStructuredResponse(response)).not.toThrow();
  });

  it("acepta exactamente los tipos de claim del contrato", () => {
    const types: readonly StructuredClaimType[] = [
      "direct_quote",
      "paraphrase",
      "inference",
      "engine",
      "ai_synthesis",
      "user_hypothesis",
      "unsupported",
    ];
    const citation = fixtureResponseInput().citations[0]!;
    const response = createStructuredResponse({
      responseId: "fixture-response-types",
      answer: "Respuesta de fixture.",
      claims: types.map((type, index) => ({
        id: `claim-${index}`,
        text: `Claim ${type}.`,
        type,
        citationIds: [citation.citationId],
      })),
      citations: [citation],
    });

    expect(response.claims.map((claim) => claim.type)).toEqual(types);
  });

  it("rechaza referencias ausentes, duplicados, citas huerfanas y procedencia invalida", () => {
    const base = fixtureResponseInput();
    const citation = base.citations[0]!;

    expect(() =>
      createStructuredResponse({
        ...base,
        claims: [
          {
            ...base.claims[0]!,
            citationIds: ["missing-citation"],
          },
        ],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "STRUCTURED_CLAIMS_MISSING_CITATION" }),
    );
    expect(() =>
      createStructuredResponse({
        ...base,
        claims: [base.claims[0]!, { ...base.claims[0]!, id: "claim-1" }],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "STRUCTURED_CLAIMS_DUPLICATE_ID" }),
    );
    expect(() =>
      createStructuredResponse({
        ...base,
        claims: [],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "STRUCTURED_CLAIMS_ORPHAN_CITATION" }),
    );
    expect(() =>
      parseStructuredResponse({
        ...createStructuredResponse(base),
        citations: [{ ...citation, sourceSha256: "invalid" }],
      }),
    ).toThrowError(
      expect.objectContaining({ code: "STRUCTURED_CLAIMS_INVALID_INPUT" }),
    );
  });
});
