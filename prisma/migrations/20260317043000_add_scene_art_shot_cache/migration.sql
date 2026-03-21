-- CreateTable
CREATE TABLE "SceneArtShotCache" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sceneKey" TEXT NOT NULL,
  "shotKey" TEXT NOT NULL,
  "sceneArtId" TEXT NOT NULL REFERENCES "SceneArt"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "SceneArtShotCache_sceneKey_shotKey_key" ON "SceneArtShotCache"("sceneKey", "shotKey");

-- CreateIndex
CREATE INDEX "SceneArtShotCache_sceneKey_index" ON "SceneArtShotCache"("sceneKey");
