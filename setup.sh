#!/usr/bin/env bash
set -euo pipefail

echo "╔══════════════════════════════════════╗"
echo "║   PageFlow — VPS Setup Script        ║"
echo "╚══════════════════════════════════════╝"
echo ""

command -v docker >/dev/null 2>&1 || { echo "❌ Docker is not installed. Visit https://docs.docker.com/get-docker/"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "❌ Docker Compose v2 is not installed."; exit 1; }

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ Created .env from .env.example"
  echo ""
  echo "⚠️  Please edit .env with your values, then re-run this script."
  echo "   Generate secrets with: openssl rand -hex 64"
  exit 0
fi

echo "🔨 Building and starting containers..."
docker compose up -d --build

echo ""
echo "⏳ Waiting for the database to be ready..."
sleep 5

echo ""
echo "✅ PageFlow is running!"
echo ""
echo "   Dashboard → http://$(hostname -I | awk '{print $1}'):${HOST_PORT:-80}"
echo ""
echo "Useful commands:"
echo "  docker compose logs -f api    # API server logs"
echo "  docker compose logs -f web    # Nginx logs"
echo "  docker compose ps             # Container status"
echo "  docker compose down           # Stop everything"
