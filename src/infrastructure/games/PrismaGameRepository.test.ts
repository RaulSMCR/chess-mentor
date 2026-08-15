import type { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import { GameRepositoryError, type GameRepository } from "./GameRepository";
import {
  PrismaGameRepository,
  type GameRecordRow,
  type GameRecordStore,
  type GameRecordWrite,
} from "./PrismaGameRepository";
import { makeValidGame, runGameRepositoryContractTests } from "./contract";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneRow(row: GameRecordRow): GameRecordRow {
  return {
    ...row,
    document: clone(row.document) as Prisma.JsonValue,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

class FakeGameRecordStore implements GameRecordStore {
  readonly rows = new Map<string, GameRecordRow>();
  failure: Error | null = null;

  private failIfConfigured(): void {
    if (this.failure !== null) throw this.failure;
  }

  async findMany(): Promise<readonly GameRecordRow[]> {
    this.failIfConfigured();
    return [...this.rows.values()]
      .sort((left, right) => {
        const updated = right.updatedAt.getTime() - left.updatedAt.getTime();
        return updated !== 0 ? updated : left.id.localeCompare(right.id);
      })
      .map((row) => cloneRow(row));
  }

  async findUnique({
    where,
  }: {
    where: { id: string };
  }): Promise<GameRecordRow | null> {
    this.failIfConfigured();
    const row = this.rows.get(where.id);
    return row === undefined ? null : cloneRow(row);
  }

  async upsert({
    create,
    update,
  }: {
    where: { id: string };
    create: GameRecordWrite;
    update: GameRecordWrite;
  }): Promise<GameRecordRow> {
    this.failIfConfigured();
    const row = this.rows.has(create.id) ? update : create;
    const stored: GameRecordRow = {
      ...row,
      document: clone(row.document) as Prisma.JsonValue,
    };
    this.rows.set(stored.id, stored);
    return cloneRow(stored);
  }

  async deleteMany({
    where,
  }: {
    where: { id: string };
  }): Promise<{ count: number }> {
    this.failIfConfigured();
    const count = this.rows.delete(where.id) ? 1 : 0;
    return { count };
  }
}

let store: FakeGameRecordStore;
const makeRepository = (): GameRepository => new PrismaGameRepository(store);

beforeEach(() => {
  store = new FakeGameRecordStore();
});

runGameRepositoryContractTests("Prisma store fake", makeRepository);

describe("PrismaGameRepository failure boundaries", () => {
  it("mapea un fallo del store a STORAGE_UNAVAILABLE", async () => {
    store.failure = new Error("connection refused");

    await expect(makeRepository().list()).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
    });
  });

  it("rechaza metadata SQL inconsistente como STORAGE_CORRUPT", async () => {
    const game = makeValidGame("broken");
    store.rows.set("broken", {
      id: game.id,
      title: "otro título",
      result: game.result,
      revision: game.revision,
      document: clone(game) as unknown as Prisma.JsonValue,
      createdAt: new Date(game.createdAt),
      updatedAt: new Date(game.updatedAt),
    });

    await expect(makeRepository().get("broken")).rejects.toMatchObject({
      code: "STORAGE_CORRUPT",
    });
  });

  it("rechaza un documento inválido antes de llamar al store", async () => {
    const invalid = {} as Parameters<GameRepository["save"]>[0];

    await expect(makeRepository().save(invalid)).rejects.toBeInstanceOf(
      GameRepositoryError,
    );
    expect(store.rows.size).toBe(0);
  });
});
