#!/usr/bin/env bash
set -euo pipefail
unset DATABASE_URL
export DATABASE_URL='file:./prisma/dev.db?connection_limit=1'
exec "$@"
