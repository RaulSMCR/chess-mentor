import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildLibraryIndex,
  searchLibraryIndex,
  type LibraryIndexDocumentInput,
} from "./LibraryIndex";

const documents = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/index/golden.documents.json"),
    "utf8",
  ),
) as readonly LibraryIndexDocumentInput[];
const expected = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/index/golden.expected.json"),
    "utf8",
  ),
) as Readonly<{
  schemaVersion: number;
  indexVersion: string;
  documentCount: number;
  chunkCount: number;
  accentQuery: string;
  accentResults: readonly {
    importKey: string;
    chunkId: string;
    score: number;
    matchedTerms: readonly string[];
  }[];
  tieQuery: string;
  tieResults: readonly string[];
}>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("LibraryIndex", () => {
  it("construye un indice serializable y busca con plegado de acentos", () => {
    const index = buildLibraryIndex(documents);
    const accentResults = searchLibraryIndex(index, expected.accentQuery).map(
      ({ importKey, chunkId, score, matchedTerms }) => ({
        importKey,
        chunkId,
        score,
        matchedTerms,
      }),
    );

    expect(index.schemaVersion).toBe(expected.schemaVersion);
    expect(index.indexVersion).toBe(expected.indexVersion);
    expect(index.documents).toHaveLength(expected.documentCount);
    expect(
      index.documents.reduce(
        (total, document) => total + document.chunks.length,
        0,
      ),
    ).toBe(expected.chunkCount);
    expect(accentResults).toEqual(expected.accentResults);
    expect(accentResults[0]).toBeDefined();
    expect(searchLibraryIndex(index, expected.accentQuery)[0]?.locator).toEqual(
      documents[0]?.chunks[1]?.locator,
    );
    expect(JSON.parse(JSON.stringify(index))).toEqual(index);
  });

  it("deduplica reimportaciones, ordena empates y conserva el texto original", () => {
    const input = clone(documents);
    const index = buildLibraryIndex([input[1]!, input[0]!, input[0]!]);
    const beforeMutation = JSON.stringify(index);
    const tieResults = searchLibraryIndex(index, expected.tieQuery).map(
      (result) => result.chunkId,
    );

    expect(index.documents.map((document) => document.importKey)).toEqual([
      documents[0]?.importKey,
      documents[1]?.importKey,
    ]);
    expect(tieResults).toEqual(expected.tieResults);
    (input[0]!.chunks[0] as { text: string }).text = "texto mutado";
    expect(JSON.stringify(index)).toBe(beforeMutation);
  });

  it("devuelve resultados limitados y copias aisladas", () => {
    const index = buildLibraryIndex(documents);
    const results = searchLibraryIndex(index, "la", { limit: 1 });
    const originalLocator = clone(results[0]!.locator);

    expect(results).toHaveLength(1);
    if (results[0] !== undefined) {
      (results[0].locator as { kind: string }).kind = "mutated";
    }
    expect(searchLibraryIndex(index, "la", { limit: 1 })[0]?.locator).toEqual(
      originalLocator,
    );
  });

  it("rechaza conflictos, entradas invalidas, consultas vacias y limites", () => {
    const conflict = clone(documents);
    (conflict[0]!.chunks[0] as { text: string }).text = "otro texto";
    expectCode(
      () => buildLibraryIndex([documents[0]!, conflict[0]!]),
      "LIBRARY_INDEX_CONFLICT",
    );

    const invalidLocator = clone(documents);
    (
      invalidLocator[0]!.chunks[0]!.locator as unknown as { valid: boolean }
    ).valid = true;
    expectCode(
      () => buildLibraryIndex(invalidLocator),
      "LIBRARY_INDEX_INVALID_DOCUMENT",
    );
    expectCode(
      () => searchLibraryIndex(buildLibraryIndex(documents), "!!!"),
      "LIBRARY_SEARCH_INVALID_QUERY",
    );
    expectCode(
      () =>
        searchLibraryIndex(buildLibraryIndex(documents), "la", { limit: 0 }),
      "LIBRARY_SEARCH_INVALID_LIMIT",
    );
    expectCode(
      () =>
        searchLibraryIndex(buildLibraryIndex(documents), "la", { limit: 101 }),
      "LIBRARY_SEARCH_INVALID_LIMIT",
    );
  });
});
