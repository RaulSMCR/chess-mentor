import { FakeEngineAdapter } from "@/engine/FakeEngineAdapter";
import {
  createInstructorResponseService,
  type InstructorResponseCompositionV1,
} from "@/application/instructor/InstructorResponseService";
import type { LibraryRetrievalResponseV1 } from "@/infrastructure/ai/LibraryRetrieval";
import type {
  InstructorCapabilitiesResponseV1,
  InstructorRespondRequestV1,
  InstructorRespondResponseV1,
  InstructorSourceDescriptorV1,
  InstructorSourcesResponseV1,
} from "./contracts";

const FIXTURE_SOURCE: InstructorSourceDescriptorV1 = {
  id: "fixture:instructor-opening-v1",
  title: "Fixture de instructor: planes del centro",
  kind: "fixture",
  status: "available",
  sourceSha256: "f".repeat(64),
};

const FIXTURE_RETRIEVAL_RESULT = {
  importKey: FIXTURE_SOURCE.id,
  sourceSha256: FIXTURE_SOURCE.sourceSha256,
  mediaType: "text/plain",
  fileName: "fixture-instructor.txt",
  title: FIXTURE_SOURCE.title,
  chunkId: "chunk-1",
  ordinal: 0,
  text: "La ocupacion del centro prepara rupturas y desarrollo armonico.",
  locator: { kind: "fixture-paragraph", ordinal: 0 },
  score: 1,
  matchedTerms: ["centro"],
  mode: "textual_fallback" as const,
};

type ServiceErrorCode = "SOURCE_NOT_FOUND" | "RESPONSE_FAILED";

export type InstructorServiceError = Readonly<{
  code: ServiceErrorCode;
  message: string;
}>;

export type InstructorServiceResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: InstructorServiceError }>;

function deployment(): "local" | "cloud" {
  return process.env.VERCEL === "1" ||
    process.env.INSTRUCTOR_DEPLOYMENT === "cloud"
    ? "cloud"
    : "local";
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getInstructorCapabilities(): InstructorCapabilitiesResponseV1 {
  const current = deployment();
  const local = current === "local";
  const reason = local
    ? null
    : "La demo cloud no alcanza recursos locales del equipo.";
  return {
    deployment: current,
    capabilities: {
      instructor: {
        status: local ? "available" : "degraded",
        reason,
      },
      sources: { status: "available", reason: null },
      respond: {
        status: local ? "available" : "degraded",
        reason,
      },
    },
    security: { sameOrigin: true, privateServicesExposed: false },
  };
}

export function listInstructorSources(): InstructorSourcesResponseV1 {
  return { sources: [clone(FIXTURE_SOURCE)] };
}

export function importInstructorSource(
  sourceId: string,
): InstructorServiceResult<InstructorSourceDescriptorV1> {
  if (sourceId !== FIXTURE_SOURCE.id) {
    return {
      ok: false,
      error: {
        code: "SOURCE_NOT_FOUND",
        message: "La fixture solicitada no existe.",
      },
    };
  }
  return { ok: true, value: clone(FIXTURE_SOURCE) };
}

function retrievalResponse(local: boolean): LibraryRetrievalResponseV1 {
  return {
    version: "library-retrieval-v1",
    mode: "textual_fallback",
    reason: local ? "no_provider" : "no_embeddings",
    results: local ? [clone(FIXTURE_RETRIEVAL_RESULT)] : [],
  };
}

export async function respondInstructor(
  request: InstructorRespondRequestV1,
): Promise<InstructorServiceResult<InstructorRespondResponseV1>> {
  const current = deployment();
  const local = current === "local";
  const responseService = createInstructorResponseService({
    retrieve: async () => retrievalResponse(local),
    engine: local ? new FakeEngineAdapter() : undefined,
    engineOptions: { depth: 4, multiPv: 2 },
  });
  const response = await responseService.respond(request);
  if (!response.ok) {
    return {
      ok: false,
      error: {
        code: "RESPONSE_FAILED",
        message: "No se pudo componer la respuesta del instructor.",
      },
    };
  }
  const composition: InstructorResponseCompositionV1 = response.value;
  return {
    ok: true,
    value: {
      deployment: current,
      degraded: !local,
      response: composition,
    },
  };
}

export { FIXTURE_SOURCE };
