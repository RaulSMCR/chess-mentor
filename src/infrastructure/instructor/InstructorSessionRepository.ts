import {
  validateInstructorSession,
  type InstructorSessionV1,
} from "@/domain/instructor/model";

export const INSTRUCTOR_SESSION_STORAGE_KEY =
  "chess-mentor.instructor-sessions.v1" as const;
export const INSTRUCTOR_SESSION_REPOSITORY_SCHEMA_VERSION = 1 as const;
export const INSTRUCTOR_SESSION_REPOSITORY_VERSION =
  "instructor-session-repository-v1" as const;

export type InstructorSessionSummaryV1 = Readonly<{
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
}>;

export type StoredInstructorSessionsV1 = Readonly<{
  schemaVersion: typeof INSTRUCTOR_SESSION_REPOSITORY_SCHEMA_VERSION;
  repositoryVersion: typeof INSTRUCTOR_SESSION_REPOSITORY_VERSION;
  sessions: Readonly<Record<string, InstructorSessionV1>>;
}>;

export type InstructorSessionRepositoryErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_CORRUPT"
  | "STORAGE_QUOTA"
  | "INVALID_DOCUMENT";

export class InstructorSessionRepositoryError extends Error {
  readonly name = "InstructorSessionRepositoryError";

  constructor(
    readonly code: InstructorSessionRepositoryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface InstructorSessionRepository {
  list(): Promise<InstructorSessionSummaryV1[]>;
  get(id: string): Promise<InstructorSessionV1 | null>;
  save(session: InstructorSessionV1): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface InstructorSessionKeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type InstructorSessionStorageProvider =
  () => InstructorSessionKeyValueStorage | null;

type RecordLike = Record<string, unknown>;

function isRecord(value: unknown): value is RecordLike {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function invalidDocument(
  message: string,
  cause?: unknown,
): InstructorSessionRepositoryError {
  return new InstructorSessionRepositoryError("INVALID_DOCUMENT", message, {
    cause,
  });
}

export function validateForSave(
  session: InstructorSessionV1,
): InstructorSessionV1 {
  const result = validateInstructorSession(session);
  if (!result.ok) {
    throw invalidDocument(
      `La sesion de instructor no es valida: ${result.error.message}`,
    );
  }
  return clone(result.value);
}

export function toSummary(
  session: InstructorSessionV1,
): InstructorSessionSummaryV1 {
  return {
    id: session.id,
    title: session.title,
    revision: session.revision,
    updatedAt: session.updatedAt,
  };
}

export function compareSummary(
  left: InstructorSessionSummaryV1,
  right: InstructorSessionSummaryV1,
): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt > right.updatedAt ? -1 : 1;
  }
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function emptyInstructorSessionEnvelope(): StoredInstructorSessionsV1 {
  return {
    schemaVersion: INSTRUCTOR_SESSION_REPOSITORY_SCHEMA_VERSION,
    repositoryVersion: INSTRUCTOR_SESSION_REPOSITORY_VERSION,
    sessions: {},
  };
}

function corrupt(
  message: string,
  cause?: unknown,
): InstructorSessionRepositoryError {
  return new InstructorSessionRepositoryError("STORAGE_CORRUPT", message, {
    cause,
  });
}

export function validateInstructorSessionEnvelope(
  value: unknown,
): StoredInstructorSessionsV1 {
  if (!isRecord(value)) {
    throw corrupt("El envelope de sesiones no es un objeto.");
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "repositoryVersion" ||
    keys[1] !== "schemaVersion" ||
    keys[2] !== "sessions"
  ) {
    throw corrupt("El envelope de sesiones tiene campos inesperados.");
  }
  if (
    value.schemaVersion !== INSTRUCTOR_SESSION_REPOSITORY_SCHEMA_VERSION ||
    value.repositoryVersion !== INSTRUCTOR_SESSION_REPOSITORY_VERSION
  ) {
    throw corrupt("La version del envelope de sesiones no es soportada.");
  }
  if (!isRecord(value.sessions)) {
    throw corrupt("sessions debe ser un objeto indexado por id.");
  }

  const sessions: Record<string, InstructorSessionV1> = {};
  for (const [id, rawSession] of Object.entries(value.sessions)) {
    const result = validateInstructorSession(rawSession);
    if (!result.ok) {
      throw corrupt(
        `La sesion ${id} almacenada no es valida: ${result.error.message}`,
      );
    }
    if (result.value.id !== id) {
      throw corrupt(
        `La clave ${id} no coincide con session.id ${result.value.id}.`,
      );
    }
    sessions[id] = result.value;
  }
  return {
    schemaVersion: INSTRUCTOR_SESSION_REPOSITORY_SCHEMA_VERSION,
    repositoryVersion: INSTRUCTOR_SESSION_REPOSITORY_VERSION,
    sessions,
  };
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function readStorage(
  provider: InstructorSessionStorageProvider,
): InstructorSessionKeyValueStorage {
  try {
    const storage = provider();
    if (
      storage === null ||
      typeof storage !== "object" ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function"
    ) {
      throw new Error("El proveedor no expone una interfaz valida.");
    }
    return storage;
  } catch (cause) {
    throw new InstructorSessionRepositoryError(
      "STORAGE_UNAVAILABLE",
      `Storage no disponible: ${causeMessage(cause)}`,
      { cause },
    );
  }
}

export function readInstructorSessionEnvelope(
  provider: InstructorSessionStorageProvider,
): {
  storage: InstructorSessionKeyValueStorage;
  envelope: StoredInstructorSessionsV1;
} {
  const storage = readStorage(provider);
  let raw: string | null;
  try {
    raw = storage.getItem(INSTRUCTOR_SESSION_STORAGE_KEY);
  } catch (cause) {
    throw new InstructorSessionRepositoryError(
      "STORAGE_UNAVAILABLE",
      `No se pudo leer storage: ${causeMessage(cause)}`,
      { cause },
    );
  }
  if (raw === null)
    return { storage, envelope: emptyInstructorSessionEnvelope() };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw corrupt("El payload de sesiones no es JSON valido.", cause);
  }
  return { storage, envelope: validateInstructorSessionEnvelope(parsed) };
}

export function writeInstructorSessionEnvelope(
  storage: InstructorSessionKeyValueStorage,
  envelope: StoredInstructorSessionsV1,
): void {
  try {
    storage.setItem(INSTRUCTOR_SESSION_STORAGE_KEY, JSON.stringify(envelope));
  } catch (cause) {
    const candidate = cause as { code?: string | number; name?: string };
    const isQuota =
      candidate.name === "QuotaExceededError" ||
      candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
      candidate.code === 22 ||
      candidate.code === 1014;
    throw new InstructorSessionRepositoryError(
      isQuota ? "STORAGE_QUOTA" : "STORAGE_UNAVAILABLE",
      isQuota
        ? "Storage sin cuota disponible."
        : `No se pudo escribir storage: ${causeMessage(cause)}`,
      { cause },
    );
  }
}
