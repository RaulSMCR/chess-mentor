import type { AIEmbeddingResponse, AIProvider } from "./AIProvider";
import type {
  LibraryIndexDocumentInput,
  LibraryLocatorV1,
} from "../library/index/LibraryIndex";

export const EMBEDDING_PIPELINE_SCHEMA_VERSION = 1 as const;
export const EMBEDDING_PIPELINE_VERSION = "embedding-pipeline-v1" as const;

export type EmbeddingPipelineErrorCode =
  | "EMBEDDING_INVALID_INPUT"
  | "EMBEDDING_PROFILE_MISMATCH"
  | "EMBEDDING_PROVIDER_FAILED";

export class EmbeddingPipelineError extends Error {
  readonly name = "EmbeddingPipelineError";

  constructor(
    readonly code: EmbeddingPipelineErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type EmbeddingProfileV1 = Readonly<{
  embeddingVersion: string;
  model: string;
  dimensions: number;
}>;

export type EmbeddingChunkInputV1 = Readonly<{
  id: string;
  ordinal: number;
  text: string;
  locator: LibraryLocatorV1;
}>;

export type EmbeddingDocumentInputV1 = Readonly<{
  importKey: string;
  title: string;
  source: LibraryIndexDocumentInput["source"];
  chunks: readonly EmbeddingChunkInputV1[];
}>;

export type EmbeddedChunkV1 = Readonly<
  EmbeddingChunkInputV1 & {
    vector: readonly number[];
  }
>;

export type EmbeddedDocumentV1 = Readonly<{
  schemaVersion: typeof EMBEDDING_PIPELINE_SCHEMA_VERSION;
  embeddingVersion: string;
  importKey: string;
  title: string;
  source: LibraryIndexDocumentInput["source"];
  model: string;
  dimensions: number;
  chunks: readonly EmbeddedChunkV1[];
}>;

function fail(
  code: EmbeddingPipelineErrorCode,
  message: string,
  options?: { cause?: unknown },
): never {
  throw new EmbeddingPipelineError(code, message, options);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail("EMBEDDING_INVALID_INPUT", `${field} debe ser texto no vacio.`);
  }
  return value.trim();
}

function normalizeProfile(value: unknown): EmbeddingProfileV1 {
  if (!isRecord(value))
    fail("EMBEDDING_INVALID_INPUT", "El perfil de embedding es invalido.");
  const embeddingVersion = nonEmptyText(
    value.embeddingVersion,
    "embeddingVersion",
  );
  const model = nonEmptyText(value.model, "model");
  if (
    typeof value.dimensions !== "number" ||
    !Number.isInteger(value.dimensions) ||
    value.dimensions < 1 ||
    value.dimensions > 4096
  ) {
    fail(
      "EMBEDDING_INVALID_INPUT",
      "dimensions debe ser un entero entre 1 y 4096.",
    );
  }
  return { embeddingVersion, model, dimensions: value.dimensions };
}

function normalizeLocator(value: unknown, field: string): LibraryLocatorV1 {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    fail("EMBEDDING_INVALID_INPUT", `${field} es invalido.`);
  }
  const normalized: Record<string, string | number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.length > 0) {
      normalized[key] = item;
      continue;
    }
    if (typeof item === "number" && Number.isFinite(item)) {
      normalized[key] = item;
      continue;
    }
    fail("EMBEDDING_INVALID_INPUT", `${field}.${key} es invalido.`);
  }
  return normalized;
}

function normalizeSource(value: unknown): LibraryIndexDocumentInput["source"] {
  if (!isRecord(value)) fail("EMBEDDING_INVALID_INPUT", "source es invalido.");
  if (
    typeof value.sha256 !== "string" ||
    !/^[\da-f]{64}$/i.test(value.sha256) ||
    typeof value.sizeBytes !== "number" ||
    !Number.isInteger(value.sizeBytes) ||
    value.sizeBytes < 0 ||
    typeof value.mediaType !== "string" ||
    value.mediaType.trim() === "" ||
    (value.fileName !== undefined &&
      (typeof value.fileName !== "string" || value.fileName.trim() === ""))
  ) {
    fail("EMBEDDING_INVALID_INPUT", "source no cumple el contrato.");
  }
  return {
    sha256: value.sha256,
    sizeBytes: value.sizeBytes,
    mediaType: value.mediaType,
    ...(value.fileName === undefined ? {} : { fileName: value.fileName }),
  };
}

function normalizeDocument(value: unknown): EmbeddingDocumentInputV1 {
  if (!isRecord(value) || !Array.isArray(value.chunks)) {
    fail("EMBEDDING_INVALID_INPUT", "El documento de embedding es invalido.");
  }
  const importKey = nonEmptyText(value.importKey, "importKey");
  const title = nonEmptyText(value.title, "title");
  const source = normalizeSource(value.source);
  const ids = new Set<string>();
  let previousOrdinal = -1;
  const chunks: EmbeddingChunkInputV1[] = [];
  for (const [index, valueChunk] of value.chunks.entries()) {
    if (!isRecord(valueChunk)) {
      fail("EMBEDDING_INVALID_INPUT", `chunks[${index}] es invalido.`);
    }
    const id = nonEmptyText(valueChunk.id, `chunks[${index}].id`);
    if (ids.has(id)) {
      fail("EMBEDDING_INVALID_INPUT", `chunks[${index}] repite id.`);
    }
    if (
      typeof valueChunk.ordinal !== "number" ||
      !Number.isInteger(valueChunk.ordinal) ||
      valueChunk.ordinal < 0 ||
      valueChunk.ordinal <= previousOrdinal
    ) {
      fail("EMBEDDING_INVALID_INPUT", `chunks[${index}].ordinal es invalido.`);
    }
    const text = nonEmptyText(valueChunk.text, `chunks[${index}].text`);
    ids.add(id);
    previousOrdinal = valueChunk.ordinal;
    chunks.push({
      id,
      ordinal: valueChunk.ordinal,
      text,
      locator: normalizeLocator(valueChunk.locator, `chunks[${index}].locator`),
    });
  }
  return { importKey, title, source, chunks };
}

function validateProvider(value: unknown): AIProvider {
  if (
    value === null ||
    typeof value !== "object" ||
    typeof (value as { embed?: unknown }).embed !== "function"
  ) {
    fail("EMBEDDING_INVALID_INPUT", "El proveedor de embeddings es invalido.");
  }
  return value as AIProvider;
}

function validateResponse(
  value: AIEmbeddingResponse,
  profile: EmbeddingProfileV1,
  chunkCount: number,
): readonly (readonly number[])[] {
  if (!isRecord(value)) {
    fail(
      "EMBEDDING_PROVIDER_FAILED",
      "La respuesta de embeddings no es un objeto.",
    );
  }
  if (
    typeof value.providerId !== "string" ||
    value.providerId.trim() === "" ||
    typeof value.model !== "string" ||
    typeof value.dimensions !== "number" ||
    !Number.isInteger(value.dimensions) ||
    !Array.isArray(value.vectors)
  ) {
    fail(
      "EMBEDDING_PROVIDER_FAILED",
      "La respuesta de embeddings es invalida.",
    );
  }
  if (
    value.model !== profile.model ||
    value.dimensions !== profile.dimensions
  ) {
    fail(
      "EMBEDDING_PROFILE_MISMATCH",
      "La respuesta no coincide con el perfil de embedding.",
    );
  }
  if (value.vectors.length !== chunkCount) {
    fail(
      "EMBEDDING_PROVIDER_FAILED",
      "La cantidad de vectores no coincide con los chunks.",
    );
  }
  return value.vectors.map((vector, index) => {
    if (
      !Array.isArray(vector) ||
      vector.length !== profile.dimensions ||
      vector.some(
        (component) =>
          typeof component !== "number" || !Number.isFinite(component),
      )
    ) {
      fail(
        "EMBEDDING_PROVIDER_FAILED",
        `El vector ${index} no cumple la dimension declarada.`,
      );
    }
    return [...vector];
  });
}

export async function embedLibraryDocument(
  input: EmbeddingDocumentInputV1,
  profile: EmbeddingProfileV1,
  provider: AIProvider,
): Promise<EmbeddedDocumentV1> {
  const normalizedProfile = normalizeProfile(profile);
  const normalizedDocument = normalizeDocument(input);
  const aiProvider = validateProvider(provider);
  let vectors: readonly (readonly number[])[] = [];
  if (normalizedDocument.chunks.length > 0) {
    let response: AIEmbeddingResponse;
    try {
      response = await aiProvider.embed({
        texts: normalizedDocument.chunks.map((chunk) => chunk.text),
        model: normalizedProfile.model,
      });
    } catch (cause) {
      if (cause instanceof EmbeddingPipelineError) throw cause;
      throw new EmbeddingPipelineError(
        "EMBEDDING_PROVIDER_FAILED",
        "El proveedor no pudo generar embeddings.",
        { cause },
      );
    }
    vectors = validateResponse(
      response,
      normalizedProfile,
      normalizedDocument.chunks.length,
    );
  }
  return {
    schemaVersion: EMBEDDING_PIPELINE_SCHEMA_VERSION,
    embeddingVersion: normalizedProfile.embeddingVersion,
    importKey: normalizedDocument.importKey,
    title: normalizedDocument.title,
    source: normalizedDocument.source,
    model: normalizedProfile.model,
    dimensions: normalizedProfile.dimensions,
    chunks: normalizedDocument.chunks.map((chunk, index) => ({
      ...chunk,
      vector: [...vectors[index]!],
    })),
  };
}

export function assertEmbeddingProfileCompatible(
  document: EmbeddedDocumentV1,
  profile: EmbeddingProfileV1,
): void {
  const normalizedProfile = normalizeProfile(profile);
  if (
    document.embeddingVersion !== normalizedProfile.embeddingVersion ||
    document.model !== normalizedProfile.model ||
    document.dimensions !== normalizedProfile.dimensions
  ) {
    fail(
      "EMBEDDING_PROFILE_MISMATCH",
      "El documento y el perfil de embedding no son compatibles.",
    );
  }
}
