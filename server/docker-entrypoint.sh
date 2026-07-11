#!/bin/sh
set -e

echo "Applying database migrations…"
npx prisma migrate deploy

# Demo seed is opt-in (creates sample projects + demo accounts). Default: off.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  COUNT=$(node -e "import('@prisma/client').then(async({PrismaClient})=>{const p=new PrismaClient();process.stdout.write(String(await p.project.count()));await p.\$disconnect()})")
  if [ "$COUNT" = "0" ]; then
    echo "Empty database — seeding sample data…"
    node dist/seed.js
  else
    echo "Database already has $COUNT projects — skipping seed."
  fi
fi

echo "Starting Velox API…"
exec node dist/index.js
