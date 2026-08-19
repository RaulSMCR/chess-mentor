import type { GameDocumentV1, NodeId } from "../game-tree/model";
import { validateGameDocument } from "../game-tree/invariants";
import { normalizeMoveAt } from "../game-tree/replay";

export const INSTRUCTOR_SESSION_SCHEMA_VERSION = 1 as const;
export const INSTRUCTOR_SESSION_VERSION = "instructor-session-v1" as const;

const SOURCE_KINDS = [
  "library",
  "exercise_repository",
  "author_theory",
  "manual",
] as const;

const CLAIM_TYPES = [
  "direct_quote",
  "paraphrase",
  "inference",
  "engine",
  "ai_synthesis",
  "user_hypothesis",
  "unsupported",
] as const;

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/u;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type InstructorSourceKind = (typeof SOURCE_KINDS)[number];
export type InstructorClaimType = (typeof CLAIM_TYPES)[number];
export type InstructorCounterpartOrigin = "source" | "engine" | "manual";
export type InstructorClaimSupport = "sufficient" | "partial" | "unsupported";

export type InstructorSourceRefV1 = Readonly<{
  id: string;
  kind: InstructorSourceKind;
  title: string;
  citationIds: readonly string[];
}>;

export type InstructorClaimV1 = Readonly<{
  id: string;
  text: string;
  type: InstructorClaimType;
  citationIds: readonly string[];
}>;

export type InstructorResponseV1 = Readonly<{
  responseId: string;
  answer: string;
  support: InstructorClaimSupport;
  claims: readonly InstructorClaimV1[];
}>;

export type InstructorEngineScoreV1 = Readonly<{
  kind: "cp" | "mate";
  value: number;
}>;

export type InstructorEngineLineV1 = Readonly<{
  multipv: number;
  depth: number;
  score: InstructorEngineScoreV1;
  pv: readonly string[];
  bestmove: string;
}>;

export type InstructorEngineAnalysisV1 = Readonly<{
  analysisId: string;
  fen: string;
  sideToMove: "w" | "b";
  lines: readonly InstructorEngineLineV1[];
}>;

type InstructorCounterpartSelectionBase = Readonly<{
  nodeId: NodeId;
  uci: string;
}>;

export type InstructorCounterpartSelectionV1 =
  | (InstructorCounterpartSelectionBase &
      Readonly<{
        origin: "source";
        sourceRefId: string;
      }>)
  | (InstructorCounterpartSelectionBase &
      Readonly<{
        origin: "engine";
        analysisId: string;
      }>)
  | (InstructorCounterpartSelectionBase &
      Readonly<{
        origin: "manual";
      }>);

export type InstructorTurnV1 = Readonly<{
  id: string;
  nodeId: NodeId;
  question: string;
  response: InstructorResponseV1 | null;
  engineAnalysis: InstructorEngineAnalysisV1 | null;
  counterpart: InstructorCounterpartSelectionV1 | null;
  createdAt: string;
}>;

export type InstructorSessionV1 = Readonly<{
  schemaVersion: typeof INSTRUCTOR_SESSION_SCHEMA_VERSION;
  sessionVersion: typeof INSTRUCTOR_SESSION_VERSION;
  id: string;
  title: string;
  gameDocument: GameDocumentV1;
  activeNodeId: NodeId;
  sourceRefs: readonly InstructorSourceRefV1[];
  turns: readonly InstructorTurnV1[];
  derivedExerciseIds: readonly string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type CreateInstructorSessionInput = Readonly<{
  id: string;
  title: string;
  gameDocument: GameDocumentV1;
  activeNodeId?: NodeId;
  sourceRefs?: readonly InstructorSourceRefV1[];
  turns?: readonly InstructorTurnV1[];
  derivedExerciseIds?: readonly string[];
  revision?: number;
  createdAt: string;
  updatedAt: string;
}>;

export type InstructorErrorCode =
  | "INSTRUCTOR_INVALID_SESSION"
  | "INSTRUCTOR_INVALID_SOURCE"
  | "INSTRUCTOR_INVALID_TURN"
  | "INSTRUCTOR_INVALID_RESPONSE"
  | "INSTRUCTOR_INVALID_ENGINE_ANALYSIS"
  | "INSTRUCTOR_INVALID_COUNTERPART";

export type InstructorError = Readonly<{
  code: InstructorErrorCode;
  message: string;
  context?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type InstructorResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: InstructorError }>;

type RecordLike = Record<string, unknown>;

type ValidatedSources = Readonly<{
  refs: readonly InstructorSourceRefV1[];
  citationIds: ReadonlySet<string>;
}>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    UTC_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isSourceKind(value: unknown): value is InstructorSourceKind {
  return (
    typeof value === "string" &&
    (SOURCE_KINDS as readonly string[]).includes(value)
  );
}

function isClaimType(value: unknown): value is InstructorClaimType {
  return (
    typeof value === "string" &&
    (CLAIM_TYPES as readonly string[]).includes(value)
  );
}

function failure<T>(
  code: InstructorErrorCode,
  message: string,
  context?: Readonly<Record<string, string | number | boolean | null>>,
): InstructorResult<T> {
  return context === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, context } };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function freezeDeep<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  const object = value as RecordLike;
  for (const child of Object.values(object)) freezeDeep(child);
  return Object.freeze(value as object) as T;
}

function cloneAndFreeze<T>(value: T): T {
  return freezeDeep(clone(value));
}

function normalizeText(
  value: unknown,
  field: string,
  code: InstructorErrorCode,
): InstructorResult<string> {
  return isNonEmptyString(value)
    ? { ok: true, value: value.trim() }
    : failure(code, `${field} debe ser un texto no vacio.`, { field });
}

function normalizeCitationIds(
  value: unknown,
  field: string,
): InstructorResult<readonly string[]> {
  if (!Array.isArray(value)) {
    return failure("INSTRUCTOR_INVALID_SOURCE", `${field} debe ser un array.`, {
      field,
    });
  }
  const ids: string[] = [];
  for (const [index, rawId] of value.entries()) {
    const normalized = normalizeText(
      rawId,
      `${field}[${index}]`,
      "INSTRUCTOR_INVALID_SOURCE",
    );
    if (!normalized.ok) return normalized;
    if (ids.includes(normalized.value)) {
      return failure(
        "INSTRUCTOR_INVALID_SOURCE",
        "Las referencias de cita no pueden repetirse.",
        { citationId: normalized.value },
      );
    }
    ids.push(normalized.value);
  }
  return { ok: true, value: ids };
}

function normalizeSources(value: unknown): InstructorResult<ValidatedSources> {
  if (!Array.isArray(value)) {
    return failure(
      "INSTRUCTOR_INVALID_SOURCE",
      "sourceRefs debe ser un array.",
    );
  }

  const refs: InstructorSourceRefV1[] = [];
  const sourceIds = new Set<string>();
  const citationIds = new Set<string>();

  for (const [index, rawSource] of value.entries()) {
    if (!isRecord(rawSource)) {
      return failure(
        "INSTRUCTOR_INVALID_SOURCE",
        `La fuente ${index} debe ser un objeto.`,
      );
    }
    const id = normalizeText(
      rawSource.id,
      `sourceRefs[${index}].id`,
      "INSTRUCTOR_INVALID_SOURCE",
    );
    if (!id.ok) return id;
    if (sourceIds.has(id.value)) {
      return failure(
        "INSTRUCTOR_INVALID_SOURCE",
        "El ID de fuente se repite.",
        {
          id: id.value,
        },
      );
    }
    sourceIds.add(id.value);

    const title = normalizeText(
      rawSource.title,
      `sourceRefs[${index}].title`,
      "INSTRUCTOR_INVALID_SOURCE",
    );
    if (!title.ok) return title;
    if (!isSourceKind(rawSource.kind)) {
      return failure(
        "INSTRUCTOR_INVALID_SOURCE",
        "El tipo de fuente no esta soportado.",
        { index },
      );
    }

    const sourceCitations = normalizeCitationIds(
      rawSource.citationIds,
      `sourceRefs[${index}].citationIds`,
    );
    if (!sourceCitations.ok) return sourceCitations;
    if (
      rawSource.kind === "author_theory" &&
      sourceCitations.value.length === 0
    ) {
      return failure(
        "INSTRUCTOR_INVALID_SOURCE",
        "Una fuente de autor requiere al menos una cita.",
        { id: id.value },
      );
    }
    for (const citationId of sourceCitations.value) {
      if (citationIds.has(citationId)) {
        return failure(
          "INSTRUCTOR_INVALID_SOURCE",
          "Una cita no puede pertenecer a varias fuentes en la misma sesion.",
          { citationId },
        );
      }
      citationIds.add(citationId);
    }
    refs.push({
      id: id.value,
      kind: rawSource.kind,
      title: title.value,
      citationIds: [...sourceCitations.value],
    });
  }

  return { ok: true, value: { refs, citationIds } };
}

function normalizeClaims(
  value: unknown,
  citationIds: ReadonlySet<string>,
): InstructorResult<readonly InstructorClaimV1[]> {
  if (!Array.isArray(value) || value.length === 0) {
    return failure(
      "INSTRUCTOR_INVALID_RESPONSE",
      "claims debe contener al menos un claim.",
    );
  }
  const claims: InstructorClaimV1[] = [];
  const claimIds = new Set<string>();
  for (const [index, rawClaim] of value.entries()) {
    if (!isRecord(rawClaim)) {
      return failure(
        "INSTRUCTOR_INVALID_RESPONSE",
        `El claim ${index} debe ser un objeto.`,
      );
    }
    const id = normalizeText(
      rawClaim.id,
      `claims[${index}].id`,
      "INSTRUCTOR_INVALID_RESPONSE",
    );
    if (!id.ok) return id;
    if (claimIds.has(id.value)) {
      return failure(
        "INSTRUCTOR_INVALID_RESPONSE",
        "El ID de claim se repite.",
        {
          id: id.value,
        },
      );
    }
    claimIds.add(id.value);
    const text = normalizeText(
      rawClaim.text,
      `claims[${index}].text`,
      "INSTRUCTOR_INVALID_RESPONSE",
    );
    if (!text.ok) return text;
    if (!isClaimType(rawClaim.type)) {
      return failure(
        "INSTRUCTOR_INVALID_RESPONSE",
        "El tipo de claim no es valido.",
        {
          index,
        },
      );
    }
    const claimCitations = normalizeCitationIds(
      rawClaim.citationIds,
      `claims[${index}].citationIds`,
    );
    if (!claimCitations.ok) {
      return failure(
        "INSTRUCTOR_INVALID_RESPONSE",
        claimCitations.error.message,
        claimCitations.error.context,
      );
    }
    for (const citationId of claimCitations.value) {
      if (!citationIds.has(citationId)) {
        return failure(
          "INSTRUCTOR_INVALID_RESPONSE",
          "El claim referencia una cita que no pertenece a la sesion.",
          { citationId },
        );
      }
    }
    if (
      rawClaim.type !== "engine" &&
      rawClaim.type !== "user_hypothesis" &&
      rawClaim.type !== "unsupported" &&
      claimCitations.value.length === 0
    ) {
      return failure(
        "INSTRUCTOR_INVALID_RESPONSE",
        "Un claim bibliografico requiere al menos una cita.",
        { id: id.value },
      );
    }
    claims.push({
      id: id.value,
      text: text.value,
      type: rawClaim.type,
      citationIds: [...claimCitations.value],
    });
  }
  return { ok: true, value: claims };
}

function normalizeResponse(
  value: unknown,
  citationIds: ReadonlySet<string>,
): InstructorResult<InstructorResponseV1> {
  if (!isRecord(value)) {
    return failure(
      "INSTRUCTOR_INVALID_RESPONSE",
      "response debe ser un objeto.",
    );
  }
  const responseId = normalizeText(
    value.responseId,
    "response.responseId",
    "INSTRUCTOR_INVALID_RESPONSE",
  );
  if (!responseId.ok) return responseId;
  const answer = normalizeText(
    value.answer,
    "response.answer",
    "INSTRUCTOR_INVALID_RESPONSE",
  );
  if (!answer.ok) return answer;
  if (
    value.support !== "sufficient" &&
    value.support !== "partial" &&
    value.support !== "unsupported"
  ) {
    return failure(
      "INSTRUCTOR_INVALID_RESPONSE",
      "response.support no es valido.",
    );
  }
  const claims = normalizeClaims(value.claims, citationIds);
  if (!claims.ok) return claims;
  return {
    ok: true,
    value: {
      responseId: responseId.value,
      answer: answer.value,
      support: value.support,
      claims: [...claims.value],
    },
  };
}

function normalizeScore(
  value: unknown,
): InstructorResult<InstructorEngineScoreV1> {
  if (!isRecord(value) || (value.kind !== "cp" && value.kind !== "mate")) {
    return failure(
      "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
      "El score del motor es invalido.",
    );
  }
  if (typeof value.value !== "number" || !Number.isSafeInteger(value.value)) {
    return failure(
      "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
      "score.value debe ser un entero seguro.",
    );
  }
  return { ok: true, value: { kind: value.kind, value: value.value } };
}

function normalizeEngineAnalysis(
  value: unknown,
  nodeFen: string,
): InstructorResult<InstructorEngineAnalysisV1> {
  if (!isRecord(value)) {
    return failure(
      "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
      "engineAnalysis debe ser un objeto.",
    );
  }
  const analysisId = normalizeText(
    value.analysisId,
    "engineAnalysis.analysisId",
    "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
  );
  if (!analysisId.ok) return analysisId;
  if (value.fen !== nodeFen) {
    return failure(
      "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
      "El FEN del motor debe coincidir con el nodo del turno.",
    );
  }
  const sideToMove = value.sideToMove;
  if (sideToMove !== "w" && sideToMove !== "b") {
    return failure(
      "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
      "sideToMove debe ser w o b.",
    );
  }
  const expectedSide = nodeFen.trim().split(/\s+/u)[1];
  if (expectedSide !== sideToMove) {
    return failure(
      "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
      "sideToMove no coincide con el FEN del nodo.",
    );
  }
  if (!Array.isArray(value.lines) || value.lines.length === 0) {
    return failure(
      "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
      "lines debe contener al menos una linea.",
    );
  }
  const lines: InstructorEngineLineV1[] = [];
  const multipv = new Set<number>();
  for (const [index, rawLine] of value.lines.entries()) {
    if (!isRecord(rawLine)) {
      return failure(
        "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
        `La linea ${index} del motor es invalida.`,
      );
    }
    if (
      typeof rawLine.multipv !== "number" ||
      !Number.isSafeInteger(rawLine.multipv) ||
      rawLine.multipv < 1 ||
      multipv.has(rawLine.multipv)
    ) {
      return failure(
        "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
        "multipv debe ser entero positivo y no repetirse.",
      );
    }
    multipv.add(rawLine.multipv);
    if (
      typeof rawLine.depth !== "number" ||
      !Number.isSafeInteger(rawLine.depth) ||
      rawLine.depth < 1
    ) {
      return failure(
        "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
        "depth debe ser un entero positivo.",
      );
    }
    const score = normalizeScore(rawLine.score);
    if (!score.ok) return score;
    if (!Array.isArray(rawLine.pv)) {
      return failure(
        "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
        "pv debe ser un array.",
      );
    }
    const pv: string[] = [];
    for (const move of rawLine.pv) {
      if (typeof move !== "string" || !UCI_PATTERN.test(move)) {
        return failure(
          "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
          "La PV contiene UCI invalido.",
        );
      }
      pv.push(move);
    }
    if (
      typeof rawLine.bestmove !== "string" ||
      (rawLine.bestmove !== "0000" && !UCI_PATTERN.test(rawLine.bestmove))
    ) {
      return failure(
        "INSTRUCTOR_INVALID_ENGINE_ANALYSIS",
        "bestmove no cumple el formato UCI.",
      );
    }
    lines.push({
      multipv: rawLine.multipv,
      depth: rawLine.depth,
      score: score.value,
      pv,
      bestmove: rawLine.bestmove,
    });
  }
  return {
    ok: true,
    value: {
      analysisId: analysisId.value,
      fen: nodeFen,
      sideToMove,
      lines,
    },
  };
}

function parseUci(value: string): InstructorResult<{
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}> {
  const uci = value.trim().toLowerCase();
  if (!UCI_PATTERN.test(uci)) {
    return failure(
      "INSTRUCTOR_INVALID_COUNTERPART",
      "La seleccion de contraparte no cumple UCI.",
    );
  }
  return {
    ok: true,
    value: {
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      ...(uci.length === 5
        ? { promotion: uci.slice(4) as "q" | "r" | "b" | "n" }
        : {}),
    },
  };
}

function normalizeCounterpart(
  value: unknown,
  nodeId: NodeId,
  gameDocument: GameDocumentV1,
  sourceIds: ReadonlySet<string>,
  analyses: ReadonlyMap<string, InstructorEngineAnalysisV1>,
): InstructorResult<InstructorCounterpartSelectionV1 | null> {
  if (value === null) return { ok: true, value: null };
  if (!isRecord(value)) {
    return failure(
      "INSTRUCTOR_INVALID_COUNTERPART",
      "counterpart debe ser un objeto o null.",
    );
  }
  if (value.nodeId !== nodeId || !isNonEmptyString(value.nodeId)) {
    return failure(
      "INSTRUCTOR_INVALID_COUNTERPART",
      "counterpart.nodeId debe coincidir con el nodo del turno.",
    );
  }
  if (typeof value.uci !== "string") {
    return failure(
      "INSTRUCTOR_INVALID_COUNTERPART",
      "counterpart.uci debe ser un string.",
    );
  }
  const parsed = parseUci(value.uci);
  if (!parsed.ok) return parsed;
  const normalized = normalizeMoveAt(gameDocument, nodeId, parsed.value);
  if (!normalized.ok) {
    return failure(
      "INSTRUCTOR_INVALID_COUNTERPART",
      "La jugada de contraparte no es legal en el nodo indicado.",
      { nodeId, uci: value.uci },
    );
  }
  if (value.origin === "source") {
    if (
      typeof value.sourceRefId !== "string" ||
      !sourceIds.has(value.sourceRefId)
    ) {
      return failure(
        "INSTRUCTOR_INVALID_COUNTERPART",
        "La fuente de la contraparte no existe en la sesion.",
      );
    }
    return {
      ok: true,
      value: {
        origin: "source",
        nodeId,
        uci: normalized.value.uci,
        sourceRefId: value.sourceRefId,
      },
    };
  }
  if (value.origin === "engine") {
    if (
      typeof value.analysisId !== "string" ||
      !analyses.has(value.analysisId)
    ) {
      return failure(
        "INSTRUCTOR_INVALID_COUNTERPART",
        "El analisis de motor de la contraparte no existe en el turno.",
      );
    }
    const analysis = analyses.get(value.analysisId)!;
    const appearsInAnalysis = analysis.lines.some(
      (line) =>
        line.bestmove === normalized.value.uci ||
        line.pv[0] === normalized.value.uci,
    );
    if (!appearsInAnalysis) {
      return failure(
        "INSTRUCTOR_INVALID_COUNTERPART",
        "La jugada seleccionada no pertenece al analisis de motor del turno.",
      );
    }
    return {
      ok: true,
      value: {
        origin: "engine",
        nodeId,
        uci: normalized.value.uci,
        analysisId: value.analysisId,
      },
    };
  }
  if (value.origin !== "manual") {
    return failure(
      "INSTRUCTOR_INVALID_COUNTERPART",
      "El origen de la contraparte no es valido.",
    );
  }
  return {
    ok: true,
    value: { origin: "manual", nodeId, uci: normalized.value.uci },
  };
}

function normalizeTurn(
  value: unknown,
  index: number,
  gameDocument: GameDocumentV1,
  sourceIds: ReadonlySet<string>,
  citationIds: ReadonlySet<string>,
): InstructorResult<InstructorTurnV1> {
  if (!isRecord(value)) {
    return failure(
      "INSTRUCTOR_INVALID_TURN",
      `El turno ${index} debe ser un objeto.`,
    );
  }
  const id = normalizeText(
    value.id,
    `turns[${index}].id`,
    "INSTRUCTOR_INVALID_TURN",
  );
  if (!id.ok) return id;
  const nodeId = normalizeText(
    value.nodeId,
    `turns[${index}].nodeId`,
    "INSTRUCTOR_INVALID_TURN",
  );
  if (!nodeId.ok) return nodeId;
  const node = gameDocument.nodesById[nodeId.value];
  if (node === undefined) {
    return failure(
      "INSTRUCTOR_INVALID_TURN",
      "El turno referencia un nodo inexistente.",
      {
        nodeId: nodeId.value,
      },
    );
  }
  const question = normalizeText(
    value.question,
    `turns[${index}].question`,
    "INSTRUCTOR_INVALID_TURN",
  );
  if (!question.ok) return question;
  if (!isUtcTimestamp(value.createdAt)) {
    return failure(
      "INSTRUCTOR_INVALID_TURN",
      "createdAt del turno debe ser UTC ISO-8601.",
    );
  }

  const response =
    value.response === null
      ? ({ ok: true, value: null } as const)
      : normalizeResponse(value.response, citationIds);
  if (!response.ok) {
    return failure(
      "INSTRUCTOR_INVALID_TURN",
      response.error.message,
      response.error.context,
    );
  }

  const engineAnalysis =
    value.engineAnalysis === null
      ? ({ ok: true, value: null } as const)
      : normalizeEngineAnalysis(value.engineAnalysis, node.fen);
  if (!engineAnalysis.ok) {
    return failure(
      "INSTRUCTOR_INVALID_TURN",
      engineAnalysis.error.message,
      engineAnalysis.error.context,
    );
  }
  const analyses = new Map<string, InstructorEngineAnalysisV1>();
  if (engineAnalysis.value !== null) {
    analyses.set(engineAnalysis.value.analysisId, engineAnalysis.value);
  }

  const counterpart = normalizeCounterpart(
    value.counterpart,
    nodeId.value,
    gameDocument,
    sourceIds,
    analyses,
  );
  if (!counterpart.ok) {
    return failure(
      "INSTRUCTOR_INVALID_TURN",
      counterpart.error.message,
      counterpart.error.context,
    );
  }

  return {
    ok: true,
    value: {
      id: id.value,
      nodeId: nodeId.value,
      question: question.value,
      response: response.value,
      engineAnalysis: engineAnalysis.value,
      counterpart: counterpart.value,
      createdAt: value.createdAt,
    },
  };
}

function normalizeSession(
  value: unknown,
): InstructorResult<InstructorSessionV1> {
  if (!isRecord(value)) {
    return failure(
      "INSTRUCTOR_INVALID_SESSION",
      "La sesion debe ser un objeto.",
    );
  }
  if (
    value.schemaVersion !== INSTRUCTOR_SESSION_SCHEMA_VERSION ||
    value.sessionVersion !== INSTRUCTOR_SESSION_VERSION
  ) {
    return failure(
      "INSTRUCTOR_INVALID_SESSION",
      "La version de sesion no esta soportada.",
    );
  }
  const id = normalizeText(value.id, "id", "INSTRUCTOR_INVALID_SESSION");
  if (!id.ok) return id;
  const title = normalizeText(
    value.title,
    "title",
    "INSTRUCTOR_INVALID_SESSION",
  );
  if (!title.ok) return title;
  if (!isRecord(value.gameDocument)) {
    return failure(
      "INSTRUCTOR_INVALID_SESSION",
      "gameDocument debe ser un objeto.",
    );
  }
  const gameErrors = validateGameDocument(value.gameDocument);
  if (gameErrors.length > 0) {
    return failure(
      "INSTRUCTOR_INVALID_SESSION",
      "gameDocument no cumple invariantes.",
      {
        code: gameErrors[0]?.code ?? "INVALID_DOCUMENT",
      },
    );
  }
  const gameDocument = cloneAndFreeze(value.gameDocument as GameDocumentV1);
  const activeNodeId = normalizeText(
    value.activeNodeId,
    "activeNodeId",
    "INSTRUCTOR_INVALID_SESSION",
  );
  if (!activeNodeId.ok) return activeNodeId;
  if (gameDocument.nodesById[activeNodeId.value] === undefined) {
    return failure(
      "INSTRUCTOR_INVALID_SESSION",
      "activeNodeId no existe en gameDocument.",
      {
        activeNodeId: activeNodeId.value,
      },
    );
  }
  const sources = normalizeSources(value.sourceRefs);
  if (!sources.ok) return sources;
  if (!Array.isArray(value.turns)) {
    return failure("INSTRUCTOR_INVALID_SESSION", "turns debe ser un array.");
  }
  const turns: InstructorTurnV1[] = [];
  const turnIds = new Set<string>();
  const responseIds = new Set<string>();
  for (const [index, rawTurn] of value.turns.entries()) {
    const turn = normalizeTurn(
      rawTurn,
      index,
      gameDocument,
      new Set(sources.value.refs.map((source) => source.id)),
      sources.value.citationIds,
    );
    if (!turn.ok) return turn;
    if (turnIds.has(turn.value.id)) {
      return failure(
        "INSTRUCTOR_INVALID_SESSION",
        "El ID de turno se repite.",
        {
          id: turn.value.id,
        },
      );
    }
    turnIds.add(turn.value.id);
    if (turn.value.response !== null) {
      if (responseIds.has(turn.value.response.responseId)) {
        return failure(
          "INSTRUCTOR_INVALID_SESSION",
          "El ID de respuesta se repite.",
          { responseId: turn.value.response.responseId },
        );
      }
      responseIds.add(turn.value.response.responseId);
    }
    turns.push(turn.value);
  }
  if (!Array.isArray(value.derivedExerciseIds)) {
    return failure(
      "INSTRUCTOR_INVALID_SESSION",
      "derivedExerciseIds debe ser un array.",
    );
  }
  const derivedExerciseIds: string[] = [];
  for (const rawExerciseId of value.derivedExerciseIds) {
    const exerciseId = normalizeText(
      rawExerciseId,
      "derivedExerciseIds",
      "INSTRUCTOR_INVALID_SESSION",
    );
    if (!exerciseId.ok) return exerciseId;
    if (derivedExerciseIds.includes(exerciseId.value)) {
      return failure(
        "INSTRUCTOR_INVALID_SESSION",
        "derivedExerciseIds no puede repetir IDs.",
        { id: exerciseId.value },
      );
    }
    derivedExerciseIds.push(exerciseId.value);
  }
  if (
    typeof value.revision !== "number" ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0
  ) {
    return failure(
      "INSTRUCTOR_INVALID_SESSION",
      "revision debe ser un entero no negativo.",
    );
  }
  if (!isUtcTimestamp(value.createdAt) || !isUtcTimestamp(value.updatedAt)) {
    return failure(
      "INSTRUCTOR_INVALID_SESSION",
      "createdAt y updatedAt deben ser UTC ISO-8601.",
    );
  }
  return {
    ok: true,
    value: cloneAndFreeze({
      schemaVersion: INSTRUCTOR_SESSION_SCHEMA_VERSION,
      sessionVersion: INSTRUCTOR_SESSION_VERSION,
      id: id.value,
      title: title.value,
      gameDocument,
      activeNodeId: activeNodeId.value,
      sourceRefs: sources.value.refs,
      turns,
      derivedExerciseIds,
      revision: value.revision,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    }),
  };
}

export function validateInstructorSession(
  value: unknown,
): InstructorResult<InstructorSessionV1> {
  return normalizeSession(value);
}

export function createInstructorSession(
  input: CreateInstructorSessionInput,
): InstructorResult<InstructorSessionV1> {
  return normalizeSession({
    ...input,
    schemaVersion: INSTRUCTOR_SESSION_SCHEMA_VERSION,
    sessionVersion: INSTRUCTOR_SESSION_VERSION,
    activeNodeId: input.activeNodeId ?? input.gameDocument.cursorNodeId,
    sourceRefs: input.sourceRefs ?? [],
    turns: input.turns ?? [],
    derivedExerciseIds: input.derivedExerciseIds ?? [],
    revision: input.revision ?? 0,
  });
}

export class InstructorSessionValidationError extends Error {
  readonly name = "InstructorSessionValidationError";

  constructor(readonly error: InstructorError) {
    super(`${error.code}: ${error.message}`);
  }
}

export function assertInstructorSession(
  value: unknown,
): asserts value is InstructorSessionV1 {
  const result = validateInstructorSession(value);
  if (!result.ok) throw new InstructorSessionValidationError(result.error);
}
