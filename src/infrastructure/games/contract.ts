import { createGameDocument } from "@/domain/game-tree/replay";
import type { GameDocumentV1 } from "@/domain/game-tree/model";
import { describe, expect, it } from "vitest";

import { GameRepositoryError, type GameRepository } from "./GameRepository";

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function makeValidGame(
  id: string,
  updatedAt = "2026-08-12T18:00:00.000Z",
): GameDocumentV1 {
  const result = createGameDocument({
    rootFen: STANDARD_FEN,
    idFactory: (() => {
      let index = 0;
      return () => {
        index += 1;
        return index === 1 ? id : `${id}-root`;
      };
    })(),
    clock: () => updatedAt,
    title: `Partida ${id}`,
  });
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result.value;
}

export function runGameRepositoryContractTests(
  label: string,
  makeRepository: () => GameRepository,
): void {
  describe(`${label} GameRepository contract`, () => {
    it("empieza vacío y get/remove ausentes son seguros", async () => {
      const repository = makeRepository();

      await expect(repository.list()).resolves.toEqual([]);
      await expect(repository.get("missing")).resolves.toBeNull();
      await expect(repository.remove("missing")).resolves.toBeUndefined();
    });

    it("guarda, lista el summary exacto y clona valores", async () => {
      const repository = makeRepository();
      const game = makeValidGame("game-1");

      await repository.save(game);
      const expectedSummary = {
        id: "game-1",
        title: "Partida game-1",
        result: "*",
        revision: 0,
        updatedAt: "2026-08-12T18:00:00.000Z",
      };
      await expect(repository.list()).resolves.toEqual([expectedSummary]);

      const firstRead = await repository.get("game-1");
      expect(firstRead).not.toBeNull();
      expect(firstRead).not.toBe(game);
      const mutableRead = firstRead as unknown as { title: string };
      mutableRead.title = "mutated outside repository";
      await expect(repository.get("game-1")).resolves.toMatchObject({
        title: "Partida game-1",
      });
    });

    it("ordena updatedAt descendente y luego id ascendente ordinal", async () => {
      const repository = makeRepository();
      await repository.save(makeValidGame("z", "2026-08-12T19:00:00.000Z"));
      await repository.save(makeValidGame("b", "2026-08-12T20:00:00.000Z"));
      await repository.save(makeValidGame("a", "2026-08-12T20:00:00.000Z"));

      await expect(repository.list()).resolves.toEqual([
        expect.objectContaining({ id: "a" }),
        expect.objectContaining({ id: "b" }),
        expect.objectContaining({ id: "z" }),
      ]);
    });

    it("rechaza documentos inválidos sin almacenarlos", async () => {
      const repository = makeRepository();
      const valid = makeValidGame("valid");
      await repository.save(valid);
      const invalid = {
        ...valid,
        headers: { ...valid.headers, Result: "0-1" },
      } as GameDocumentV1;

      await expect(repository.save(invalid)).rejects.toMatchObject({
        code: "INVALID_DOCUMENT",
      });
      await expect(repository.get("valid")).resolves.toEqual(valid);
      await expect(repository.remove("valid")).resolves.toBeUndefined();
      await expect(repository.get("valid")).resolves.toBeNull();
    });

    it("expone errores tipados de repositorio", async () => {
      const repository = makeRepository();
      const invalid = {} as GameDocumentV1;

      try {
        await repository.save(invalid);
        throw new Error("Se esperaba un rechazo.");
      } catch (error) {
        expect(error).toBeInstanceOf(GameRepositoryError);
        expect((error as GameRepositoryError).code).toBe("INVALID_DOCUMENT");
      }
    });
  });
}
