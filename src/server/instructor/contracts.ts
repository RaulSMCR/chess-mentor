import { Chess } from "chess.js";
import { z } from "zod";

import type { InstructorResponseCompositionV1 } from "@/application/instructor/InstructorResponseService";

export const INSTRUCTOR_HTTP_CONTRACT_VERSION = "instructor-http-v1" as const;
export const INSTRUCTOR_HTTP_MAX_BODY_BYTES = 64 * 1024;
export const INSTRUCTOR_HTTP_MAX_QUESTION_LENGTH = 2_000;

export type InstructorHttpErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "PAYLOAD_TOO_LARGE"
  | "SOURCE_NOT_FOUND"
  | "INSTRUCTOR_DEGRADED"
  | "INTERNAL_ERROR";

export type InstructorHttpError = Readonly<{
  code: InstructorHttpErrorCode;
  message: string;
  status: number;
}>;

export type InstructorHttpResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: InstructorHttpError }>;

export type InstructorRespondRequestV1 = Readonly<{
  requestId: string;
  question: string;
  snapshot: Readonly<{
    snapshotId: string;
    fen: string;
    sideToMove: "w" | "b";
    revision: number;
  }>;
}>;

export type InstructorSourcesRequestV1 = Readonly<{
  sourceId: string;
}>;

export type InstructorCapabilityV1 = Readonly<{
  status: "available" | "degraded";
  reason: string | null;
}>;

export type InstructorCapabilitiesResponseV1 = Readonly<{
  deployment: "local" | "cloud";
  capabilities: Readonly<{
    instructor: InstructorCapabilityV1;
    sources: InstructorCapabilityV1;
    respond: InstructorCapabilityV1;
  }>;
  security: Readonly<{
    sameOrigin: true;
    privateServicesExposed: false;
  }>;
}>;

export type InstructorSourceDescriptorV1 = Readonly<{
  id: string;
  title: string;
  kind: "fixture";
  status: "available";
  sourceSha256: string;
}>;

export type InstructorSourcesResponseV1 = Readonly<{
  sources: readonly InstructorSourceDescriptorV1[];
}>;

export type InstructorSourceImportResponseV1 = Readonly<{
  imported: InstructorSourceDescriptorV1;
}>;

export type InstructorRespondResponseV1 = Readonly<{
  deployment: "local" | "cloud";
  degraded: boolean;
  response: InstructorResponseCompositionV1;
}>;

const snapshotSchema = z
  .object({
    snapshotId: z.string().trim().min(1).max(128),
    fen: z.string().trim().min(1).max(128),
    sideToMove: z.enum(["w", "b"]),
    revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

const respondSchema = z
  .object({
    requestId: z.string().trim().min(1).max(128),
    question: z.string().trim().min(1).max(INSTRUCTOR_HTTP_MAX_QUESTION_LENGTH),
    snapshot: snapshotSchema,
  })
  .strict();

const sourcesSchema = z
  .object({ sourceId: z.string().trim().min(1).max(128) })
  .strict();

function error(
  code: InstructorHttpErrorCode,
  message: string,
  status: number,
): InstructorHttpResult<never> {
  return { ok: false, error: { code, message, status } };
}

export function parseRespondRequest(
  value: unknown,
): InstructorHttpResult<InstructorRespondRequestV1> {
  const parsed = respondSchema.safeParse(value);
  if (!parsed.success) {
    return error(
      "INVALID_REQUEST",
      "La solicitud de respuesta no es valida.",
      400,
    );
  }
  try {
    if (
      new Chess(parsed.data.snapshot.fen).turn() !==
      parsed.data.snapshot.sideToMove
    ) {
      return error(
        "INVALID_REQUEST",
        "La solicitud de respuesta no es valida.",
        400,
      );
    }
  } catch {
    return error(
      "INVALID_REQUEST",
      "La solicitud de respuesta no es valida.",
      400,
    );
  }
  return { ok: true, value: parsed.data };
}

export function parseSourcesRequest(
  value: unknown,
): InstructorHttpResult<InstructorSourcesRequestV1> {
  const parsed = sourcesSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : error("INVALID_REQUEST", "La solicitud de fuente no es valida.", 400);
}

export async function readJsonBody(
  request: Request,
): Promise<InstructorHttpResult<unknown>> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const length = Number(declaredLength);
    if (
      !Number.isSafeInteger(length) ||
      length > INSTRUCTOR_HTTP_MAX_BODY_BYTES
    ) {
      return error(
        "PAYLOAD_TOO_LARGE",
        "El payload supera el limite permitido.",
        413,
      );
    }
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return error("INVALID_JSON", "No se pudo leer el payload JSON.", 400);
  }
  if (
    new TextEncoder().encode(raw).byteLength > INSTRUCTOR_HTTP_MAX_BODY_BYTES
  ) {
    return error(
      "PAYLOAD_TOO_LARGE",
      "El payload supera el limite permitido.",
      413,
    );
  }
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return error("INVALID_JSON", "El payload no contiene JSON valido.", 400);
  }
}

export function success<T>(value: T): Response {
  return Response.json(
    {
      ok: true,
      contractVersion: INSTRUCTOR_HTTP_CONTRACT_VERSION,
      data: value,
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

export function errorResponse(value: InstructorHttpError): Response {
  return Response.json(
    {
      ok: false,
      contractVersion: INSTRUCTOR_HTTP_CONTRACT_VERSION,
      error: { code: value.code, message: value.message },
    },
    { status: value.status, headers: { "cache-control": "no-store" } },
  );
}

export function internalError(): Response {
  return errorResponse({
    code: "INTERNAL_ERROR",
    message: "No se pudo completar la solicitud del instructor.",
    status: 500,
  });
}
