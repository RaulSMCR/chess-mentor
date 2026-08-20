import { describe, expect, it } from "vitest";

import { createGameDocument } from "@/domain/game-tree/replay";
import {
  createInstructorSession,
  type InstructorSessionV1,
} from "@/domain/instructor/model";
import {
  INSTRUCTOR_SESSION_REPOSITORY_VERSION,
  INSTRUCTOR_SESSION_STORAGE_KEY,
  InstructorSessionRepositoryError,
  type InstructorSessionKeyValueStorage,
} from "./InstructorSessionRepository";
import { LocalStorageInstructorSessionRepository } from "./LocalStorageInstructorSessionRepository";
import { MemoryInstructorSessionRepository } from "./MemoryInstructorSessionRepository";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

class FakeStorage implements InstructorSessionKeyValueStorage {
  private readonly values = new Map<string, string>();

  writes = 0;

  failRead = false;

  failWrite: Error | null = null;

  getItem(key: string): string | null {
    if (this.failRead) throw new Error("read unavailable");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes += 1;
    if (this.failWrite !== null) throw this.failWrite;
    this.values.set(key, value);
  }

  putRaw(value: string): void {
    this.values.set(INSTRUCTOR_SESSION_STORAGE_KEY, value);
  }

  raw(): string | null {
    return this.values.get(INSTRUCTOR_SESSION_STORAGE_KEY) ?? null;
  }
}

function makeSession(
  id = "session-1",
  updatedAt = "2026-08-20T12:00:00.000Z",
): InstructorSessionV1 {
  const game = createGameDocument({
    rootFen: STANDARD_FEN,
    idFactory: (() => {
      let index = 0;
      return () => {
        index += 1;
        return index === 1 ? `${id}-game` : `${id}-root`;
      };
    })(),
    clock: () => updatedAt,
    title: `Partida de ${id}`,
  });
  if (!game.ok) throw new Error(game.error.message);
  const session = createInstructorSession({
    id,
    title: `Sesion ${id}`,
    gameDocument: game.value,
    createdAt: updatedAt,
    updatedAt,
  });
  if (!session.ok) throw new Error(session.error.message);
  return session.value;
}

function quotaError(): Error {
  const error = new Error("quota");
  Object.defineProperty(error, "name", { value: "QuotaExceededError" });
  return error;
}

function expectRepositoryError(
  promise: Promise<unknown>,
  code: InstructorSessionRepositoryError["code"],
) {
  return expect(promise).rejects.toMatchObject({ code });
}

describe("MemoryInstructorSessionRepository", () => {
  it("guarda, lista ordenadamente, clona y elimina sesiones", async () => {
    const repository = new MemoryInstructorSessionRepository();
    await repository.save(
      makeSession("session-older", "2026-08-20T10:00:00.000Z"),
    );
    await repository.save(
      makeSession("session-newer", "2026-08-20T11:00:00.000Z"),
    );

    await expect(repository.list()).resolves.toEqual([
      {
        id: "session-newer",
        title: "Sesion session-newer",
        revision: 0,
        updatedAt: "2026-08-20T11:00:00.000Z",
      },
      {
        id: "session-older",
        title: "Sesion session-older",
        revision: 0,
        updatedAt: "2026-08-20T10:00:00.000Z",
      },
    ]);

    const first = await repository.get("session-newer");
    expect(first).not.toBeNull();
    expect(first).not.toBe(await repository.get("session-newer"));
    (first as { title: string }).title = "mutated outside repository";
    expect((await repository.get("session-newer"))?.title).toBe(
      "Sesion session-newer",
    );

    await repository.remove("session-newer");
    await repository.remove("missing");
    await expect(repository.get("session-newer")).resolves.toBeNull();
  });

  it("rechaza una sesion invalida sin mutar la anterior", async () => {
    const repository = new MemoryInstructorSessionRepository();
    await repository.save(makeSession());
    const invalid = { ...makeSession(), activeNodeId: "missing-node" };

    await expectRepositoryError(repository.save(invalid), "INVALID_DOCUMENT");
    await expect(repository.get("session-1")).resolves.toMatchObject({
      activeNodeId: "session-1-root",
    });
  });
});

describe("LocalStorageInstructorSessionRepository", () => {
  it("usa un envelope versionado y permite recargar una copia validada", async () => {
    const storage = new FakeStorage();
    const repository = new LocalStorageInstructorSessionRepository(
      () => storage,
    );
    await repository.save(makeSession());

    const parsed = JSON.parse(storage.raw() ?? "{}") as Record<string, unknown>;
    expect(parsed.repositoryVersion).toBe(
      INSTRUCTOR_SESSION_REPOSITORY_VERSION,
    );
    expect(parsed.sessions).toHaveProperty("session-1");

    const reloaded = new LocalStorageInstructorSessionRepository(() => storage);
    const session = await reloaded.get("session-1");
    expect(session).toMatchObject({ id: "session-1", revision: 0 });
    expect(session).not.toBe(await reloaded.get("session-1"));
  });

  it("preserva el payload corrupto y no lo sobrescribe", async () => {
    const storage = new FakeStorage();
    const repository = new LocalStorageInstructorSessionRepository(
      () => storage,
    );
    await repository.save(makeSession());
    storage.putRaw("{broken");
    const original = storage.raw();

    await expectRepositoryError(repository.list(), "STORAGE_CORRUPT");
    await expectRepositoryError(
      repository.save(makeSession("session-2")),
      "STORAGE_CORRUPT",
    );
    expect(storage.raw()).toBe(original);
    expect(storage.writes).toBe(1);
  });

  it("rechaza versiones desconocidas y claves inconsistentes", async () => {
    const storage = new FakeStorage();
    storage.putRaw(
      JSON.stringify({
        schemaVersion: 99,
        repositoryVersion: INSTRUCTOR_SESSION_REPOSITORY_VERSION,
        sessions: {},
      }),
    );
    const repository = new LocalStorageInstructorSessionRepository(
      () => storage,
    );
    await expectRepositoryError(repository.list(), "STORAGE_CORRUPT");

    storage.putRaw(
      JSON.stringify({
        schemaVersion: 1,
        repositoryVersion: INSTRUCTOR_SESSION_REPOSITORY_VERSION,
        sessions: { wrong: makeSession("session-1") },
      }),
    );
    await expectRepositoryError(repository.list(), "STORAGE_CORRUPT");
  });

  it("mapea indisponibilidad y cuota sin perder el payload anterior", async () => {
    const unavailable = new FakeStorage();
    unavailable.failRead = true;
    const unavailableRepository = new LocalStorageInstructorSessionRepository(
      () => unavailable,
    );
    await expectRepositoryError(
      unavailableRepository.list(),
      "STORAGE_UNAVAILABLE",
    );

    const storage = new FakeStorage();
    const repository = new LocalStorageInstructorSessionRepository(
      () => storage,
    );
    await repository.save(makeSession());
    const original = storage.raw();
    storage.failWrite = quotaError();
    await expectRepositoryError(
      repository.save(makeSession("session-2")),
      "STORAGE_QUOTA",
    );
    expect(storage.raw()).toBe(original);
  });

  it("devuelve siempre el error tipado ante un documento almacenado invalido", async () => {
    const storage = new FakeStorage();
    storage.putRaw(
      JSON.stringify({
        schemaVersion: 1,
        repositoryVersion: INSTRUCTOR_SESSION_REPOSITORY_VERSION,
        sessions: { broken: { id: "broken" } },
      }),
    );
    try {
      await new LocalStorageInstructorSessionRepository(() => storage).list();
      throw new Error("Se esperaba un rechazo.");
    } catch (error) {
      expect(error).toBeInstanceOf(InstructorSessionRepositoryError);
      expect((error as InstructorSessionRepositoryError).code).toBe(
        "STORAGE_CORRUPT",
      );
    }
  });
});
