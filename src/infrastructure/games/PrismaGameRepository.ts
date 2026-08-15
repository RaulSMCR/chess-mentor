import type { Prisma, PrismaClient } from "@prisma/client";

import { validateGameDocument } from "@/domain/game-tree/invariants";
import type { GameDocumentV1 } from "@/domain/game-tree/model";
import { prisma } from "@/infrastructure/db/prisma";

import {
  GameRepositoryError,
  type GameRepository,
  type GameSummary,
} from "./GameRepository";
import {
  clone,
  compareSummary,
  toSummary,
  validateForSave,
} from "./MemoryGameRepository";
import { GameDocumentSchema } from "./schema";

export type GameRecordRow = Readonly<{
  id: string;
  title: string;
  result: string;
  revision: number;
  document: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}>;

export type GameRecordWrite = Readonly<{
  id: string;
  title: string;
  result: string;
  revision: number;
  document: Prisma.InputJsonValue;
  createdAt: Date;
  updatedAt: Date;
}>;

export type GameRecordStore = Readonly<{
  findMany(args: {
    orderBy: ({ updatedAt: "desc" } | { id: "asc" })[];
  }): Promise<readonly GameRecordRow[]>;
  findUnique(args: { where: { id: string } }): Promise<GameRecordRow | null>;
  upsert(args: {
    where: { id: string };
    create: GameRecordWrite;
    update: GameRecordWrite;
  }): Promise<GameRecordRow>;
  deleteMany(args: { where: { id: string } }): Promise<{ count: number }>;
}>;

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function unavailable(cause: unknown): GameRepositoryError {
  return new GameRepositoryError(
    "STORAGE_UNAVAILABLE",
    `Base de datos no disponible: ${causeMessage(cause)}`,
    { cause },
  );
}

function corrupt(message: string, cause?: unknown): GameRepositoryError {
  return new GameRepositoryError("STORAGE_CORRUPT", message, { cause });
}

function toInputJson(game: GameDocumentV1): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(game)) as Prisma.InputJsonValue;
}

function toDocument(row: GameRecordRow): GameDocumentV1 {
  const parsed = GameDocumentSchema.safeParse(row.document);
  if (!parsed.success) {
    throw corrupt(
      `La partida ${row.id} contiene un documento inválido.`,
      parsed.error,
    );
  }

  const errors = validateGameDocument(parsed.data);
  if (errors.length > 0) {
    throw corrupt(
      `La partida ${row.id} está corrupta: ${errors
        .map((item) => item.message)
        .join("; ")}`,
    );
  }

  const document = clone(parsed.data);
  const metadataMatches =
    row.id === document.id &&
    row.title === document.title &&
    row.result === document.result &&
    row.revision === document.revision &&
    row.createdAt.toISOString() === document.createdAt &&
    row.updatedAt.toISOString() === document.updatedAt;

  if (!metadataMatches) {
    throw corrupt(
      `La metadata SQL de la partida ${row.id} no coincide con su documento.`,
    );
  }

  return document;
}

export function createPrismaGameRecordStore(
  client: PrismaClient,
): GameRecordStore {
  return {
    findMany: ({ orderBy }) => client.gameRecord.findMany({ orderBy }),
    findUnique: ({ where }) => client.gameRecord.findUnique({ where }),
    upsert: ({ where, create, update }) =>
      client.gameRecord.upsert({ where, create, update }),
    deleteMany: ({ where }) => client.gameRecord.deleteMany({ where }),
  };
}

export class PrismaGameRepository implements GameRepository {
  constructor(
    private readonly store: GameRecordStore = createPrismaGameRecordStore(
      prisma,
    ),
  ) {}

  async list(): Promise<GameSummary[]> {
    try {
      const rows = await this.store.findMany({
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      });
      return rows
        .map((row) => toSummary(toDocument(row)))
        .sort(compareSummary)
        .map((summary) => clone(summary));
    } catch (cause) {
      if (cause instanceof GameRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async get(id: string): Promise<GameDocumentV1 | null> {
    try {
      const row = await this.store.findUnique({ where: { id } });
      return row === null ? null : clone(toDocument(row));
    } catch (cause) {
      if (cause instanceof GameRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async save(game: GameDocumentV1): Promise<void> {
    const validated = validateForSave(game);
    const write: GameRecordWrite = {
      id: validated.id,
      title: validated.title,
      result: validated.result,
      revision: validated.revision,
      document: toInputJson(validated),
      createdAt: new Date(validated.createdAt),
      updatedAt: new Date(validated.updatedAt),
    };

    try {
      await this.store.upsert({
        where: { id: validated.id },
        create: write,
        update: write,
      });
    } catch (cause) {
      if (cause instanceof GameRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.store.deleteMany({ where: { id } });
    } catch (cause) {
      if (cause instanceof GameRepositoryError) throw cause;
      throw unavailable(cause);
    }
  }
}
