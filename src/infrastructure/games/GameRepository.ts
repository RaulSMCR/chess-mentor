import type { GameDocumentV1, GameResult } from "@/domain/game-tree/model";

export const GAMES_STORAGE_KEY = "chess-mentor.games.v1";

export type GameSummary = Readonly<{
  id: string;
  title: string;
  result: GameResult;
  revision: number;
  updatedAt: string;
}>;

export type GameRepositoryErrorCode =
  | "STORAGE_UNAVAILABLE"
  | "STORAGE_CORRUPT"
  | "STORAGE_QUOTA"
  | "INVALID_DOCUMENT";

export class GameRepositoryError extends Error {
  readonly name = "GameRepositoryError";

  constructor(
    readonly code: GameRepositoryErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface GameRepository {
  list(): Promise<GameSummary[]>;
  get(id: string): Promise<GameDocumentV1 | null>;
  save(game: GameDocumentV1): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type StorageProvider = () => KeyValueStorage;
