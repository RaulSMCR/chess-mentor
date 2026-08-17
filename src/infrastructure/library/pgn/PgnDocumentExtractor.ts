import { createHash } from "node:crypto";

import {
  importPgn,
  inspectPgn,
  MAX_PGN_INPUT_BYTES,
  type PgnAdapterDependencies,
  type PgnWarning,
} from "@/domain/pgn/adapter";
import type { DomainErrorCode, GameDocumentV1 } from "@/domain/game-tree/model";

export { MAX_PGN_INPUT_BYTES } from "@/domain/pgn/adapter";

export const PGN_SCHEMA_VERSION = 1 as const;
export const PGN_EXTRACTOR_VERSION = "pgn-bibliographic-v1" as const;

export type PgnExtractionErrorCode =
  | "PGN_INVALID_INPUT"
  | "PGN_INPUT_TOO_LARGE"
  | "PGN_INVALID_ENCODING"
  | DomainErrorCode;

export class PgnExtractionError extends Error {
  readonly name = "PgnExtractionError";

  constructor(
    readonly code: PgnExtractionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type PgnGameLocatorV1 = Readonly<{
  kind: "pgn-game";
  gameIndex: number;
}>;

export type PgnBibliographicGameV1 = Readonly<{
  citationId: string;
  gameIndex: number;
  locator: PgnGameLocatorV1;
  sourceSha256: string;
  work: string | null;
  edition: string | null;
  fragment: string | null;
  headers: Readonly<Record<string, string>>;
  document: GameDocumentV1;
  warnings: readonly PgnWarning[];
}>;

export type PgnBibliographicDocumentV1 = Readonly<{
  schemaVersion: typeof PGN_SCHEMA_VERSION;
  extractorVersion: typeof PGN_EXTRACTOR_VERSION;
  importKey: string;
  source: Readonly<{
    sha256: string;
    sizeBytes: number;
    mediaType: "application/x-chess-pgn";
    fileName?: string;
  }>;
  derived: Readonly<{
    games: readonly PgnBibliographicGameV1[];
  }>;
}>;

export type PgnExtractionOptions = Readonly<{
  fileName?: string;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isUint8Array(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === "[object Uint8Array]";
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new PgnExtractionError(
      "PGN_INVALID_ENCODING",
      "El PGN no contiene UTF-8 valido.",
      { cause },
    );
  }
}

function throwDomainError(error: {
  code: DomainErrorCode;
  message: string;
}): never {
  throw new PgnExtractionError(error.code, error.message);
}

function headerValue(
  headers: Readonly<Record<string, string>>,
  key: string,
): string | null {
  const value = headers[key];
  if (typeof value !== "string" || value.trim() === "") return null;
  return value;
}

function firstHeader(
  headers: Readonly<Record<string, string>>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = headerValue(headers, key);
    if (value !== null) return value;
  }
  return null;
}

function validateOptions(
  options: PgnExtractionOptions,
  dependencies: PgnAdapterDependencies,
): void {
  if (
    options.fileName !== undefined &&
    (typeof options.fileName !== "string" || options.fileName.length === 0)
  ) {
    throw new PgnExtractionError(
      "PGN_INVALID_INPUT",
      "fileName debe ser una cadena no vacia cuando se proporciona.",
    );
  }
  if (
    typeof dependencies?.idFactory !== "function" ||
    typeof dependencies?.clock !== "function"
  ) {
    throw new PgnExtractionError(
      "PGN_INVALID_INPUT",
      "Las dependencias PGN deben incluir idFactory y clock.",
    );
  }
}

export function extractPgnDocument(
  input: Readonly<Uint8Array>,
  dependencies: PgnAdapterDependencies,
  options: PgnExtractionOptions = {},
): PgnBibliographicDocumentV1 {
  if (!isUint8Array(input)) {
    throw new PgnExtractionError(
      "PGN_INVALID_INPUT",
      "La entrada PGN debe ser Uint8Array.",
    );
  }
  validateOptions(options, dependencies);

  if (input.byteLength > MAX_PGN_INPUT_BYTES) {
    throw new PgnExtractionError(
      "PGN_INPUT_TOO_LARGE",
      `El PGN supera el limite de ${MAX_PGN_INPUT_BYTES} bytes.`,
    );
  }

  const bytes = new Uint8Array(input);
  const sourceSha256 = sha256(bytes);
  const text = decodeUtf8(bytes);
  const inspected = inspectPgn(text);
  if (!inspected.ok) throwDomainError(inspected.error);

  const importKey = `${PGN_EXTRACTOR_VERSION}:${sourceSha256}`;
  const games: PgnBibliographicGameV1[] = [];
  for (const summary of inspected.value) {
    const imported = importPgn(text, dependencies, summary.index);
    if (!imported.ok) throwDomainError(imported.error);

    const document = imported.value.document;
    const headers = clone(document.headers);
    games.push({
      citationId: `${importKey}:citation:${summary.index}`,
      gameIndex: summary.index,
      locator: { kind: "pgn-game", gameIndex: summary.index },
      sourceSha256,
      work: firstHeader(headers, ["Source", "Event"]),
      edition: headerValue(headers, "SourceVersion"),
      fragment: headerValue(headers, "Round"),
      headers,
      document: clone(document),
      warnings: clone(imported.value.warnings),
    });
  }

  const document: PgnBibliographicDocumentV1 = {
    schemaVersion: PGN_SCHEMA_VERSION,
    extractorVersion: PGN_EXTRACTOR_VERSION,
    importKey,
    source: {
      sha256: sourceSha256,
      sizeBytes: bytes.byteLength,
      mediaType: "application/x-chess-pgn",
      ...(options.fileName === undefined ? {} : { fileName: options.fileName }),
    },
    derived: { games },
  };

  return clone(document);
}
