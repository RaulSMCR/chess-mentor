import {
  errorResponse,
  internalError,
  parseSourcesRequest,
  readJsonBody,
  success,
} from "@/server/instructor/contracts";
import {
  importInstructorSource,
  listInstructorSources,
} from "@/server/instructor/service";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return success(listInstructorSources());
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(body.error);
    const parsed = parseSourcesRequest(body.value);
    if (!parsed.ok) return errorResponse(parsed.error);
    const imported = importInstructorSource(parsed.value.sourceId);
    if (!imported.ok) {
      return errorResponse({
        code: "SOURCE_NOT_FOUND",
        message: imported.error.message,
        status: 404,
      });
    }
    return success({ imported: imported.value });
  } catch {
    return internalError();
  }
}
