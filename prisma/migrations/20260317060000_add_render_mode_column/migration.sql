-- CreateEnum
CREATE TYPE "RenderMode" AS ENUM ('full', 'partial');

-- AlterTable
ALTER TABLE "SceneArt" ADD COLUMN "renderMode" "RenderMode" NOT NULL DEFAULT 'full';
