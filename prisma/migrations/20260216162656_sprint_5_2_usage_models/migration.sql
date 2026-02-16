-- CreateTable
CREATE TABLE "UserUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "turnCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedTurns" INTEGER NOT NULL DEFAULT 0,
    "reservedTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TurnBudgetHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "holdKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adventureId" TEXT,
    "tier" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "reservedTurns" INTEGER NOT NULL DEFAULT 1,
    "reservedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "reservedTotal" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'HELD',
    "expiresAt" DATETIME NOT NULL,
    "releasedAt" DATETIME,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TurnLease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adventureId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "leaseKey" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acquiredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "UserUsage_userId_idx" ON "UserUsage"("userId");

-- CreateIndex
CREATE INDEX "UserUsage_monthKey_idx" ON "UserUsage"("monthKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserUsage_userId_monthKey_key" ON "UserUsage"("userId", "monthKey");

-- CreateIndex
CREATE INDEX "TurnBudgetHold_holdKey_idx" ON "TurnBudgetHold"("holdKey");

-- CreateIndex
CREATE INDEX "TurnBudgetHold_userId_monthKey_idx" ON "TurnBudgetHold"("userId", "monthKey");

-- CreateIndex
CREATE INDEX "TurnBudgetHold_adventureId_idx" ON "TurnBudgetHold"("adventureId");

-- CreateIndex
CREATE INDEX "TurnBudgetHold_expiresAt_idx" ON "TurnBudgetHold"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TurnBudgetHold_holdKey_key" ON "TurnBudgetHold"("holdKey");

-- CreateIndex
CREATE UNIQUE INDEX "TurnLease_adventureId_key" ON "TurnLease"("adventureId");

-- CreateIndex
CREATE INDEX "TurnLease_leaseKey_idx" ON "TurnLease"("leaseKey");

-- CreateIndex
CREATE INDEX "TurnLease_userId_idx" ON "TurnLease"("userId");

-- CreateIndex
CREATE INDEX "TurnLease_expiresAt_idx" ON "TurnLease"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TurnLease_leaseKey_key" ON "TurnLease"("leaseKey");
