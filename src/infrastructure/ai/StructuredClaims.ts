import type {
  LibraryLocatorV1,
  LibrarySearchResultV1,
} from "../library/index/LibraryIndex";

export const STRUCTURED_CLAIMS_SCHEMA_VERSION = 1 as const;
export const STRUCTURED_CLAIMS_VERSION = "structured-claims-v1" as const;

export type StructuredClaimType =
  | "direct_quote"
  | "paraphrase"
  | "inference"
  | "engine"
  | "ai_synthesis"
  | "user_hypothesis"
  | "unsupported";

export type StructuredCitationMetadataV1 = Readonly<{
  citationId?: string;
  work?: string | null;
  edition?: string | null;
  fen?: string;
  move?: string;
}>;

export type StructuredCitationV1 = Readonly<{
  citationId: string;
  importKey: string;
  sourceSha256: string;
  mediaType: string;
  fileName?: string;
  title: string;
  work: string | null;
  edition: string | null;
  locator: LibraryLocatorV1;
  fragment: string;
  fen?: string;
  move?: string;
}>;

export type StructuredClaimV1 = Readonly<{
  id: string;
  text: string;
  type: StructuredClaimType;
  citationIds: readonly string[];
}>;

export type StructuredResponseInputV1 = Readonly<{
  responseId: string;
  answer: string;
  claims: readonly StructuredClaimV1[];
  citations: readonly StructuredCitationV1[];
}>;

export type StructuredResponseV1 = Readonly<
  StructuredResponseInputV1 & {
    schemaVersion: typeof STRUCTURED_CLAIMS_SCHEMA_VERSION;
    responseVersion: typeof STRUCTURED_CLAIMS_VERSION;
  }
>;

export type StructuredClaimsErrorCode =
  | "STRUCTURED_CLAIMS_INVALID_INPUT"
  | "STRUCTURED_CLAIMS_DUPLICATE_ID"
  | "STRUCTURED_CLAIMS_DUPLICATE_REFERENCE"
  | "STRUCTURED_CLAIMS_MISSING_CITATION"
  | "STRUCTURED_CLAIMS_ORPHAN_CITATION";

export class StructuredClaimsError extends Error {
  readonly name = "StructuredClaimsError";

  constructor(
    readonly code: StructuredClaimsErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function fail(code: StructuredClaimsErrorCode, message: string): never {
  throw new StructuredClaimsError(code, message);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(
      "STRUCTURED_CLAIMS_INVALID_INPUT",
      `${field} debe ser un texto no vacio.`,
    );
  }
  return value.trim();
}

function nullableText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  return requiredText(value, field);
}

function isClaimType(value: unknown): value is StructuredClaimType {
  return (
    value === "direct_quote" ||
    value === "paraphrase" ||
    value === "inference" ||
    value === "engine" ||
    value === "ai_synthesis" ||
    value === "user_hypothesis" ||
    value === "unsupported"
  );
}

function normalizeLocator(value: unknown): LibraryLocatorV1 {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    fail(
      "STRUCTURED_CLAIMS_INVALID_INPUT",
      "El localizador de la cita es invalido.",
    );
  }
  const locator: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string" && entry.length > 0) {
      locator[key] = entry;
      continue;
    }
    if (typeof entry === "number" && Number.isFinite(entry)) {
      locator[key] = entry;
      continue;
    }
    fail(
      "STRUCTURED_CLAIMS_INVALID_INPUT",
      `El localizador ${key} de la cita es invalido.`,
    );
  }
  return locator;
}

function normalizeCitation(value: unknown): StructuredCitationV1 {
  if (!isRecord(value)) {
    fail("STRUCTURED_CLAIMS_INVALID_INPUT", "La cita es invalida.");
  }
  const sourceSha256 = requiredText(value.sourceSha256, "sourceSha256");
  if (!/^[\da-f]{64}$/i.test(sourceSha256)) {
    fail(
      "STRUCTURED_CLAIMS_INVALID_INPUT",
      "sourceSha256 no cumple el formato SHA-256.",
    );
  }
  const citation: StructuredCitationV1 = {
    citationId: requiredText(value.citationId, "citationId"),
    importKey: requiredText(value.importKey, "importKey"),
    sourceSha256,
    mediaType: requiredText(value.mediaType, "mediaType"),
    title: requiredText(value.title, "title"),
    work: nullableText(value.work, "work"),
    edition: nullableText(value.edition, "edition"),
    locator: normalizeLocator(value.locator),
    fragment: requiredText(value.fragment, "fragment"),
    ...(value.fileName === undefined
      ? {}
      : { fileName: requiredText(value.fileName, "fileName") }),
    ...(value.fen === undefined ? {} : { fen: requiredText(value.fen, "fen") }),
    ...(value.move === undefined
      ? {}
      : { move: requiredText(value.move, "move") }),
  };
  return citation;
}

function normalizeClaim(value: unknown): StructuredClaimV1 {
  if (!isRecord(value) || !Array.isArray(value.citationIds)) {
    fail("STRUCTURED_CLAIMS_INVALID_INPUT", "El claim es invalido.");
  }
  if (!isClaimType(value.type)) {
    fail(
      "STRUCTURED_CLAIMS_INVALID_INPUT",
      "El tipo de claim no esta soportado.",
    );
  }
  const citationIds = value.citationIds.map((citationId, index) =>
    requiredText(citationId, `citationIds[${index}]`),
  );
  if (new Set(citationIds).size !== citationIds.length) {
    fail(
      "STRUCTURED_CLAIMS_DUPLICATE_REFERENCE",
      "Un claim no puede repetir una cita.",
    );
  }
  return {
    id: requiredText(value.id, "claim.id"),
    text: requiredText(value.text, "claim.text"),
    type: value.type,
    citationIds,
  };
}

function buildStructuredResponse(value: unknown): StructuredResponseV1 {
  if (
    !isRecord(value) ||
    !Array.isArray(value.claims) ||
    !Array.isArray(value.citations)
  ) {
    fail(
      "STRUCTURED_CLAIMS_INVALID_INPUT",
      "La respuesta estructurada es invalida.",
    );
  }

  const claims = value.claims.map(normalizeClaim);
  const claimIds = new Set<string>();
  for (const claim of claims) {
    if (claimIds.has(claim.id)) {
      fail(
        "STRUCTURED_CLAIMS_DUPLICATE_ID",
        `El claim ${claim.id} esta duplicado.`,
      );
    }
    claimIds.add(claim.id);
  }

  const citations = value.citations.map(normalizeCitation);
  const citationsById = new Map<string, StructuredCitationV1>();
  for (const citation of citations) {
    if (citationsById.has(citation.citationId)) {
      fail(
        "STRUCTURED_CLAIMS_DUPLICATE_ID",
        `La cita ${citation.citationId} esta duplicada.`,
      );
    }
    citationsById.set(citation.citationId, citation);
  }

  const referencedCitationIds = new Set<string>();
  for (const claim of claims) {
    for (const citationId of claim.citationIds) {
      if (!citationsById.has(citationId)) {
        fail(
          "STRUCTURED_CLAIMS_MISSING_CITATION",
          `El claim ${claim.id} referencia una cita inexistente.`,
        );
      }
      referencedCitationIds.add(citationId);
    }
  }
  for (const citation of citations) {
    if (!referencedCitationIds.has(citation.citationId)) {
      fail(
        "STRUCTURED_CLAIMS_ORPHAN_CITATION",
        `La cita ${citation.citationId} no esta referenciada por un claim.`,
      );
    }
  }

  return {
    schemaVersion: STRUCTURED_CLAIMS_SCHEMA_VERSION,
    responseVersion: STRUCTURED_CLAIMS_VERSION,
    responseId: requiredText(value.responseId, "responseId"),
    answer: requiredText(value.answer, "answer"),
    claims,
    citations,
  };
}

export function createCitationFromSearchResult(
  result: LibrarySearchResultV1,
  metadata: StructuredCitationMetadataV1 = {},
): StructuredCitationV1 {
  return normalizeCitation({
    citationId:
      metadata.citationId ?? `${result.importKey}:chunk:${result.chunkId}`,
    importKey: result.importKey,
    sourceSha256: result.sourceSha256,
    mediaType: result.mediaType,
    ...(result.fileName === undefined ? {} : { fileName: result.fileName }),
    title: result.title,
    work: metadata.work === undefined ? result.title : metadata.work,
    edition: metadata.edition,
    locator: result.locator,
    fragment: result.text,
    ...(metadata.fen === undefined ? {} : { fen: metadata.fen }),
    ...(metadata.move === undefined ? {} : { move: metadata.move }),
  });
}

export function createStructuredResponse(
  input: StructuredResponseInputV1,
): StructuredResponseV1 {
  return clone(buildStructuredResponse(input));
}

export function parseStructuredResponse(value: unknown): StructuredResponseV1 {
  if (
    !isRecord(value) ||
    value.schemaVersion !== STRUCTURED_CLAIMS_SCHEMA_VERSION ||
    value.responseVersion !== STRUCTURED_CLAIMS_VERSION
  ) {
    fail(
      "STRUCTURED_CLAIMS_INVALID_INPUT",
      "La version de la respuesta estructurada es invalida.",
    );
  }
  return clone(buildStructuredResponse(value));
}

export function assertStructuredResponse(
  value: unknown,
): asserts value is StructuredResponseV1 {
  parseStructuredResponse(value);
}
