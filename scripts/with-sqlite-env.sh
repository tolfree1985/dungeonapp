#!/usr/bin/env bash
set -euo pipefail
unset DATABASE_URL
mkdir -p prisma
export DATABASE_URL="file:${PWD}/prisma/dev.db?connection_limit=1"
npx prisma migrate deploy >/dev/null
exec "$@"
