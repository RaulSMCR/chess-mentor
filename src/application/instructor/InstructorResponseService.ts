import { Chess } from "chess.js";

import type {
  AnalysisRequest,
  EngineAdapter,
  EngineLine,
} from "@/engine/EngineAdapter";
import { validateAnalysisRequest } from "@/engine/EngineAdapter";
import type { InstructorResponseV1 } from "@/domain/instructor/model";
import type { AIProvider } from "@/infrastructure/ai/AIProvider";
import {
  createCitationFromSearchResult,
  createStructuredResponse,
  type StructuredClaimV1,
  type StructuredCitationV1,
  type StructuredResponseV1,
} from "@/infrastructure/ai/StructuredClaims";
import {
  createStockfishExplanation,
  type StockfishExplanationV1,
} from "@/infrastructure/ai/StockfishExplanation";
import {
  type LibraryRetrievalFallbackReason,
  type LibraryRetrievalMode,
  type LibraryRetrievalResponseV1,
  type LibraryRetrievalResultV1,
} from "@/infrastructure/ai/LibraryRetrieval";
import {
  verifyStructuredResponse,
  type StructuredVerificationResultV1,
} from "@/infrastructure/ai/StructuredClaimsVerifier";

export const INSTRUCTOR_RESPONSE_SERVICE_VERSION =
  "instructor-response-service-v1" as const;

export type InstructorPositionSnapshotV1 = Readonly<{
  snapshotId: string;
  fen: string;
  sideToMove: "w" | "b";
  revision: number;
}>;

export type InstructorResponseRequestV1 = Readonly<{
  requestId: string;
  question: string;
  snapshot: InstructorPositionSnapshotV1;
  signal?: AbortSignal;
}>;

export type InstructorRetrievalRequestV1 = Readonly<{
  question: string;
  snapshot: InstructorPositionSnapshotV1;
  signal: AbortSignal;
}>;

export type InstructorRetrieverV1 = (
  request: InstructorRetrievalRequestV1,
) => Promise<LibraryRetrievalResponseV1>;

export type InstructorEngineOptionsV1 = Readonly<{
  depth: number;
  multiPv: number;
  movetimeMs?: number;
}>;

export type InstructorResponseServiceOptions = Readonly<{
  retrieve: InstructorRetrieverV1;
  engine?: EngineAdapter;
  ai?: AIProvider;
  engineOptions?: InstructorEngineOptionsV1;
}>;

export type InstructorRetrievalRunV1 = Readonly<{
  status: "used" | "empty" | "failed";
  mode: LibraryRetrievalMode | null;
  reason: LibraryRetrievalFallbackReason | "retrieval_failed" | null;
  resultCount: number;
  error: string | null;
}>;

export type InstructorEngineRunV1 = Readonly<{
  status: "used" | "empty" | "not_configured" | "failed";
  analysisId: string | null;
  fen: string;
  sideToMove: "w" | "b";
  lines: readonly EngineLine[];
  explanation: StockfishExplanationV1 | null;
  error: string | null;
}>;

export type InstructorAIRunV1 = Readonly<{
  status: "used" | "not_configured" | "unavailable" | "failed";
  providerId: string | null;
  model: string | null;
  text: string | null;
  error: string | null;
}>;

export type InstructorProspectiveLineV1 = Readonly<{
  id: string;
  origin: "engine" | "unsupported";
  label: string;
  moves: readonly string[];
  citationIds: readonly string[];
}>;

export type InstructorResponseCompositionV1 = Readonly<{
  version: typeof INSTRUCTOR_RESPONSE_SERVICE_VERSION;
  requestId: string;
  question: string;
  snapshot: InstructorPositionSnapshotV1;
  response: InstructorResponseV1;
  structuredResponse: StructuredResponseV1;
  citations: readonly StructuredCitationV1[];
  verification: StructuredVerificationResultV1;
  retrieval: InstructorRetrievalRunV1;
  engine: InstructorEngineRunV1;
  ai: InstructorAIRunV1;
  prospectiva: readonly InstructorProspectiveLineV1[];
}>;

export type InstructorResponseServiceErrorCode =
  | "INSTRUCTOR_RESPONSE_INVALID_REQUEST"
  | "INSTRUCTOR_RESPONSE_INVALID_RETRIEVAL"
  | "INSTRUCTOR_RESPONSE_VERIFICATION_FAILED";

export type InstructorResponseServiceError = Readonly<{
  code: InstructorResponseServiceErrorCode;
  message: string;
}>;

export type InstructorResponseDiscarded = Readonly<{
  requestId: string;
  reason: "cancelled" | "superseded";
}>;

export type InstructorResponseServiceResult =
  | Readonly<{ ok: true; value: InstructorResponseCompositionV1 }>
  | Readonly<{ ok: false; error: InstructorResponseServiceError }>
  | Readonly<{ ok: false; discarded: InstructorResponseDiscarded }>;

type RecordLike = Record<string, unknown>;
type ValidationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: InstructorResponseServiceError }>;

type NormalizedRequest = Readonly<{
  requestId: string;
  question: string;
  snapshot: InstructorPositionSnapshotV1;
  signal?: AbortSignal;
}>;

type ActiveRun = Readonly<{
  requestId: string;
  controller: AbortController;
}>;

const DEFAULT_ENGINE_OPTIONS: InstructorEngineOptionsV1 = {
  depth: 8,
  multiPv: 3,
};

const CANCELLED = Symbol("instructor-response-cancelled");
type Cancelled = typeof CANCELLED;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failure<T>(
  code: InstructorResponseServiceErrorCode,
  message: string,
): ValidationResult<T> {
  return { ok: false, error: { code, message } };
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

function normalizeRequest(value: unknown): ValidationResult<NormalizedRequest> {
  if (!isRecord(value)) {
    return failure(
      "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
      "La solicitud de respuesta del instructor debe ser un objeto.",
    );
  }
  if (!isNonEmptyString(value.requestId) || !isNonEmptyString(value.question)) {
    return failure(
      "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
      "requestId y question deben ser textos no vacios.",
    );
  }
  if (!isRecord(value.snapshot)) {
    return failure(
      "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
      "snapshot debe ser un objeto.",
    );
  }
  if (!isNonEmptyString(value.snapshot.snapshotId)) {
    return failure(
      "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
      "snapshotId debe ser un texto no vacio.",
    );
  }
  if (!isNonEmptyString(value.snapshot.fen)) {
    return failure(
      "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
      "snapshot.fen debe ser un FEN no vacio.",
    );
  }
  if (value.snapshot.sideToMove !== "w" && value.snapshot.sideToMove !== "b") {
    return failure(
      "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
      "snapshot.sideToMove debe ser w o b.",
    );
  }
  if (
    typeof value.snapshot.revision !== "number" ||
    !Number.isSafeInteger(value.snapshot.revision) ||
    value.snapshot.revision < 0
  ) {
    return failure(
      "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
      "snapshot.revision debe ser un entero no negativo.",
    );
  }

  let fen: string;
  try {
    const chess = new Chess(value.snapshot.fen.trim());
    if (chess.turn() !== value.snapshot.sideToMove) {
      return failure(
        "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
        "snapshot.sideToMove no coincide con el FEN.",
      );
    }
    fen = chess.fen();
  } catch {
    return failure(
      "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
      "snapshot.fen no es una posicion valida.",
    );
  }

  const signal = value.signal;
  if (
    signal !== undefined &&
    (!isRecord(signal) ||
      typeof signal.addEventListener !== "function" ||
      typeof signal.removeEventListener !== "function")
  ) {
    return failure(
      "INSTRUCTOR_RESPONSE_INVALID_REQUEST",
      "signal no cumple la interfaz AbortSignal.",
    );
  }
  return {
    ok: true,
    value: {
      requestId: value.requestId.trim(),
      question: value.question.trim(),
      snapshot: {
        snapshotId: value.snapshot.snapshotId.trim(),
        fen,
        sideToMove: value.snapshot.sideToMove,
        revision: value.snapshot.revision,
      },
      signal: signal as AbortSignal | undefined,
    },
  };
}

async function awaitOrCancelled<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T | Cancelled> {
  if (signal.aborted) return CANCELLED;
  let onAbort: (() => void) | null = null;
  const aborted = new Promise<Cancelled>((resolve) => {
    onAbort = () => resolve(CANCELLED);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([work, aborted]);
  } finally {
    if (onAbort !== null) signal.removeEventListener("abort", onAbort);
  }
}

function linkSignal(
  source: AbortSignal | undefined,
  target: AbortController,
): () => void {
  if (source === undefined) return () => undefined;
  if (source.aborted) {
    target.abort();
    return () => undefined;
  }
  const onAbort = () => target.abort();
  source.addEventListener("abort", onAbort, { once: true });
  return () => source.removeEventListener("abort", onAbort);
}

function sourceMaterial(
  requestId: string,
  results: readonly LibraryRetrievalResultV1[],
): Readonly<{
  claims: readonly StructuredClaimV1[];
  citations: readonly StructuredCitationV1[];
}> {
  const claims: StructuredClaimV1[] = [];
  const citations: StructuredCitationV1[] = [];
  for (const [index, result] of results.entries()) {
    const citationId = `${requestId}:citation:${index}`;
    citations.push(createCitationFromSearchResult(result, { citationId }));
    claims.push({
      id: `${requestId}:source:${index}`,
      text: result.text,
      type: "direct_quote",
      citationIds: [citationId],
    });
  }
  return { claims, citations };
}

function sourceContext(
  citations: readonly StructuredCitationV1[],
  results: readonly LibraryRetrievalResultV1[],
): string {
  return results
    .map(
      (result, index) =>
        `[${citations[index]?.citationId ?? `source-${index}`}] ${result.text}`,
    )
    .join("\n");
}

function responseSupport(
  verification: StructuredVerificationResultV1,
  aiStatus: InstructorAIRunV1["status"],
  hasSources: boolean,
  hasEngine: boolean,
): InstructorResponseV1["support"] {
  if (verification.status === "unsupported") return "unsupported";
  if (aiStatus === "used") return "sufficient";
  return hasSources || hasEngine ? "partial" : "unsupported";
}

function prospectiveLines(
  requestId: string,
  lines: readonly EngineLine[],
): readonly InstructorProspectiveLineV1[] {
  const usable = lines.filter(
    (line) => line.bestmove !== "0000" && line.pv.length > 0,
  );
  if (usable.length === 0) {
    return [
      {
        id: `${requestId}:prospectiva:unsupported`,
        origin: "unsupported",
        label: "Sin linea prospectiva conservada",
        moves: [],
        citationIds: [],
      },
    ];
  }
  return usable.map((line) => ({
    id: `${requestId}:prospectiva:engine:${line.multipv}`,
    origin: "engine" as const,
    label: `Stockfish MultiPV ${line.multipv}`,
    moves: [...line.pv],
    citationIds: [],
  }));
}

async function collectEngineLines(
  engine: EngineAdapter,
  request: AnalysisRequest,
  signal: AbortSignal,
): Promise<readonly EngineLine[]> {
  if (signal.aborted) return [];
  const lines: EngineLine[] = [];
  const cancel = () => {
    void engine.cancel(request.requestId).catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for await (const line of engine.analyze(request)) {
      if (signal.aborted) break;
      lines.push(clone(line));
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    if (signal.aborted) cancel();
  }
  return lines;
}

function discard(
  requestId: string,
  reason: InstructorResponseDiscarded["reason"],
): InstructorResponseServiceResult {
  return { ok: false, discarded: { requestId, reason } };
}

export class InstructorResponseService {
  private active: ActiveRun | null = null;

  private readonly retrieve: InstructorRetrieverV1;

  private readonly engine: EngineAdapter | undefined;

  private readonly ai: AIProvider | undefined;

  private readonly engineOptions: InstructorEngineOptionsV1;

  constructor(options: InstructorResponseServiceOptions) {
    this.retrieve = options.retrieve;
    this.engine = options.engine;
    this.ai = options.ai;
    this.engineOptions = options.engineOptions ?? DEFAULT_ENGINE_OPTIONS;
  }

  cancel(requestId: string): void {
    if (this.active?.requestId === requestId) this.active.controller.abort();
  }

  respond(
    request: InstructorResponseRequestV1,
  ): Promise<InstructorResponseServiceResult> {
    const normalized = normalizeRequest(request);
    if (!normalized.ok) return Promise.resolve(normalized);

    this.active?.controller.abort();
    const controller = new AbortController();
    const unlink = linkSignal(normalized.value.signal, controller);
    const active: ActiveRun = {
      requestId: normalized.value.requestId,
      controller,
    };
    this.active = active;
    return this.execute(normalized.value, active)
      .catch((cause: unknown): InstructorResponseServiceResult => {
        if (controller.signal.aborted) {
          return discard(
            active.requestId,
            this.active === active ? "cancelled" : "superseded",
          );
        }
        return {
          ok: false,
          error: {
            code: "INSTRUCTOR_RESPONSE_VERIFICATION_FAILED",
            message:
              cause instanceof Error
                ? cause.message
                : "No se pudo componer la respuesta del instructor.",
          },
        };
      })
      .finally(() => {
        unlink();
        if (this.active === active) this.active = null;
      });
  }

  private async execute(
    request: NormalizedRequest,
    active: ActiveRun,
  ): Promise<InstructorResponseServiceResult> {
    const signal = active.controller.signal;
    const current = (): boolean => !signal.aborted && this.active === active;
    const cancelled = (): InstructorResponseServiceResult | null => {
      if (current()) return null;
      return discard(
        request.requestId,
        signal.aborted && this.active === active ? "cancelled" : "superseded",
      );
    };

    const retrievalPromise = this.retrieve({
      question: request.question,
      snapshot: request.snapshot,
      signal,
    });
    const retrievalValue = await awaitOrCancelled(retrievalPromise, signal);
    if (retrievalValue === CANCELLED) {
      return discard(
        request.requestId,
        this.active === active ? "cancelled" : "superseded",
      );
    }
    const retrievalResponse = retrievalValue as LibraryRetrievalResponseV1;
    const retrieval: InstructorRetrievalRunV1 = {
      status: retrievalResponse.results.length === 0 ? "empty" : "used",
      mode: retrievalResponse.mode,
      reason: retrievalResponse.reason,
      resultCount: retrievalResponse.results.length,
      error: null,
    };
    const source = sourceMaterial(request.requestId, retrievalResponse.results);
    const staleAfterRetrieval = cancelled();
    if (staleAfterRetrieval !== null) return staleAfterRetrieval;

    let engineLines: readonly EngineLine[] = [];
    let engineError: string | null = null;
    let engineStatus: InstructorEngineRunV1["status"] =
      this.engine === undefined ? "not_configured" : "empty";
    const analysisId =
      this.engine === undefined ? null : `${request.requestId}:engine-analysis`;

    if (this.engine !== undefined) {
      const engineRequest: AnalysisRequest = {
        requestId: `${request.requestId}:engine`,
        fen: request.snapshot.fen,
        depth: this.engineOptions.depth,
        multiPv: this.engineOptions.multiPv,
        ...(this.engineOptions.movetimeMs === undefined
          ? {}
          : { movetimeMs: this.engineOptions.movetimeMs }),
      };
      try {
        validateAnalysisRequest(engineRequest);
        const engineValue = await awaitOrCancelled(
          collectEngineLines(this.engine, engineRequest, signal),
          signal,
        );
        if (engineValue === CANCELLED) {
          return discard(
            request.requestId,
            this.active === active ? "cancelled" : "superseded",
          );
        }
        engineLines = engineValue;
        engineStatus = engineLines.length === 0 ? "empty" : "used";
      } catch (cause: unknown) {
        if (!current()) {
          return discard(
            request.requestId,
            this.active === active ? "cancelled" : "superseded",
          );
        }
        engineStatus = "failed";
        engineError = cause instanceof Error ? cause.message : String(cause);
      }
    }

    const engineLine = engineLines[0];
    const stockfishExplanation =
      engineLine === undefined
        ? null
        : createStockfishExplanation({
            responseId: `${request.requestId}:engine-response`,
            sideToMove: request.snapshot.sideToMove,
            line: engineLine,
          });
    const engineClaims =
      stockfishExplanation === null ||
      engineLine === undefined ||
      engineLine.bestmove === "0000" ||
      engineLine.pv.length === 0
        ? []
        : [...stockfishExplanation.response.claims];

    let aiStatus: InstructorAIRunV1["status"] =
      this.ai === undefined ? "not_configured" : "failed";
    let aiProviderId: string | null = null;
    let aiModel: string | null = null;
    let aiText: string | null = null;
    let aiError: string | null = null;

    if (this.ai !== undefined) {
      try {
        const availabilityValue = await awaitOrCancelled(
          this.ai.availability(),
          signal,
        );
        if (availabilityValue === CANCELLED) {
          return discard(
            request.requestId,
            this.active === active ? "cancelled" : "superseded",
          );
        }
        aiProviderId = availabilityValue.providerId;
        aiModel = availabilityValue.model;
        if (!availabilityValue.available) {
          aiStatus = "unavailable";
          aiError = availabilityValue.reason;
        } else {
          const generated = await awaitOrCancelled(
            this.ai.generate({
              system:
                "Separa hechos citados, inferencias, motor y sintesis. No atribuyas al autor lo que provenga del motor o de la hipotesis del usuario.",
              prompt: [
                `Pregunta: ${request.question}`,
                `FEN del snapshot ${request.snapshot.snapshotId}: ${request.snapshot.fen}`,
                retrievalResponse.results.length === 0
                  ? "No hay fuentes bibliograficas recuperadas."
                  : `Fuentes recuperadas:\n${sourceContext(source.citations, retrievalResponse.results)}`,
              ].join("\n\n"),
              model: availabilityValue.model ?? undefined,
              maxTokens: 1024,
            }),
            signal,
          );
          if (generated === CANCELLED) {
            return discard(
              request.requestId,
              this.active === active ? "cancelled" : "superseded",
            );
          }
          aiProviderId = generated.providerId;
          aiModel = generated.model;
          if (generated.text.trim().length === 0) {
            aiStatus = "failed";
            aiError = "El proveedor devolvio una sintesis vacia.";
          } else {
            aiStatus = "used";
            aiText = generated.text.trim();
          }
        }
      } catch (cause: unknown) {
        if (!current()) {
          return discard(
            request.requestId,
            this.active === active ? "cancelled" : "superseded",
          );
        }
        aiStatus = "failed";
        aiError = cause instanceof Error ? cause.message : String(cause);
      }
    }

    const claims: StructuredClaimV1[] = [...source.claims, ...engineClaims];
    if (aiText !== null) {
      claims.push({
        id: `${request.requestId}:ai-synthesis`,
        text: aiText,
        type: "ai_synthesis",
        citationIds: source.citations.map((citation) => citation.citationId),
      });
    }

    const answerParts = [`Pregunta: ${request.question}.`];
    if (source.claims.length > 0) {
      answerParts.push(
        `Se conservaron ${source.claims.length} fragmentos citados como fuentes.`,
      );
    }
    if (engineClaims.length > 0) {
      answerParts.push(
        "Se separo el analisis de Stockfish como origen engine.",
      );
    }
    if (aiText !== null) answerParts.push(aiText);
    if (aiText === null && this.ai !== undefined) {
      answerParts.push(
        "La IA opcional no esta disponible para esta respuesta.",
      );
    }
    if (claims.length === 0) {
      const unsupportedText =
        "No hay fuentes, motor o sintesis verificada suficientes para responder.";
      answerParts.push(unsupportedText);
      claims.push({
        id: `${request.requestId}:unsupported`,
        text: unsupportedText,
        type: "unsupported",
        citationIds: [],
      });
    }

    let structuredResponse: StructuredResponseV1;
    let verification: StructuredVerificationResultV1;
    try {
      structuredResponse = createStructuredResponse({
        responseId: request.requestId,
        answer: answerParts.join(" "),
        claims,
        citations: source.citations,
      });
      verification = verifyStructuredResponse(
        structuredResponse,
        retrievalResponse.results,
      );
    } catch (cause: unknown) {
      return {
        ok: false,
        error: {
          code: "INSTRUCTOR_RESPONSE_VERIFICATION_FAILED",
          message:
            cause instanceof Error
              ? cause.message
              : "La respuesta no pudo verificarse.",
        },
      };
    }

    const support = responseSupport(
      verification,
      aiStatus,
      source.claims.length > 0,
      engineClaims.length > 0,
    );
    const response: InstructorResponseV1 = {
      responseId: verification.response.responseId,
      answer: verification.response.answer,
      support,
      claims: verification.response.claims,
    };
    const engine: InstructorEngineRunV1 = {
      status: engineStatus,
      analysisId,
      fen: request.snapshot.fen,
      sideToMove: request.snapshot.sideToMove,
      lines: engineLines,
      explanation: stockfishExplanation,
      error: engineError,
    };
    const ai: InstructorAIRunV1 = {
      status: aiStatus,
      providerId: aiProviderId,
      model: aiModel,
      text: aiText,
      error: aiError,
    };
    const result: InstructorResponseCompositionV1 = {
      version: INSTRUCTOR_RESPONSE_SERVICE_VERSION,
      requestId: request.requestId,
      question: request.question,
      snapshot: request.snapshot,
      response,
      structuredResponse: verification.response,
      citations: verification.response.citations,
      verification,
      retrieval,
      engine,
      ai,
      prospectiva: prospectiveLines(request.requestId, engineLines),
    };

    const staleBeforeReturn = cancelled();
    if (staleBeforeReturn !== null) return staleBeforeReturn;
    return { ok: true, value: cloneAndFreeze(result) };
  }
}

export function createInstructorResponseService(
  options: InstructorResponseServiceOptions,
): InstructorResponseService {
  return new InstructorResponseService(options);
}
