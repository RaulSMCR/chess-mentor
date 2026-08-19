import type { NodeId } from "../game-tree/model";
import { replayToNode } from "../game-tree/replay";
import {
  createExerciseV2,
  type ExerciseCounterpartReplyV2,
  type ExerciseSourceRefV2,
  type ExerciseV2,
} from "../trainer/model-v2";
import type { ExerciseHints, TrainerDifficulty } from "../trainer/model";
import {
  validateInstructorSession,
  type InstructorClaimV1,
  type InstructorCounterpartSelectionV1,
  type InstructorSessionV1,
} from "./model";

export type CreateExerciseDraftInput = Readonly<{
  session: InstructorSessionV1;
  id: string;
  title: string;
  nodeId: NodeId;
  acceptedMoves: readonly string[];
  hints: ExerciseHints;
  difficulty: TrainerDifficulty;
  timeLimitMs?: number | null;
}>;

export type ExerciseDraftHistoryEventV1 = Readonly<{
  id: string;
  kind: "created";
  createdAt: string;
  sessionId: string;
  nodeId: NodeId;
  claimIds: readonly string[];
  sourceRefIds: readonly string[];
  counterpartReplyIds: readonly string[];
}>;

export type ExerciseDraftV2 = Readonly<{
  exercise: ExerciseV2;
  sessionId: string;
  nodeId: NodeId;
  claims: readonly InstructorClaimV1[];
  claimIds: readonly string[];
  history: readonly ExerciseDraftHistoryEventV1[];
}>;

export type ExerciseDraftErrorCode =
  | "INSTRUCTOR_DRAFT_INVALID_INPUT"
  | "INSTRUCTOR_DRAFT_INVALID_SESSION"
  | "INSTRUCTOR_DRAFT_NODE_NOT_FOUND"
  | "INSTRUCTOR_DRAFT_INVALID_CLAIM"
  | "INSTRUCTOR_DRAFT_INVALID_EXERCISE";

export type ExerciseDraftError = Readonly<{
  code: ExerciseDraftErrorCode;
  message: string;
  context?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type ExerciseDraftResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ExerciseDraftError }>;

type DraftEvidence = Readonly<{
  sourceRefs: readonly ExerciseSourceRefV2[];
  claims: readonly InstructorClaimV1[];
  claimIds: readonly string[];
  counterpartReplies: readonly ExerciseCounterpartReplyV2[];
}>;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure<T>(
  code: ExerciseDraftErrorCode,
  message: string,
  context?: Readonly<Record<string, string | number | boolean | null>>,
): ExerciseDraftResult<T> {
  return context === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, context } };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  const object = value as Record<string, unknown>;
  for (const child of Object.values(object)) freezeDeep(child);
  return Object.freeze(value as object) as T;
}

function cloneAndFreeze<T>(value: T): T {
  return freezeDeep(clone(value));
}

function counterpartReply(
  turnId: string,
  selection: InstructorCounterpartSelectionV1,
): ExerciseCounterpartReplyV2 {
  const id = `${turnId}:counterpart`;
  if (selection.origin === "source") {
    return {
      id,
      nodeId: selection.nodeId,
      uci: selection.uci,
      origin: "source",
      sourceRefId: selection.sourceRefId,
    };
  }
  if (selection.origin === "engine") {
    return {
      id,
      nodeId: selection.nodeId,
      uci: selection.uci,
      origin: "engine",
      analysisId: selection.analysisId,
    };
  }
  return {
    id,
    nodeId: selection.nodeId,
    uci: selection.uci,
    origin: "manual",
  };
}

function collectEvidence(
  session: InstructorSessionV1,
  nodeId: NodeId,
): ExerciseDraftResult<DraftEvidence> {
  const turns = session.turns.filter((turn) => turn.nodeId === nodeId);
  const claims: InstructorClaimV1[] = [];
  const claimIds = new Set<string>();
  const usedSourceIds = new Set<string>();
  const counterpartReplies: ExerciseCounterpartReplyV2[] = [];

  for (const turn of turns) {
    if (turn.response !== null) {
      for (const claim of turn.response.claims) {
        if (claimIds.has(claim.id)) {
          return failure(
            "INSTRUCTOR_DRAFT_INVALID_CLAIM",
            "El contexto seleccionado repite un ID de claim.",
            { claimId: claim.id },
          );
        }
        claimIds.add(claim.id);
        claims.push({
          ...claim,
          citationIds: [...claim.citationIds],
        });
        for (const citationId of claim.citationIds) {
          const source = session.sourceRefs.find((candidate) =>
            candidate.citationIds.includes(citationId),
          );
          if (source === undefined) {
            return failure(
              "INSTRUCTOR_DRAFT_INVALID_CLAIM",
              "El claim referencia una fuente ausente en la sesion.",
              { claimId: claim.id, citationId },
            );
          }
          usedSourceIds.add(source.id);
        }
      }
    }

    if (turn.counterpart !== null) {
      const reply = counterpartReply(turn.id, turn.counterpart);
      counterpartReplies.push(reply);
      if (reply.origin === "source") usedSourceIds.add(reply.sourceRefId);
    }
  }

  const sourceRefs: ExerciseSourceRefV2[] = session.sourceRefs
    .filter((source) => usedSourceIds.has(source.id))
    .map((source) => ({
      id: source.id,
      kind: source.kind,
      title: source.title,
      citationIds: [...source.citationIds],
    }));

  return {
    ok: true,
    value: {
      sourceRefs,
      claims,
      claimIds: [...claimIds],
      counterpartReplies,
    },
  };
}

export function createExerciseDraft(
  input: CreateExerciseDraftInput,
): ExerciseDraftResult<ExerciseDraftV2> {
  if (!isNonEmptyString(input.nodeId)) {
    return failure(
      "INSTRUCTOR_DRAFT_INVALID_INPUT",
      "nodeId debe ser un texto no vacio.",
    );
  }

  const session = validateInstructorSession(input.session);
  if (!session.ok) {
    return failure(
      "INSTRUCTOR_DRAFT_INVALID_SESSION",
      "La sesion no es valida para derivar un ejercicio.",
      { validationCode: session.error.code },
    );
  }

  const node = session.value.gameDocument.nodesById[input.nodeId];
  if (node === undefined) {
    return failure(
      "INSTRUCTOR_DRAFT_NODE_NOT_FOUND",
      "El nodo seleccionado no existe en el snapshot de la sesion.",
      { nodeId: input.nodeId },
    );
  }

  const replayed = replayToNode(session.value.gameDocument, input.nodeId);
  if (!replayed.ok) {
    return failure(
      "INSTRUCTOR_DRAFT_NODE_NOT_FOUND",
      "El nodo seleccionado no pudo reproducirse desde el snapshot.",
      { nodeId: input.nodeId, validationCode: replayed.error.code },
    );
  }

  const evidence = collectEvidence(session.value, input.nodeId);
  if (!evidence.ok) return evidence;

  const exercise = createExerciseV2({
    id: input.id,
    title: input.title,
    fen: replayed.value.fen,
    acceptedMoves: input.acceptedMoves,
    hints: input.hints,
    difficulty: input.difficulty,
    timeLimitMs: input.timeLimitMs,
    origin: "instructor_session",
    originRefId: session.value.id,
    originNodeId: input.nodeId,
    sourceRefs: evidence.value.sourceRefs,
    counterpartReplies: evidence.value.counterpartReplies,
  });
  if (!exercise.ok) {
    return failure(
      "INSTRUCTOR_DRAFT_INVALID_EXERCISE",
      "Los datos declarados no producen un ejercicio V2 valido.",
      { validationCode: exercise.error.code },
    );
  }

  const counterpartReplyIds = evidence.value.counterpartReplies.map(
    (reply) => reply.id,
  );
  const history: ExerciseDraftHistoryEventV1 = {
    id: `${exercise.value.id}:created`,
    kind: "created",
    createdAt: session.value.updatedAt,
    sessionId: session.value.id,
    nodeId: input.nodeId,
    claimIds: [...evidence.value.claimIds],
    sourceRefIds: evidence.value.sourceRefs.map((source) => source.id),
    counterpartReplyIds,
  };

  return {
    ok: true,
    value: cloneAndFreeze({
      exercise: exercise.value,
      sessionId: session.value.id,
      nodeId: input.nodeId,
      claims: evidence.value.claims,
      claimIds: evidence.value.claimIds,
      history: [history],
    }),
  };
}

export const createExerciseDraftFromSession = createExerciseDraft;
