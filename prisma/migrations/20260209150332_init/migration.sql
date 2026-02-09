-- CreateTable
CREATE TABLE "Adventure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "latestTurnIndex" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Turn" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Turn_adventureId_fkey" FOREIGN KEY ("adventureId") REFERENCES "Adventure" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Turn_adventureId_idx" ON "Turn"("adventureId");

-- CreateIndex
CREATE UNIQUE INDEX "Turn_adventureId_turnIndex_key" ON "Turn"("adventureId", "turnIndex");
