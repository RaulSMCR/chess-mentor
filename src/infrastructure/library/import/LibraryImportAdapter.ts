import type { PgnAdapterDependencies } from "@/domain/pgn/adapter";

import {
  type LibraryCatalogEntryV1,
  type LibraryCatalogRepository,
  type LibraryCatalogUpsertResult,
} from "../catalog/LibraryCatalogRepository";
import {
  extractEpubDocument,
  type EpubDocumentV1,
} from "../epub/EpubDocumentExtractor";
import type { LibraryLocatorV1 } from "../index/LibraryIndex";
import {
  extractMarkdownDocument,
  type MarkdownDocumentV1,
} from "../markdown/MarkdownDocumentExtractor";
import {
  extractPdfTextDocument,
  type PdfTextDocumentV1,
} from "../pdf/PdfTextDocumentExtractor";
import {
  extractPgnDocument,
  type PgnBibliographicDocumentV1,
} from "../pgn/PgnDocumentExtractor";
import {
  extractTxtDocument,
  type TxtDocumentV1,
} from "../txt/TxtDocumentExtractor";

export const LIBRARY_IMPORT_ADAPTER_VERSION = "library-import-v1" as const;

export type LibraryImportFormat = "txt" | "markdown" | "pgn" | "epub" | "pdf";

export type LibrarySourceFile = Readonly<{
  fileName: string;
  bytes: Readonly<Uint8Array>;
}>;

export interface LibrarySourceReader {
  read(sourcePath: string): Promise<LibrarySourceFile>;
}

export type LibraryImportAdapterDependencies = Readonly<{
  sourceReader: LibrarySourceReader;
  catalog: LibraryCatalogRepository;
  pgnDependencies?: PgnAdapterDependencies;
}>;

export type LibraryImportErrorCode =
  | "LIBRARY_INVALID_REQUEST"
  | "LIBRARY_SOURCE_UNAVAILABLE"
  | "LIBRARY_UNSUPPORTED_FORMAT"
  | "LIBRARY_IMPORT_FAILED";

export class LibraryImportError extends Error {
  readonly name = "LibraryImportError";

  constructor(
    readonly code: LibraryImportErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type LibraryImportResultV1 = Readonly<{
  adapterVersion: typeof LIBRARY_IMPORT_ADAPTER_VERSION;
  sourcePath: string;
  format: LibraryImportFormat;
  upsert: LibraryCatalogUpsertResult;
  entry: LibraryCatalogEntryV1;
}>;

type CatalogChunkInput = Readonly<{
  id: string;
  ordinal: number;
  text: string;
  sourceLocator: LibraryLocatorV1;
}>;

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isUint8Array(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === "[object Uint8Array]";
}

function validateDependencies(
  dependencies: LibraryImportAdapterDependencies,
): void {
  if (
    dependencies === null ||
    typeof dependencies !== "object" ||
    typeof dependencies.sourceReader?.read !== "function" ||
    typeof dependencies.catalog?.upsert !== "function"
  ) {
    throw new LibraryImportError(
      "LIBRARY_INVALID_REQUEST",
      "Las dependencias de importacion no cumplen el contrato.",
    );
  }
}

function validateSourcePath(sourcePath: string): void {
  if (typeof sourcePath !== "string" || sourcePath.trim() === "") {
    throw new LibraryImportError(
      "LIBRARY_INVALID_REQUEST",
      "La ruta de origen no puede estar vacia.",
    );
  }
}

function validateSourceFile(value: unknown): LibrarySourceFile {
  if (value === null || typeof value !== "object") {
    throw new Error("El lector no devolvio una fuente.");
  }
  const source = value as Record<string, unknown>;
  if (
    typeof source.fileName !== "string" ||
    source.fileName.trim() === "" ||
    !isUint8Array(source.bytes)
  ) {
    throw new Error("El lector devolvio una fuente invalida.");
  }
  return {
    fileName: source.fileName,
    bytes: new Uint8Array(source.bytes),
  };
}

function detectFormat(fileName: string): LibraryImportFormat {
  const extension = fileName
    .trim()
    .toLowerCase()
    .match(/\.([^.\\/]+)$/)?.[1];
  switch (extension) {
    case "txt":
      return "txt";
    case "md":
    case "markdown":
      return "markdown";
    case "pgn":
      return "pgn";
    case "epub":
      return "epub";
    case "pdf":
      return "pdf";
    default:
      throw new LibraryImportError(
        "LIBRARY_UNSUPPORTED_FORMAT",
        `La extension de ${fileName} no esta soportada.`,
      );
  }
}

function catalogEntry(
  importKey: string,
  extractorVersion: string,
  source: LibraryCatalogEntryV1["source"],
  title: string,
  confidence: LibraryCatalogEntryV1["confidence"],
  reviewStatus: LibraryCatalogEntryV1["reviewStatus"],
  chunks: readonly CatalogChunkInput[],
  reviewReason?: string,
): LibraryCatalogEntryV1 {
  return {
    importKey,
    extractorVersion,
    source,
    title,
    confidence,
    reviewStatus,
    ...(reviewReason === undefined ? {} : { reviewReason }),
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      ordinal: chunk.ordinal,
      text: chunk.text,
      locator: chunk.sourceLocator,
    })),
  };
}

function fromTxt(document: TxtDocumentV1): LibraryCatalogEntryV1 {
  return catalogEntry(
    document.importKey,
    document.extractorVersion,
    document.source,
    document.source.fileName ?? document.importKey,
    "high",
    "not_required",
    document.derived.chunks.map((chunk) => ({
      id: chunk.id,
      ordinal: chunk.ordinal,
      text: chunk.text,
      sourceLocator: chunk.locator,
    })),
  );
}

function fromMarkdown(document: MarkdownDocumentV1): LibraryCatalogEntryV1 {
  return catalogEntry(
    document.importKey,
    document.extractorVersion,
    document.source,
    document.source.fileName ?? document.importKey,
    "high",
    "not_required",
    document.derived.chunks.map((chunk) => ({
      id: chunk.id,
      ordinal: chunk.ordinal,
      text: chunk.text,
      sourceLocator: chunk.sourceLocator,
    })),
  );
}

function fromEpub(document: EpubDocumentV1): LibraryCatalogEntryV1 {
  const chunks = document.derived.chapters.flatMap((chapter) =>
    chapter.chunks.map((chunk) => ({
      id: chunk.id,
      ordinal: 0,
      text: chunk.text,
      sourceLocator: chunk.sourceLocator,
    })),
  );
  return catalogEntry(
    document.importKey,
    document.extractorVersion,
    document.source,
    document.derived.title,
    "high",
    "not_required",
    chunks.map((chunk, ordinal) => ({ ...chunk, ordinal })),
  );
}

function fromPdf(document: PdfTextDocumentV1): LibraryCatalogEntryV1 {
  const chunks = document.derived.pages.flatMap((page) =>
    page.chunks.map((chunk) => ({
      id: chunk.id,
      ordinal: 0,
      text: chunk.text,
      sourceLocator: chunk.sourceLocator,
    })),
  );
  return catalogEntry(
    document.importKey,
    document.extractorVersion,
    document.source,
    document.source.fileName ?? document.importKey,
    "medium",
    "pending",
    chunks.map((chunk, ordinal) => ({ ...chunk, ordinal })),
    "La extraccion textual de PDF requiere revision.",
  );
}

function pgnSummary(
  headers: Readonly<Record<string, string>>,
  gameIndex: number,
): string {
  const values = Object.entries(headers)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}: ${value}`);
  return values.length === 0 ? `Partida ${gameIndex + 1}` : values.join(" | ");
}

function fromPgn(document: PgnBibliographicDocumentV1): LibraryCatalogEntryV1 {
  const chunks = document.derived.games.map((game, ordinal) => ({
    id: game.citationId,
    ordinal,
    text: pgnSummary(game.headers, game.gameIndex),
    sourceLocator: game.locator,
  }));
  return catalogEntry(
    document.importKey,
    document.extractorVersion,
    document.source,
    document.source.fileName ?? document.importKey,
    "high",
    "not_required",
    chunks,
  );
}

function extractEntry(
  format: LibraryImportFormat,
  bytes: Uint8Array,
  fileName: string,
  dependencies: LibraryImportAdapterDependencies,
): LibraryCatalogEntryV1 {
  if (format === "txt") return fromTxt(extractTxtDocument(bytes, { fileName }));
  if (format === "markdown")
    return fromMarkdown(extractMarkdownDocument(bytes, { fileName }));
  if (format === "epub")
    return fromEpub(extractEpubDocument(bytes, { fileName }));
  if (format === "pdf")
    return fromPdf(extractPdfTextDocument(bytes, { fileName }));

  const pgnDependencies = dependencies.pgnDependencies;
  if (
    pgnDependencies === undefined ||
    typeof pgnDependencies.idFactory !== "function" ||
    typeof pgnDependencies.clock !== "function"
  ) {
    throw new LibraryImportError(
      "LIBRARY_INVALID_REQUEST",
      "El formato PGN requiere idFactory y clock.",
    );
  }
  return fromPgn(extractPgnDocument(bytes, pgnDependencies, { fileName }));
}

export async function importLibrarySource(
  sourcePath: string,
  dependencies: LibraryImportAdapterDependencies,
): Promise<LibraryImportResultV1> {
  validateSourcePath(sourcePath);
  validateDependencies(dependencies);

  let source: LibrarySourceFile;
  try {
    source = validateSourceFile(
      await dependencies.sourceReader.read(sourcePath),
    );
  } catch (cause) {
    if (cause instanceof LibraryImportError) throw cause;
    throw new LibraryImportError(
      "LIBRARY_SOURCE_UNAVAILABLE",
      `No se pudo leer ${sourcePath}: ${causeMessage(cause)}`,
      { cause },
    );
  }

  const format = detectFormat(source.fileName);
  let entry: LibraryCatalogEntryV1;
  try {
    entry = extractEntry(
      format,
      new Uint8Array(source.bytes),
      source.fileName,
      dependencies,
    );
  } catch (cause) {
    if (cause instanceof LibraryImportError) throw cause;
    throw new LibraryImportError(
      "LIBRARY_IMPORT_FAILED",
      `No se pudo importar ${source.fileName}: ${causeMessage(cause)}`,
      { cause },
    );
  }

  const upsert = await dependencies.catalog.upsert(entry);
  return {
    adapterVersion: LIBRARY_IMPORT_ADAPTER_VERSION,
    sourcePath,
    format,
    upsert,
    entry: upsert.entry,
  };
}
