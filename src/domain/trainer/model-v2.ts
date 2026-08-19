import {
  DEFAULT_TRAINER_TIME_LIMIT_MS,
  isLegalTrainerUci,
  normalizeTrainerUci,
  type ExerciseHints,
  type ExerciseV1,
  type TrainerDifficulty,
  type TrainerErrorCode,
  validateExercise,
} from "./model";

export const EXERCISE_V2_SCHEMA_VERSION = 2 as const;
export const EXERCISE_V2_VERSION = "exercise-v2" as const;

const EXERCISE_ORIGINS = [
  "manual",
  "library",
  "exercise_repository",
  "author_theory",
  "instructor_session",
  "legacy_manual",
] as const;

const SOURCE_KINDS = [
  "library",
  "exercise_repository",
  "author_theory",
  "manual",
] as const;

const COUNTERPART_ORIGINS = ["source", "engine", "manual"] as const;
const REVIEW_STATUSES = ["draft", "approved", "rejected"] as const;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export type ExerciseOriginV2 = (typeof EXERCISE_ORIGINS)[number];
export type ExerciseSourceKindV2 = (typeof SOURCE_KINDS)[number];
export type ExerciseCounterpartOriginV2 = (typeof COUNTERPART_ORIGINS)[number];
export type ExerciseReviewStatusV2 = (typeof REVIEW_STATUSES)[number];

export type ExerciseSourceRefV2 = Readonly<{
  id: string;
  kind: ExerciseSourceKindV2;
  title: string;
  citationIds: readonly string[];
}>;

type ExerciseCounterpartBaseV2 = Readonly<{
  id: string;
  nodeId: string;
  uci: string;
}>;

export type ExerciseCounterpartReplyV2 =
  | (ExerciseCounterpartBaseV2 &
      Readonly<{
        origin: "source";
        sourceRefId: string;
      }>)
  | (ExerciseCounterpartBaseV2 &
      Readonly<{
        origin: "engine";
        analysisId: string;
      }>)
  | (ExerciseCounterpartBaseV2 &
      Readonly<{
        origin: "manual";
      }>);

export type ExerciseDraftReviewV2 = Readonly<{
  status: "draft";
}>;

export type ExerciseDecidedReviewV2 = Readonly<{
  status: "approved" | "rejected";
  reviewerId: string;
  reviewedAt: string;
  reason: string;
}>;

export type ExerciseReviewV2 = ExerciseDraftReviewV2 | ExerciseDecidedReviewV2;

export type ExerciseV2 = Readonly<{
  schemaVersion: typeof EXERCISE_V2_SCHEMA_VERSION;
  exerciseVersion: typeof EXERCISE_V2_VERSION;
  id: ExerciseV1["id"];
  title: ExerciseV1["title"];
  fen: ExerciseV1["fen"];
  acceptedMoves: ExerciseV1["acceptedMoves"];
  hints: ExerciseHints;
  difficulty: TrainerDifficulty;
  timeLimitMs: ExerciseV1["timeLimitMs"];
  origin: ExerciseOriginV2;
  originRefId: string | null;
  originNodeId: string | null;
  sourceRefs: readonly ExerciseSourceRefV2[];
  counterpartReplies: readonly ExerciseCounterpartReplyV2[];
  review: ExerciseReviewV2;
}>;

export type CreateExerciseV2Input = Readonly<{
  id: string;
  title: string;
  fen: string;
  acceptedMoves: readonly string[];
  hints: ExerciseHints;
  difficulty: TrainerDifficulty;
  timeLimitMs?: number | null;
  origin: ExerciseOriginV2;
  originRefId?: string | null;
  originNodeId?: string | null;
  sourceRefs?: readonly ExerciseSourceRefV2[];
  counterpartReplies?: readonly ExerciseCounterpartReplyV2[];
  review?: ExerciseDraftReviewV2;
}>;

export type ExerciseV2ErrorCode =
  | TrainerErrorCode
  | "INVALID_EXERCISE_V2"
  | "INVALID_EXERCISE_ORIGIN"
  | "INVALID_EXERCISE_SOURCE"
  | "INVALID_EXERCISE_COUNTERPART"
  | "INVALID_EXERCISE_REVIEW"
  | "INVALID_LEGACY_EXERCISE";

export type ExerciseV2Error = Readonly<{
  code: ExerciseV2ErrorCode;
  message: string;
  context?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type ExerciseV2Result<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: ExerciseV2Error }>;

type RecordLike = Record<string, unknown>;

type NormalizedSources = Readonly<{
  refs: readonly ExerciseSourceRefV2[];
  ids: ReadonlySet<string>;
}>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOrigin(value: unknown): value is ExerciseOriginV2 {
  return (
    typeof value === "string" &&
    (EXERCISE_ORIGINS as readonly string[]).includes(value)
  );
}

function isSourceKind(value: unknown): value is ExerciseSourceKindV2 {
  return (
    typeof value === "string" &&
    (SOURCE_KINDS as readonly string[]).includes(value)
  );
}

function isReviewStatus(value: unknown): value is ExerciseReviewStatusV2 {
  return (
    typeof value === "string" &&
    (REVIEW_STATUSES as readonly string[]).includes(value)
  );
}

function isUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    UTC_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function failure<T>(
  code: ExerciseV2ErrorCode,
  message: string,
  context?: Readonly<Record<string, string | number | boolean | null>>,
): ExerciseV2Result<T> {
  return context === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, context } };
}

function normalizeText(
  value: unknown,
  field: string,
  code: ExerciseV2ErrorCode,
): ExerciseV2Result<string> {
  return isNonEmptyString(value)
    ? { ok: true, value: value.trim() }
    : failure(code, `${field} debe ser un texto no vacio.`, { field });
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

function normalizeCitationIds(
  value: unknown,
  index: number,
): ExerciseV2Result<readonly string[]> {
  if (!Array.isArray(value)) {
    return failure(
      "INVALID_EXERCISE_SOURCE",
      "citationIds debe ser un array.",
      { index },
    );
  }
  const citationIds: string[] = [];
  for (const [citationIndex, rawCitationId] of value.entries()) {
    const citationId = normalizeText(
      rawCitationId,
      `sourceRefs[${index}].citationIds[${citationIndex}]`,
      "INVALID_EXERCISE_SOURCE",
    );
    if (!citationId.ok) return citationId;
    if (citationIds.includes(citationId.value)) {
      return failure(
        "INVALID_EXERCISE_SOURCE",
        "Una fuente no puede repetir citas.",
        { citationId: citationId.value },
      );
    }
    citationIds.push(citationId.value);
  }
  return { ok: true, value: citationIds };
}

function normalizeSources(value: unknown): ExerciseV2Result<NormalizedSources> {
  if (!Array.isArray(value)) {
    return failure("INVALID_EXERCISE_SOURCE", "sourceRefs debe ser un array.");
  }

  const refs: ExerciseSourceRefV2[] = [];
  const sourceIds = new Set<string>();
  const citationIds = new Set<string>();
  for (const [index, rawSource] of value.entries()) {
    if (!isRecord(rawSource)) {
      return failure(
        "INVALID_EXERCISE_SOURCE",
        `La fuente ${index} debe ser un objeto.`,
      );
    }
    const id = normalizeText(
      rawSource.id,
      `sourceRefs[${index}].id`,
      "INVALID_EXERCISE_SOURCE",
    );
    if (!id.ok) return id;
    if (sourceIds.has(id.value)) {
      return failure("INVALID_EXERCISE_SOURCE", "El ID de fuente se repite.", {
        id: id.value,
      });
    }
    sourceIds.add(id.value);

    const title = normalizeText(
      rawSource.title,
      `sourceRefs[${index}].title`,
      "INVALID_EXERCISE_SOURCE",
    );
    if (!title.ok) return title;
    if (!isSourceKind(rawSource.kind)) {
      return failure(
        "INVALID_EXERCISE_SOURCE",
        "El tipo de fuente no esta soportado.",
        { index },
      );
    }
    const citations = normalizeCitationIds(rawSource.citationIds, index);
    if (!citations.ok) return citations;
    if (rawSource.kind === "author_theory" && citations.value.length === 0) {
      return failure(
        "INVALID_EXERCISE_SOURCE",
        "Una fuente de autor requiere al menos una cita.",
        { id: id.value },
      );
    }
    for (const citationId of citations.value) {
      if (citationIds.has(citationId)) {
        return failure(
          "INVALID_EXERCISE_SOURCE",
          "Una cita no puede pertenecer a varias fuentes.",
          { citationId },
        );
      }
      citationIds.add(citationId);
    }
    refs.push({
      id: id.value,
      kind: rawSource.kind,
      title: title.value,
      citationIds: [...citations.value],
    });
  }
  return { ok: true, value: { refs, ids: sourceIds } };
}

function normalizeCounterpartReplies(
  value: unknown,
  fen: string,
  sourceIds: ReadonlySet<string>,
): ExerciseV2Result<readonly ExerciseCounterpartReplyV2[]> {
  if (!Array.isArray(value)) {
    return failure(
      "INVALID_EXERCISE_COUNTERPART",
      "counterpartReplies debe ser un array.",
    );
  }

  const replies: ExerciseCounterpartReplyV2[] = [];
  const replyIds = new Set<string>();
  for (const [index, rawReply] of value.entries()) {
    if (!isRecord(rawReply)) {
      return failure(
        "INVALID_EXERCISE_COUNTERPART",
        `La respuesta de contraparte ${index} debe ser un objeto.`,
      );
    }
    const id = normalizeText(
      rawReply.id,
      `counterpartReplies[${index}].id`,
      "INVALID_EXERCISE_COUNTERPART",
    );
    if (!id.ok) return id;
    if (replyIds.has(id.value)) {
      return failure(
        "INVALID_EXERCISE_COUNTERPART",
        "El ID de respuesta de contraparte se repite.",
        { id: id.value },
      );
    }
    replyIds.add(id.value);

    const nodeId = normalizeText(
      rawReply.nodeId,
      `counterpartReplies[${index}].nodeId`,
      "INVALID_EXERCISE_COUNTERPART",
    );
    if (!nodeId.ok) return nodeId;
    if (typeof rawReply.uci !== "string") {
      return failure(
        "INVALID_EXERCISE_COUNTERPART",
        "La respuesta de contraparte debe incluir UCI.",
        { index },
      );
    }
    const uci = normalizeTrainerUci(rawReply.uci);
    if (uci === null || !isLegalTrainerUci(fen, uci)) {
      return failure(
        "INVALID_EXERCISE_COUNTERPART",
        "La respuesta de contraparte debe ser UCI legal para el FEN.",
        { index, uci: rawReply.uci },
      );
    }
    if (!COUNTERPART_ORIGINS.includes(rawReply.origin as never)) {
      return failure(
        "INVALID_EXERCISE_COUNTERPART",
        "El origen de la contraparte no es valido.",
        { index },
      );
    }

    if (rawReply.origin === "source") {
      const sourceRefId = normalizeText(
        rawReply.sourceRefId,
        `counterpartReplies[${index}].sourceRefId`,
        "INVALID_EXERCISE_COUNTERPART",
      );
      if (!sourceRefId.ok) return sourceRefId;
      if (!sourceIds.has(sourceRefId.value)) {
        return failure(
          "INVALID_EXERCISE_COUNTERPART",
          "La respuesta de fuente referencia una fuente inexistente.",
          { sourceRefId: sourceRefId.value },
        );
      }
      replies.push({
        id: id.value,
        nodeId: nodeId.value,
        uci,
        origin: "source",
        sourceRefId: sourceRefId.value,
      });
    } else if (rawReply.origin === "engine") {
      const analysisId = normalizeText(
        rawReply.analysisId,
        `counterpartReplies[${index}].analysisId`,
        "INVALID_EXERCISE_COUNTERPART",
      );
      if (!analysisId.ok) return analysisId;
      replies.push({
        id: id.value,
        nodeId: nodeId.value,
        uci,
        origin: "engine",
        analysisId: analysisId.value,
      });
    } else {
      replies.push({
        id: id.value,
        nodeId: nodeId.value,
        uci,
        origin: "manual",
      });
    }
  }
  return { ok: true, value: replies };
}

function normalizeReview(value: unknown): ExerciseV2Result<ExerciseReviewV2> {
  if (!isRecord(value)) {
    return failure("INVALID_EXERCISE_REVIEW", "review debe ser un objeto.");
  }
  if (!isReviewStatus(value.status)) {
    return failure(
      "INVALID_EXERCISE_REVIEW",
      "review.status debe ser draft, approved o rejected.",
    );
  }
  if (value.status === "draft") return { ok: true, value: { status: "draft" } };
  const reviewerId = normalizeText(
    value.reviewerId,
    "review.reviewerId",
    "INVALID_EXERCISE_REVIEW",
  );
  if (!reviewerId.ok) return reviewerId;
  if (!isUtcTimestamp(value.reviewedAt)) {
    return failure(
      "INVALID_EXERCISE_REVIEW",
      "review.reviewedAt debe ser un timestamp UTC ISO-8601 valido.",
    );
  }
  const reason = normalizeText(
    value.reason,
    "review.reason",
    "INVALID_EXERCISE_REVIEW",
  );
  if (!reason.ok) return reason;
  return {
    ok: true,
    value: {
      status: value.status,
      reviewerId: reviewerId.value,
      reviewedAt: value.reviewedAt,
      reason: reason.value,
    },
  };
}

function validateOrigin(
  origin: ExerciseOriginV2,
  originRefId: string | null,
  originNodeId: string | null,
  sourceRefs: readonly ExerciseSourceRefV2[],
): ExerciseV2Result<null> {
  if (origin === "legacy_manual") {
    if (
      originRefId !== null ||
      originNodeId !== null ||
      sourceRefs.length > 0
    ) {
      return failure(
        "INVALID_EXERCISE_ORIGIN",
        "legacy_manual no puede inventar referencias de procedencia.",
      );
    }
    return { ok: true, value: null };
  }
  if (origin === "manual") {
    if (originRefId !== null || originNodeId !== null) {
      return failure(
        "INVALID_EXERCISE_ORIGIN",
        "Un ejercicio manual no puede declarar un origen externo.",
      );
    }
    return { ok: true, value: null };
  }
  if (originRefId === null) {
    return failure(
      "INVALID_EXERCISE_ORIGIN",
      "Un ejercicio de fuente debe conservar originRefId.",
    );
  }
  if (
    (origin === "library" ||
      origin === "exercise_repository" ||
      origin === "author_theory") &&
    sourceRefs.length === 0
  ) {
    return failure(
      "INVALID_EXERCISE_ORIGIN",
      "Un ejercicio de fuente debe conservar al menos una referencia.",
    );
  }
  if (origin === "instructor_session" && originNodeId === null) {
    return failure(
      "INVALID_EXERCISE_ORIGIN",
      "Un ejercicio de sesion debe conservar originNodeId.",
    );
  }
  return { ok: true, value: null };
}

function baseExerciseCandidate(candidate: RecordLike): RecordLike {
  return {
    schemaVersion: 1,
    id: candidate.id,
    title: candidate.title,
    fen: candidate.fen,
    acceptedMoves: candidate.acceptedMoves,
    hints: candidate.hints,
    difficulty: candidate.difficulty,
    timeLimitMs: candidate.timeLimitMs,
  };
}

export function validateExerciseV2(
  value: unknown,
): ExerciseV2Result<ExerciseV2> {
  if (!isRecord(value)) {
    return failure(
      "INVALID_EXERCISE_V2",
      "El ejercicio V2 debe ser un objeto.",
    );
  }
  if (
    value.schemaVersion !== EXERCISE_V2_SCHEMA_VERSION ||
    value.exerciseVersion !== EXERCISE_V2_VERSION
  ) {
    return failure(
      "INVALID_EXERCISE_V2",
      "La version del ejercicio V2 no es soportada.",
    );
  }

  const base = validateExercise(baseExerciseCandidate(value));
  if (!base.ok) {
    return failure(base.error.code, base.error.message, base.error.context);
  }
  if (!isOrigin(value.origin)) {
    return failure("INVALID_EXERCISE_ORIGIN", "origin no es un valor valido.");
  }

  const sourceRefs = normalizeSources(value.sourceRefs);
  if (!sourceRefs.ok) return sourceRefs;

  const originRefId =
    value.originRefId === null || value.originRefId === undefined
      ? null
      : normalizeText(
          value.originRefId,
          "originRefId",
          "INVALID_EXERCISE_ORIGIN",
        );
  if (originRefId !== null && !originRefId.ok) return originRefId;
  const normalizedOriginRefId = originRefId === null ? null : originRefId.value;

  const originNodeId =
    value.originNodeId === null || value.originNodeId === undefined
      ? null
      : normalizeText(
          value.originNodeId,
          "originNodeId",
          "INVALID_EXERCISE_ORIGIN",
        );
  if (originNodeId !== null && !originNodeId.ok) return originNodeId;
  const normalizedOriginNodeId =
    originNodeId === null ? null : originNodeId.value;

  const origin = validateOrigin(
    value.origin,
    normalizedOriginRefId,
    normalizedOriginNodeId,
    sourceRefs.value.refs,
  );
  if (!origin.ok) return origin;

  const counterpartReplies = normalizeCounterpartReplies(
    value.counterpartReplies,
    base.value.fen,
    sourceRefs.value.ids,
  );
  if (!counterpartReplies.ok) return counterpartReplies;

  const review = normalizeReview(value.review);
  if (!review.ok) return review;

  return {
    ok: true,
    value: cloneAndFreeze({
      ...base.value,
      schemaVersion: EXERCISE_V2_SCHEMA_VERSION,
      exerciseVersion: EXERCISE_V2_VERSION,
      origin: value.origin,
      originRefId: normalizedOriginRefId,
      originNodeId: normalizedOriginNodeId,
      sourceRefs: sourceRefs.value.refs,
      counterpartReplies: counterpartReplies.value,
      review: review.value,
    }),
  };
}

export function createExerciseV2(
  input: CreateExerciseV2Input,
): ExerciseV2Result<ExerciseV2> {
  if (input.review !== undefined && input.review.status !== "draft") {
    return failure(
      "INVALID_EXERCISE_REVIEW",
      "La creacion de un ejercicio V2 siempre produce un borrador.",
    );
  }
  return validateExerciseV2({
    ...input,
    schemaVersion: EXERCISE_V2_SCHEMA_VERSION,
    exerciseVersion: EXERCISE_V2_VERSION,
    timeLimitMs:
      input.timeLimitMs === undefined
        ? DEFAULT_TRAINER_TIME_LIMIT_MS
        : input.timeLimitMs,
    originRefId: input.originRefId ?? null,
    originNodeId: input.originNodeId ?? null,
    sourceRefs: input.sourceRefs ?? [],
    counterpartReplies: input.counterpartReplies ?? [],
    review: input.review ?? { status: "draft" },
  });
}

export function migrateExerciseV1(
  value: unknown,
): ExerciseV2Result<ExerciseV2> {
  const legacy = validateExercise(value);
  if (!legacy.ok) {
    return failure(
      "INVALID_LEGACY_EXERCISE",
      "No se puede migrar un ejercicio V1 invalido.",
      { legacyCode: legacy.error.code },
    );
  }
  return validateExerciseV2({
    ...legacy.value,
    schemaVersion: EXERCISE_V2_SCHEMA_VERSION,
    exerciseVersion: EXERCISE_V2_VERSION,
    origin: "legacy_manual",
    originRefId: null,
    originNodeId: null,
    sourceRefs: [],
    counterpartReplies: [],
    review: { status: "draft" },
  });
}

export function isPracticeEligibleExerciseV2(exercise: ExerciseV2): boolean {
  return exercise.review.status === "approved";
}

export const isExerciseV2PracticeEligible = isPracticeEligibleExerciseV2;
