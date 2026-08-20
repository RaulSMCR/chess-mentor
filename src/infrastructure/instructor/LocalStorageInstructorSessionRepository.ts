import type { InstructorSessionV1 } from "@/domain/instructor/model";
import {
  InstructorSessionRepositoryError,
  readInstructorSessionEnvelope,
  writeInstructorSessionEnvelope,
  type InstructorSessionRepository,
  type InstructorSessionStorageProvider,
  type InstructorSessionSummaryV1,
} from "./InstructorSessionRepository";
import {
  clone,
  compareSummary,
  toSummary,
  validateForSave,
  type StoredInstructorSessionsV1,
} from "./InstructorSessionRepository";

export class LocalStorageInstructorSessionRepository implements InstructorSessionRepository {
  constructor(private readonly provider: InstructorSessionStorageProvider) {}

  async list(): Promise<InstructorSessionSummaryV1[]> {
    const { envelope } = readInstructorSessionEnvelope(this.provider);
    return Object.values(envelope.sessions)
      .map(toSummary)
      .sort(compareSummary)
      .map(clone);
  }

  async get(id: string): Promise<InstructorSessionV1 | null> {
    const { envelope } = readInstructorSessionEnvelope(this.provider);
    const session = envelope.sessions[id];
    return session === undefined ? null : clone(session);
  }

  async save(session: InstructorSessionV1): Promise<void> {
    const validated = validateForSave(session);
    const { storage, envelope } = readInstructorSessionEnvelope(this.provider);
    const next: StoredInstructorSessionsV1 = {
      ...envelope,
      sessions: { ...envelope.sessions, [validated.id]: validated },
    };
    try {
      writeInstructorSessionEnvelope(storage, next);
    } catch (cause) {
      if (cause instanceof InstructorSessionRepositoryError) throw cause;
      throw new InstructorSessionRepositoryError(
        "STORAGE_UNAVAILABLE",
        "No se pudo guardar la sesion de instructor.",
        { cause },
      );
    }
  }

  async remove(id: string): Promise<void> {
    const { storage, envelope } = readInstructorSessionEnvelope(this.provider);
    if (envelope.sessions[id] === undefined) return;
    const sessions = { ...envelope.sessions };
    delete sessions[id];
    writeInstructorSessionEnvelope(storage, { ...envelope, sessions });
  }
}
