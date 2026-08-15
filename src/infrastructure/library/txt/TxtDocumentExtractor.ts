import { createHash } from "node:crypto";

export const TXT_SCHEMA_VERSION = 1 as const;
export const TXT_EXTRACTOR_VERSION = "txt-v1" as const;
export const MAX_TXT_INPUT_BYTES = 16 * 1024 * 1024;

export type TxtExtractionErrorCode =
  "TXT_INVALID_INPUT" | "TXT_INPUT_TOO_LARGE" | "TXT_INVALID_ENCODING";

export class TxtExtractionError extends Error {
  readonly name = "TxtExtractionError";

  constructor(
    readonly code: TxtExtractionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type TxtOffsetLocator = Readonly<{
  kind: "offset";
  unit: "utf8-byte";
  startByte: number;
  endByte: number;
}>;

export type TxtChunkV1 = Readonly<{
  id: string;
  ordinal: number;
  text: string;
  locator: TxtOffsetLocator;
}>;

export type TxtDocumentV1 = Readonly<{
  schemaVersion: typeof TXT_SCHEMA_VERSION;
  extractorVersion: typeof TXT_EXTRACTOR_VERSION;
  importKey: string;
  source: Readonly<{
    sha256: string;
    sizeBytes: number;
    mediaType: "text/plain";
    fileName?: string;
  }>;
  derived: Readonly<{
    textSha256: string;
    text: string;
    encoding: "utf-8";
    normalization: "none";
    chunks: readonly TxtChunkV1[];
  }>;
}>;

export type TxtExtractionOptions = Readonly<{
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
    throw new TxtExtractionError(
      "TXT_INVALID_ENCODING",
      "El TXT no contiene UTF-8 válido.",
      { cause },
    );
  }
}

function collectLines(text: string): readonly {
  line: string;
  startChar: number;
}[] {
  const lines: { line: string; startChar: number }[] = [];
  let startChar = 0;

  while (startChar <= text.length) {
    let endChar = startChar;
    while (
      endChar < text.length &&
      text[endChar] !== "\r" &&
      text[endChar] !== "\n"
    ) {
      endChar += 1;
    }
    lines.push({ line: text.slice(startChar, endChar), startChar });
    if (endChar === text.length) break;

    if (text[endChar] === "\r" && text[endChar + 1] === "\n") {
      startChar = endChar + 2;
    } else {
      startChar = endChar + 1;
    }
  }

  return lines;
}

function makeChunks(text: string, importKey: string): readonly TxtChunkV1[] {
  const chunks: TxtChunkV1[] = [];
  const lines = collectLines(text);
  for (const { line, startChar } of lines) {
    if (line.length === 0) continue;
    const startByte = Buffer.byteLength(text.slice(0, startChar), "utf8");
    const endByte = startByte + Buffer.byteLength(line, "utf8");
    const ordinal = chunks.length;
    chunks.push({
      id: `${importKey}:chunk:${ordinal}`,
      ordinal,
      text: line,
      locator: { kind: "offset", unit: "utf8-byte", startByte, endByte },
    });
  }
  return chunks;
}

export function extractTxtDocument(
  input: Readonly<Uint8Array>,
  options: TxtExtractionOptions = {},
): TxtDocumentV1 {
  if (!isUint8Array(input)) {
    throw new TxtExtractionError(
      "TXT_INVALID_INPUT",
      "La entrada TXT debe ser Uint8Array.",
    );
  }
  if (input.byteLength > MAX_TXT_INPUT_BYTES) {
    throw new TxtExtractionError(
      "TXT_INPUT_TOO_LARGE",
      `El TXT supera el límite de ${MAX_TXT_INPUT_BYTES} bytes.`,
    );
  }
  if (
    options.fileName !== undefined &&
    (typeof options.fileName !== "string" || options.fileName.length === 0)
  ) {
    throw new TxtExtractionError(
      "TXT_INVALID_INPUT",
      "fileName debe ser una cadena no vacía cuando se proporciona.",
    );
  }

  const bytes = new Uint8Array(input);
  const sourceSha256 = sha256(bytes);
  const text = decodeUtf8(bytes);
  const importKey = `${TXT_EXTRACTOR_VERSION}:${sourceSha256}`;
  const document: TxtDocumentV1 = {
    schemaVersion: TXT_SCHEMA_VERSION,
    extractorVersion: TXT_EXTRACTOR_VERSION,
    importKey,
    source: {
      sha256: sourceSha256,
      sizeBytes: bytes.byteLength,
      mediaType: "text/plain",
      ...(options.fileName === undefined ? {} : { fileName: options.fileName }),
    },
    derived: {
      textSha256: sha256(new TextEncoder().encode(text)),
      text,
      encoding: "utf-8",
      normalization: "none",
      chunks: makeChunks(text, importKey),
    },
  };

  return clone(document);
}
