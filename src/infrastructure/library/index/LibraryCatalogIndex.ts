import {
  buildLibraryIndex,
  searchLibraryIndex,
  type LibraryIndexDocumentInput,
  type LibraryIndexV1,
  type LibrarySearchOptions,
  type LibrarySearchResultV1,
} from "./LibraryIndex";
import type {
  LibraryCatalogEntryV1,
  LibraryCatalogRepository,
} from "../catalog/LibraryCatalogRepository";

export const LIBRARY_CATALOG_INDEX_ADAPTER_VERSION =
  "library-catalog-index-v1" as const;

function toIndexDocument(
  entry: LibraryCatalogEntryV1,
): LibraryIndexDocumentInput {
  return {
    importKey: entry.importKey,
    title: entry.title,
    source: entry.source,
    chunks: entry.chunks.map((chunk) => ({
      id: chunk.id,
      ordinal: chunk.ordinal,
      text: chunk.text,
      locator: chunk.locator,
    })),
  };
}

export function buildLibraryIndexFromEntries(
  entries: readonly LibraryCatalogEntryV1[],
): LibraryIndexV1 {
  return buildLibraryIndex(entries.map(toIndexDocument));
}

export async function buildLibraryIndexFromCatalog(
  catalog: LibraryCatalogRepository,
): Promise<LibraryIndexV1> {
  return buildLibraryIndexFromEntries(await catalog.list());
}

export async function searchLibraryCatalog(
  catalog: LibraryCatalogRepository,
  query: string,
  options: LibrarySearchOptions = {},
): Promise<readonly LibrarySearchResultV1[]> {
  const index = await buildLibraryIndexFromCatalog(catalog);
  return searchLibraryIndex(index, query, options);
}
