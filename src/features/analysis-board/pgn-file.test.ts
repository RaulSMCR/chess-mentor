import { strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { readPgnFile } from "./pgn-file";

describe("readPgnFile", () => {
  it("lee PGN plano", async () => {
    const result = await readPgnFile(
      new File(['[Result "*"]\n\n1. e4 *'], "game.pgn"),
    );
    expect(result).toEqual({
      ok: true,
      text: '[Result "*"]\n\n1. e4 *',
    });
  });

  it("extrae el PGN descargado en ZIP", async () => {
    const text = '[Result "*"]\n\n1. d4 *';
    const archive = zipSync({
      "download/game.pgn": new Uint8Array(strToU8(text)),
    });
    const archiveBlob = new Blob([archive.slice().buffer]);
    expect(Object.keys(unzipSync(archive))).toEqual(["download/game.pgn"]);
    const result = await readPgnFile(new File([archiveBlob], "download.zip"));
    expect(result).toEqual({ ok: true, text });
  });

  it("rechaza ZIP sin PGN", async () => {
    const archive = zipSync({
      "readme.txt": new Uint8Array(strToU8("no")),
    });
    const archiveBlob = new Blob([archive.slice().buffer]);
    const result = await readPgnFile(new File([archiveBlob], "download.zip"));
    expect(result).toMatchObject({ ok: false });
  });
});
