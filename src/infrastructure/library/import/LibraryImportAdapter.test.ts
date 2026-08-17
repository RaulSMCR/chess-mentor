import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import {
  LibraryImportError,
  type LibraryImportAdapterDependencies,
  type LibraryImportFormat,
  type LibrarySourceFile,
  importLibrarySource,
} from "./LibraryImportAdapter";
import {
  LibraryCatalogError,
  MemoryLibraryCatalogRepository,
  type LibraryCatalogRepository,
} from "../catalog/LibraryCatalogRepository";

type GoldenSource = Readonly<{
  path: string;
  fileName: string;
  format: LibraryImportFormat;
  text?: string;
}>;

type GoldenExpected = Readonly<{
  formats: readonly LibraryImportFormat[];
  confidenceByFormat: Readonly<Record<LibraryImportFormat, string>>;
  reviewStatusByFormat: Readonly<Record<LibraryImportFormat, string>>;
  readerCalls: number;
  catalogEntryCount: number;
}>;

const sources = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/import/golden.sources.json"),
    "utf8",
  ),
) as readonly GoldenSource[];
const expected = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/import/golden.expected.json"),
    "utf8",
  ),
) as GoldenExpected;

function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function epubBytes(): Uint8Array {
  const entries: Record<string, Uint8Array> = {
    mimetype: new Uint8Array(strToU8("application/epub+zip")),
    "META-INF/container.xml": new Uint8Array(
      strToU8(
        '<?xml version="1.0"?><container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
      ),
    ),
    "OEBPS/content.opf": new Uint8Array(
      strToU8(
        '<package><metadata><dc:title>Fixture Book</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="text/chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>',
      ),
    ),
    "OEBPS/text/chapter.xhtml": new Uint8Array(
      strToU8(
        "<html><head><title>Fixture chapter</title></head><body><h1>Decision</h1><p>Texto EPUB de prueba.</p></body></html>",
      ),
    ),
  };
  return zipSync(entries, {
    level: 0,
    mtime: new Date("2026-08-17T00:00:00.000Z").getTime(),
  });
}

function pdfBytes(): Uint8Array {
  const stream = "BT\n(Decision PDF) Tj\nET\n";
  const pieces = [
    "%PDF-1.7\n",
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n",
    `4 0 obj\n<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream\nendobj\n`,
    "%%EOF\n",
  ];
  return new Uint8Array(Buffer.from(pieces.join(""), "latin1"));
}

function bytesFor(source: GoldenSource): Uint8Array {
  if (source.format === "epub") return epubBytes();
  if (source.format === "pdf") return pdfBytes();
  return textBytes(source.text ?? "");
}

function pgnDependencies(): NonNullable<
  LibraryImportAdapterDependencies["pgnDependencies"]
> {
  let id = 0;
  return {
    idFactory: () => `fixture-game-${id++}`,
    clock: () => "2026-08-17T00:00:00.000Z",
  };
}

function makeHarness(): {
  dependencies: LibraryImportAdapterDependencies;
  files: Map<string, LibrarySourceFile>;
  calls: string[];
} {
  const files = new Map<string, LibrarySourceFile>();
  for (const source of sources) {
    const bytes = bytesFor(source);
    files.set(source.path, { fileName: source.fileName, bytes });
  }
  const calls: string[] = [];
  const sourceReader = {
    async read(sourcePath: string): Promise<LibrarySourceFile> {
      calls.push(sourcePath);
      const source = files.get(sourcePath);
      if (source === undefined) throw new Error("fixture source missing");
      return { fileName: source.fileName, bytes: new Uint8Array(source.bytes) };
    },
  };
  const catalog = new MemoryLibraryCatalogRepository();
  return {
    dependencies: { sourceReader, catalog, pgnDependencies: pgnDependencies() },
    files,
    calls,
  };
}

describe("importLibrarySource", () => {
  it("importa los cinco formatos con catalogo, procedencia y revision", async () => {
    const harness = makeHarness();
    const results = [];
    for (const source of sources)
      results.push(
        await importLibrarySource(source.path, harness.dependencies),
      );

    expect(results.map((result) => result.format)).toEqual(expected.formats);
    expect(results.map((result) => result.entry.confidence)).toEqual(
      expected.formats.map((format) => expected.confidenceByFormat[format]),
    );
    expect(results.map((result) => result.entry.reviewStatus)).toEqual(
      expected.formats.map((format) => expected.reviewStatusByFormat[format]),
    );
    expect(results.map((result) => result.upsert.kind)).toEqual(
      expected.formats.map(() => "created"),
    );
    expect(harness.calls).toHaveLength(expected.readerCalls);
    expect(await harness.dependencies.catalog.list()).toHaveLength(
      expected.catalogEntryCount,
    );
    expect(
      results.find((result) => result.format === "pdf")?.entry,
    ).toMatchObject({
      reviewReason: "La extraccion textual de PDF requiere revision.",
    });
    expect(
      results.find((result) => result.format === "pgn")?.entry.chunks[0],
    ).toMatchObject({ locator: { kind: "pgn-game", gameIndex: 0 } });
    expect(
      results.find((result) => result.format === "epub")?.entry.chunks[0],
    ).toMatchObject({ locator: { kind: "epub-offset", chapterIndex: 0 } });
    expect(
      results.find((result) => result.format === "pdf")?.entry.chunks[0],
    ).toMatchObject({ locator: { kind: "pdf-offset", pageIndex: 0 } });
  });

  it("reimporta por hash sin mutar bytes ni guardar originales", async () => {
    const harness = makeHarness();
    const txt = sources.find((source) => source.format === "txt");
    if (txt === undefined) throw new Error("txt fixture missing");
    const before = new Uint8Array(harness.files.get(txt.path)?.bytes ?? []);

    const first = await importLibrarySource(txt.path, harness.dependencies);
    const second = await importLibrarySource(txt.path, harness.dependencies);
    const serialized = JSON.stringify(
      await harness.dependencies.catalog.list(),
    );

    expect(first.entry.importKey).toBe(second.entry.importKey);
    expect(second.upsert.kind).toBe("unchanged");
    expect(Array.from(harness.files.get(txt.path)?.bytes ?? [])).toEqual(
      Array.from(before),
    );
    expect(serialized).not.toContain("%PDF-");
    expect(serialized).not.toContain("PK");
    expect(await harness.dependencies.catalog.list()).toHaveLength(1);
  });

  it("tipa ruta, lector, formato, PGN ausente y conflicto del catalogo", async () => {
    const harness = makeHarness();
    const txt = sources.find((source) => source.format === "txt");
    if (txt === undefined) throw new Error("txt fixture missing");
    harness.files.set("notes.bin", {
      fileName: "notes.bin",
      bytes: textBytes("unsupported"),
    });
    harness.files.set("broken.pdf", {
      fileName: "broken.PDF",
      bytes: textBytes("not a pdf"),
    });

    await expect(
      importLibrarySource("", harness.dependencies),
    ).rejects.toMatchObject({ code: "LIBRARY_INVALID_REQUEST" });
    await expect(
      importLibrarySource("missing.txt", harness.dependencies),
    ).rejects.toMatchObject({ code: "LIBRARY_SOURCE_UNAVAILABLE" });
    await expect(
      importLibrarySource("notes.bin", harness.dependencies),
    ).rejects.toMatchObject({ code: "LIBRARY_UNSUPPORTED_FORMAT" });
    await expect(
      importLibrarySource("broken.pdf", harness.dependencies),
    ).rejects.toMatchObject({
      code: "LIBRARY_IMPORT_FAILED",
      cause: expect.objectContaining({ code: "PDF_INVALID_STRUCTURE" }),
    });

    const { pgnDependencies: ignored, ...withoutPgn } = harness.dependencies;
    void ignored;
    const pgn = sources.find((source) => source.format === "pgn");
    if (pgn === undefined) throw new Error("pgn fixture missing");
    await expect(
      importLibrarySource(pgn.path, withoutPgn),
    ).rejects.toMatchObject({ code: "LIBRARY_INVALID_REQUEST" });

    const conflictCatalog: LibraryCatalogRepository = {
      list: async () => [],
      get: async () => null,
      upsert: async () => {
        throw new LibraryCatalogError(
          "LIBRARY_IMPORT_CONFLICT",
          "fixture conflict",
        );
      },
    };
    await expect(
      importLibrarySource(txt.path, {
        ...harness.dependencies,
        catalog: conflictCatalog,
      }),
    ).rejects.toBeInstanceOf(LibraryCatalogError);
    expect(harness.calls).toHaveLength(5);
    expect(
      new LibraryImportError("LIBRARY_INVALID_REQUEST", "x"),
    ).toBeInstanceOf(Error);
  });
});
