import { Chess } from "chess.js";

import {
  validateAuthorTheoryCatalog,
  type AuthorProfileV1,
  type AuthorTheoryCatalogV1,
  type TheoryConceptV1,
} from "@/domain/author-theory/catalog";
import {
  AUTHOR_THEORY_SCHEMA_VERSION,
  AUTHOR_THEORY_VERSION,
  validateAuthorTheoryRecord,
  type AuthorTheoryClaimType,
  type AuthorTheoryRecordV1,
} from "@/domain/author-theory/model";

export const AUTHOR_EXERCISE_CANDIDATE_SCHEMA_VERSION = 1 as const;
export const AUTHOR_EXERCISE_CANDIDATE_VERSION =
  "author-exercise-candidate-v1" as const;

export type AuthorExerciseEvidenceLocatorV1 = Readonly<
  Record<string, string | number>
>;

export type AuthorExerciseEvidenceV1 = Readonly<{
  citationId: string;
  sourceId: string;
  sourceSha256: string;
  locator: AuthorExerciseEvidenceLocatorV1;
  fen: string;
  line: readonly string[];
}>;

export type AuthorExerciseSourceV1 = Readonly<{
  kind: "author_theory";
  id: string;
  version: typeof AUTHOR_THEORY_VERSION;
  schemaVersion: typeof AUTHOR_THEORY_SCHEMA_VERSION;
  author: AuthorProfileV1;
  concept: TheoryConceptV1;
  record: AuthorTheoryRecordV1;
}>;

export type AuthorExerciseCandidateV1 = Readonly<{
  schemaVersion: typeof AUTHOR_EXERCISE_CANDIDATE_SCHEMA_VERSION;
  candidateVersion: typeof AUTHOR_EXERCISE_CANDIDATE_VERSION;
  id: string;
  title: string;
  statement: string;
  claimType: AuthorTheoryClaimType;
  citationIds: readonly string[];
  evidence: readonly AuthorExerciseEvidenceV1[];
  fen: string;
  line: readonly string[];
  locator: AuthorExerciseEvidenceLocatorV1;
  source: AuthorExerciseSourceV1;
  status: "draft";
}>;

export type AuthorExerciseSourceInput = Readonly<{
  record: AuthorTheoryRecordV1;
  catalog: AuthorTheoryCatalogV1;
  evidence: readonly AuthorExerciseEvidenceV1[];
}>;

export type AuthorExerciseSourceErrorCode =
  | "AUTHOR_EXERCISE_INVALID_INPUT"
  | "AUTHOR_EXERCISE_INVALID_RECORD"
  | "AUTHOR_EXERCISE_INVALID_CATALOG"
  | "AUTHOR_EXERCISE_REVIEW_REQUIRED"
  | "AUTHOR_EXERCISE_UNSUPPORTED_CLAIM"
  | "AUTHOR_EXERCISE_DISALLOWED_CLAIM"
  | "AUTHOR_EXERCISE_AUTHOR_NOT_FOUND"
  | "AUTHOR_EXERCISE_CONCEPT_NOT_FOUND"
  | "AUTHOR_EXERCISE_INVALID_ASSOCIATION"
  | "AUTHOR_EXERCISE_MISSING_EVIDENCE"
  | "AUTHOR_EXERCISE_INVALID_EVIDENCE"
  | "AUTHOR_EXERCISE_AMBIGUOUS_POSITION";

export type AuthorExerciseSourceError = Readonly<{
  code: AuthorExerciseSourceErrorCode;
  message: string;
  context?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type AuthorExerciseSourceResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: AuthorExerciseSourceError }>;

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^[\da-f]{64}$/iu.test(value.trim());
}

function failure<T>(
  code: AuthorExerciseSourceErrorCode,
  message: string,
  context?: Readonly<Record<string, string | number | boolean | null>>,
): AuthorExerciseSourceResult<T> {
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

function normalizeLocator(
  value: unknown,
): AuthorExerciseSourceResult<AuthorExerciseEvidenceLocatorV1> {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    return failure(
      "AUTHOR_EXERCISE_INVALID_EVIDENCE",
      "La evidencia debe conservar un localizador no vacio.",
    );
  }
  for (const [key, entry] of Object.entries(value)) {
    if (
      (typeof entry !== "string" || entry.trim().length === 0) &&
      (typeof entry !== "number" || !Number.isFinite(entry))
    ) {
      return failure(
        "AUTHOR_EXERCISE_INVALID_EVIDENCE",
        "El localizador de evidencia contiene un valor invalido.",
        { key },
      );
    }
  }
  const locator: Record<string, string | number> = {};
  for (const [key, entry] of Object.entries(value)) {
    locator[key] = typeof entry === "string" ? entry.trim() : (entry as number);
  }
  return { ok: true, value: locator };
}

function normalizeEvidence(
  value: unknown,
  citationId: string,
): AuthorExerciseSourceResult<AuthorExerciseEvidenceV1> {
  if (!isRecord(value)) {
    return failure(
      "AUTHOR_EXERCISE_INVALID_EVIDENCE",
      "La evidencia debe ser un objeto.",
      { citationId },
    );
  }
  if (!isNonEmptyString(value.citationId)) {
    return failure(
      "AUTHOR_EXERCISE_INVALID_EVIDENCE",
      "La evidencia debe conservar citationId.",
      { citationId },
    );
  }
  if (value.citationId.trim() !== citationId) {
    return failure(
      "AUTHOR_EXERCISE_INVALID_EVIDENCE",
      "La evidencia seleccionada no coincide con la cita del registro.",
      { citationId },
    );
  }
  if (!isNonEmptyString(value.sourceId) || !isSha256(value.sourceSha256)) {
    return failure(
      "AUTHOR_EXERCISE_INVALID_EVIDENCE",
      "La evidencia debe conservar sourceId y SHA-256 validos.",
      { citationId },
    );
  }
  if (!isNonEmptyString(value.fen)) {
    return failure(
      "AUTHOR_EXERCISE_INVALID_EVIDENCE",
      "La evidencia debe conservar una posicion FEN.",
      { citationId },
    );
  }

  let fen: string;
  try {
    fen = new Chess(value.fen.trim()).fen();
  } catch {
    return failure(
      "AUTHOR_EXERCISE_INVALID_EVIDENCE",
      "La posicion FEN conservada no es valida.",
      { citationId },
    );
  }

  if (!Array.isArray(value.line)) {
    return failure(
      "AUTHOR_EXERCISE_INVALID_EVIDENCE",
      "La evidencia debe conservar una linea de movimientos UCI.",
      { citationId },
    );
  }
  const line: string[] = [];
  for (const [index, rawMove] of value.line.entries()) {
    if (
      typeof rawMove !== "string" ||
      !/^[a-h][1-8][a-h][1-8][qrbn]?$/u.test(rawMove.trim().toLowerCase())
    ) {
      return failure(
        "AUTHOR_EXERCISE_INVALID_EVIDENCE",
        "La linea de evidencia contiene UCI invalido.",
        { citationId, index },
      );
    }
    line.push(rawMove.trim().toLowerCase());
  }

  const locator = normalizeLocator(value.locator);
  if (!locator.ok) return locator;

  return {
    ok: true,
    value: {
      citationId,
      sourceId: value.sourceId.trim(),
      sourceSha256: value.sourceSha256.trim().toLowerCase(),
      locator: locator.value,
      fen,
      line,
    },
  };
}

function sameLine(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((move, index) => move === right[index])
  );
}

function selectedEvidence(
  citationIds: readonly string[],
  evidence: readonly AuthorExerciseEvidenceV1[],
): AuthorExerciseSourceResult<readonly AuthorExerciseEvidenceV1[]> {
  const selected: AuthorExerciseEvidenceV1[] = [];
  for (const citationId of citationIds) {
    const matches = evidence.filter(
      (candidate) =>
        isRecord(candidate) &&
        typeof candidate.citationId === "string" &&
        candidate.citationId.trim() === citationId,
    );
    if (matches.length === 0) {
      return failure(
        "AUTHOR_EXERCISE_MISSING_EVIDENCE",
        "Falta evidencia conservada para una cita del registro.",
        { citationId },
      );
    }
    if (matches.length > 1) {
      return failure(
        "AUTHOR_EXERCISE_INVALID_EVIDENCE",
        "Una cita no puede tener evidencia duplicada.",
        { citationId },
      );
    }
    const normalized = normalizeEvidence(matches[0], citationId);
    if (!normalized.ok) return normalized;
    selected.push(normalized.value);
  }

  const first = selected[0];
  if (first === undefined) {
    return failure(
      "AUTHOR_EXERCISE_MISSING_EVIDENCE",
      "El registro debe conservar al menos una cita con posicion.",
    );
  }
  for (const current of selected.slice(1)) {
    if (current.fen !== first.fen || !sameLine(current.line, first.line)) {
      return failure(
        "AUTHOR_EXERCISE_AMBIGUOUS_POSITION",
        "Las citas del registro apuntan a posiciones o lineas distintas.",
        { citationId: current.citationId },
      );
    }
  }
  return { ok: true, value: selected };
}

export function bindAuthorExerciseSource(
  input: AuthorExerciseSourceInput,
): AuthorExerciseSourceResult<AuthorExerciseCandidateV1> {
  if (!isRecord(input)) {
    return failure(
      "AUTHOR_EXERCISE_INVALID_INPUT",
      "La fuente de ejercicios de autor debe ser un objeto.",
    );
  }

  const record = validateAuthorTheoryRecord(input.record);
  if (!record.ok) {
    return failure(
      record.error.code === "AUTHOR_THEORY_DISALLOWED_CLAIM_TYPE"
        ? "AUTHOR_EXERCISE_DISALLOWED_CLAIM"
        : "AUTHOR_EXERCISE_INVALID_RECORD",
      record.error.message,
    );
  }
  if (record.value.claimType === "unsupported") {
    return failure(
      "AUTHOR_EXERCISE_UNSUPPORTED_CLAIM",
      "Una postura unsupported no puede originar un ejercicio.",
      { recordId: record.value.id },
    );
  }
  if (
    record.value.review.status !== "approved" &&
    record.value.review.status !== "corrected"
  ) {
    return failure(
      "AUTHOR_EXERCISE_REVIEW_REQUIRED",
      "Solo una interpretacion approved o corrected puede originar un ejercicio.",
      { status: record.value.review.status },
    );
  }

  const catalog = validateAuthorTheoryCatalog(input.catalog);
  if (!catalog.ok) {
    return failure("AUTHOR_EXERCISE_INVALID_CATALOG", catalog.error.message);
  }

  const author = catalog.value.authors.find(
    (candidate) => candidate.id === record.value.authorId,
  );
  if (author === undefined) {
    return failure(
      "AUTHOR_EXERCISE_AUTHOR_NOT_FOUND",
      "El authorId del registro no existe en el catalogo.",
      { authorId: record.value.authorId },
    );
  }
  const concept = catalog.value.concepts.find(
    (candidate) => candidate.id === record.value.conceptId,
  );
  if (concept === undefined) {
    return failure(
      "AUTHOR_EXERCISE_CONCEPT_NOT_FOUND",
      "El conceptId del registro no existe en el catalogo.",
      { conceptId: record.value.conceptId },
    );
  }
  if (!author.conceptIds.includes(concept.id)) {
    return failure(
      "AUTHOR_EXERCISE_INVALID_ASSOCIATION",
      "El concepto no esta asociado al autor en el catalogo.",
      { authorId: author.id, conceptId: concept.id },
    );
  }

  const evidence = selectedEvidence(record.value.citationIds, input.evidence);
  if (!evidence.ok) return evidence;
  const position = evidence.value[0];
  if (position === undefined) {
    return failure(
      "AUTHOR_EXERCISE_MISSING_EVIDENCE",
      "El registro debe conservar una posicion.",
    );
  }

  const statement =
    record.value.review.status === "corrected"
      ? record.value.review.correctedText
      : record.value.statement;
  const source: AuthorExerciseSourceV1 = {
    kind: "author_theory",
    id: record.value.id,
    version: AUTHOR_THEORY_VERSION,
    schemaVersion: AUTHOR_THEORY_SCHEMA_VERSION,
    author,
    concept,
    record: record.value,
  };

  return {
    ok: true,
    value: cloneAndFreeze({
      schemaVersion: AUTHOR_EXERCISE_CANDIDATE_SCHEMA_VERSION,
      candidateVersion: AUTHOR_EXERCISE_CANDIDATE_VERSION,
      id: `author:${record.value.id}`,
      title: `${author.canonicalName}: ${concept.label}`,
      statement,
      claimType: record.value.claimType,
      citationIds: record.value.citationIds,
      evidence: evidence.value,
      fen: position.fen,
      line: position.line,
      locator: position.locator,
      source,
      status: "draft",
    }),
  };
}

export const createAuthorExerciseCandidate = bindAuthorExerciseSource;
export const adaptAuthorTheoryRecord = bindAuthorExerciseSource;
