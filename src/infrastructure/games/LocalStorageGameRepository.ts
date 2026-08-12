import { validateGameDocument } from "@/domain/game-tree/invariants";
import type { GameDocumentV1 } from "@/domain/game-tree/model";
import {
  GAMES_STORAGE_KEY,
  GameRepositoryError,
  type GameRepository,
  type GameSummary,
  type KeyValueStorage,
  type StorageProvider,
} from "./GameRepository";
import {
  GameDocumentSchema,
  StoredGamesV1Schema,
  type StoredGamesV1,
} from "./schema";
import { clone, compareSummary, toSummary } from "./MemoryGameRepository";

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isQuotaError(cause: unknown): boolean {
  if (!(cause instanceof Error)) return false;
  const candidate = cause as Error & { code?: string | number; name: string };
  return (
    candidate.name === "QuotaExceededError" ||
    candidate.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    candidate.code === 22 ||
    candidate.code === 1014
  );
}

function invalidStoredDocument(
  message: string,
  cause?: unknown,
): GameRepositoryError {
  return new GameRepositoryError("STORAGE_CORRUPT", message, { cause });
}

function readProvider(provider: StorageProvider): KeyValueStorage {
  try {
    const storage = provider();
    if (
      storage === null ||
      typeof storage !== "object" ||
      typeof storage.getItem !== "function" ||
      typeof storage.setItem !== "function"
    ) {
      throw new Error("El proveedor no expone una interfaz de storage válida.");
    }
    return storage;
  } catch (cause) {
    throw new GameRepositoryError(
      "STORAGE_UNAVAILABLE",
      `Storage no disponible: ${causeMessage(cause)}`,
      { cause },
    );
  }
}

function readEnvelope(provider: StorageProvider): {
  storage: KeyValueStorage;
  envelope: StoredGamesV1;
} {
  const storage = readProvider(provider);
  let raw: string | null;
  try {
    raw = storage.getItem(GAMES_STORAGE_KEY);
  } catch (cause) {
    throw new GameRepositoryError(
      "STORAGE_UNAVAILABLE",
      `No se pudo leer storage: ${causeMessage(cause)}`,
      { cause },
    );
  }
  if (raw === null) {
    return {
      storage,
      envelope: { schemaVersion: 1, games: {} },
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (cause) {
    throw invalidStoredDocument(
      "El payload de storage no es JSON válido.",
      cause,
    );
  }
  const schema = StoredGamesV1Schema.safeParse(parsed);
  if (!schema.success) {
    throw invalidStoredDocument(
      `El envelope de storage no es válido: ${schema.error.message}`,
      schema.error,
    );
  }
  const parsedEnvelope = schema.data as unknown as StoredGamesV1;
  for (const [key, game] of Object.entries(parsedEnvelope.games)) {
    if (key !== game.id) {
      throw invalidStoredDocument(
        `La clave ${key} no coincide con game.id ${game.id}.`,
      );
    }
    const errors = validateGameDocument(game);
    if (errors.length > 0) {
      throw invalidStoredDocument(
        `La partida ${game.id} está corrupta: ${errors
          .map((item) => item.message)
          .join("; ")}`,
      );
    }
  }
  return { storage, envelope: clone(parsedEnvelope) };
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
      `Documento inválido: ${errors.map((item) => item.message).join("; ")}`,
    );
  }
  return clone(schema.data);
}

function writeEnvelope(
  storage: KeyValueStorage,
  envelope: StoredGamesV1,
): void {
  const payload = JSON.stringify(envelope);
  try {
    storage.setItem(GAMES_STORAGE_KEY, payload);
  } catch (cause) {
    if (isQuotaError(cause)) {
      throw new GameRepositoryError(
        "STORAGE_QUOTA",
        `Storage sin cuota disponible: ${causeMessage(cause)}`,
        { cause },
      );
    }
    throw new GameRepositoryError(
      "STORAGE_UNAVAILABLE",
      `No se pudo escribir storage: ${causeMessage(cause)}`,
      { cause },
    );
  }
}

export class LocalStorageGameRepository implements GameRepository {
  constructor(private readonly storageProvider: StorageProvider) {}

  async list(): Promise<GameSummary[]> {
    const { envelope } = readEnvelope(this.storageProvider);
    return Object.values(envelope.games)
      .map((game) => toSummary(game))
      .sort(compareSummary)
      .map((summary) => clone(summary));
  }

  async get(id: string): Promise<GameDocumentV1 | null> {
    const { envelope } = readEnvelope(this.storageProvider);
    const game = envelope.games[id];
    return game === undefined ? null : clone(game);
  }

  async save(game: GameDocumentV1): Promise<void> {
    const validated = validateForSave(game);
    const { storage, envelope } = readEnvelope(this.storageProvider);
    const next: StoredGamesV1 = {
      schemaVersion: 1,
      games: { ...envelope.games, [validated.id]: validated },
    };
    writeEnvelope(storage, next);
  }

  async remove(id: string): Promise<void> {
    const { storage, envelope } = readEnvelope(this.storageProvider);
    if (envelope.games[id] === undefined) return;
    const remaining = { ...envelope.games };
    delete remaining[id];
    writeEnvelope(storage, { schemaVersion: 1, games: remaining });
  }
}

export { readEnvelope, writeEnvelope };
