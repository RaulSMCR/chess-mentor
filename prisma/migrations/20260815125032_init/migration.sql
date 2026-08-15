-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "GameRecord" (
    "id" VARCHAR(128) NOT NULL,
    "title" VARCHAR(512) NOT NULL,
    "result" VARCHAR(7) NOT NULL,
    "revision" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "GameRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerExerciseRecord" (
    "id" VARCHAR(128) NOT NULL,
    "nextDueAt" TIMESTAMPTZ(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TrainerExerciseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRecord" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(128) NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMPTZ(3),
    "checkpoint" JSONB,
    "idempotencyKey" VARCHAR(255) NOT NULL,
    "result" JSONB,
    "error" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "JobRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GameRecord_updatedAt_id_idx" ON "GameRecord"("updatedAt", "id");

-- CreateIndex
CREATE INDEX "TrainerExerciseRecord_nextDueAt_id_idx" ON "TrainerExerciseRecord"("nextDueAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JobRecord_idempotencyKey_key" ON "JobRecord"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobRecord_status_leaseUntil_idx" ON "JobRecord"("status", "leaseUntil");
