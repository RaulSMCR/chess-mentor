import { describe, expect, it } from "vitest";

import { sameSemanticDocument } from "./semantic";
import { makeGameDocument } from "@/test/factories";

describe("PGN semantic normalization", () => {
  it("ignores cursor but preserves content", () => {
    const document = makeGameDocument();
    expect(
      sameSemanticDocument(document, { ...document, cursorNodeId: "other" }),
    ).toBe(true);
    expect(
      sameSemanticDocument(document, { ...document, title: "other" }),
    ).toBe(false);
  });

  it("ignores generated IDs, revision and timestamps", () => {
    const document = makeGameDocument();
    const root = document.nodesById[document.rootNodeId];
    const other = {
      ...document,
      id: "other-game",
      rootNodeId: "other-root",
      cursorNodeId: "other-root",
      revision: 99,
      createdAt: "2026-08-13T18:00:00.000Z",
      updatedAt: "2026-08-13T18:01:00.000Z",
      nodesById: {
        "other-root": { ...root, id: "other-root" },
      },
    } as typeof document;
    expect(sameSemanticDocument(document, other)).toBe(true);
  });
});
