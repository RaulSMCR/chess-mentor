import { createHash } from "node:crypto";

export const MARKDOWN_SCHEMA_VERSION = 1 as const;
export const MARKDOWN_EXTRACTOR_VERSION = "markdown-v1" as const;
export const MAX_MARKDOWN_INPUT_BYTES = 16 * 1024 * 1024;

export type MarkdownExtractionErrorCode =
  | "MARKDOWN_INVALID_INPUT"
  | "MARKDOWN_INPUT_TOO_LARGE"
  | "MARKDOWN_INVALID_ENCODING";

export class MarkdownExtractionError extends Error {
  readonly name = "MarkdownExtractionError";

  constructor(
    readonly code: MarkdownExtractionErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export type MarkdownOffsetLocator = Readonly<{
  kind: "offset";
  unit: "utf8-byte";
  startByte: number;
  endByte: number;
}>;

export type MarkdownChunkV1 = Readonly<{
  id: string;
  ordinal: number;
  text: string;
  sourceLocator: MarkdownOffsetLocator;
}>;

export type MarkdownDocumentV1 = Readonly<{
  schemaVersion: typeof MARKDOWN_SCHEMA_VERSION;
  extractorVersion: typeof MARKDOWN_EXTRACTOR_VERSION;
  importKey: string;
  source: Readonly<{
    sha256: string;
    sizeBytes: number;
    mediaType: "text/markdown";
    fileName?: string;
  }>;
  derived: Readonly<{
    textSha256: string;
    text: string;
    sanitization: "plain-text-v1";
    encoding: "utf-8";
    normalization: "none";
    chunks: readonly MarkdownChunkV1[];
  }>;
}>;

export type MarkdownExtractionOptions = Readonly<{
  fileName?: string;
}>;

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

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new MarkdownExtractionError(
      "MARKDOWN_INVALID_ENCODING",
      "El Markdown no contiene UTF-8 válido.",
      { cause },
    );
  }
}

function collectLines(text: string): readonly SourceLine[] {
  const lines: SourceLine[] = [];
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

    startChar =
      text[endChar] === "\r" && text[endChar + 1] === "\n"
        ? endChar + 2
        : endChar + 1;
  }

  return lines;
}

function removeUnsafeBlocks(
  lines: readonly SourceLine[],
): readonly SourceLine[] {
  const safeLines: SourceLine[] = [];
  let hiddenTag: "script" | "style" | null = null;
  let hiddenComment = false;

  for (const sourceLine of lines) {
    let visible = sourceLine.line;
    while (visible.length > 0 || hiddenTag !== null || hiddenComment) {
      if (hiddenTag !== null) {
        const closing = new RegExp(`</${hiddenTag}\\s*>`, "i").exec(visible);
        if (closing === null) {
          visible = "";
          break;
        }
        visible = visible.slice(closing.index + closing[0].length);
        hiddenTag = null;
        continue;
      }

      if (hiddenComment) {
        const closingIndex = visible.indexOf("-->");
        if (closingIndex < 0) {
          visible = "";
          break;
        }
        visible = visible.slice(closingIndex + 3);
        hiddenComment = false;
        continue;
      }

      const tag = /<(script|style)\b[^>]*>/i.exec(visible);
      const commentIndex = visible.indexOf("<!--");
      if (tag === null && commentIndex < 0) break;

      if (tag !== null && (commentIndex < 0 || tag.index < commentIndex)) {
        const prefix = visible.slice(0, tag.index);
        const closing = new RegExp(`</${tag[1]}\\s*>`, "i").exec(
          visible.slice(tag.index + tag[0].length),
        );
        if (closing === null) {
          visible = prefix;
          hiddenTag = tag[1].toLowerCase() as "script" | "style";
          break;
        }
        const afterClosing = tag.index + tag[0].length + closing.index;
        visible = `${prefix}${visible.slice(afterClosing + closing[0].length)}`;
        continue;
      }

      const commentTail = visible.slice(commentIndex + 4);
      const sameLineClosing = commentTail.indexOf("-->");
      if (sameLineClosing >= 0) {
        visible = `${visible.slice(0, commentIndex)}${commentTail.slice(
          sameLineClosing + 3,
        )}`;
        continue;
      }
      visible = visible.slice(0, commentIndex);
      hiddenComment = true;
      break;
    }

    safeLines.push({ ...sourceLine, line: visible });
  }

  return safeLines;
}

function stripMarkdownSyntax(line: string): string {
  return line
    .replace(/!\[([^\]]*)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/\[([^\]]+)\]\((?:[^()]|\([^()]*\))*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/<[^>]*>/g, "")
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s{0,3}(?:[-+*]|\d+\.)\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/^\s*([-*_])(?:\s*\1){2,}\s*$/, "")
    .replace(/\\([\\`*_{}[\]()#+.!>~-])/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMarkdownDocument(
  input: Readonly<Uint8Array>,
  options: MarkdownExtractionOptions = {},
): MarkdownDocumentV1 {
  if (!isUint8Array(input)) {
    throw new MarkdownExtractionError(
      "MARKDOWN_INVALID_INPUT",
      "La entrada Markdown debe ser Uint8Array.",
    );
  }
  if (input.byteLength > MAX_MARKDOWN_INPUT_BYTES) {
    throw new MarkdownExtractionError(
      "MARKDOWN_INPUT_TOO_LARGE",
      `El Markdown supera el límite de ${MAX_MARKDOWN_INPUT_BYTES} bytes.`,
    );
  }
  if (
    options.fileName !== undefined &&
    (typeof options.fileName !== "string" || options.fileName.length === 0)
  ) {
    throw new MarkdownExtractionError(
      "MARKDOWN_INVALID_INPUT",
      "fileName debe ser una cadena no vacía cuando se proporciona.",
    );
  }

  const bytes = new Uint8Array(input);
  const sourceSha256 = sha256(bytes);
  const sourceText = decodeUtf8(bytes);
  const importKey = `${MARKDOWN_EXTRACTOR_VERSION}:${sourceSha256}`;
  const chunks: MarkdownChunkV1[] = [];
  const safeLines = removeUnsafeBlocks(collectLines(sourceText));

  for (const sourceLine of safeLines) {
    const text = stripMarkdownSyntax(sourceLine.line);
    if (text.length === 0) continue;
    const startByte = Buffer.byteLength(
      sourceText.slice(0, sourceLine.startChar),
      "utf8",
    );
    const endByte = startByte + Buffer.byteLength(sourceLine.line, "utf8");
    const ordinal = chunks.length;
    chunks.push({
      id: `${importKey}:chunk:${ordinal}`,
      ordinal,
      text,
      sourceLocator: {
        kind: "offset",
        unit: "utf8-byte",
        startByte,
        endByte,
      },
    });
  }

  const derivedText = chunks.map((chunk) => chunk.text).join("\n");
  const document: MarkdownDocumentV1 = {
    schemaVersion: MARKDOWN_SCHEMA_VERSION,
    extractorVersion: MARKDOWN_EXTRACTOR_VERSION,
    importKey,
    source: {
      sha256: sourceSha256,
      sizeBytes: bytes.byteLength,
      mediaType: "text/markdown",
      ...(options.fileName === undefined ? {} : { fileName: options.fileName }),
    },
    derived: {
      textSha256: sha256(new TextEncoder().encode(derivedText)),
      text: derivedText,
      sanitization: "plain-text-v1",
      encoding: "utf-8",
      normalization: "none",
      chunks,
    },
  };

  return clone(document);
}
