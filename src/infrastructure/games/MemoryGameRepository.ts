import type { GameDocumentV1 } from "@/domain/game-tree/model";
import {
  GameRepositoryError,
  type GameRepository,
  type GameSummary,
} from "./GameRepository";
import { GameDocumentSchema } from "./schema";
import { validateGameDocument } from "@/domain/game-tree/invariants";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validationMessage(errors: readonly { message: string }[]): string {
  return errors.map((item) => item.message).join("; ");
}

function validateForSave(game: GameDocumentV1): GameDocumentV1 {
  const schema = GameDocumentSchema.safeParse(game);
  if (!schema.success) {
    throw new GameRepositoryError(
      "INVALID_DOCUMENT",
      `Documento inválido: ${schema.error.message}`,
      { cause: schema.error },
    );
  }
  const errors = validateGameDocument(schema.data);
  if (errors.length > 0) {
    throw new GameRepositoryError(
      "INVALID_DOCUMENT",
      `Documento inválido: ${validationMessage(errors)}`,
    );
  }
  return clone(schema.data);
}

export function toSummary(game: GameDocumentV1): GameSummary {
  return {
    id: game.id,
    title: game.title,
    result: game.result,
    revision: game.revision,
    updatedAt: game.updatedAt,
  };
}

function compareSummary(left: GameSummary, right: GameSummary): number {
  if (left.updatedAt !== right.updatedAt) {
    return left.updatedAt > right.updatedAt ? -1 : 1;
  }
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export class MemoryGameRepository implements GameRepository {
  private readonly games = new Map<string, GameDocumentV1>();

  async list(): Promise<GameSummary[]> {
    return [...this.games.values()]
      .map((game) => toSummary(game))
      .sort(compareSummary)
      .map((summary) => clone(summary));
  }

  async get(id: string): Promise<GameDocumentV1 | null> {
    const game = this.games.get(id);
    return game === undefined ? null : clone(game);
  }

  async save(game: GameDocumentV1): Promise<void> {
    const validated = validateForSave(game);
    this.games.set(validated.id, validated);
  }

  async remove(id: string): Promise<void> {
    this.games.delete(id);
  }
}

export { compareSummary, clone, validateForSave };
