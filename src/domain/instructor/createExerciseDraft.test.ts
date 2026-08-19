import { describe, expect, it } from "vitest";

import { createGameDocument } from "../game-tree/replay";
import {
  createInstructorSession,
  type CreateInstructorSessionInput,
  type InstructorSessionV1,
} from "./model";
import {
  createExerciseDraft,
  type CreateExerciseDraftInput,
} from "./createExerciseDraft";

const FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TIMESTAMP = "2026-08-19T12:00:00.000Z";

function makeSession(): InstructorSessionV1 {
  const game = createGameDocument({
    rootFen: FEN,
    idFactory: (() => {
      const ids = ["game-1", "root-1"];
      let index = 0;
      return () => ids[index++] ?? "unused";
    })(),
    clock: () => TIMESTAMP,
  });
  if (!game.ok) throw new Error(game.error.message);

  const input: CreateInstructorSessionInput = {
    id: "session-1",
    title: "Centro y desarrollo",
    gameDocument: game.value,
    activeNodeId: game.value.rootNodeId,
    sourceRefs: [
      {
        id: "book-1",
        kind: "library",
        title: "Fixture bibliografico",
        citationIds: ["citation-1"],
      },
      {
        id: "unused-1",
        kind: "manual",
        title: "Fuente no usada",
        citationIds: [],
      },
    ],
    turns: [
      {
        id: "turn-1",
        nodeId: game.value.rootNodeId,
        question: "Que busca esta jugada?",
        response: {
          responseId: "response-1",
          answer: "Controla el centro.",
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
        engineAnalysis: null,
        counterpart: {
          origin: "source",
          nodeId: game.value.rootNodeId,
          uci: "E2E4",
          sourceRefId: "book-1",
        },
        createdAt: TIMESTAMP,
      },
    ],
    derivedExerciseIds: [],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
  };
  const session = createInstructorSession(input);
  if (!session.ok) throw new Error(session.error.message);
  return session.value;
}

function draftInput(
  session: InstructorSessionV1,
  overrides: Partial<CreateExerciseDraftInput> = {},
): CreateExerciseDraftInput {
  return {
    session,
    id: "draft-1",
    title: "Centro desde sesion",
    nodeId: session.activeNodeId,
    acceptedMoves: ["E2E4"],
    hints: { concept: "Controla el centro.", destination: "Mira e4." },
    difficulty: 3,
    ...overrides,
  };
}

describe("createExerciseDraft", () => {
  it("deriva un borrador situado y conserva la evidencia usada", () => {
    const session = makeSession();
    const acceptedMoves = ["E2E4"];
    const result = createExerciseDraft(draftInput(session, { acceptedMoves }));
    acceptedMoves[0] = "d2d4";

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.exercise).toMatchObject({
      schemaVersion: 2,
      exerciseVersion: "exercise-v2",
      fen: FEN,
      acceptedMoves: ["e2e4"],
      origin: "instructor_session",
      originRefId: "session-1",
      originNodeId: "root-1",
      review: { status: "draft" },
    });
    expect(result.value.exercise.sourceRefs).toEqual([
      {
        id: "book-1",
        kind: "library",
        title: "Fixture bibliografico",
        citationIds: ["citation-1"],
      },
    ]);
    expect(result.value.exercise.counterpartReplies).toEqual([
      {
        id: "turn-1:counterpart",
        nodeId: "root-1",
        uci: "e2e4",
        origin: "source",
        sourceRefId: "book-1",
      },
    ]);
    expect(result.value.claimIds).toEqual(["claim-1"]);
    expect(result.value.claims).toMatchObject([
      { id: "claim-1", type: "direct_quote", citationIds: ["citation-1"] },
    ]);
    expect(result.value.history).toEqual([
      {
        id: "draft-1:created",
        kind: "created",
        createdAt: TIMESTAMP,
        sessionId: "session-1",
        nodeId: "root-1",
        claimIds: ["claim-1"],
        sourceRefIds: ["book-1"],
        counterpartReplyIds: ["turn-1:counterpart"],
      },
    ]);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.exercise)).toBe(true);
    expect(Object.isFrozen(result.value.history[0])).toBe(true);
  });

  it("no copia fuentes ni turnos ajenos al nodo seleccionado", () => {
    const session = makeSession();
    const result = createExerciseDraft(
      draftInput(session, {
        nodeId: "root-1",
        acceptedMoves: ["d2d4"],
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.value.exercise.sourceRefs.map((source) => source.id),
      ).toEqual(["book-1"]);
      expect(result.value.claimIds).toEqual(["claim-1"]);
      expect(result.value.sessionId).toBe("session-1");
      expect(result.value.nodeId).toBe("root-1");
    }
  });

  it("rechaza un nodo inexistente y jugadas no legales para su FEN", () => {
    const session = makeSession();

    expect(
      createExerciseDraft(draftInput(session, { nodeId: "missing-node" })),
    ).toMatchObject({
      ok: false,
      error: { code: "INSTRUCTOR_DRAFT_NODE_NOT_FOUND" },
    });

    expect(
      createExerciseDraft(draftInput(session, { acceptedMoves: ["e2e5"] })),
    ).toMatchObject({
      ok: false,
      error: { code: "INSTRUCTOR_DRAFT_INVALID_EXERCISE" },
    });
  });

  it("no aprueba ni infiere evidencia cuando el nodo no tiene turnos", () => {
    const session = makeSession();
    const emptyContext = {
      ...session,
      turns: [],
    };
    const result = createExerciseDraft(draftInput(emptyContext));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.exercise.review).toEqual({ status: "draft" });
      expect(result.value.exercise.sourceRefs).toEqual([]);
      expect(result.value.exercise.counterpartReplies).toEqual([]);
      expect(result.value.claims).toEqual([]);
      expect(result.value.history[0]?.claimIds).toEqual([]);
    }
  });
});
