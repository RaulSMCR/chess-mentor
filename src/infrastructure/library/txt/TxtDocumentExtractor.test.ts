import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractTxtDocument,
  MAX_TXT_INPUT_BYTES,
  TxtExtractionError,
} from "./TxtDocumentExtractor";

const fixtureBytes = readFileSync(
  resolve(process.cwd(), "fixtures/phase4/txt/golden.txt"),
);
const fixtureExpected = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/txt/golden.expected.json"),
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

describe("extractTxtDocument", () => {
  it("extrae la fixture dorada con hashes y localizadores UTF-8", () => {
    const input = new Uint8Array(fixtureBytes);
    const before = new Uint8Array(input);
    const document = extractTxtDocument(input, { fileName: "golden.txt" });

    expect(input).toEqual(before);
    expect(document.schemaVersion).toBe(fixtureExpected.schemaVersion);
    expect(document.source.sha256).toBe(fixtureExpected.sourceSha256);
    expect(document.source.sizeBytes).toBe(fixtureExpected.sizeBytes);
    expect(document.derived.textSha256).toBe(fixtureExpected.textSha256);
    expect(document.source.fileName).toBe("golden.txt");
    expect(document.importKey).toBe(`txt-v1:${fixtureExpected.sourceSha256}`);
    expect(
      document.derived.chunks.map(({ ordinal, locator }) => ({
        ordinal,
        startByte: locator.startByte,
        endByte: locator.endByte,
      })),
    ).toEqual(fixtureExpected.chunks);
    expect(document.derived.chunks.map((chunk) => chunk.text)).toEqual([
      "# Chess Mentor — fixture TXT",
      "Apertura española: 1. e4 e5 2. Nf3 Nc6 3. Bb5 a6.",
      "Línea crítica: ♞f6 responde con desarrollo y presión central.",
    ]);
  });

  it("mantiene la clave de importación aunque cambie el nombre display", () => {
    const first = extractTxtDocument(fixtureBytes, { fileName: "one.txt" });
    const second = extractTxtDocument(fixtureBytes, { fileName: "two.txt" });

    expect(second.importKey).toBe(first.importKey);
    expect(second.source.sha256).toBe(first.source.sha256);
    expect(second.source.fileName).not.toBe(first.source.fileName);
  });

  it("calcula offsets de bytes con Unicode, CRLF y líneas vacías", () => {
    const document = extractTxtDocument(
      new TextEncoder().encode("α\r\n\n♞x\n"),
    );

    expect(document.derived.chunks.map((chunk) => chunk.text)).toEqual([
      "α",
      "♞x",
    ]);
    expect(
      document.derived.chunks.map(({ locator }) => [
        locator.startByte,
        locator.endByte,
      ]),
    ).toEqual([
      [0, 2],
      [5, 9],
    ]);
  });

  it("separa el BOM de la vista pero lo conserva en el hash y tamaño de origen", () => {
    const document = extractTxtDocument(
      new Uint8Array([0xef, 0xbb, 0xbf, 0x61]),
    );

    expect(document.source.sizeBytes).toBe(4);
    expect(document.derived.text).toBe("a");
    expect(document.derived.chunks[0]?.locator).toMatchObject({
      startByte: 0,
      endByte: 1,
    });
    expect(document.source.sha256).not.toBe(document.derived.textSha256);
  });

  it("acepta vacío y el límite exacto, pero rechaza el exceso", () => {
    expect(extractTxtDocument(new Uint8Array()).derived.chunks).toEqual([]);
    expect(
      extractTxtDocument(new Uint8Array(MAX_TXT_INPUT_BYTES)).source.sizeBytes,
    ).toBe(MAX_TXT_INPUT_BYTES);
    expect(() =>
      extractTxtDocument(new Uint8Array(MAX_TXT_INPUT_BYTES + 1)),
    ).toThrowError(expect.objectContaining({ code: "TXT_INPUT_TOO_LARGE" }));
  });

  it("rechaza UTF-8 inválido y opciones de entrada inválidas", () => {
    expect(() => extractTxtDocument(new Uint8Array([0xc3, 0x28]))).toThrowError(
      expect.objectContaining({ code: "TXT_INVALID_ENCODING" }),
    );
    expect(() =>
      extractTxtDocument(fixtureBytes, { fileName: "" }),
    ).toThrowError(TxtExtractionError);
  });
});
