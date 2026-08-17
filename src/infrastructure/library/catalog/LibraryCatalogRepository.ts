import { z } from "zod";

import type { LibraryLocatorV1 } from "../index/LibraryIndex";

export const LIBRARY_CATALOG_SCHEMA_VERSION = 1 as const;
export const LIBRARY_CATALOG_STORAGE_KEY = "chess-mentor.library.catalog.v1";

export type LibraryCatalogConfidence = "high" | "medium" | "low";
export type LibraryCatalogReviewStatus =
  "not_required" | "pending" | "approved" | "rejected";

export type LibraryCatalogErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_CORRUPT"
  | "STORAGE_QUOTA"
  | "INVALID_ENTRY"
  | "LIBRARY_IMPORT_CONFLICT";

export class LibraryCatalogError extends Error {
  readonly name = "LibraryCatalogError";

  constructor(
    readonly code: LibraryCatalogErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type LibraryCatalogChunkV1 = Readonly<{
  id: string;
  ordinal: number;
  text: string;
  locator: LibraryLocatorV1;
}>;

export type LibraryCatalogEntryV1 = Readonly<{
  importKey: string;
  extractorVersion: string;
  source: Readonly<{
    sha256: string;
    sizeBytes: number;
    mediaType: string;
    fileName?: string;
  }>;
  title: string;
  confidence: LibraryCatalogConfidence;
  reviewStatus: LibraryCatalogReviewStatus;
  reviewReason?: string;
  chunks: readonly LibraryCatalogChunkV1[];
}>;

export type StoredLibraryCatalogV1 = Readonly<{
  schemaVersion: typeof LIBRARY_CATALOG_SCHEMA_VERSION;
  entries: Readonly<Record<string, LibraryCatalogEntryV1>>;
}>;

export type LibraryKeyValueStorage = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}>;

export type LibraryStorageProvider = () => LibraryKeyValueStorage;

export type LibraryCatalogUpsertResult = Readonly<{
  kind: "created" | "unchanged";
  entry: LibraryCatalogEntryV1;
}>;

export interface LibraryCatalogRepository {
  list(): Promise<readonly LibraryCatalogEntryV1[]>;
  get(importKey: string): Promise<LibraryCatalogEntryV1 | null>;
  upsert(entry: LibraryCatalogEntryV1): Promise<LibraryCatalogUpsertResult>;
}

const LocatorSchema = z.record(
  z.string(),
  z.union([z.string().min(1), z.number().finite()]),
);

const ChunkSchema = z
  .object({
    id: z.string().min(1),
    ordinal: z.number().int().nonnegative(),
    text: z.string().min(1),
    locator: LocatorSchema,
  })
  .strict();

const EntrySchema = z
  .object({
    importKey: z.string().min(1),
    extractorVersion: z.string().min(1),
    source: z
      .object({
        sha256: z.string().regex(/^[\da-f]{64}$/i),
        sizeBytes: z.number().int().nonnegative(),
        mediaType: z.string().min(1),
        fileName: z.string().min(1).optional(),
      })
      .strict(),
    title: z.string().min(1),
    confidence: z.enum(["high", "medium", "low"]),
    reviewStatus: z.enum(["not_required", "pending", "approved", "rejected"]),
    reviewReason: z.string().min(1).optional(),
    chunks: z.array(ChunkSchema),
  })
  .strict();

const StoredCatalogSchema = z
  .object({
    schemaVersion: z.literal(LIBRARY_CATALOG_SCHEMA_VERSION),
    entries: z.record(z.string().min(1), EntrySchema),
  })
  .strict();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function crossValidateEntry(entry: LibraryCatalogEntryV1): void {
  if (
    (entry.reviewStatus === "pending" || entry.reviewStatus === "rejected") &&
    (entry.reviewReason === undefined || entry.reviewReason.trim().length === 0)
  ) {
    throw new Error("pending/rejected requiere reviewReason.");
  }

  const ids = new Set<string>();
  let previousOrdinal = -1;
  for (const chunk of entry.chunks) {
    if (ids.has(chunk.id) || chunk.ordinal <= previousOrdinal) {
      throw new Error(
        "Los chunks deben tener ids unicos y ordinal ascendente.",
      );
    }
    ids.add(chunk.id);
    previousOrdinal = chunk.ordinal;
  }
}

function parseEntry(value: unknown): LibraryCatalogEntryV1 {
  const parsed = EntrySchema.safeParse(value);
  if (!parsed.success) throw new Error(parsed.error.message);
  const entry = parsed.data as unknown as LibraryCatalogEntryV1;
  crossValidateEntry(entry);
  return clone(entry);
}

function validateEntry(value: unknown): LibraryCatalogEntryV1 {
  try {
    return parseEntry(value);
  } catch (cause) {
    throw new LibraryCatalogError(
      "INVALID_ENTRY",
      `La entrada de biblioteca es invalida: ${causeMessage(cause)}`,
      { cause },
    );
  }
}

function parseStoredEnvelope(value: unknown): StoredLibraryCatalogV1 {
  const parsed = StoredCatalogSchema.safeParse(value);
  if (!parsed.success) {
    throw new LibraryCatalogError(
      "STORAGE_CORRUPT",
      `El catalogo de biblioteca es invalido: ${parsed.error.message}`,
      { cause: parsed.error },
    );
  }

  try {
    const entries: Record<string, LibraryCatalogEntryV1> = {};
    for (const [key, value] of Object.entries(parsed.data.entries)) {
      const entry = parseEntry(value);
      if (key !== entry.importKey) {
        throw new Error(
          `La clave ${key} no coincide con importKey ${entry.importKey}.`,
        );
      }
      entries[key] = entry;
    }
    return { schemaVersion: LIBRARY_CATALOG_SCHEMA_VERSION, entries };
  } catch (cause) {
    if (cause instanceof LibraryCatalogError) throw cause;
    throw new LibraryCatalogError(
      "STORAGE_CORRUPT",
      `El catalogo de biblioteca esta corrupto: ${causeMessage(cause)}`,
      { cause },
    );
  }
}

function invalidProvider(): LibraryCatalogError {
  return new LibraryCatalogError(
    "STORAGE_UNAVAILABLE",
    "El proveedor no expone una interfaz de storage valida.",
  );
}

function readProvider(
  provider: LibraryStorageProvider,
): LibraryKeyValueStorage {
  try {
    const storage = provider();
    if (
      storage === null ||
      typeof storage !== "object" ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function"
    ) {
      throw invalidProvider();
    }
    return storage;
  } catch (cause) {
    if (cause instanceof LibraryCatalogError) throw cause;
    throw new LibraryCatalogError(
      "STORAGE_UNAVAILABLE",
      `Storage no disponible: ${causeMessage(cause)}`,
      { cause },
    );
  }
}

function readEnvelope(provider: LibraryStorageProvider): {
  storage: LibraryKeyValueStorage;
  envelope: StoredLibraryCatalogV1;
} {
  const storage = readProvider(provider);
  let raw: string | null;
  try {
    raw = storage.getItem(LIBRARY_CATALOG_STORAGE_KEY);
  } catch (cause) {
    throw new LibraryCatalogError(
      "STORAGE_UNAVAILABLE",
      `No se pudo leer el catalogo: ${causeMessage(cause)}`,
      { cause },
    );
  }
  if (raw === null) {
    return {
      storage,
      envelope: { schemaVersion: LIBRARY_CATALOG_SCHEMA_VERSION, entries: {} },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw new LibraryCatalogError(
      "STORAGE_CORRUPT",
      "El catalogo de biblioteca no contiene JSON valido.",
      { cause },
    );
  }
  return { storage, envelope: parseStoredEnvelope(parsed) };
}

function isQuotaError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const candidate = cause as Error & { code?: string | number };
  return (
    candidate.name === "QuotaExceededError" ||
    candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    candidate.code === 22 ||
    candidate.code === 1014
  );
}

function writeEnvelope(
  storage: LibraryKeyValueStorage,
  envelope: StoredLibraryCatalogV1,
): void {
  try {
    storage.setItem(LIBRARY_CATALOG_STORAGE_KEY, JSON.stringify(envelope));
  } catch (cause) {
    throw new LibraryCatalogError(
      isQuotaError(cause) ? "STORAGE_QUOTA" : "STORAGE_UNAVAILABLE",
      isQuotaError(cause)
        ? "Se supero la cuota del catalogo de biblioteca."
        : `No se pudo escribir el catalogo: ${causeMessage(cause)}`,
      { cause },
    );
  }
}

function sortedEntries(
  entries: Readonly<Record<string, LibraryCatalogEntryV1>>,
): readonly LibraryCatalogEntryV1[] {
  return Object.values(entries)
    .sort((left, right) => left.importKey.localeCompare(right.importKey))
    .map((entry) => clone(entry));
}

function upsertEntry(
  entries: Readonly<Record<string, LibraryCatalogEntryV1>>,
  entry: LibraryCatalogEntryV1,
): LibraryCatalogUpsertResult & {
  nextEntries: Readonly<Record<string, LibraryCatalogEntryV1>>;
} {
  const previous = entries[entry.importKey];
  if (previous !== undefined) {
    if (stableSerialize(previous) !== stableSerialize(entry)) {
      throw new LibraryCatalogError(
        "LIBRARY_IMPORT_CONFLICT",
        `La importacion ${entry.importKey} ya existe con otro derivado.`,
      );
    }
    return { kind: "unchanged", entry: clone(previous), nextEntries: entries };
  }
  const nextEntries = { ...entries, [entry.importKey]: clone(entry) };
  return { kind: "created", entry: clone(entry), nextEntries };
}

export class MemoryLibraryCatalogRepository implements LibraryCatalogRepository {
  private readonly entries = new Map<string, LibraryCatalogEntryV1>();

  constructor(initialEntries: readonly LibraryCatalogEntryV1[] = []) {
    for (const entry of initialEntries) {
      const validated = validateEntry(entry);
      const previous = this.entries.get(validated.importKey);
      if (
        previous !== undefined &&
        stableSerialize(previous) !== stableSerialize(validated)
      ) {
        throw new LibraryCatalogError(
          "LIBRARY_IMPORT_CONFLICT",
          `La importacion ${validated.importKey} esta duplicada.`,
        );
      }
      this.entries.set(validated.importKey, validated);
    }
  }

  async list(): Promise<readonly LibraryCatalogEntryV1[]> {
    return [...this.entries.values()]
      .sort((left, right) => left.importKey.localeCompare(right.importKey))
      .map((entry) => clone(entry));
  }

  async get(importKey: string): Promise<LibraryCatalogEntryV1 | null> {
    const entry = this.entries.get(importKey);
    return entry === undefined ? null : clone(entry);
  }

  async upsert(
    entry: LibraryCatalogEntryV1,
  ): Promise<LibraryCatalogUpsertResult> {
    const validated = validateEntry(entry);
    const existing = Object.fromEntries(this.entries.entries());
    const result = upsertEntry(existing, validated);
    if (result.kind === "created")
      this.entries.set(validated.importKey, clone(validated));
    return { kind: result.kind, entry: clone(result.entry) };
  }
}

export class LocalStorageLibraryCatalogRepository implements LibraryCatalogRepository {
  constructor(private readonly storageProvider: LibraryStorageProvider) {}

  async list(): Promise<readonly LibraryCatalogEntryV1[]> {
    const { envelope } = readEnvelope(this.storageProvider);
    return sortedEntries(envelope.entries);
  }

  async get(importKey: string): Promise<LibraryCatalogEntryV1 | null> {
    const { envelope } = readEnvelope(this.storageProvider);
    const entry = envelope.entries[importKey];
    return entry === undefined ? null : clone(entry);
  }

  async upsert(
    entry: LibraryCatalogEntryV1,
  ): Promise<LibraryCatalogUpsertResult> {
    const validated = validateEntry(entry);
    const { storage, envelope } = readEnvelope(this.storageProvider);
    const result = upsertEntry(envelope.entries, validated);
    if (result.kind === "unchanged")
      return { kind: result.kind, entry: clone(result.entry) };
    writeEnvelope(storage, {
      schemaVersion: LIBRARY_CATALOG_SCHEMA_VERSION,
      entries: result.nextEntries,
    });
    return { kind: result.kind, entry: clone(result.entry) };
  }
}

export { parseStoredEnvelope, readEnvelope, writeEnvelope };
