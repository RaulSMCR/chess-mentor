export const LIBRARY_INDEX_SCHEMA_VERSION = 1 as const;
export const LIBRARY_INDEX_VERSION = "library-index-v1" as const;
export const DEFAULT_LIBRARY_SEARCH_LIMIT = 20;
export const MAX_LIBRARY_SEARCH_LIMIT = 100;

export type LibraryIndexErrorCode =
  | "LIBRARY_INDEX_INVALID_INPUT"
  | "LIBRARY_INDEX_INVALID_DOCUMENT"
  | "LIBRARY_INDEX_CONFLICT"
  | "LIBRARY_SEARCH_INVALID_QUERY"
  | "LIBRARY_SEARCH_INVALID_LIMIT";

export class LibraryIndexError extends Error {
  readonly name = "LibraryIndexError";

  constructor(
    readonly code: LibraryIndexErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type LibraryLocatorV1 = Readonly<Record<string, string | number>>;

export type LibraryIndexChunkInput = Readonly<{
  id: string;
  ordinal: number;
  text: string;
  locator: LibraryLocatorV1;
}>;

export type LibraryIndexDocumentInput = Readonly<{
  importKey: string;
  title?: string;
  source: Readonly<{
    sha256: string;
    sizeBytes: number;
    mediaType: string;
    fileName?: string;
  }>;
  chunks: readonly LibraryIndexChunkInput[];
}>;

export type LibraryIndexedChunkV1 = Readonly<{
  id: string;
  ordinal: number;
  text: string;
  locator: LibraryLocatorV1;
  normalizedTerms: readonly string[];
}>;

export type LibraryIndexedDocumentV1 = Readonly<{
  importKey: string;
  title: string;
  source: Readonly<{
    sha256: string;
    sizeBytes: number;
    mediaType: string;
    fileName?: string;
  }>;
  chunks: readonly LibraryIndexedChunkV1[];
}>;

export type LibraryIndexV1 = Readonly<{
  schemaVersion: typeof LIBRARY_INDEX_SCHEMA_VERSION;
  indexVersion: typeof LIBRARY_INDEX_VERSION;
  documents: readonly LibraryIndexedDocumentV1[];
}>;

export type LibrarySearchOptions = Readonly<{
  limit?: number;
}>;

export type LibrarySearchResultV1 = Readonly<{
  importKey: string;
  sourceSha256: string;
  mediaType: string;
  fileName?: string;
  title: string;
  chunkId: string;
  ordinal: number;
  text: string;
  locator: LibraryLocatorV1;
  score: number;
  matchedTerms: readonly string[];
}>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fail(
  code: LibraryIndexErrorCode,
  message: string,
  options?: { cause?: unknown },
): never {
  throw new LibraryIndexError(code, message, options);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{64}$/i.test(value);
}

function isFiniteInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value)
  );
}

function isLocator(value: unknown): value is LibraryLocatorV1 {
  if (!isPlainRecord(value)) return false;
  return Object.values(value).every(
    (entry) =>
      (typeof entry === "string" && entry.length > 0) ||
      (typeof entry === "number" && Number.isFinite(entry)),
  );
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function tokenize(value: string): readonly string[] {
  return normalizeText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

function uniqueTerms(value: string): readonly string[] {
  return [...new Set(tokenize(value))];
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isPlainRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateSource(
  source: LibraryIndexDocumentInput["source"],
  importKey: string,
): void {
  if (
    !isPlainRecord(source) ||
    !isSha256(source.sha256) ||
    !isFiniteInteger(source.sizeBytes) ||
    source.sizeBytes < 0 ||
    !isNonEmptyString(source.mediaType) ||
    (source.fileName !== undefined && !isNonEmptyString(source.fileName))
  ) {
    fail(
      "LIBRARY_INDEX_INVALID_DOCUMENT",
      `La fuente del documento ${importKey} no cumple el contrato.`,
    );
  }
}

function normalizeDocument(
  input: LibraryIndexDocumentInput,
): LibraryIndexedDocumentV1 {
  if (
    !isPlainRecord(input) ||
    !isNonEmptyString(input.importKey) ||
    !isPlainRecord(input.source) ||
    !Array.isArray(input.chunks)
  ) {
    fail(
      "LIBRARY_INDEX_INVALID_DOCUMENT",
      "El documento de biblioteca es invalido.",
    );
  }
  validateSource(input.source, input.importKey);
  if (input.title !== undefined && !isNonEmptyString(input.title)) {
    fail(
      "LIBRARY_INDEX_INVALID_DOCUMENT",
      "El titulo del documento no es valido.",
    );
  }

  const chunks: LibraryIndexedChunkV1[] = [];
  const chunkIds = new Set<string>();
  let previousOrdinal = -1;
  for (const chunk of input.chunks) {
    if (
      !isPlainRecord(chunk) ||
      !isNonEmptyString(chunk.id) ||
      !isFiniteInteger(chunk.ordinal) ||
      chunk.ordinal < 0 ||
      chunk.ordinal <= previousOrdinal ||
      typeof chunk.text !== "string" ||
      chunk.text.length === 0 ||
      !isLocator(chunk.locator) ||
      chunkIds.has(chunk.id)
    ) {
      fail(
        "LIBRARY_INDEX_INVALID_DOCUMENT",
        `El chunk del documento ${input.importKey} es invalido.`,
      );
    }
    previousOrdinal = chunk.ordinal;
    chunkIds.add(chunk.id);
    chunks.push({
      id: chunk.id,
      ordinal: chunk.ordinal,
      text: chunk.text,
      locator: clone(chunk.locator),
      normalizedTerms: tokenize(chunk.text),
    });
  }

  return {
    importKey: input.importKey,
    title: input.title ?? input.source.fileName ?? input.importKey,
    source: clone(input.source),
    chunks,
  };
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function countOccurrences(
  terms: readonly string[],
  queryTerms: readonly string[],
): Readonly<{ matchedTerms: readonly string[]; occurrenceCount: number }> {
  const counts = new Map<string, number>();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  const matchedTerms = queryTerms.filter((term) => counts.has(term));
  const occurrenceCount = matchedTerms.reduce(
    (total, term) => total + (counts.get(term) ?? 0),
    0,
  );
  return { matchedTerms, occurrenceCount };
}

export function buildLibraryIndex(
  inputs: readonly LibraryIndexDocumentInput[],
): LibraryIndexV1 {
  if (!Array.isArray(inputs)) {
    fail(
      "LIBRARY_INDEX_INVALID_INPUT",
      "La entrada del indice debe ser un array.",
    );
  }

  const documentsByKey = new Map<string, LibraryIndexedDocumentV1>();
  for (const input of inputs) {
    const normalized = normalizeDocument(input);
    const previous = documentsByKey.get(normalized.importKey);
    if (previous !== undefined) {
      if (stableSerialize(previous) !== stableSerialize(normalized)) {
        fail(
          "LIBRARY_INDEX_CONFLICT",
          `El importKey ${normalized.importKey} tiene derivados diferentes.`,
        );
      }
      continue;
    }
    documentsByKey.set(normalized.importKey, normalized);
  }

  const documents = [...documentsByKey.values()].sort((left, right) =>
    compareStrings(left.importKey, right.importKey),
  );
  return clone({
    schemaVersion: LIBRARY_INDEX_SCHEMA_VERSION,
    indexVersion: LIBRARY_INDEX_VERSION,
    documents,
  });
}

function validateLimit(limit: number | undefined): number {
  const value = limit ?? DEFAULT_LIBRARY_SEARCH_LIMIT;
  if (
    !isFiniteInteger(value) ||
    value < 1 ||
    value > MAX_LIBRARY_SEARCH_LIMIT
  ) {
    fail(
      "LIBRARY_SEARCH_INVALID_LIMIT",
      `El limite debe estar entre 1 y ${MAX_LIBRARY_SEARCH_LIMIT}.`,
    );
  }
  return value;
}

export function searchLibraryIndex(
  index: LibraryIndexV1,
  query: string,
  options: LibrarySearchOptions = {},
): readonly LibrarySearchResultV1[] {
  if (
    !isPlainRecord(index) ||
    index.schemaVersion !== LIBRARY_INDEX_SCHEMA_VERSION ||
    index.indexVersion !== LIBRARY_INDEX_VERSION ||
    !Array.isArray(index.documents) ||
    typeof query !== "string"
  ) {
    fail(
      "LIBRARY_INDEX_INVALID_INPUT",
      "El indice o la consulta no cumplen el contrato.",
    );
  }
  const queryTerms = uniqueTerms(query);
  if (queryTerms.length === 0) {
    fail(
      "LIBRARY_SEARCH_INVALID_QUERY",
      "La consulta debe contener al menos un termino.",
    );
  }
  const limit = validateLimit(options.limit);
  const results: LibrarySearchResultV1[] = [];

  for (const document of index.documents) {
    for (const chunk of document.chunks) {
      const match = countOccurrences(chunk.normalizedTerms, queryTerms);
      if (match.matchedTerms.length === 0) continue;
      results.push({
        importKey: document.importKey,
        sourceSha256: document.source.sha256,
        mediaType: document.source.mediaType,
        ...(document.source.fileName === undefined
          ? {}
          : { fileName: document.source.fileName }),
        title: document.title,
        chunkId: chunk.id,
        ordinal: chunk.ordinal,
        text: chunk.text,
        locator: clone(chunk.locator),
        score: match.matchedTerms.length * 1000 + match.occurrenceCount,
        matchedTerms: match.matchedTerms,
      });
    }
  }

  results.sort((left, right) => {
    if (left.score !== right.score) return right.score - left.score;
    const importKeyOrder = compareStrings(left.importKey, right.importKey);
    if (importKeyOrder !== 0) return importKeyOrder;
    if (left.ordinal !== right.ordinal) return left.ordinal - right.ordinal;
    return compareStrings(left.chunkId, right.chunkId);
  });
  return clone(results.slice(0, limit));
}
