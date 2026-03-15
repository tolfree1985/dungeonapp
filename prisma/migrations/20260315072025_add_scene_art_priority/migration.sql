-- CreateEnum
CREATE TYPE "SceneArtPriority" AS ENUM ('low', 'normal', 'high', 'critical');

-- AlterTable
ALTER TABLE "SceneArt" ADD COLUMN     "renderPriority" "SceneArtPriority" NOT NULL DEFAULT 'normal';
