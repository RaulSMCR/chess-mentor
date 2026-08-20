import type { InstructorSessionV1 } from "@/domain/instructor/model";
import {
  InstructorSessionRepositoryError,
  type InstructorSessionRepository,
  type InstructorSessionSummaryV1,
  compareSummary,
  clone,
  toSummary,
  validateForSave,
} from "./InstructorSessionRepository";

export class MemoryInstructorSessionRepository implements InstructorSessionRepository {
  private readonly sessions = new Map<string, InstructorSessionV1>();

  async list(): Promise<InstructorSessionSummaryV1[]> {
    return [...this.sessions.values()]
      .map(toSummary)
      .sort(compareSummary)
      .map(clone);
  }

  async get(id: string): Promise<InstructorSessionV1 | null> {
    const session = this.sessions.get(id);
    return session === undefined ? null : clone(session);
  }

  async save(session: InstructorSessionV1): Promise<void> {
    try {
      this.sessions.set(session.id, validateForSave(session));
    } catch (cause) {
      if (cause instanceof InstructorSessionRepositoryError) throw cause;
      throw new InstructorSessionRepositoryError(
        "INVALID_DOCUMENT",
        "La sesion de instructor no es valida.",
        { cause },
      );
    }
  }

  async remove(id: string): Promise<void> {
    this.sessions.delete(id);
  }
}
