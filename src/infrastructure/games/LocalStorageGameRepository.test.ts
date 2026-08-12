import { beforeEach, describe, expect, it } from "vitest";

import {
  GAMES_STORAGE_KEY,
  GameRepositoryError,
  type KeyValueStorage,
} from "./GameRepository";
import { LocalStorageGameRepository } from "./LocalStorageGameRepository";
import { makeValidGame, runGameRepositoryContractTests } from "./contract";

class FakeStorage implements KeyValueStorage {
  value: string | null = null;
  failRead: Error | null = null;
  failWrite: Error | null = null;
  writes = 0;

  getItem(): string | null {
    if (this.failRead !== null) throw this.failRead;
    return this.value;
  }

  setItem(_key: string, value: string): void {
    this.writes += 1;
    if (this.failWrite !== null) throw this.failWrite;
    this.value = value;
  }
}

function quotaError(): Error {
  const error = new Error("quota");
  Object.defineProperty(error, "name", { value: "QuotaExceededError" });
  return error;
}

let storage: FakeStorage;
const makeRepository = (): LocalStorageGameRepository =>
  new LocalStorageGameRepository(() => storage);

beforeEach(() => {
  storage = new FakeStorage();
});

runGameRepositoryContractTests("LocalStorage", makeRepository);

describe("LocalStorageGameRepository failure boundaries", () => {
  it("conserva el payload corrupto y no lo sobrescribe", async () => {
    storage.value = "{not-json";
    const repository = makeRepository();
    const original = storage.value;

    await expect(repository.list()).rejects.toMatchObject({
      code: "STORAGE_CORRUPT",
    });
    await expect(repository.save(makeValidGame("new"))).rejects.toMatchObject({
      code: "STORAGE_CORRUPT",
    });
    expect(storage.value).toBe(original);
    expect(storage.writes).toBe(0);
  });

  it("rechaza versiones desconocidas sin migrarlas", async () => {
    storage.value = JSON.stringify({ schemaVersion: 99, games: {} });

    await expect(makeRepository().list()).rejects.toMatchObject({
      code: "STORAGE_CORRUPT",
    });
    expect(storage.value).toContain('"schemaVersion":99');
  });

  it("mapea cuota y deja el payload anterior intacto", async () => {
    const repository = makeRepository();
    await repository.save(makeValidGame("old"));
    const original = storage.value;
    storage.failWrite = quotaError();

    await expect(repository.save(makeValidGame("new"))).rejects.toMatchObject({
      code: "STORAGE_QUOTA",
    });
    expect(storage.value).toBe(original);
    expect(storage.writes).toBe(2);
  });

  it("mapea acceso no disponible", async () => {
    storage.failRead = new Error("denied");
    const repository = makeRepository();

    await expect(repository.get("any")).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });

  it("usa la clave versionada exacta y permite recarga simulada", async () => {
    const first = makeRepository();
    await first.save(makeValidGame("reload"));
    expect(storage.value).toContain(`"schemaVersion":1`);
    expect(GAMES_STORAGE_KEY).toBe("chess-mentor.games.v1");

    const second = makeRepository();
    await expect(second.get("reload")).resolves.toMatchObject({ id: "reload" });
  });

  it("devuelve siempre GameRepositoryError en payload inválido", async () => {
    storage.value = JSON.stringify({
      schemaVersion: 1,
      games: { broken: { id: "different" } },
    });

    try {
      await makeRepository().list();
      throw new Error("Se esperaba un rechazo.");
    } catch (error) {
      expect(error).toBeInstanceOf(GameRepositoryError);
      expect((error as GameRepositoryError).code).toBe("STORAGE_CORRUPT");
    }
  });
});
