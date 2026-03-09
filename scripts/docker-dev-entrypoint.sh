#!/bin/sh
set -e
if [ ! -f /app/node_modules/.bin/tsx ] && [ ! -f /app/packages/bot/node_modules/.bin/tsx ]; then
    npm install --no-audit --no-fund
fi
exec "$@"
