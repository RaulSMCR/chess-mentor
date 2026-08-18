export const AUTHOR_THEORY_SCHEMA_VERSION = 1 as const;
export const AUTHOR_THEORY_VERSION = "author-theory-v1" as const;

const AUTHOR_THEORY_CLAIM_TYPES = [
  "direct_quote",
  "paraphrase",
  "inference",
  "ai_synthesis",
  "unsupported",
] as const;

const KNOWN_CLAIM_TYPES = [
  ...AUTHOR_THEORY_CLAIM_TYPES,
  "engine",
  "user_hypothesis",
] as const;

const REVIEW_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "corrected",
] as const;

const FINAL_REVIEW_STATUSES = ["approved", "rejected", "corrected"] as const;

export type AuthorTheoryClaimType = (typeof AUTHOR_THEORY_CLAIM_TYPES)[number];
type KnownAuthorTheoryClaimType = (typeof KNOWN_CLAIM_TYPES)[number];
export type AuthorTheoryReviewStatus = (typeof REVIEW_STATUSES)[number];
export type FinalAuthorTheoryReviewStatus =
  (typeof FINAL_REVIEW_STATUSES)[number];

export type PendingAuthorTheoryReview = Readonly<{
  status: "pending";
}>;

export type DecidedAuthorTheoryReview = Readonly<{
  status: "approved" | "rejected";
  reviewerId: string;
  reviewedAt: string;
  reason: string;
}>;

export type CorrectedAuthorTheoryReview = Readonly<{
  status: "corrected";
  reviewerId: string;
  reviewedAt: string;
  reason: string;
  correctedText: string;
}>;

export type AuthorTheoryReviewV1 =
  | PendingAuthorTheoryReview
  | DecidedAuthorTheoryReview
  | CorrectedAuthorTheoryReview;

export type AuthorTheoryReviewDecisionInput =
  | Readonly<{
      status: "approved" | "rejected";
      reviewerId: string;
      reviewedAt: string;
      reason: string;
    }>
  | Readonly<{
      status: "corrected";
      reviewerId: string;
      reviewedAt: string;
      reason: string;
      correctedText: string;
    }>;

export type AuthorTheoryReviewEventV1 = Readonly<{
  from: AuthorTheoryReviewStatus;
  to: FinalAuthorTheoryReviewStatus;
  reviewerId: string;
  reviewedAt: string;
  reason: string;
  correctedText?: string;
}>;

export type AuthorTheoryRecordV1 = Readonly<{
  schemaVersion: typeof AUTHOR_THEORY_SCHEMA_VERSION;
  recordVersion: typeof AUTHOR_THEORY_VERSION;
  id: string;
  authorId: string;
  authorName: string;
  conceptId: string;
  conceptLabel: string;
  statement: string;
  claimType: AuthorTheoryClaimType;
  citationIds: readonly string[];
  review: AuthorTheoryReviewV1;
  reviewHistory: readonly AuthorTheoryReviewEventV1[];
}>;

export type CreateAuthorTheoryRecordInput = Readonly<{
  id: string;
  authorId: string;
  authorName: string;
  conceptId: string;
  conceptLabel: string;
  statement: string;
  claimType: AuthorTheoryClaimType;
  citationIds: readonly string[];
}>;

export type AuthorTheoryErrorCode =
  | "AUTHOR_THEORY_INVALID_RECORD"
  | "AUTHOR_THEORY_INVALID_CLAIM_TYPE"
  | "AUTHOR_THEORY_INVALID_CITATION_REFERENCE"
  | "AUTHOR_THEORY_INVALID_REVIEW"
  | "AUTHOR_THEORY_DISALLOWED_CLAIM_TYPE";

export type AuthorTheoryError = Readonly<{
  code: AuthorTheoryErrorCode;
  message: string;
  context?: Readonly<Record<string, string | number>>;
}>;

export type AuthorTheoryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: AuthorTheoryError }>;

type NormalizedHistory = Readonly<{
  events: readonly AuthorTheoryReviewEventV1[];
  status: AuthorTheoryReviewStatus;
}>;

const UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;

function failure<T>(
  code: AuthorTheoryErrorCode,
  message: string,
  context?: Readonly<Record<string, string | number>>,
): AuthorTheoryResult<T> {
  return context === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, context } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKnownClaimType(value: unknown): value is KnownAuthorTheoryClaimType {
  return (
    typeof value === "string" &&
    (KNOWN_CLAIM_TYPES as readonly string[]).includes(value)
  );
}

function isReviewStatus(value: unknown): value is AuthorTheoryReviewStatus {
  return (
    typeof value === "string" &&
    (REVIEW_STATUSES as readonly string[]).includes(value)
  );
}

function isFinalReviewStatus(
  value: unknown,
): value is FinalAuthorTheoryReviewStatus {
  return (
    typeof value === "string" &&
    (FINAL_REVIEW_STATUSES as readonly string[]).includes(value)
  );
}

function normalizeRequiredText(
  value: unknown,
  field: string,
  code: AuthorTheoryErrorCode = "AUTHOR_THEORY_INVALID_RECORD",
): AuthorTheoryResult<string> {
  if (typeof value !== "string" || value.trim() === "") {
    return failure(code, `${field} debe ser un texto no vacio.`);
  }
  return { ok: true, value: value.trim() };
}

function isUtcTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !UTC_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  return new Date(parsed).toISOString().slice(0, 19) === value.slice(0, 19);
}

function normalizeCitationIds(
  value: unknown,
): AuthorTheoryResult<readonly string[]> {
  if (!Array.isArray(value)) {
    return failure(
      "AUTHOR_THEORY_INVALID_CITATION_REFERENCE",
      "citationIds debe ser un array.",
    );
  }

  const citationIds: string[] = [];
  for (const [index, rawCitationId] of value.entries()) {
    const citationId = normalizeRequiredText(
      rawCitationId,
      `citationIds[${index}]`,
      "AUTHOR_THEORY_INVALID_CITATION_REFERENCE",
    );
    if (!citationId.ok) return citationId;
    if (citationIds.includes(citationId.value)) {
      return failure(
        "AUTHOR_THEORY_INVALID_CITATION_REFERENCE",
        "citationIds no puede repetir una referencia.",
        { citationId: citationId.value },
      );
    }
    citationIds.push(citationId.value);
  }
  return { ok: true, value: citationIds };
}

function normalizeReviewDecision(
  value: unknown,
): AuthorTheoryResult<AuthorTheoryReviewV1> {
  if (!isRecord(value) || !isReviewStatus(value.status)) {
    return failure(
      "AUTHOR_THEORY_INVALID_REVIEW",
      "La revision debe tener un estado soportado.",
    );
  }
  if (value.status === "pending") {
    return { ok: true, value: { status: "pending" } };
  }

  if (!isFinalReviewStatus(value.status)) {
    return failure(
      "AUTHOR_THEORY_INVALID_REVIEW",
      "El estado de revision no es finalizable.",
    );
  }

  const reviewerId = normalizeRequiredText(value.reviewerId, "reviewerId");
  if (!reviewerId.ok)
    return failure("AUTHOR_THEORY_INVALID_REVIEW", reviewerId.error.message);

  if (!isUtcTimestamp(value.reviewedAt)) {
    return failure(
      "AUTHOR_THEORY_INVALID_REVIEW",
      "reviewedAt debe ser un timestamp UTC ISO-8601 valido.",
    );
  }

  const reason = normalizeRequiredText(value.reason, "reason");
  if (!reason.ok)
    return failure("AUTHOR_THEORY_INVALID_REVIEW", reason.error.message);

  if (value.status === "corrected") {
    const correctedText = normalizeRequiredText(
      value.correctedText,
      "correctedText",
    );
    if (!correctedText.ok) {
      return failure(
        "AUTHOR_THEORY_INVALID_REVIEW",
        correctedText.error.message,
      );
    }
    return {
      ok: true,
      value: {
        status: "corrected",
        reviewerId: reviewerId.value,
        reviewedAt: value.reviewedAt,
        reason: reason.value,
        correctedText: correctedText.value,
      },
    };
  }

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

function normalizeReviewEvent(
  value: unknown,
): AuthorTheoryResult<AuthorTheoryReviewEventV1> {
  if (!isRecord(value) || !isReviewStatus(value.from)) {
    return failure(
      "AUTHOR_THEORY_INVALID_REVIEW",
      "El evento de revision debe indicar un estado previo valido.",
    );
  }
  const decision = normalizeReviewDecision({ ...value, status: value.to });
  if (!decision.ok || decision.value.status === "pending") {
    return failure(
      "AUTHOR_THEORY_INVALID_REVIEW",
      "El evento de revision debe llevar a un estado final.",
    );
  }
  return {
    ok: true,
    value: {
      from: value.from,
      to: decision.value.status,
      reviewerId: decision.value.reviewerId,
      reviewedAt: decision.value.reviewedAt,
      reason: decision.value.reason,
      ...(decision.value.status === "corrected"
        ? { correctedText: decision.value.correctedText }
        : {}),
    },
  };
}

function normalizeReviewHistory(
  value: unknown,
): AuthorTheoryResult<NormalizedHistory> {
  if (!Array.isArray(value)) {
    return failure(
      "AUTHOR_THEORY_INVALID_REVIEW",
      "reviewHistory debe ser un array.",
    );
  }

  const events: AuthorTheoryReviewEventV1[] = [];
  let status: AuthorTheoryReviewStatus = "pending";
  for (const [index, rawEvent] of value.entries()) {
    const event = normalizeReviewEvent(rawEvent);
    if (!event.ok) {
      return failure(
        "AUTHOR_THEORY_INVALID_REVIEW",
        `El evento de revision ${index} es invalido.`,
      );
    }
    if (event.value.from !== status) {
      return failure(
        "AUTHOR_THEORY_INVALID_REVIEW",
        `El evento de revision ${index} no encadena con el estado anterior.`,
      );
    }
    events.push(event.value);
    status = event.value.to;
  }
  return { ok: true, value: { events, status } };
}

function normalizeRecord(
  value: unknown,
): AuthorTheoryResult<AuthorTheoryRecordV1> {
  if (!isRecord(value)) {
    return failure(
      "AUTHOR_THEORY_INVALID_RECORD",
      "El registro de autor y teoria debe ser un objeto.",
    );
  }
  if (value.schemaVersion !== AUTHOR_THEORY_SCHEMA_VERSION) {
    return failure(
      "AUTHOR_THEORY_INVALID_RECORD",
      "schemaVersion de autor y teoria no soportada.",
    );
  }
  if (value.recordVersion !== AUTHOR_THEORY_VERSION) {
    return failure(
      "AUTHOR_THEORY_INVALID_RECORD",
      "recordVersion de autor y teoria no soportada.",
    );
  }

  const textFields = [
    ["id", value.id],
    ["authorId", value.authorId],
    ["authorName", value.authorName],
    ["conceptId", value.conceptId],
    ["conceptLabel", value.conceptLabel],
    ["statement", value.statement],
  ] as const;
  const normalizedFields: string[] = [];
  for (const [field, rawValue] of textFields) {
    const normalized = normalizeRequiredText(rawValue, field);
    if (!normalized.ok) return normalized;
    normalizedFields.push(normalized.value);
  }

  if (!isKnownClaimType(value.claimType)) {
    return failure(
      "AUTHOR_THEORY_INVALID_CLAIM_TYPE",
      "claimType no es un tipo bibliografico soportado.",
    );
  }
  if (value.claimType === "engine" || value.claimType === "user_hypothesis") {
    return failure(
      "AUTHOR_THEORY_DISALLOWED_CLAIM_TYPE",
      "engine y user_hypothesis no pueden atribuirse a un autor.",
    );
  }

  const citationIds = normalizeCitationIds(value.citationIds);
  if (!citationIds.ok) return citationIds;
  if (value.claimType !== "unsupported" && citationIds.value.length === 0) {
    return failure(
      "AUTHOR_THEORY_INVALID_CITATION_REFERENCE",
      "Una postura bibliografica requiere al menos una cita.",
    );
  }

  const review = normalizeReviewDecision(value.review);
  if (!review.ok) return review;
  const history = normalizeReviewHistory(value.reviewHistory);
  if (!history.ok) return history;
  if (history.value.status !== review.value.status) {
    return failure(
      "AUTHOR_THEORY_INVALID_REVIEW",
      "review no coincide con el ultimo evento de reviewHistory.",
    );
  }

  return {
    ok: true,
    value: {
      schemaVersion: AUTHOR_THEORY_SCHEMA_VERSION,
      recordVersion: AUTHOR_THEORY_VERSION,
      id: normalizedFields[0],
      authorId: normalizedFields[1],
      authorName: normalizedFields[2],
      conceptId: normalizedFields[3],
      conceptLabel: normalizedFields[4],
      statement: normalizedFields[5],
      claimType: value.claimType,
      citationIds: [...citationIds.value],
      review: review.value,
      reviewHistory: history.value.events.map((event) => ({ ...event })),
    },
  };
}

export function validateAuthorTheoryRecord(
  value: unknown,
): AuthorTheoryResult<AuthorTheoryRecordV1> {
  return normalizeRecord(value);
}

export function createAuthorTheoryRecord(
  input: CreateAuthorTheoryRecordInput,
): AuthorTheoryResult<AuthorTheoryRecordV1> {
  return normalizeRecord({
    ...input,
    schemaVersion: AUTHOR_THEORY_SCHEMA_VERSION,
    recordVersion: AUTHOR_THEORY_VERSION,
    review: { status: "pending" },
    reviewHistory: [],
  });
}

export function applyAuthorTheoryReview(
  record: AuthorTheoryRecordV1,
  decision: AuthorTheoryReviewDecisionInput,
): AuthorTheoryResult<AuthorTheoryRecordV1> {
  const current = validateAuthorTheoryRecord(record);
  if (!current.ok) return current;

  const nextReview = normalizeReviewDecision(decision);
  if (!nextReview.ok || nextReview.value.status === "pending") {
    return failure(
      "AUTHOR_THEORY_INVALID_REVIEW",
      "La decision debe llevar a un estado final.",
    );
  }

  const event: AuthorTheoryReviewEventV1 = {
    from: current.value.review.status,
    to: nextReview.value.status,
    reviewerId: nextReview.value.reviewerId,
    reviewedAt: nextReview.value.reviewedAt,
    reason: nextReview.value.reason,
    ...(nextReview.value.status === "corrected"
      ? { correctedText: nextReview.value.correctedText }
      : {}),
  };

  return validateAuthorTheoryRecord({
    ...current.value,
    review: nextReview.value,
    reviewHistory: [...current.value.reviewHistory, event],
  });
}
