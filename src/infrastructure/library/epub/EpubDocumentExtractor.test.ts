import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  extractEpubDocument,
  MAX_EPUB_INPUT_BYTES,
} from "./EpubDocumentExtractor";

const source = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/epub/golden.source.json"),
    "utf8",
  ),
) as { entries: Readonly<Record<string, string>> };
const expected = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/epub/golden.expected.json"),
    "utf8",
  ),
) as {
  sourceSha256: string;
  sizeBytes: number;
  title: string;
  language: string;
  chapters: readonly {
    ordinal: number;
    href: string;
    spineId: string;
    title: string;
    text: string;
    chunkTexts: readonly string[];
  }[];
};

function archiveBytes(
  overrides: Readonly<Record<string, Uint8Array | string>> = {},
): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, value] of Object.entries(source.entries))
    entries[name] =
      typeof value === "string" ? new Uint8Array(strToU8(value)) : value;
  for (const [name, value] of Object.entries(overrides))
    entries[name] =
      typeof value === "string" ? new Uint8Array(strToU8(value)) : value;
  return zipSync(entries, {
    level: 0,
    mtime: new Date("2026-08-17T00:00:00.000Z").getTime(),
  });
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("extractEpubDocument", () => {
  it("extrae el spine con texto saneado y localizadores", () => {
    const input = archiveBytes();
    const before = new Uint8Array(input);
    const document = extractEpubDocument(input, { fileName: "golden.epub" });

    expect(input).toEqual(before);
    expect(document.schemaVersion).toBe(1);
    expect(document.extractorVersion).toBe("epub-v1");
    expect(document.source.sha256).toBe(expected.sourceSha256);
    expect(document.source.sizeBytes).toBe(expected.sizeBytes);
    expect(document.source.fileName).toBe("golden.epub");
    expect(document.importKey).toBe(`epub-v1:${expected.sourceSha256}`);
    expect(document.derived.title).toBe(expected.title);
    expect(document.derived.language).toBe(expected.language);
    expect(
      document.derived.chapters.map((chapter) => ({
        ordinal: chapter.ordinal,
        href: chapter.href,
        spineId: chapter.spineId,
        title: chapter.title,
        text: chapter.text,
        chunkTexts: chapter.chunks.map((chunk) => chunk.text),
      })),
    ).toEqual(expected.chapters);
    expect(document.derived.chapters[0]?.locator).toMatchObject({
      kind: "epub-chapter",
      chapterIndex: 0,
      href: "OEBPS/text/chapter-1.xhtml",
    });
    expect(
      document.derived.chapters[0]?.chunks[0]?.sourceLocator,
    ).toMatchObject({
      kind: "epub-offset",
      unit: "utf8-byte",
      chapterIndex: 0,
      startByte: 0,
    });
    expect(document.derived.chapters[0]?.text).not.toMatch(
      /script|style|alert/i,
    );
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });

  it("mantiene la identidad por bytes y no por nombre", () => {
    const first = extractEpubDocument(archiveBytes(), { fileName: "one.epub" });
    const second = extractEpubDocument(archiveBytes(), {
      fileName: "two.epub",
    });

    expect(second.importKey).toBe(first.importKey);
    expect(second.source.sha256).toBe(first.source.sha256);
    expect(second.source.fileName).not.toBe(first.source.fileName);
  });

  it("rechaza ZIP corrupto, mimetype y estructura invalidos", () => {
    expectCode(
      () => extractEpubDocument(new Uint8Array([1, 2, 3])),
      "EPUB_INVALID_ARCHIVE",
    );
    expectCode(
      () => extractEpubDocument(archiveBytes({ mimetype: "application/zip" })),
      "EPUB_INVALID_STRUCTURE",
    );
    expectCode(
      () =>
        extractEpubDocument(
          archiveBytes({
            "OEBPS/content.opf": "<package><manifest /></package>",
          }),
        ),
      "EPUB_INVALID_STRUCTURE",
    );
    expectCode(
      () => extractEpubDocument(archiveBytes(), { fileName: "" }),
      "EPUB_INVALID_INPUT",
    );
  });

  it("rechaza UTF-8 invalido y el exceso antes de descomprimir", () => {
    expectCode(
      () =>
        extractEpubDocument(
          archiveBytes({
            "OEBPS/text/chapter-1.xhtml": new Uint8Array([0xff]),
          }),
        ),
      "EPUB_INVALID_ENCODING",
    );
    expectCode(
      () => extractEpubDocument(new Uint8Array(MAX_EPUB_INPUT_BYTES + 1)),
      "EPUB_INPUT_TOO_LARGE",
    );
  });
});
