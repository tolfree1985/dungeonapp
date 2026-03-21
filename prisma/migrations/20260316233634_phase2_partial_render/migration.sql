-- DropForeignKey
ALTER TABLE "SceneArtShotCache" DROP CONSTRAINT "SceneArtShotCache_sceneArtId_fkey";

-- AlterTable
ALTER TABLE "SceneArtShotCache" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AddForeignKey
ALTER TABLE "SceneArtShotCache" ADD CONSTRAINT "SceneArtShotCache_sceneArtId_fkey" FOREIGN KEY ("sceneArtId") REFERENCES "SceneArt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "SceneArtShotCache_sceneKey_index" RENAME TO "SceneArtShotCache_sceneKey_idx";
