import {
  createStructuredResponse,
  parseStructuredResponse,
  type StructuredCitationV1,
  type StructuredClaimV1,
  type StructuredResponseV1,
} from "./StructuredClaims";
import type {
  LibraryLocatorV1,
  LibrarySearchResultV1,
} from "../library/index/LibraryIndex";

export const STRUCTURED_CLAIMS_VERIFIER_VERSION =
  "structured-claims-verifier-v1" as const;

export type StructuredVerificationStatus = "verified" | "unsupported";

export type StructuredVerificationIssueCode =
  | "CLAIM_MISSING_CITATION"
  | "CITATION_NOT_IN_CORPUS"
  | "DIRECT_QUOTE_NOT_FOUND"
  | "CLAIM_MARKED_UNSUPPORTED";

export type StructuredVerificationIssueV1 = Readonly<{
  code: StructuredVerificationIssueCode;
  claimId: string;
  citationId?: string;
  message: string;
}>;

export type StructuredVerificationResultV1 = Readonly<{
  verifierVersion: typeof STRUCTURED_CLAIMS_VERIFIER_VERSION;
  status: StructuredVerificationStatus;
  response: StructuredResponseV1;
  issues: readonly StructuredVerificationIssueV1[];
}>;

export type StructuredClaimsVerifierErrorCode =
  "STRUCTURED_VERIFIER_INVALID_EVIDENCE";

export class StructuredClaimsVerifierError extends Error {
  readonly name = "StructuredClaimsVerifierError";

  constructor(
    readonly code: StructuredClaimsVerifierErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLocator(value: unknown): value is LibraryLocatorV1 {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every(
      (entry) =>
        (typeof entry === "string" && entry.length > 0) ||
        (typeof entry === "number" && Number.isFinite(entry)),
    )
  );
}

function isEvidenceResult(value: unknown): value is LibrarySearchResultV1 {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.importKey) &&
    typeof value.sourceSha256 === "string" &&
    /^[\da-f]{64}$/i.test(value.sourceSha256) &&
    isNonEmptyString(value.mediaType) &&
    (value.fileName === undefined || isNonEmptyString(value.fileName)) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.chunkId) &&
    Number.isInteger(value.ordinal) &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    isLocator(value.locator)
  );
}

function validateEvidence(value: unknown): readonly LibrarySearchResultV1[] {
  if (!Array.isArray(value) || !value.every(isEvidenceResult)) {
    throw new StructuredClaimsVerifierError(
      "STRUCTURED_VERIFIER_INVALID_EVIDENCE",
      "La evidencia de biblioteca no cumple el contrato.",
    );
  }
  return value;
}

function stableLocator(value: LibraryLocatorV1): string {
  return JSON.stringify(
    Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    ),
  );
}

function citationMatchesEvidence(
  citation: StructuredCitationV1,
  evidence: LibrarySearchResultV1,
): boolean {
  return (
    citation.importKey === evidence.importKey &&
    citation.sourceSha256 === evidence.sourceSha256 &&
    citation.mediaType === evidence.mediaType &&
    citation.title === evidence.title &&
    (citation.fileName === undefined ||
      citation.fileName === evidence.fileName) &&
    stableLocator(citation.locator) === stableLocator(evidence.locator) &&
    evidence.text.includes(citation.fragment)
  );
}

function requiresBibliographicCitation(
  type: StructuredClaimV1["type"],
): boolean {
  return (
    type === "direct_quote" ||
    type === "paraphrase" ||
    type === "inference" ||
    type === "ai_synthesis"
  );
}

function issue(
  code: StructuredVerificationIssueCode,
  claim: StructuredClaimV1,
  message: string,
  citationId?: string,
): StructuredVerificationIssueV1 {
  return {
    code,
    claimId: claim.id,
    ...(citationId === undefined ? {} : { citationId }),
    message,
  };
}

export function verifyStructuredResponse(
  response: unknown,
  evidence: readonly LibrarySearchResultV1[] = [],
): StructuredVerificationResultV1 {
  const normalizedResponse = parseStructuredResponse(response);
  const normalizedEvidence = validateEvidence(evidence);
  const citationsById = new Map(
    normalizedResponse.citations.map((citation) => [
      citation.citationId,
      citation,
    ]),
  );
  const issues: StructuredVerificationIssueV1[] = [];
  const verifiedCitationIds = new Set<string>();
  const claims: StructuredClaimV1[] = [];

  for (const claim of normalizedResponse.claims) {
    let unsupported = claim.type === "unsupported";
    if (claim.type === "unsupported") {
      issues.push(
        issue(
          "CLAIM_MARKED_UNSUPPORTED",
          claim,
          "El claim ya esta marcado como unsupported.",
        ),
      );
    }

    const validCitationIds: string[] = [];
    for (const citationId of claim.citationIds) {
      const citation = citationsById.get(citationId);
      if (citation === undefined) continue;
      const matches = normalizedEvidence.some((candidate) =>
        citationMatchesEvidence(citation, candidate),
      );
      if (!matches) {
        unsupported = true;
        issues.push(
          issue(
            "CITATION_NOT_IN_CORPUS",
            claim,
            `La cita ${citationId} no coincide con la evidencia recuperada.`,
            citationId,
          ),
        );
        continue;
      }
      validCitationIds.push(citationId);
    }

    if (requiresBibliographicCitation(claim.type)) {
      if (validCitationIds.length === 0) {
        unsupported = true;
        if (claim.citationIds.length === 0) {
          issues.push(
            issue(
              "CLAIM_MISSING_CITATION",
              claim,
              "El claim bibliografico no tiene una cita valida.",
            ),
          );
        }
      }
      if (claim.type === "direct_quote" && validCitationIds.length > 0) {
        const quoteFound = validCitationIds.some((citationId) => {
          const citation = citationsById.get(citationId);
          return (
            citation !== undefined &&
            normalizedEvidence.some(
              (candidate) =>
                citationMatchesEvidence(citation, candidate) &&
                candidate.text.includes(claim.text),
            )
          );
        });
        if (!quoteFound) {
          unsupported = true;
          issues.push(
            issue(
              "DIRECT_QUOTE_NOT_FOUND",
              claim,
              "El texto del direct_quote no aparece en el fragmento citado.",
            ),
          );
        }
      }
    }

    if (unsupported) {
      claims.push({ ...claim, type: "unsupported", citationIds: [] });
      continue;
    }
    for (const citationId of validCitationIds) {
      verifiedCitationIds.add(citationId);
    }
    claims.push({ ...claim, citationIds: validCitationIds });
  }

  const citations = normalizedResponse.citations.filter((citation) =>
    verifiedCitationIds.has(citation.citationId),
  );
  const hasIssues = issues.length > 0;
  const verifiedResponse = createStructuredResponse({
    responseId: normalizedResponse.responseId,
    answer: hasIssues
      ? "No hay evidencia suficiente para respaldar todos los claims."
      : normalizedResponse.answer,
    claims,
    citations,
  });

  return {
    verifierVersion: STRUCTURED_CLAIMS_VERIFIER_VERSION,
    status: hasIssues ? "unsupported" : "verified",
    response: verifiedResponse,
    issues,
  };
}
