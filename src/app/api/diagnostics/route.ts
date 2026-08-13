import {
  getWorkerDiagnostics,
  workerErrorResponse,
} from "@/server/worker/client";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    return Response.json(await getWorkerDiagnostics(), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const mapped = workerErrorResponse(error);
    return Response.json(mapped.body, {
      status: mapped.status,
      headers: { "cache-control": "no-store" },
    });
  }
}
