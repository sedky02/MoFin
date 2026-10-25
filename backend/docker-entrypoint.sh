#!/bin/sh
# Container start: apply pending migrations, optionally seed the demo account,
# then hand over to the API process (exec, so it receives SIGTERM directly).
set -e

echo "Applying database migrations..."
npx --no-install prisma migrate deploy

if [ "$SEED_DEMO" = "true" ]; then
  # The seed is compiled with the app (prisma/seed.ts -> dist/prisma/seed.js),
  # so the image needs no TypeScript runner. It is idempotent: an existing demo
  # account is left as it is. Under NODE_ENV=production it also needs
  # ALLOW_DEMO_SEED=true.
  if [ -f dist/prisma/seed.js ]; then
    echo "Seeding the demo account..."
    node dist/prisma/seed.js
  else
    echo "SEED_DEMO=true, but this build has no demo seed (prisma/seed.ts); skipping."
  fi
fi

exec "$@"
