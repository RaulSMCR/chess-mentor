import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  chessMentorPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.chessMentorPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.chessMentorPrisma = prisma;
}
