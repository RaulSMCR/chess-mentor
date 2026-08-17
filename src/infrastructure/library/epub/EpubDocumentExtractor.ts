import { createHash } from "node:crypto";

import { unzipSync } from "fflate";

export const EPUB_SCHEMA_VERSION = 1 as const;
export const EPUB_EXTRACTOR_VERSION = "epub-v1" as const;
export const MAX_EPUB_INPUT_BYTES = 64 * 1024 * 1024;

export type EpubExtractionErrorCode =
  | "EPUB_INVALID_INPUT"
  | "EPUB_INPUT_TOO_LARGE"
  | "EPUB_INVALID_ENCODING"
  | "EPUB_INVALID_ARCHIVE"
  | "EPUB_INVALID_STRUCTURE";

export class EpubExtractionError extends Error {
  readonly name = "EpubExtractionError";

  constructor(
    readonly code: EpubExtractionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type EpubChapterLocatorV1 = Readonly<{
  kind: "epub-chapter";
  chapterIndex: number;
  href: string;
}>;

export type EpubOffsetLocatorV1 = Readonly<{
  kind: "epub-offset";
  chapterIndex: number;
  href: string;
  unit: "utf8-byte";
  startByte: number;
  endByte: number;
}>;

export type EpubChunkV1 = Readonly<{
  id: string;
  ordinal: number;
  text: string;
  sourceLocator: EpubOffsetLocatorV1;
}>;

export type EpubChapterV1 = Readonly<{
  id: string;
  ordinal: number;
  href: string;
  spineId: string;
  title: string;
  locator: EpubChapterLocatorV1;
  textSha256: string;
  text: string;
  chunks: readonly EpubChunkV1[];
}>;

export type EpubDocumentV1 = Readonly<{
  schemaVersion: typeof EPUB_SCHEMA_VERSION;
  extractorVersion: typeof EPUB_EXTRACTOR_VERSION;
  importKey: string;
  source: Readonly<{
    sha256: string;
    sizeBytes: number;
    mediaType: "application/epub+zip";
    fileName?: string;
  }>;
  derived: Readonly<{
    title: string;
    language: string | null;
    chapters: readonly EpubChapterV1[];
  }>;
}>;

export type EpubExtractionOptions = Readonly<{
  fileName?: string;
}>;

type ZipEntryMap = ReadonlyMap<string, Uint8Array>;

type ManifestItem = Readonly<{
  id: string;
  href: string;
  mediaType: string;
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

function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new EpubExtractionError(
      "EPUB_INVALID_ENCODING",
      `${label} no contiene UTF-8 valido.`,
      { cause },
    );
  }
}

function normalizeArchivePath(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value.replaceAll("\\", "/"));
  } catch (cause) {
    throw new EpubExtractionError(
      "EPUB_INVALID_STRUCTURE",
      "La ruta EPUB contiene un escape invalido.",
      { cause },
    );
  }
  if (decoded.startsWith("/") || decoded.includes("\0")) {
    throw new EpubExtractionError(
      "EPUB_INVALID_STRUCTURE",
      "La ruta EPUB no es relativa.",
    );
  }
  const parts: string[] = [];
  for (const part of decoded.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      throw new EpubExtractionError(
        "EPUB_INVALID_STRUCTURE",
        "La ruta EPUB escapa del archivo ZIP.",
      );
    }
    parts.push(part);
  }
  return parts.join("/");
}

function makeEntryMap(entries: Record<string, Uint8Array>): ZipEntryMap {
  const normalized = new Map<string, Uint8Array>();
  for (const [rawName, bytes] of Object.entries(entries)) {
    const name = normalizeArchivePath(rawName);
    if (name === "" || normalized.has(name)) {
      throw new EpubExtractionError(
        "EPUB_INVALID_STRUCTURE",
        "El EPUB contiene una ruta vacia o duplicada.",
      );
    }
    normalized.set(name, bytes);
  }
  return normalized;
}

function requiredEntry(entries: ZipEntryMap, path: string): Uint8Array {
  const bytes = entries.get(path);
  if (bytes === undefined) {
    throw new EpubExtractionError(
      "EPUB_INVALID_STRUCTURE",
      `Falta la entrada EPUB requerida: ${path}.`,
    );
  }
  return bytes;
}

function tagPattern(localName: string): RegExp {
  return new RegExp(`<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b[^>]*>`, "gi");
}

function findTags(xml: string, localName: string): readonly string[] {
  return [...xml.matchAll(tagPattern(localName))].map((match) => match[0]);
}

function attribute(tag: string, name: string): string | null {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  ).exec(tag);
  return match?.[1] ?? match?.[2] ?? null;
}

function elementBody(xml: string, localName: string): string | null {
  const match = new RegExp(
    `<(?:[A-Za-z_][\\w.-]*:)?${localName}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z_][\\w.-]*:)?${localName}\\s*>`,
    "i",
  ).exec(xml);
  return match?.[1] ?? null;
}

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (entity, body: string) => {
      if (body.toLowerCase() === "amp") return "&";
      if (body.toLowerCase() === "lt") return "<";
      if (body.toLowerCase() === "gt") return ">";
      if (body.toLowerCase() === "quot") return '"';
      if (body.toLowerCase() === "apos") return "'";
      const value = body.startsWith("#x")
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isSafeInteger(value) && value >= 0 && value <= 0x10ffff
        ? String.fromCodePoint(value)
        : entity;
    },
  );
}

function plainText(fragment: string): string {
  return decodeEntities(
    fragment
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(
        /<\/(?:p|div|section|article|h[1-6]|li|blockquote|tr|body|html)\s*>/gi,
        "\n",
      )
      .replace(/<[^>]*>/g, "")
      .replace(/[ \t\f\v]+/g, " ")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join("\n"),
  );
}

function resolveArchivePath(basePath: string, href: string): string {
  const withoutFragment = href.split(/[?#]/, 1)[0];
  const baseParts = basePath.split("/");
  baseParts.pop();
  return normalizeArchivePath([...baseParts, withoutFragment].join("/"));
}

function parseContainer(container: string): string {
  const rootfiles = findTags(container, "rootfile");
  const rootfile = rootfiles.find(
    (tag) => attribute(tag, "media-type") === "application/oebps-package+xml",
  );
  const fullPath =
    rootfile === undefined ? null : attribute(rootfile, "full-path");
  if (fullPath === null || fullPath === "") {
    throw new EpubExtractionError(
      "EPUB_INVALID_STRUCTURE",
      "container.xml no declara un rootfile OPF valido.",
    );
  }
  return normalizeArchivePath(fullPath);
}

function parsePackage(
  opf: string,
  opfPath: string,
): Readonly<{
  title: string;
  language: string | null;
  spine: readonly Readonly<{ idref: string; item: ManifestItem }>[];
}> {
  const titleBody = elementBody(opf, "title");
  const title = titleBody === null ? "EPUB sin titulo" : plainText(titleBody);
  if (title === "") {
    throw new EpubExtractionError(
      "EPUB_INVALID_STRUCTURE",
      "El OPF no declara un titulo util.",
    );
  }
  const languageBody = elementBody(opf, "language");
  const language =
    languageBody === null ? null : plainText(languageBody) || null;

  const manifest = new Map<string, ManifestItem>();
  for (const tag of findTags(opf, "item")) {
    const id = attribute(tag, "id");
    const href = attribute(tag, "href");
    const mediaType = attribute(tag, "media-type");
    if (id === null || href === null || mediaType === null) {
      throw new EpubExtractionError(
        "EPUB_INVALID_STRUCTURE",
        "El manifest contiene un item incompleto.",
      );
    }
    if (manifest.has(id)) {
      throw new EpubExtractionError(
        "EPUB_INVALID_STRUCTURE",
        `El manifest repite el id ${id}.`,
      );
    }
    manifest.set(id, {
      id,
      href: resolveArchivePath(opfPath, href),
      mediaType,
    });
  }

  const spine: { idref: string; item: ManifestItem }[] = [];
  for (const tag of findTags(opf, "itemref")) {
    const idref = attribute(tag, "idref");
    const item = idref === null ? undefined : manifest.get(idref);
    if (idref === null || item === undefined) {
      throw new EpubExtractionError(
        "EPUB_INVALID_STRUCTURE",
        "El spine referencia un item inexistente.",
      );
    }
    spine.push({ idref, item });
  }
  if (spine.length === 0) {
    throw new EpubExtractionError(
      "EPUB_INVALID_STRUCTURE",
      "El OPF no declara un spine con capitulos.",
    );
  }
  return { title, language, spine };
}

function chapterTitle(xhtml: string, fallback: string): string {
  for (const heading of ["h1", "h2", "h3", "h4", "h5", "h6", "title"]) {
    const body = elementBody(xhtml, heading);
    if (body !== null) {
      const value = plainText(body);
      if (value !== "") return value;
    }
  }
  return fallback;
}

function makeChunks(
  text: string,
  importKey: string,
  chapterIndex: number,
  href: string,
): readonly EpubChunkV1[] {
  const chunks: EpubChunkV1[] = [];
  let startChar = 0;
  for (const line of text.split("\n")) {
    const startByte = Buffer.byteLength(text.slice(0, startChar), "utf8");
    const endByte = startByte + Buffer.byteLength(line, "utf8");
    if (line !== "") {
      const ordinal = chunks.length;
      chunks.push({
        id: `${importKey}:chapter:${chapterIndex}:chunk:${ordinal}`,
        ordinal,
        text: line,
        sourceLocator: {
          kind: "epub-offset",
          chapterIndex,
          href,
          unit: "utf8-byte",
          startByte,
          endByte,
        },
      });
    }
    startChar += line.length + 1;
  }
  return chunks;
}

function parseArchive(input: Uint8Array): ZipEntryMap {
  try {
    return makeEntryMap(unzipSync(input));
  } catch (cause) {
    if (cause instanceof EpubExtractionError) throw cause;
    throw new EpubExtractionError(
      "EPUB_INVALID_ARCHIVE",
      "El archivo no es un ZIP EPUB valido.",
      { cause },
    );
  }
}

export function extractEpubDocument(
  input: Readonly<Uint8Array>,
  options: EpubExtractionOptions = {},
): EpubDocumentV1 {
  if (!isUint8Array(input)) {
    throw new EpubExtractionError(
      "EPUB_INVALID_INPUT",
      "La entrada EPUB debe ser Uint8Array.",
    );
  }
  if (
    options.fileName !== undefined &&
    (typeof options.fileName !== "string" || options.fileName.length === 0)
  ) {
    throw new EpubExtractionError(
      "EPUB_INVALID_INPUT",
      "fileName debe ser una cadena no vacia cuando se proporciona.",
    );
  }
  if (input.byteLength > MAX_EPUB_INPUT_BYTES) {
    throw new EpubExtractionError(
      "EPUB_INPUT_TOO_LARGE",
      `El EPUB supera el limite de ${MAX_EPUB_INPUT_BYTES} bytes.`,
    );
  }

  const bytes = new Uint8Array(input);
  const sourceSha256 = sha256(bytes);
  const entries = parseArchive(bytes);
  const mimetype = decodeUtf8(requiredEntry(entries, "mimetype"), "mimetype");
  if (mimetype !== "application/epub+zip") {
    throw new EpubExtractionError(
      "EPUB_INVALID_STRUCTURE",
      "La entrada mimetype no es application/epub+zip.",
    );
  }

  const container = decodeUtf8(
    requiredEntry(entries, "META-INF/container.xml"),
    "container.xml",
  );
  const opfPath = parseContainer(container);
  const opf = decodeUtf8(requiredEntry(entries, opfPath), "content.opf");
  const parsed = parsePackage(opf, opfPath);
  const importKey = `${EPUB_EXTRACTOR_VERSION}:${sourceSha256}`;
  const chapters: EpubChapterV1[] = [];

  for (const spineEntry of parsed.spine) {
    if (
      spineEntry.item.mediaType !== "application/xhtml+xml" &&
      spineEntry.item.mediaType !== "text/html"
    ) {
      continue;
    }
    const xhtml = decodeUtf8(
      requiredEntry(entries, spineEntry.item.href),
      spineEntry.item.href,
    );
    const ordinal = chapters.length;
    const text = plainText(xhtml);
    if (text === "") {
      throw new EpubExtractionError(
        "EPUB_INVALID_STRUCTURE",
        `El capitulo ${spineEntry.item.href} no contiene texto visible.`,
      );
    }
    chapters.push({
      id: `${importKey}:chapter:${ordinal}`,
      ordinal,
      href: spineEntry.item.href,
      spineId: spineEntry.idref,
      title: chapterTitle(xhtml, `Capitulo ${ordinal + 1}`),
      locator: {
        kind: "epub-chapter",
        chapterIndex: ordinal,
        href: spineEntry.item.href,
      },
      textSha256: sha256(new TextEncoder().encode(text)),
      text,
      chunks: makeChunks(text, importKey, ordinal, spineEntry.item.href),
    });
  }

  if (chapters.length === 0) {
    throw new EpubExtractionError(
      "EPUB_INVALID_STRUCTURE",
      "El spine no contiene capitulos XHTML o HTML.",
    );
  }

  const document: EpubDocumentV1 = {
    schemaVersion: EPUB_SCHEMA_VERSION,
    extractorVersion: EPUB_EXTRACTOR_VERSION,
    importKey,
    source: {
      sha256: sourceSha256,
      sizeBytes: bytes.byteLength,
      mediaType: "application/epub+zip",
      ...(options.fileName === undefined ? {} : { fileName: options.fileName }),
    },
    derived: {
      title: parsed.title,
      language: parsed.language,
      chapters,
    },
  };

  return clone(document);
}
