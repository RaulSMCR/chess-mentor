import { z } from "zod";

import type { GameDocumentV1 } from "@/domain/game-tree/model";

const MoveInputSchema = z
  .object({
    from: z.string().regex(/^[a-h][1-8]$/),
    to: z.string().regex(/^[a-h][1-8]$/),
    promotion: z.enum(["q", "r", "b", "n"]).optional(),
  })
  .strict();

const RootNodeSchema = z
  .object({
    kind: z.literal("root"),
    id: z.string().min(1),
    parentId: z.null(),
    childIds: z.array(z.string().min(1)),
    fen: z.string().min(1),
  })
  .strict();

const MoveNodeSchema = z
  .object({
    kind: z.literal("move"),
    id: z.string().min(1),
    parentId: z.string().min(1),
    childIds: z.array(z.string().min(1)),
    move: MoveInputSchema,
    uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
    san: z.string().min(1),
    fen: z.string().min(1),
    comment: z
      .string()
      .min(1)
      .refine((value) => value.trim() === value)
      .nullable(),
    nags: z.array(z.number().int().min(1).max(255)),
  })
  .strict();

export const GameNodeSchema = z.discriminatedUnion("kind", [
  RootNodeSchema,
  MoveNodeSchema,
]);

export const GameDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    title: z.string().min(1),
    headers: z.record(z.string(), z.string()),
    rootNodeId: z.string().min(1),
    nodesById: z.record(z.string().min(1), GameNodeSchema),
    cursorNodeId: z.string().min(1),
    result: z.enum(["1-0", "0-1", "1/2-1/2", "*"]),
    revision: z.number().int().nonnegative(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const StoredGamesV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    games: z.record(z.string().min(1), GameDocumentSchema),
  })
  .strict();

export type StoredGamesV1 = Readonly<{
  schemaVersion: 1;
  games: Readonly<Record<string, GameDocumentV1>>;
}>;
