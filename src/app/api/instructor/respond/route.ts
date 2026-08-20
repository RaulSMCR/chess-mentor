import {
  errorResponse,
  internalError,
  parseRespondRequest,
  readJsonBody,
  success,
} from "@/server/instructor/contracts";
import { respondInstructor } from "@/server/instructor/service";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    if (!body.ok) return errorResponse(body.error);
    const parsed = parseRespondRequest(body.value);
    if (!parsed.ok) return errorResponse(parsed.error);
    const response = await respondInstructor(parsed.value);
    if (!response.ok) {
      return errorResponse({
        code:
          response.error.code === "SOURCE_NOT_FOUND"
            ? "SOURCE_NOT_FOUND"
            : "INTERNAL_ERROR",
        message: response.error.message,
        status: response.error.code === "SOURCE_NOT_FOUND" ? 404 : 500,
      });
    }
    return success(response.value);
  } catch {
    return internalError();
  }
}
