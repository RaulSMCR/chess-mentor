import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { exportPgn, importPgn, MAX_PGN_INPUT_BYTES } from "./adapter";
import { sameSemanticDocument } from "./semantic";

const fixture = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), "fixtures", "phase1", name), "utf8");
const deps = () => {
  let id = 0;
  return {
    idFactory: () => `pgn-${id++}`,
    clock: () => "2026-08-12T18:00:00.000Z",
  };
};

describe("PGN adapter", () => {
  it("imports annotated variations with expected tree and round-trips semantically", () => {
    const imported = importPgn(fixture("annotated-variations.pgn"), deps());
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.document.title).toBe("Chess Mentor Phase 1 Fixture");
    const exported = exportPgn(imported.value.document);
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const reparsed = importPgn(exported.value, deps());
    expect(reparsed.ok).toBe(true);
    if (reparsed.ok)
      expect(
        sameSemanticDocument(imported.value.document, reparsed.value.document),
      ).toBe(true);
  });

  it("imports custom and black-to-move FENs", () => {
    for (const name of ["custom-start.pgn", "black-to-move.pgn"]) {
      const result = importPgn(fixture(name), deps());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.document.headers.SetUp).toBe("1");
        const exported = exportPgn(result.value.document);
        expect(exported.ok).toBe(true);
        if (exported.ok) {
          const reparsed = importPgn(exported.value, deps());
          expect(reparsed.ok).toBe(true);
          if (reparsed.ok)
            expect(
              sameSemanticDocument(
                result.value.document,
                reparsed.value.document,
              ),
            ).toBe(true);
        }
      }
    }
  });

  it("rejects invalid and unsupported PGN without a partial document", () => {
    expect(importPgn(fixture("invalid.pgn"), deps())).toMatchObject({
      ok: false,
      error: { code: "PGN_PARSE_ERROR" },
    });
    expect(
      importPgn(fixture("unsupported-directives.pgn"), deps()),
    ).toMatchObject({ ok: false, error: { code: "UNSUPPORTED_PGN_FEATURE" } });
  });

  it("enforces UTF-8 size boundaries", () => {
    const exact = "x".repeat(MAX_PGN_INPUT_BYTES);
    const over = "x".repeat(MAX_PGN_INPUT_BYTES + 1);
    expect(importPgn(exact, deps())).toMatchObject({
      ok: false,
      error: { code: "PGN_PARSE_ERROR" },
    });
    expect(importPgn(over, deps())).toMatchObject({
      ok: false,
      error: { code: "PGN_PARSE_ERROR" },
    });
  });
});
