#!/bin/bash

# Database setup script for Lucky
# This script sets up PostgreSQL database and runs Prisma migrations

set -e

echo "🗄️  Setting up database for Lucky..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "Please set DATABASE_URL in your .env file"
    echo "Example: DATABASE_URL=postgresql://username:password@localhost:5432/discordbot"
    exit 1
fi

# Check if PostgreSQL is running
echo "🔍 Checking PostgreSQL connection..."
if ! pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running or not accessible"
    echo "Please ensure PostgreSQL is running and accessible"
    exit 1
fi

echo "✅ PostgreSQL is running and accessible"

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Run database migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy

# Seed database with initial data (optional)
if [ "$1" = "--seed" ]; then
    echo "🌱 Seeding database with initial data..."
    npx prisma db seed
fi

echo "✅ Database setup completed successfully!"
echo ""
echo "📊 Database status:"
npx prisma db status

echo ""
echo "🎉 Lucky database is ready to use!"
