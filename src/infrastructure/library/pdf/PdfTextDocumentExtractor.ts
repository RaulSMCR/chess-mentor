import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

export const PDF_SCHEMA_VERSION = 1 as const;
export const PDF_EXTRACTOR_VERSION = "pdf-text-v1" as const;
export const MAX_PDF_INPUT_BYTES = 64 * 1024 * 1024;

export type PdfTextExtractionErrorCode =
  | "PDF_INVALID_INPUT"
  | "PDF_INPUT_TOO_LARGE"
  | "PDF_INVALID_STRUCTURE"
  | "PDF_UNSUPPORTED_FEATURE"
  | "PDF_INVALID_ENCODING"
  | "PDF_NO_TEXT";

export class PdfTextExtractionError extends Error {
  readonly name = "PdfTextExtractionError";

  constructor(
    readonly code: PdfTextExtractionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type PdfPageLocatorV1 = Readonly<{
  kind: "pdf-page";
  pageIndex: number;
}>;

export type PdfOffsetLocatorV1 = Readonly<{
  kind: "pdf-offset";
  pageIndex: number;
  unit: "utf8-byte";
  startByte: number;
  endByte: number;
}>;

export type PdfTextChunkV1 = Readonly<{
  id: string;
  ordinal: number;
  text: string;
  sourceLocator: PdfOffsetLocatorV1;
}>;

export type PdfTextPageV1 = Readonly<{
  id: string;
  ordinal: number;
  objectNumber: number;
  textSha256: string;
  text: string;
  locator: PdfPageLocatorV1;
  chunks: readonly PdfTextChunkV1[];
}>;

export type PdfTextDocumentV1 = Readonly<{
  schemaVersion: typeof PDF_SCHEMA_VERSION;
  extractorVersion: typeof PDF_EXTRACTOR_VERSION;
  importKey: string;
  source: Readonly<{
    sha256: string;
    sizeBytes: number;
    mediaType: "application/pdf";
    fileName?: string;
  }>;
  derived: Readonly<{
    textSha256: string;
    text: string;
    pages: readonly PdfTextPageV1[];
  }>;
}>;

export type PdfTextExtractionOptions = Readonly<{
  fileName?: string;
}>;

type PdfObject = Readonly<{
  objectNumber: number;
  generation: number;
  dictionary: string;
  stream: Uint8Array | null;
}>;

type PdfReference = Readonly<{
  objectNumber: number;
  generation: number;
}>;

type PdfToken =
  | Readonly<{ kind: "string"; value: string }>
  | Readonly<{ kind: "array"; value: readonly PdfToken[] }>
  | Readonly<{ kind: "word"; value: string }>;

type SourceLine = Readonly<{ line: string; startChar: number }>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isUint8Array(value: unknown): value is Uint8Array {
  return Object.prototype.toString.call(value) === "[object Uint8Array]";
}

function latin1(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

function bytesFromLatin1(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "latin1"));
}

function fail(
  code: PdfTextExtractionErrorCode,
  message: string,
  options?: { cause?: unknown },
): never {
  throw new PdfTextExtractionError(code, message, options);
}

function directReference(dictionary: string, key: string): PdfReference | null {
  const match = new RegExp(`/${key}\\s+(\\d+)\\s+(\\d+)\\s+R`).exec(dictionary);
  return match === null
    ? null
    : { objectNumber: Number(match[1]), generation: Number(match[2]) };
}

function arrayReferences(
  dictionary: string,
  key: string,
): readonly PdfReference[] {
  const match = new RegExp(`/${key}\\s*\\[([\\s\\S]*?)\\]`).exec(dictionary);
  if (match === null) return [];
  const references: PdfReference[] = [];
  for (const reference of match[1].matchAll(/(\d+)\s+(\d+)\s+R/g)) {
    references.push({
      objectNumber: Number(reference[1]),
      generation: Number(reference[2]),
    });
  }
  return references;
}

function hasType(dictionary: string, type: string): boolean {
  return new RegExp(`/Type\\s+/${type}\\b`).test(dictionary);
}

function parseDirectLength(dictionary: string): number | null {
  const match = /\/Length\s+(\d+)\b/.exec(dictionary);
  return match === null ? null : Number(match[1]);
}

function parseObjects(input: Uint8Array): ReadonlyMap<number, PdfObject> {
  const source = latin1(input);
  const objects = new Map<number, PdfObject>();
  const objectPattern = /(\d+)\s+(\d+)\s+obj\b/g;
  let match: RegExpExecArray | null;

  while ((match = objectPattern.exec(source)) !== null) {
    const objectEnd = source.indexOf("endobj", objectPattern.lastIndex);
    if (objectEnd < 0) {
      fail("PDF_INVALID_STRUCTURE", "Un objeto PDF no termina en endobj.");
    }
    const body = source.slice(objectPattern.lastIndex, objectEnd);
    const streamMarker = /stream(?:\r\n|\n|\r)/.exec(body);
    const dictionary = streamMarker ? body.slice(0, streamMarker.index) : body;
    let stream: Uint8Array | null = null;

    if (streamMarker !== null) {
      const streamStart = streamMarker.index + streamMarker[0].length;
      const length = parseDirectLength(dictionary);
      if (length !== null) {
        const streamText = body.slice(streamStart, streamStart + length);
        if (streamText.length !== length) {
          fail(
            "PDF_INVALID_STRUCTURE",
            "La longitud de un stream PDF es invalida.",
          );
        }
        stream = bytesFromLatin1(streamText);
      } else {
        const streamEnd = body.indexOf("endstream", streamStart);
        if (streamEnd < 0) {
          fail(
            "PDF_INVALID_STRUCTURE",
            "Un stream PDF no termina en endstream.",
          );
        }
        stream = bytesFromLatin1(body.slice(streamStart, streamEnd));
      }
    }

    const objectNumber = Number(match[1]);
    if (objects.has(objectNumber)) {
      fail(
        "PDF_INVALID_STRUCTURE",
        `El objeto PDF ${objectNumber} esta duplicado.`,
      );
    }
    objects.set(objectNumber, {
      objectNumber,
      generation: Number(match[2]),
      dictionary,
      stream,
    });
    objectPattern.lastIndex = objectEnd + "endobj".length;
  }

  if (objects.size === 0) {
    fail("PDF_INVALID_STRUCTURE", "El PDF no contiene objetos indirectos.");
  }
  return objects;
}

function objectFor(
  objects: ReadonlyMap<number, PdfObject>,
  reference: PdfReference,
): PdfObject {
  const object = objects.get(reference.objectNumber);
  if (object === undefined || object.generation !== reference.generation) {
    fail(
      "PDF_INVALID_STRUCTURE",
      `Falta el objeto PDF ${reference.objectNumber} ${reference.generation} R.`,
    );
  }
  return object;
}

function pageTree(
  objects: ReadonlyMap<number, PdfObject>,
): readonly PdfObject[] {
  const roots = [...objects.values()].filter(
    (object) =>
      hasType(object.dictionary, "Pages") &&
      !/\/Parent\s+\d+\s+\d+\s+R/.test(object.dictionary),
  );
  if (roots.length !== 1) {
    fail(
      "PDF_INVALID_STRUCTURE",
      "El PDF debe declarar un unico arbol raiz de paginas.",
    );
  }

  const pages: PdfObject[] = [];
  const visited = new Set<number>();
  const visit = (reference: PdfReference): void => {
    if (visited.has(reference.objectNumber)) {
      fail(
        "PDF_INVALID_STRUCTURE",
        "El arbol de paginas PDF contiene un ciclo.",
      );
    }
    visited.add(reference.objectNumber);
    const object = objectFor(objects, reference);
    if (hasType(object.dictionary, "Pages")) {
      const children = arrayReferences(object.dictionary, "Kids");
      if (children.length === 0) {
        fail("PDF_INVALID_STRUCTURE", "Un nodo /Pages no tiene hijos.");
      }
      for (const child of children) visit(child);
      return;
    }
    if (!hasType(object.dictionary, "Page")) {
      fail(
        "PDF_INVALID_STRUCTURE",
        "El arbol de paginas referencia un tipo invalido.",
      );
    }
    pages.push(object);
  };

  visit({
    objectNumber: roots[0].objectNumber,
    generation: roots[0].generation,
  });
  if (pages.length === 0) {
    fail("PDF_INVALID_STRUCTURE", "El PDF no contiene paginas.");
  }
  return pages;
}

function streamFilter(dictionary: string): "flate" | "none" {
  const filter = /\/Filter\s+(?:\[([\s\S]*?)\]|\/(\w+))/.exec(dictionary);
  if (filter === null) return "none";
  const filters = filter[1]
    ? [...filter[1].matchAll(/\/(\w+)/g)].map((match) => match[1])
    : [filter[2]];
  if (filters.length !== 1 || filters[0] !== "FlateDecode") {
    fail(
      "PDF_UNSUPPORTED_FEATURE",
      "El PDF usa un filtro de stream no soportado.",
    );
  }
  return "flate";
}

function contentBytes(object: PdfObject): Uint8Array {
  if (object.stream === null) {
    fail(
      "PDF_INVALID_STRUCTURE",
      "El objeto de contenido PDF no tiene stream.",
    );
  }
  if (streamFilter(object.dictionary) === "none")
    return new Uint8Array(object.stream);
  try {
    return new Uint8Array(inflateSync(object.stream));
  } catch (cause) {
    throw new PdfTextExtractionError(
      "PDF_INVALID_STRUCTURE",
      "No se pudo descomprimir un stream FlateDecode.",
      { cause },
    );
  }
}

function decodePdfString(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    if ((bytes.length - 2) % 2 !== 0) {
      fail("PDF_INVALID_ENCODING", "Una cadena UTF-16BE tiene longitud impar.");
    }
    let value = "";
    for (let index = 2; index < bytes.length; index += 2) {
      value += String.fromCharCode((bytes[index] << 8) | bytes[index + 1]);
    }
    return value;
  }
  try {
    return new TextDecoder("windows-1252", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new PdfTextExtractionError(
      "PDF_INVALID_ENCODING",
      "Una cadena PDF no tiene una codificacion compatible.",
      { cause },
    );
  }
}

function decodeLiteral(bytes: Uint8Array): string {
  const decoded: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte !== 0x5c) {
      decoded.push(byte);
      continue;
    }
    index += 1;
    if (index >= bytes.length) {
      fail("PDF_INVALID_ENCODING", "Una cadena literal PDF termina en escape.");
    }
    const escaped = bytes[index];
    const simple: Readonly<Record<number, number>> = {
      0x6e: 0x0a,
      0x72: 0x0d,
      0x74: 0x09,
      0x62: 0x08,
      0x66: 0x0c,
      0x28: 0x28,
      0x29: 0x29,
      0x5c: 0x5c,
    };
    if (simple[escaped] !== undefined) {
      decoded.push(simple[escaped]);
      continue;
    }
    if (escaped >= 0x30 && escaped <= 0x37) {
      let octal = escaped - 0x30;
      for (let count = 0; count < 2; count += 1) {
        const next = bytes[index + 1];
        if (next < 0x30 || next > 0x37) break;
        index += 1;
        octal = octal * 8 + next - 0x30;
      }
      decoded.push(octal);
      continue;
    }
    if (escaped === 0x0d) {
      if (bytes[index + 1] === 0x0a) index += 1;
      continue;
    }
    if (escaped === 0x0a) continue;
    decoded.push(escaped);
  }
  return decodePdfString(new Uint8Array(decoded));
}

function parseLiteralToken(
  content: Uint8Array,
  start: number,
): Readonly<{ token: PdfToken; next: number }> {
  const bytes: number[] = [];
  let depth = 1;
  let index = start + 1;
  while (index < content.length) {
    const byte = content[index];
    if (byte === 0x5c) {
      bytes.push(byte);
      index += 1;
      if (index >= content.length) break;
      bytes.push(content[index]);
      index += 1;
      continue;
    }
    if (byte === 0x28) depth += 1;
    if (byte === 0x29) {
      depth -= 1;
      if (depth === 0) {
        return {
          token: {
            kind: "string",
            value: decodeLiteral(new Uint8Array(bytes)),
          },
          next: index + 1,
        };
      }
    }
    bytes.push(byte);
    index += 1;
  }
  fail(
    "PDF_INVALID_ENCODING",
    "Una cadena literal PDF no termina en parentesis.",
  );
}

function hexNibble(byte: number): number {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
  fail(
    "PDF_INVALID_ENCODING",
    "Una cadena hexadecimal PDF contiene un digito invalido.",
  );
}

function parseHexToken(
  content: Uint8Array,
  start: number,
): Readonly<{ token: PdfToken; next: number }> {
  const digits: number[] = [];
  let index = start + 1;
  while (index < content.length && content[index] !== 0x3e) {
    if (![0x20, 0x09, 0x0a, 0x0d, 0x0c].includes(content[index])) {
      digits.push(content[index]);
    }
    index += 1;
  }
  if (index >= content.length) {
    fail("PDF_INVALID_ENCODING", "Una cadena hexadecimal PDF no termina en >.");
  }
  const bytes = new Uint8Array(Math.ceil(digits.length / 2));
  for (let offset = 0; offset < digits.length; offset += 2) {
    const high = hexNibble(digits[offset]);
    const low = offset + 1 < digits.length ? hexNibble(digits[offset + 1]) : 0;
    bytes[offset / 2] = (high << 4) | low;
  }
  return {
    token: { kind: "string", value: decodePdfString(bytes) },
    next: index + 1,
  };
}

function isWhitespace(byte: number): boolean {
  return (
    byte === 0 ||
    byte === 0x09 ||
    byte === 0x0a ||
    byte === 0x0c ||
    byte === 0x0d ||
    byte === 0x20
  );
}

function isDelimiter(byte: number): boolean {
  return (
    isWhitespace(byte) ||
    [0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25].includes(byte)
  );
}

function tokenize(
  content: Uint8Array,
  start = 0,
  stopAtArrayEnd = false,
): Readonly<{ tokens: readonly PdfToken[]; next: number }> {
  const tokens: PdfToken[] = [];
  let index = start;
  while (index < content.length) {
    while (index < content.length && isWhitespace(content[index])) index += 1;
    if (index >= content.length) break;
    if (content[index] === 0x5d && stopAtArrayEnd)
      return { tokens, next: index + 1 };
    if (content[index] === 0x25) {
      while (
        index < content.length &&
        content[index] !== 0x0a &&
        content[index] !== 0x0d
      )
        index += 1;
      continue;
    }
    if (content[index] === 0x28) {
      const literal = parseLiteralToken(content, index);
      tokens.push(literal.token);
      index = literal.next;
      continue;
    }
    if (content[index] === 0x3c && content[index + 1] !== 0x3c) {
      const hex = parseHexToken(content, index);
      tokens.push(hex.token);
      index = hex.next;
      continue;
    }
    if (content[index] === 0x5b) {
      const array = tokenize(content, index + 1, true);
      tokens.push({ kind: "array", value: array.tokens });
      index = array.next;
      continue;
    }
    if (content[index] === 0x5d && !stopAtArrayEnd) {
      fail(
        "PDF_INVALID_STRUCTURE",
        "El stream PDF contiene ] fuera de un array.",
      );
    }
    const wordStart = index;
    while (index < content.length && !isDelimiter(content[index])) index += 1;
    if (wordStart === index) {
      index += 1;
      continue;
    }
    tokens.push({
      kind: "word",
      value: Buffer.from(content.slice(wordStart, index)).toString("latin1"),
    });
  }
  if (stopAtArrayEnd) {
    fail("PDF_INVALID_STRUCTURE", "Un array del stream PDF no termina en ].");
  }
  return { tokens, next: index };
}

function textFromTokens(content: Uint8Array): string {
  const tokens = tokenize(content).tokens;
  let inTextObject = false;
  let text = "";
  const appendLineBreak = (): void => {
    if (text.length > 0 && !text.endsWith("\n")) text += "\n";
  };
  const append = (value: string): void => {
    if (value.length > 0) text += value;
  };
  const previous = (index: number): PdfToken | undefined => tokens[index - 1];
  const textValue = (token: PdfToken | undefined): string => {
    if (token?.kind === "string") return token.value;
    if (token?.kind === "array") {
      return token.value
        .filter(
          (item): item is Extract<PdfToken, { kind: "string" }> =>
            item.kind === "string",
        )
        .map((item) => item.value)
        .join("");
    }
    return "";
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind !== "word") continue;
    if (token.value === "BT") {
      inTextObject = true;
      continue;
    }
    if (token.value === "ET") {
      if (inTextObject) appendLineBreak();
      inTextObject = false;
      continue;
    }
    if (!inTextObject) continue;
    if (token.value === "Tj" || token.value === "TJ") {
      append(textValue(previous(index)));
      continue;
    }
    if (token.value === "'" || token.value === '"') {
      appendLineBreak();
      append(textValue(previous(index)));
      continue;
    }
    if (token.value === "T*" || token.value === "Td" || token.value === "TD") {
      appendLineBreak();
    }
  }

  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

function collectLines(text: string): readonly SourceLine[] {
  const lines: SourceLine[] = [];
  let startChar = 0;
  while (startChar <= text.length) {
    let endChar = startChar;
    while (endChar < text.length && text[endChar] !== "\n") endChar += 1;
    lines.push({ line: text.slice(startChar, endChar), startChar });
    if (endChar === text.length) break;
    startChar = endChar + 1;
  }
  return lines;
}

function makeChunks(
  text: string,
  importKey: string,
  pageIndex: number,
): readonly PdfTextChunkV1[] {
  const chunks: PdfTextChunkV1[] = [];
  for (const { line, startChar } of collectLines(text)) {
    if (line.length === 0) continue;
    const ordinal = chunks.length;
    const startByte = Buffer.byteLength(text.slice(0, startChar), "utf8");
    const endByte = startByte + Buffer.byteLength(line, "utf8");
    chunks.push({
      id: `${importKey}:page:${pageIndex}:chunk:${ordinal}`,
      ordinal,
      text: line,
      sourceLocator: {
        kind: "pdf-offset",
        pageIndex,
        unit: "utf8-byte",
        startByte,
        endByte,
      },
    });
  }
  return chunks;
}

function pageText(
  page: PdfObject,
  objects: ReadonlyMap<number, PdfObject>,
): string {
  const contents = directReference(page.dictionary, "Contents");
  const references =
    contents === null
      ? arrayReferences(page.dictionary, "Contents")
      : [contents];
  if (references.length === 0) return "";
  return references
    .map((reference) =>
      textFromTokens(contentBytes(objectFor(objects, reference))),
    )
    .filter((text) => text.length > 0)
    .join("\n")
    .trim();
}

export function extractPdfTextDocument(
  input: Readonly<Uint8Array>,
  options: PdfTextExtractionOptions = {},
): PdfTextDocumentV1 {
  if (!isUint8Array(input)) {
    fail("PDF_INVALID_INPUT", "La entrada PDF debe ser Uint8Array.");
  }
  if (input.byteLength > MAX_PDF_INPUT_BYTES) {
    fail(
      "PDF_INPUT_TOO_LARGE",
      `El PDF supera el limite de ${MAX_PDF_INPUT_BYTES} bytes.`,
    );
  }
  if (
    options.fileName !== undefined &&
    (typeof options.fileName !== "string" || options.fileName.length === 0)
  ) {
    fail(
      "PDF_INVALID_INPUT",
      "fileName debe ser una cadena no vacia cuando se proporciona.",
    );
  }

  const bytes = new Uint8Array(input);
  const source = latin1(bytes);
  if (!source.startsWith("%PDF-")) {
    fail("PDF_INVALID_STRUCTURE", "El archivo no declara una cabecera PDF.");
  }
  if (!/%%EOF\s*$/.test(source)) {
    fail("PDF_INVALID_STRUCTURE", "El PDF no termina en %%EOF.");
  }
  if (
    /\/Encrypt\b/.test(source) ||
    [...source.matchAll(/\/Type\s+\/ObjStm\b/g)].length > 0
  ) {
    fail(
      "PDF_UNSUPPORTED_FEATURE",
      "El PDF cifrado u object stream no esta soportado.",
    );
  }

  const sourceSha256 = sha256(bytes);
  const importKey = `${PDF_EXTRACTOR_VERSION}:${sourceSha256}`;
  const objects = parseObjects(bytes);
  const pages = pageTree(objects);
  const derivedPages: PdfTextPageV1[] = pages.map((page, pageIndex) => {
    const text = pageText(page, objects);
    return {
      id: `${importKey}:page:${pageIndex}`,
      ordinal: pageIndex,
      objectNumber: page.objectNumber,
      textSha256: sha256(new TextEncoder().encode(text)),
      text,
      locator: { kind: "pdf-page", pageIndex },
      chunks: makeChunks(text, importKey, pageIndex),
    };
  });

  if (derivedPages.every((page) => page.text.length === 0)) {
    fail("PDF_NO_TEXT", "El PDF no contiene texto visible en sus paginas.");
  }

  const derivedText = derivedPages.map((page) => page.text).join("\n\n");
  return clone({
    schemaVersion: PDF_SCHEMA_VERSION,
    extractorVersion: PDF_EXTRACTOR_VERSION,
    importKey,
    source: {
      sha256: sourceSha256,
      sizeBytes: bytes.byteLength,
      mediaType: "application/pdf",
      ...(options.fileName === undefined ? {} : { fileName: options.fileName }),
    },
    derived: {
      textSha256: sha256(new TextEncoder().encode(derivedText)),
      text: derivedText,
      pages: derivedPages,
    },
  } satisfies PdfTextDocumentV1);
}
