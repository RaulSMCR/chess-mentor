import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractMarkdownDocument,
  MarkdownExtractionError,
  MAX_MARKDOWN_INPUT_BYTES,
} from "./MarkdownDocumentExtractor";

const fixtureBytes = readFileSync(
  resolve(process.cwd(), "fixtures/phase4/markdown/golden.md"),
);
const fixtureExpected = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/markdown/golden.expected.json"),
    "utf8",
  ),
) as {
  schemaVersion: number;
  sourceSha256: string;
  sizeBytes: number;
  textSha256: string;
  chunks: readonly {
    ordinal: number;
    startByte: number;
    endByte: number;
  }[];
};

describe("extractMarkdownDocument", () => {
  it("extrae la fixture dorada como texto plano saneado", () => {
    const input = new Uint8Array(fixtureBytes);
    const before = new Uint8Array(input);
    const document = extractMarkdownDocument(input, {
      fileName: "golden.md",
    });

    expect(input).toEqual(before);
    expect(document.schemaVersion).toBe(fixtureExpected.schemaVersion);
    expect(document.source.sha256).toBe(fixtureExpected.sourceSha256);
    expect(document.source.sizeBytes).toBe(fixtureExpected.sizeBytes);
    expect(document.derived.textSha256).toBe(fixtureExpected.textSha256);
    expect(document.source.fileName).toBe("golden.md");
    expect(document.derived.sanitization).toBe("plain-text-v1");
    expect(document.importKey).toBe(
      `markdown-v1:${fixtureExpected.sourceSha256}`,
    );
    expect(
      document.derived.chunks.map(({ ordinal, sourceLocator }) => ({
        ordinal,
        startByte: sourceLocator.startByte,
        endByte: sourceLocator.endByte,
      })),
    ).toEqual(fixtureExpected.chunks);
    expect(document.derived.text).toBe(
      [
        "Apertura — fixture Markdown",
        "Texto seguro con enlace útil.",
        "diagrama",
        "Texto visible y e4.",
        "Variante: desarrollo",
      ].join("\n"),
    );
    expect(document.derived.text).not.toMatch(/script|style|javascript|</i);
  });

  it("mantiene la identidad por bytes y no por nombre display", () => {
    const first = extractMarkdownDocument(fixtureBytes, {
      fileName: "one.md",
    });
    const second = extractMarkdownDocument(fixtureBytes, {
      fileName: "two.md",
    });

    expect(second.importKey).toBe(first.importKey);
    expect(second.source.sha256).toBe(first.source.sha256);
    expect(second.source.fileName).not.toBe(first.source.fileName);
  });

  it("elimina bloques peligrosos y comentarios aunque ocupen varias líneas", () => {
    const document = extractMarkdownDocument(
      new TextEncoder().encode(
        "antes\n<script>\nalert(1)\n</script>\ndespués\n<!--\nprivado\n-->\nvisible",
      ),
    );

    expect(document.derived.text).toBe("antes\ndespués\nvisible");
  });

  it("preserva offsets de bytes con Unicode y CRLF", () => {
    const document = extractMarkdownDocument(
      new TextEncoder().encode("# α\r\n\r\n**♞** y [x](javascript:bad)\r\n"),
    );

    expect(document.derived.text).toBe("α\n♞ y x");
    expect(
      document.derived.chunks.map(({ sourceLocator }) => [
        sourceLocator.startByte,
        sourceLocator.endByte,
      ]),
    ).toEqual([
      [0, 4],
      [8, 37],
    ]);
  });

  it("separa BOM, acepta vacío y valida límites/encoding", () => {
    const bom = extractMarkdownDocument(
      new Uint8Array([0xef, 0xbb, 0xbf, 0x23, 0x20, 0x61]),
    );
    expect(bom.derived.text).toBe("a");
    expect(bom.source.sizeBytes).toBe(6);
    expect(extractMarkdownDocument(new Uint8Array()).derived.text).toBe("");
    expect(
      extractMarkdownDocument(new Uint8Array(MAX_MARKDOWN_INPUT_BYTES)).source
        .sizeBytes,
    ).toBe(MAX_MARKDOWN_INPUT_BYTES);
    expect(() =>
      extractMarkdownDocument(new Uint8Array(MAX_MARKDOWN_INPUT_BYTES + 1)),
    ).toThrowError(
      expect.objectContaining({ code: "MARKDOWN_INPUT_TOO_LARGE" }),
    );
    expect(() =>
      extractMarkdownDocument(new Uint8Array([0xc3, 0x28])),
    ).toThrowError(
      expect.objectContaining({ code: "MARKDOWN_INVALID_ENCODING" }),
    );
  });

  it("rechaza una opción de nombre vacía", () => {
    expect(() =>
      extractMarkdownDocument(fixtureBytes, { fileName: "" }),
    ).toThrowError(MarkdownExtractionError);
  });
});
