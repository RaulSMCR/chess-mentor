import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LibraryCatalogError,
  MemoryLibraryCatalogRepository,
  type LibraryCatalogEntryV1,
  type LibraryCatalogRepository,
} from "../catalog/LibraryCatalogRepository";
import {
  buildLibraryIndexFromCatalog,
  buildLibraryIndexFromEntries,
  searchLibraryCatalog,
} from "./LibraryCatalogIndex";

const entries = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/catalog/golden.entries.json"),
    "utf8",
  ),
) as readonly LibraryCatalogEntryV1[];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function countingCatalog(entriesToUse: readonly LibraryCatalogEntryV1[]): {
  catalog: LibraryCatalogRepository;
  calls: number;
} {
  const repository = new MemoryLibraryCatalogRepository(entriesToUse);
  let calls = 0;
  return {
    catalog: {
      list: async () => {
        calls += 1;
        return repository.list();
      },
      get: (importKey) => repository.get(importKey),
      upsert: (entry) => repository.upsert(entry),
    },
    get calls() {
      return calls;
    },
  };
}

describe("LibraryCatalogIndex", () => {
  it("construye el indice desde una lectura del catalogo", async () => {
    const source = countingCatalog([entries[1]!, entries[0]!]);
    const index = await buildLibraryIndexFromCatalog(source.catalog);

    expect(index.documents).toHaveLength(2);
    expect(
      index.documents.reduce(
        (total, document) => total + document.chunks.length,
        0,
      ),
    ).toBe(2);
    expect(index.documents[0]?.chunks[0]?.locator).toEqual(
      entries[0]?.chunks[0]?.locator,
    );
    expect(source.calls).toBe(1);
  });

  it("busca texto del catalogo y conserva hash, titulo y localizador", async () => {
    const source = countingCatalog(entries);
    const results = await searchLibraryCatalog(
      source.catalog,
      "evaluación posicional",
    );

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      importKey: entries[1]?.importKey,
      sourceSha256: entries[1]?.source.sha256,
      title: entries[1]?.title,
      chunkId: entries[1]?.chunks[0]?.id,
      locator: entries[1]?.chunks[0]?.locator,
    });
    expect(results[0]?.matchedTerms).toEqual(["evaluacion", "posicional"]);
    expect(source.calls).toBe(1);
  });

  it("aisla las entradas y conserva la validacion de busqueda", () => {
    const input = clone(entries);
    const index = buildLibraryIndexFromEntries(input);
    const before = JSON.stringify(index);

    (input[0]!.chunks[0] as { text: string }).text = "texto mutado";

    expect(JSON.stringify(index)).toBe(before);
    expect(() => {
      buildLibraryIndexFromEntries(entries);
    }).not.toThrow();
  });

  it("propaga errores del catalogo y errores tipados del indice", async () => {
    const catalogError = new LibraryCatalogError(
      "STORAGE_UNAVAILABLE",
      "fixture offline",
    );
    const failingCatalog: LibraryCatalogRepository = {
      list: async () => {
        throw catalogError;
      },
      get: async () => null,
      upsert: async (entry) => ({ kind: "created", entry }),
    };

    await expect(buildLibraryIndexFromCatalog(failingCatalog)).rejects.toBe(
      catalogError,
    );
    await expect(
      searchLibraryCatalog(new MemoryLibraryCatalogRepository(entries), "!!!"),
    ).rejects.toMatchObject({ code: "LIBRARY_SEARCH_INVALID_QUERY" });
  });
});
