#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

: "${DATABASE_URL:=file:./__migrate_usage_day.db}"
export DATABASE_URL
export NODE_ENV="${NODE_ENV:-test}"

mkdir -p prisma
npx prisma migrate deploy >/dev/null
exec "$@"
