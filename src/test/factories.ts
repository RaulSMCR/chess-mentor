import type {
  Clock,
  CreateGameDocumentDraftInput,
  GameDocumentV1,
  IdFactory,
} from "@/domain/game-tree/model";
import { createGameDocumentDraft } from "@/domain/game-tree/model";

export const FIXED_TIMESTAMP = "2026-08-12T18:00:00.000Z";

export function createIdFactory(ids: readonly string[]): IdFactory {
  let index = 0;
  return () => {
    const value = ids[index];
    index += 1;
    if (value === undefined) {
      throw new Error("La factory de IDs de test se quedó sin valores.");
    }
    return value;
  };
}

export function createClockFactory(
  timestamps: readonly string[] = [FIXED_TIMESTAMP],
): Clock {
  let index = 0;
  return () => {
    const value = timestamps[index] ?? timestamps[timestamps.length - 1];
    index += 1;
    if (value === undefined) {
      throw new Error("La factory de Clock de test se quedó sin valores.");
    }
    return value;
  };
}

export function makeGameDocument(
  overrides: Partial<CreateGameDocumentDraftInput> = {},
): GameDocumentV1 {
  const result = createGameDocumentDraft({
    rootFen: "opaque-root-fen",
    idFactory: createIdFactory(["game-1", "root-1"]),
    clock: createClockFactory(),
    ...overrides,
  });
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}
