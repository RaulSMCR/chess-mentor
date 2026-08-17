import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  extractPdfTextDocument,
  MAX_PDF_INPUT_BYTES,
} from "./PdfTextDocumentExtractor";

type FixtureObject = Readonly<{
  number: number;
  generation: number;
  body?: string;
  stream?: string;
  filter?: "FlateDecode" | "LZWDecode" | null;
}>;

const source = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/pdf/golden.source.json"),
    "utf8",
  ),
) as Readonly<{
  header: string;
  objects: readonly FixtureObject[];
  footer: string;
}>;
const expected = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/pdf/golden.expected.json"),
    "utf8",
  ),
) as Readonly<{
  sourceSha256: string;
  sizeBytes: number;
  textSha256: string;
  text: string;
  pages: readonly {
    ordinal: number;
    objectNumber: number;
    text: string;
    chunkTexts: readonly string[];
  }[];
}>;

function pdfBytes(
  overrides: Readonly<Record<number, Partial<FixtureObject>>> = {},
): Uint8Array {
  const pieces: Buffer[] = [Buffer.from(source.header, "latin1")];
  for (const original of source.objects) {
    const object = { ...original, ...overrides[original.number] };
    const body = object.body ?? "";
    if (object.stream === undefined) {
      pieces.push(
        Buffer.from(
          `${object.number} ${object.generation} obj\n${body}\nendobj\n`,
          "latin1",
        ),
      );
      continue;
    }
    const stream = Buffer.from(object.stream, "latin1");
    const encoded =
      object.filter === "FlateDecode" ? deflateSync(stream) : stream;
    const filter = object.filter === null ? "" : ` /Filter /${object.filter}`;
    pieces.push(
      Buffer.from(
        `${object.number} ${object.generation} obj\n<< /Length ${encoded.length}${filter} >>\nstream\n`,
        "latin1",
      ),
      encoded,
      Buffer.from("\nendstream\nendobj\n", "latin1"),
    );
  }
  pieces.push(Buffer.from(source.footer, "latin1"));
  return new Uint8Array(Buffer.concat(pieces));
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

describe("extractPdfTextDocument", () => {
  it("extrae paginas en orden de arbol, texto y localizadores", () => {
    const input = pdfBytes();
    const before = new Uint8Array(input);
    const document = extractPdfTextDocument(input, { fileName: "golden.pdf" });

    expect(input).toEqual(before);
    expect(document.schemaVersion).toBe(1);
    expect(document.extractorVersion).toBe("pdf-text-v1");
    expect(document.source.sha256).toBe(expected.sourceSha256);
    expect(document.source.sizeBytes).toBe(expected.sizeBytes);
    expect(document.source.fileName).toBe("golden.pdf");
    expect(document.importKey).toBe(`pdf-text-v1:${expected.sourceSha256}`);
    expect(document.derived.textSha256).toBe(expected.textSha256);
    expect(document.derived.text).toBe(expected.text);
    expect(
      document.derived.pages.map((page) => ({
        ordinal: page.ordinal,
        objectNumber: page.objectNumber,
        text: page.text,
        chunkTexts: page.chunks.map((chunk) => chunk.text),
      })),
    ).toEqual(expected.pages);
    expect(document.derived.pages[0]?.locator).toEqual({
      kind: "pdf-page",
      pageIndex: 0,
    });
    expect(document.derived.pages[0]?.chunks[1]?.sourceLocator).toMatchObject({
      kind: "pdf-offset",
      pageIndex: 0,
      unit: "utf8-byte",
    });
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });

  it("usa FlateDecode, TJ y UTF-16BE sin depender del orden de objetos", () => {
    const document = extractPdfTextDocument(pdfBytes());

    expect(document.derived.pages.map((page) => page.objectNumber)).toEqual([
      4, 3,
    ]);
    expect(document.derived.pages[0]?.text).toBe("Decision\ny y");
    expect(document.derived.pages[1]?.text).toBe("Material\nestrategia");
  });

  it("conserva una pagina vacia cuando otra pagina tiene texto", () => {
    const document = extractPdfTextDocument(
      pdfBytes({ 6: { stream: "BT ET\n", filter: null } }),
    );

    expect(document.derived.pages).toHaveLength(2);
    expect(document.derived.pages[0]?.text).toBe("");
    expect(document.derived.pages[0]?.chunks).toEqual([]);
    expect(document.derived.pages[1]?.text).toBe("Material\nestrategia");
  });

  it("mantiene identidad por bytes y valida entrada, limite y estructura", () => {
    const first = extractPdfTextDocument(pdfBytes(), { fileName: "one.pdf" });
    const second = extractPdfTextDocument(pdfBytes(), { fileName: "two.pdf" });

    expect(second.importKey).toBe(first.importKey);
    expect(second.source.sha256).toBe(first.source.sha256);
    expect(second.source.fileName).not.toBe(first.source.fileName);
    expectCode(
      () => extractPdfTextDocument(new Uint8Array(MAX_PDF_INPUT_BYTES + 1)),
      "PDF_INPUT_TOO_LARGE",
    );
    expectCode(
      () => extractPdfTextDocument(new TextEncoder().encode("not a PDF")),
      "PDF_INVALID_STRUCTURE",
    );
    expectCode(
      () => extractPdfTextDocument(pdfBytes({ 6: { filter: "LZWDecode" } })),
      "PDF_UNSUPPORTED_FEATURE",
    );
    expectCode(
      () => extractPdfTextDocument(pdfBytes({ 5: { stream: "BT (x Tj" } })),
      "PDF_INVALID_ENCODING",
    );
  });

  it("rechaza PDF sin texto, cifrado y paginas invalidas", () => {
    expectCode(
      () =>
        extractPdfTextDocument(
          pdfBytes({
            5: { stream: "BT ET\n" },
            6: { stream: "BT ET\n" },
          }),
        ),
      "PDF_NO_TEXT",
    );
    expectCode(
      () =>
        extractPdfTextDocument(
          new Uint8Array(
            Buffer.from(
              `${source.header}1 0 obj\n<< /Encrypt 2 0 R >>\nendobj\n${source.footer}`,
              "latin1",
            ),
          ),
        ),
      "PDF_UNSUPPORTED_FEATURE",
    );
    expectCode(
      () =>
        extractPdfTextDocument(
          pdfBytes({ 2: { body: "<< /Type /Pages /Kids [] /Count 0 >>" } }),
        ),
      "PDF_INVALID_STRUCTURE",
    );
  });
});
