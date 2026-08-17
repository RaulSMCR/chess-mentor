import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  extractPgnDocument,
  MAX_PGN_INPUT_BYTES,
} from "./PgnDocumentExtractor";

const fixtureBytes = readFileSync(
  resolve(process.cwd(), "fixtures/phase4/pgn/golden.pgn"),
);
const fixtureExpected = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/phase4/pgn/golden.expected.json"),
    "utf8",
  ),
) as {
  gameCount: number;
  sourceSha256: string;
  sizeBytes: number;
  games: readonly {
    gameIndex: number;
    work: string | null;
    edition: string | null;
    fragment: string | null;
    warningCount: number;
    result: string;
    moveCount: number;
  }[];
};

function dependencies() {
  let id = 0;
  return {
    idFactory: () => `library-game-${id++}`,
    clock: () => "2026-08-17T12:00:00.000Z",
  };
}

function expectCode(action: () => unknown, code: string): void {
  expect(action).toThrowError(expect.objectContaining({ code }));
}

function moveCount(document: {
  nodesById: Readonly<Record<string, { kind: string }>>;
}): number {
  return Object.values(document.nodesById).filter(
    (node) => node.kind === "move",
  ).length;
}

describe("extractPgnDocument", () => {
  it("extrae una coleccion con procedencia y documentos validados", () => {
    const input = new Uint8Array(fixtureBytes);
    const before = new Uint8Array(input);
    const document = extractPgnDocument(input, dependencies(), {
      fileName: "golden.pgn",
    });

    expect(input).toEqual(before);
    expect(document.schemaVersion).toBe(1);
    expect(document.extractorVersion).toBe("pgn-bibliographic-v1");
    expect(document.source.sha256).toBe(fixtureExpected.sourceSha256);
    expect(document.source.sizeBytes).toBe(fixtureExpected.sizeBytes);
    expect(document.source.fileName).toBe("golden.pgn");
    expect(document.importKey).toBe(
      `pgn-bibliographic-v1:${fixtureExpected.sourceSha256}`,
    );
    expect(document.derived.games).toHaveLength(fixtureExpected.gameCount);

    expect(
      document.derived.games.map((game) => ({
        gameIndex: game.gameIndex,
        work: game.work,
        edition: game.edition,
        fragment: game.fragment,
        warningCount: game.warnings.length,
        result: game.document.result,
        moveCount: moveCount(game.document),
      })),
    ).toEqual(fixtureExpected.games);

    const first = document.derived.games[0];
    expect(first).toMatchObject({
      citationId: `${document.importKey}:citation:0`,
      locator: { kind: "pgn-game", gameIndex: 0 },
      headers: {
        Source: "Fictional Chess Anthology",
        SourceVersion: "First fixture edition",
      },
    });
    expect(first?.document.headers).toEqual(first?.headers);
    expect(first?.document.rootNodeId).not.toBe(first?.document.id);
    expect(first?.warnings).toEqual([]);
    expect(document.derived.games[1]?.warnings).toEqual([]);
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
  });

  it("mantiene la identidad por bytes aunque cambie el nombre", () => {
    const first = extractPgnDocument(fixtureBytes, dependencies(), {
      fileName: "one.pgn",
    });
    const second = extractPgnDocument(fixtureBytes, dependencies(), {
      fileName: "two.pgn",
    });

    expect(second.importKey).toBe(first.importKey);
    expect(second.source.sha256).toBe(first.source.sha256);
    expect(second.source.fileName).not.toBe(first.source.fileName);
  });

  it("conserva los warnings del adaptador en una entrada seleccionada", () => {
    const input = new TextEncoder().encode(
      '[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n\n1. e4 *',
    );
    const document = extractPgnDocument(input, dependencies());

    expect(document.derived.games).toHaveLength(1);
    expect(document.derived.games[0]?.warnings).toHaveLength(4);
    expect(document.derived.games[0]?.warnings[0]).toMatchObject({
      code: "MISSING_OPTIONAL_STR_TAG",
      line: 1,
    });
  });

  it("rechaza entrada invalida, encoding, PGN y directivas no soportadas", () => {
    expectCode(
      () => extractPgnDocument(new Uint8Array([0xc3, 0x28]), dependencies()),
      "PGN_INVALID_ENCODING",
    );
    expectCode(
      () =>
        extractPgnDocument(
          new TextEncoder().encode('[Result "*"]\n\n1. e4 e5 1-0'),
          dependencies(),
        ),
      "PGN_PARSE_ERROR",
    );
    expectCode(
      () =>
        extractPgnDocument(
          new TextEncoder().encode(
            '[Result "*"]\n\n1. e4 {[%cal Ge2e4] [%clk 0:05:00]} e5 *',
          ),
          dependencies(),
        ),
      "UNSUPPORTED_PGN_FEATURE",
    );
    expectCode(
      () => extractPgnDocument(fixtureBytes, dependencies(), { fileName: "" }),
      "PGN_INVALID_INPUT",
    );
  });

  it("aplica el limite de bytes antes del parser", () => {
    expectCode(
      () =>
        extractPgnDocument(
          new Uint8Array(MAX_PGN_INPUT_BYTES + 1),
          dependencies(),
        ),
      "PGN_INPUT_TOO_LARGE",
    );
    expectCode(
      () =>
        extractPgnDocument(new Uint8Array(MAX_PGN_INPUT_BYTES), dependencies()),
      "PGN_PARSE_ERROR",
    );
  });
});
