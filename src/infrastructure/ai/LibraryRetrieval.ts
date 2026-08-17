import {
  assertEmbeddingProfileCompatible,
  type EmbeddedDocumentV1,
  type EmbeddingProfileV1,
} from "./EmbeddingPipeline";
import type { AIEmbeddingResponse, AIProvider } from "./AIProvider";
import {
  DEFAULT_LIBRARY_SEARCH_LIMIT,
  searchLibraryIndex,
  type LibraryIndexV1,
  type LibraryLocatorV1,
  type LibrarySearchOptions,
  type LibrarySearchResultV1,
} from "../library/index/LibraryIndex";

export const LIBRARY_RETRIEVAL_VERSION = "library-retrieval-v1" as const;

export type LibraryRetrievalMode = "semantic" | "textual_fallback";

export type LibraryRetrievalFallbackReason =
  | "no_provider"
  | "provider_unavailable"
  | "provider_failed"
  | "profile_mismatch"
  | "invalid_embeddings"
  | "no_embeddings"
  | "no_semantic_results";

export type LibraryRetrievalResultV1 = Readonly<
  LibrarySearchResultV1 & {
    mode: LibraryRetrievalMode;
  }
>;

export type LibraryRetrievalResponseV1 = Readonly<{
  version: typeof LIBRARY_RETRIEVAL_VERSION;
  mode: LibraryRetrievalMode;
  reason: LibraryRetrievalFallbackReason | null;
  results: readonly LibraryRetrievalResultV1[];
}>;

export type LibraryRetrievalOptions = LibrarySearchOptions;

export type LibraryRetrievalErrorCode = "LIBRARY_RETRIEVAL_INVALID_INPUT";

export class LibraryRetrievalError extends Error {
  readonly name = "LibraryRetrievalError";

  constructor(
    readonly code: LibraryRetrievalErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type ValidatedProfile = EmbeddingProfileV1;

type QueryEmbeddingResult = Readonly<{
  vector: readonly number[] | null;
  reason: "profile_mismatch" | "provider_failed";
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value)
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function invalid(message: string): never {
  throw new LibraryRetrievalError("LIBRARY_RETRIEVAL_INVALID_INPUT", message);
}

function validateProfile(value: unknown): ValidatedProfile {
  if (!isRecord(value)) invalid("El perfil de embedding es invalido.");
  if (
    !isNonEmptyString(value.embeddingVersion) ||
    !isNonEmptyString(value.model) ||
    !isFiniteInteger(value.dimensions) ||
    value.dimensions < 1 ||
    value.dimensions > 4096
  ) {
    invalid("El perfil de embedding no cumple el contrato.");
  }
  return {
    embeddingVersion: value.embeddingVersion,
    model: value.model,
    dimensions: value.dimensions,
  };
}

function isLocator(value: unknown): value is LibraryLocatorV1 {
  return (
    isRecord(value) &&
    Object.values(value).every(
      (entry) =>
        (typeof entry === "string" && entry.length > 0) ||
        (typeof entry === "number" && Number.isFinite(entry)),
    )
  );
}

function isValidSource(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.sha256 === "string" &&
    /^[\da-f]{64}$/i.test(value.sha256) &&
    isFiniteInteger(value.sizeBytes) &&
    value.sizeBytes >= 0 &&
    isNonEmptyString(value.mediaType) &&
    (value.fileName === undefined || isNonEmptyString(value.fileName))
  );
}

function isValidEmbeddedDocument(
  value: unknown,
  profile: ValidatedProfile,
): value is EmbeddedDocumentV1 {
  if (!isRecord(value) || !Array.isArray(value.chunks)) return false;
  if (
    value.schemaVersion !== 1 ||
    !isNonEmptyString(value.embeddingVersion) ||
    value.embeddingVersion !== profile.embeddingVersion ||
    !isNonEmptyString(value.importKey) ||
    !isNonEmptyString(value.title) ||
    !isValidSource(value.source) ||
    value.model !== profile.model ||
    value.dimensions !== profile.dimensions
  ) {
    return false;
  }

  let previousOrdinal = -1;
  const ids = new Set<string>();
  for (const chunk of value.chunks) {
    if (!isRecord(chunk)) return false;
    if (
      !isNonEmptyString(chunk.id) ||
      ids.has(chunk.id) ||
      !isFiniteInteger(chunk.ordinal) ||
      chunk.ordinal < 0 ||
      chunk.ordinal <= previousOrdinal ||
      !isNonEmptyString(chunk.text) ||
      !isLocator(chunk.locator) ||
      !Array.isArray(chunk.vector) ||
      chunk.vector.length !== profile.dimensions ||
      chunk.vector.some(
        (component) =>
          typeof component !== "number" || !Number.isFinite(component),
      )
    ) {
      return false;
    }
    ids.add(chunk.id);
    previousOrdinal = chunk.ordinal;
  }
  return true;
}

function fallback(
  results: readonly LibrarySearchResultV1[],
  reason: LibraryRetrievalFallbackReason,
): LibraryRetrievalResponseV1 {
  return {
    version: LIBRARY_RETRIEVAL_VERSION,
    mode: "textual_fallback",
    reason,
    results: results.map((result) => ({
      ...result,
      mode: "textual_fallback" as const,
    })),
  };
}

function cosineSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function parseQueryEmbedding(
  value: unknown,
  profile: ValidatedProfile,
): QueryEmbeddingResult {
  if (!isRecord(value)) {
    return { vector: null, reason: "provider_failed" };
  }
  if (
    value.model !== profile.model ||
    value.dimensions !== profile.dimensions
  ) {
    return { vector: null, reason: "profile_mismatch" };
  }
  if (
    typeof value.providerId !== "string" ||
    value.providerId.trim() === "" ||
    !Array.isArray(value.vectors) ||
    value.vectors.length !== 1
  ) {
    return { vector: null, reason: "provider_failed" };
  }
  const vector = value.vectors[0];
  if (
    !Array.isArray(vector) ||
    vector.length !== profile.dimensions ||
    vector.some(
      (component) =>
        typeof component !== "number" || !Number.isFinite(component),
    )
  ) {
    return { vector: null, reason: "provider_failed" };
  }
  return { vector: [...vector], reason: "provider_failed" };
}

async function embedQuery(
  provider: AIProvider,
  query: string,
  profile: ValidatedProfile,
): Promise<QueryEmbeddingResult> {
  let response: AIEmbeddingResponse;
  try {
    response = await provider.embed({
      texts: [query.trim()],
      model: profile.model,
    });
  } catch {
    return { vector: null, reason: "provider_failed" };
  }
  return parseQueryEmbedding(response, profile);
}

function semanticResults(
  documents: readonly EmbeddedDocumentV1[],
  queryVector: readonly number[],
  limit: number,
): readonly LibraryRetrievalResultV1[] {
  const results: LibraryRetrievalResultV1[] = [];
  for (const document of documents) {
    for (const chunk of document.chunks) {
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
        score: cosineSimilarity(queryVector, chunk.vector),
        matchedTerms: [],
        mode: "semantic",
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

export async function retrieveLibrary(
  index: LibraryIndexV1,
  documents: readonly EmbeddedDocumentV1[],
  query: string,
  profile: EmbeddingProfileV1,
  provider?: AIProvider,
  options: LibraryRetrievalOptions = {},
): Promise<LibraryRetrievalResponseV1> {
  const textualResults = searchLibraryIndex(index, query, options);
  if (!Array.isArray(documents))
    invalid("Los documentos de embedding son invalidos.");
  const normalizedProfile = validateProfile(profile);
  const limit = options.limit ?? DEFAULT_LIBRARY_SEARCH_LIMIT;

  if (documents.length === 0) return fallback(textualResults, "no_embeddings");
  if (provider === undefined) return fallback(textualResults, "no_provider");

  for (const document of documents) {
    if (!isValidEmbeddedDocument(document, normalizedProfile)) {
      try {
        assertEmbeddingProfileCompatible(document, normalizedProfile);
      } catch {
        return fallback(textualResults, "profile_mismatch");
      }
      return fallback(textualResults, "invalid_embeddings");
    }
  }

  let availability;
  try {
    availability = await provider.availability();
  } catch {
    return fallback(textualResults, "provider_failed");
  }
  if (
    !isRecord(availability) ||
    typeof availability.available !== "boolean" ||
    (availability.model !== null &&
      availability.model !== undefined &&
      typeof availability.model !== "string")
  ) {
    return fallback(textualResults, "provider_failed");
  }
  if (!availability.available) {
    return fallback(textualResults, "provider_unavailable");
  }
  if (
    availability.model !== null &&
    availability.model !== normalizedProfile.model
  ) {
    return fallback(textualResults, "profile_mismatch");
  }

  const queryEmbedding = await embedQuery(provider, query, normalizedProfile);
  if (queryEmbedding.vector === null) {
    return fallback(textualResults, queryEmbedding.reason);
  }
  const results = semanticResults(documents, queryEmbedding.vector, limit);
  if (results.length === 0) {
    return fallback(textualResults, "no_semantic_results");
  }
  return {
    version: LIBRARY_RETRIEVAL_VERSION,
    mode: "semantic",
    reason: null,
    results,
  };
}
