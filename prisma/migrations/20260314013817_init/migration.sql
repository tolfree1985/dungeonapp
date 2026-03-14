-- CreateEnum
CREATE TYPE "SceneArtStatus" AS ENUM ('queued', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('NOMAD', 'TRAILBLAZOR', 'CHRONICLER', 'LOREMASTER');

-- CreateEnum
CREATE TYPE "ScenarioVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateTable
CREATE TABLE "Adventure" (
    "id" TEXT NOT NULL,
    "latestTurnIndex" INTEGER NOT NULL DEFAULT 0,
    "seed" INTEGER,
    "state" JSONB,
    "ownerId" TEXT,

    CONSTRAINT "Adventure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL,
    "adventureId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "playerInput" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "resolution" JSONB NOT NULL,
    "stateDeltas" JSONB NOT NULL,
    "ledgerAdds" JSONB NOT NULL,
    "memoryGate" TEXT,
    "debug" JSONB,
    "intentJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Turn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnEvent" (
    "eventId" TEXT NOT NULL,
    "adventureId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prevEventId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "rejectReason" TEXT,
    "baseStateHash" TEXT NOT NULL,
    "resultStateHash" TEXT NOT NULL,
    "rngSeed" TEXT NOT NULL,
    "playerInput" TEXT NOT NULL,
    "modelInputHash" TEXT NOT NULL,
    "turnJson" JSONB NOT NULL,
    "receiptEnvelopeHash" TEXT,
    "receiptChainHash" TEXT,
    "receiptSig" TEXT,

    CONSTRAINT "TurnEvent_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "bucketStartMs" BIGINT NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "tier" "Tier" NOT NULL,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedTurns" INTEGER NOT NULL DEFAULT 0,
    "reservedTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnBudgetHold" (
    "id" TEXT NOT NULL,
    "holdKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adventureId" TEXT,
    "tier" "Tier" NOT NULL,
    "monthKey" TEXT NOT NULL,
    "reservedTurns" INTEGER NOT NULL DEFAULT 1,
    "reservedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedTotal" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurnBudgetHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TurnLease" (
    "id" TEXT NOT NULL,
    "adventureId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaseKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TurnLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "contentJson" JSONB NOT NULL,
    "visibility" "ScenarioVisibility" NOT NULL DEFAULT 'PRIVATE',
    "ownerId" TEXT,
    "sourceScenarioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Save" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "nextTurnIndex" INTEGER NOT NULL DEFAULT 0,
    "stateJson" JSONB NOT NULL,
    "ledgerJson" JSONB NOT NULL,
    "styleLockJson" JSONB,

    CONSTRAINT "Save_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaveTurn" (
    "id" TEXT NOT NULL,
    "saveId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "artifactPath" TEXT,
    "requestHash" TEXT NOT NULL DEFAULT '',
    "createdIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaveTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageDay" (
    "key" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "turns" INTEGER NOT NULL DEFAULT 0,
    "lastTurnAt" TIMESTAMP(3),

    CONSTRAINT "UsageDay_pkey" PRIMARY KEY ("key","day")
);

-- CreateTable
CREATE TABLE "SceneArt" (
    "id" TEXT NOT NULL,
    "sceneKey" TEXT NOT NULL,
    "title" TEXT,
    "basePrompt" TEXT NOT NULL,
    "renderPrompt" TEXT NOT NULL,
    "stylePreset" TEXT,
    "tagsJson" TEXT,
    "status" "SceneArtStatus" NOT NULL DEFAULT 'queued',
    "imageUrl" TEXT,
    "engineVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SceneArt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Adventure_ownerId_idx" ON "Adventure"("ownerId");

-- CreateIndex
CREATE INDEX "Turn_adventureId_idx" ON "Turn"("adventureId");

-- CreateIndex
CREATE UNIQUE INDEX "Turn_adventureId_turnIndex_key" ON "Turn"("adventureId", "turnIndex");

-- CreateIndex
CREATE INDEX "TurnEvent_adventureId_seq_idx" ON "TurnEvent"("adventureId", "seq");

-- CreateIndex
CREATE INDEX "TurnEvent_adventureId_idx" ON "TurnEvent"("adventureId");

-- CreateIndex
CREATE UNIQUE INDEX "TurnEvent_adventureId_seq_key" ON "TurnEvent"("adventureId", "seq");

-- CreateIndex
CREATE INDEX "RateLimitBucket_key_idx" ON "RateLimitBucket"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitBucket_key_bucketStartMs_key" ON "RateLimitBucket"("key", "bucketStartMs");

-- CreateIndex
CREATE INDEX "UserUsage_userId_idx" ON "UserUsage"("userId");

-- CreateIndex
CREATE INDEX "UserUsage_monthKey_idx" ON "UserUsage"("monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserUsage_userId_monthKey_key" ON "UserUsage"("userId", "monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "TurnBudgetHold_holdKey_key" ON "TurnBudgetHold"("holdKey");

-- CreateIndex
CREATE INDEX "TurnBudgetHold_holdKey_idx" ON "TurnBudgetHold"("holdKey");

-- CreateIndex
CREATE INDEX "TurnBudgetHold_userId_monthKey_idx" ON "TurnBudgetHold"("userId", "monthKey");

-- CreateIndex
CREATE INDEX "TurnBudgetHold_adventureId_idx" ON "TurnBudgetHold"("adventureId");

-- CreateIndex
CREATE INDEX "TurnBudgetHold_expiresAt_idx" ON "TurnBudgetHold"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TurnLease_adventureId_key" ON "TurnLease"("adventureId");

-- CreateIndex
CREATE UNIQUE INDEX "TurnLease_leaseKey_key" ON "TurnLease"("leaseKey");

-- CreateIndex
CREATE INDEX "TurnLease_leaseKey_idx" ON "TurnLease"("leaseKey");

-- CreateIndex
CREATE INDEX "TurnLease_userId_idx" ON "TurnLease"("userId");

-- CreateIndex
CREATE INDEX "TurnLease_expiresAt_idx" ON "TurnLease"("expiresAt");

-- CreateIndex
CREATE INDEX "Scenario_visibility_idx" ON "Scenario"("visibility");

-- CreateIndex
CREATE INDEX "Scenario_ownerId_idx" ON "Scenario"("ownerId");

-- CreateIndex
CREATE INDEX "Save_scenarioId_idx" ON "Save"("scenarioId");

-- CreateIndex
CREATE INDEX "SaveTurn_saveId_idx" ON "SaveTurn"("saveId");

-- CreateIndex
CREATE UNIQUE INDEX "SaveTurn_saveId_createdIndex_key" ON "SaveTurn"("saveId", "createdIndex");

-- CreateIndex
CREATE UNIQUE INDEX "SceneArt_sceneKey_key" ON "SceneArt"("sceneKey");

-- CreateIndex
CREATE INDEX "SceneArt_status_idx" ON "SceneArt"("status");

-- AddForeignKey
ALTER TABLE "Turn" ADD CONSTRAINT "Turn_adventureId_fkey" FOREIGN KEY ("adventureId") REFERENCES "Adventure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnEvent" ADD CONSTRAINT "TurnEvent_adventureId_fkey" FOREIGN KEY ("adventureId") REFERENCES "Adventure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TurnEvent" ADD CONSTRAINT "TurnEvent_prevEventId_fkey" FOREIGN KEY ("prevEventId") REFERENCES "TurnEvent"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaveTurn" ADD CONSTRAINT "SaveTurn_saveId_fkey" FOREIGN KEY ("saveId") REFERENCES "Save"("id") ON DELETE CASCADE ON UPDATE CASCADE;
