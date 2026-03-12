#!/bin/bash
set -euo pipefail

PRISMA_CONFIG_PATH="prisma/prisma.config.ts"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🗄️  Setting up database for Lucky..."

if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "Please set DATABASE_URL in your .env file"
    echo "Example: DATABASE_URL=postgresql://username:password@localhost:5432/discordbot"
    exit 1
fi

echo "🔍 Checking PostgreSQL connection..."
if ! pg_isready -d "$DATABASE_URL" >/dev/null 2>&1; then
    echo "❌ PostgreSQL is not running or not accessible"
    echo "Please ensure PostgreSQL is running and accessible"
    exit 1
fi

echo "✅ PostgreSQL is running and accessible"

echo "🔧 Generating Prisma client..."
npx prisma generate --config "$PRISMA_CONFIG_PATH"

echo "📦 Running database migrations..."
"$SCRIPT_DIR/db-migrate-safe.sh"

if [[ "${1:-}" = "--seed" ]]; then
    echo "🌱 Seeding database with initial data..."
    npx prisma db seed --config "$PRISMA_CONFIG_PATH"
fi

echo "✅ Database setup completed successfully!"
echo ""
echo "📊 Database status:"
npx prisma migrate status --config "$PRISMA_CONFIG_PATH"

echo ""
echo "🎉 Lucky database is ready to use!"
