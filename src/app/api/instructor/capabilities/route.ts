import { getInstructorCapabilities } from "@/server/instructor/service";
import { success } from "@/server/instructor/contracts";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  return success(getInstructorCapabilities());
}
