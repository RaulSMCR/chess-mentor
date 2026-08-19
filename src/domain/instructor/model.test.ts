import { describe, expect, it } from "vitest";

import { playMove } from "../game-tree/commands";
import { createGameDocument } from "../game-tree/replay";
import type { GameDocumentV1 } from "../game-tree/model";
import {
  createInstructorSession,
  type CreateInstructorSessionInput,
  validateInstructorSession,
} from "./model";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TIMESTAMP = "2026-08-19T12:00:00.000Z";

function makeGame(): GameDocumentV1 {
  const created = createGameDocument({
    rootFen: STANDARD_FEN,
    idFactory: (() => {
      const ids = ["game-1", "root-1"];
      let index = 0;
      return () => ids[index++] ?? "unused";
    })(),
    clock: () => TIMESTAMP,
  });
  if (!created.ok) throw new Error(created.error.message);
  return created.value;
}

function baseInput(
  gameDocument: GameDocumentV1 = makeGame(),
): CreateInstructorSessionInput {
  return {
    id: "session-1",
    title: "Centro y desarrollo",
    gameDocument,
    sourceRefs: [
      {
        id: "book-1",
        kind: "library",
        title: "Fixture de estrategia",
        citationIds: ["citation-1"],
      },
    ],
    turns: [
      {
        id: "turn-1",
        nodeId: gameDocument.rootNodeId,
        question: "¿Qué busca esta jugada?",
        response: {
          responseId: "response-1",
          answer: "Controla el centro y prepara el desarrollo.",
          support: "sufficient",
          claims: [
            {
              id: "claim-1",
              text: "La jugada ocupa una casilla central.",
              type: "direct_quote",
              citationIds: ["citation-1"],
            },
          ],
        },
        engineAnalysis: {
          analysisId: "analysis-1",
          fen: gameDocument.nodesById[gameDocument.rootNodeId]!.fen,
          sideToMove: "w",
          lines: [
            {
              multipv: 1,
              depth: 12,
              score: { kind: "cp", value: 20 },
              pv: ["e2e4"],
              bestmove: "e2e4",
            },
          ],
        },
        counterpart: {
          origin: "source",
          nodeId: gameDocument.rootNodeId,
          uci: "e2e4",
          sourceRefId: "book-1",
        },
        createdAt: TIMESTAMP,
      },
    ],
    derivedExerciseIds: [],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
}

describe("createInstructorSession", () => {
  it("creates a frozen session with separated response, engine and counterpart", () => {
    const input = baseInput();
    const result = createInstructorSession(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.sessionVersion).toBe("instructor-session-v1");
    expect(result.value.activeNodeId).toBe(
      result.value.gameDocument.rootNodeId,
    );
    expect(result.value.turns[0]?.response?.claims[0]?.type).toBe(
      "direct_quote",
    );
    expect(result.value.turns[0]?.engineAnalysis?.lines[0]?.bestmove).toBe(
      "e2e4",
    );
    expect(result.value.turns[0]?.counterpart?.origin).toBe("source");
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.gameDocument)).toBe(true);
  });

  it("does not mutate source inputs and defaults optional collections", () => {
    const gameDocument = makeGame();
    const source = {
      id: "manual-1",
      kind: "manual" as const,
      title: "Apunte del instructor",
      citationIds: [] as string[],
    };
    const result = createInstructorSession({
      id: "session-2",
      title: "  Sesión  ",
      gameDocument,
      sourceRefs: [source],
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    });

    source.title = "Cambiado después";
    source.citationIds.push("not-used");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe("Sesión");
    expect(result.value.sourceRefs[0]?.title).toBe("Apunte del instructor");
    expect(result.value.sourceRefs[0]?.citationIds).toEqual([]);
    expect(result.value.turns).toEqual([]);
    expect(result.value.derivedExerciseIds).toEqual([]);
  });

  it("accepts an engine-selected legal counterpart move", () => {
    const base = baseInput();
    const input: CreateInstructorSessionInput = {
      ...base,
      turns: [
        {
          ...base.turns![0]!,
          counterpart: {
            origin: "engine",
            nodeId: base.gameDocument.rootNodeId,
            uci: "e2e4",
            analysisId: "analysis-1",
          },
        },
      ],
    };

    const result = createInstructorSession(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.turns[0]?.counterpart).toMatchObject({
        origin: "engine",
        uci: "e2e4",
      });
    }
  });
});

describe("validateInstructorSession", () => {
  it("rejects a turn that references a missing node", () => {
    const base = baseInput();
    const input: CreateInstructorSessionInput = {
      ...base,
      turns: [{ ...base.turns![0]!, nodeId: "missing-node" }],
    };

    const result = createInstructorSession(input);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INSTRUCTOR_INVALID_TURN" },
    });
  });

  it("rejects an illegal counterpart move", () => {
    const base = baseInput();
    const input: CreateInstructorSessionInput = {
      ...base,
      turns: [
        {
          ...base.turns![0]!,
          counterpart: {
            origin: "manual",
            nodeId: base.gameDocument.rootNodeId,
            uci: "e2e5",
          },
        },
      ],
    };

    const result = createInstructorSession(input);

    expect(result).toMatchObject({
      ok: false,
      error: { code: "INSTRUCTOR_INVALID_TURN" },
    });
  });

  it("rejects duplicate source IDs and dangling citations", () => {
    const duplicateBase = baseInput();
    const duplicateSources: CreateInstructorSessionInput = {
      ...duplicateBase,
      sourceRefs: [...duplicateBase.sourceRefs!, duplicateBase.sourceRefs![0]!],
    };
    expect(createInstructorSession(duplicateSources)).toMatchObject({
      ok: false,
      error: { code: "INSTRUCTOR_INVALID_SOURCE" },
    });

    const danglingBase = baseInput();
    const danglingCitation: CreateInstructorSessionInput = {
      ...danglingBase,
      turns: [
        {
          ...danglingBase.turns![0]!,
          response: {
            ...danglingBase.turns![0]!.response!,
            claims: [
              {
                ...danglingBase.turns![0]!.response!.claims[0]!,
                citationIds: ["missing-citation"],
              },
            ],
          },
        },
      ],
    };
    expect(createInstructorSession(danglingCitation)).toMatchObject({
      ok: false,
      error: { code: "INSTRUCTOR_INVALID_TURN" },
    });
  });

  it("rejects malformed timestamps and duplicate turn IDs", () => {
    const invalidTime: CreateInstructorSessionInput = {
      ...baseInput(),
      updatedAt: "2026-08-19T12:00:00Z",
    };
    expect(createInstructorSession(invalidTime)).toMatchObject({
      ok: false,
      error: { code: "INSTRUCTOR_INVALID_SESSION" },
    });

    const duplicateBase = baseInput();
    const duplicateTurns: CreateInstructorSessionInput = {
      ...duplicateBase,
      turns: [
        ...duplicateBase.turns!,
        { ...duplicateBase.turns![0]!, response: null, engineAnalysis: null },
      ],
    };
    expect(createInstructorSession(duplicateTurns)).toMatchObject({
      ok: false,
      error: { code: "INSTRUCTOR_INVALID_SESSION" },
    });
  });

  it("validates a serialized session again", () => {
    const created = createInstructorSession(baseInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const parsed = validateInstructorSession(
      JSON.parse(JSON.stringify(created.value)) as unknown,
    );

    expect(parsed).toEqual(created);
  });
});

describe("session game fixture", () => {
  it("can contain a legal move without making the session own another board", () => {
    const game = makeGame();
    const moved = playMove(
      game,
      { from: "e2", to: "e4" },
      { idFactory: () => "move-1", clock: () => TIMESTAMP },
    );

    expect(moved.ok).toBe(true);
    if (moved.ok) {
      expect(moved.value.nodesById["move-1"]?.kind).toBe("move");
      expect(moved.value.nodesById).not.toBe(game.nodesById);
    }
  });
});
