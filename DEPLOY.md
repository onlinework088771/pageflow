# PageFlow — VPS Deployment Guide

## Requirements

| Requirement | Version |
|-------------|---------|
| Docker      | 24+     |
| Docker Compose | v2+  |
| RAM         | 1 GB+   |
| Disk        | 10 GB+  |

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/onlinework088771/pageflow.git
cd pageflow
```

### 2. Configure environment

```bash
cp .env.example .env
nano .env          # fill in every value — see comments inside
```

Generate secrets quickly:

```bash
# JWT_SECRET
openssl rand -hex 64

# SESSION_SECRET
openssl rand -hex 64

# DB_PASSWORD — pick any strong password
openssl rand -base64 32
```

### 3. Build and start

```bash
docker compose up -d --build
```

This starts three containers:
- **postgres** — PostgreSQL 16 database
- **api** — Node.js Express API on port 8080 (internal only)
- **web** — Nginx serving the built React frontend on port 80

### 4. Run database migrations

```bash
docker compose exec api node -e "
  import('./dist/index.mjs').then(() => {
    const { db } = require('./dist/index.mjs');
  });
"
```

Or run the drizzle push from your local machine (with DATABASE_URL pointing to your VPS):

```bash
DATABASE_URL=postgresql://pageflow:<DB_PASSWORD>@<VPS_IP>:5432/pageflow \
  pnpm --filter @workspace/db run push
```

> **Tip:** Expose port 5432 temporarily via `docker compose -f docker-compose.yml -f docker-compose.override.yml up` if you need remote access to the DB.

### 5. Verify

```bash
# Check all containers are running
docker compose ps

# Tail logs
docker compose logs -f api
docker compose logs -f web

# Quick health check
curl http://localhost/api/health
```

---

## HTTPS with Let's Encrypt (Certbot)

Install Certbot on the host and point nginx to the cert files, or use a reverse proxy like Caddy:

```bash
# Install Caddy (easiest option)
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/debian.bookworm main" | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install caddy

# /etc/caddy/Caddyfile
# yourdomain.com {
#   reverse_proxy localhost:80
# }
```

Set `HOST_PORT=8888` in `.env` (so Caddy can run on 80) then `docker compose up -d`.

---

## Updates

```bash
git pull
docker compose up -d --build
```

---

## ARM64 VPS (Ampere, Graviton, Apple Silicon)

The `pnpm-workspace.yaml` restricts esbuild/rollup to the `linux-x64` binary by default (optimised for Replit). For ARM64 Docker builds, add `--platform linux/arm64` or edit the overrides section in `pnpm-workspace.yaml` to include `linux-arm64-gnu` variants.

```bash
docker compose build --platform linux/arm64
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DB_PASSWORD` | ✅ | PostgreSQL password |
| `JWT_SECRET` | ✅ | JWT signing secret (64 hex chars) |
| `SESSION_SECRET` | ✅ | Session signing secret |
| `PUBLIC_BASE_URL` | ✅ | Full public URL e.g. `https://app.example.com` |
| `HOST_PORT` | optional | Host port for web container (default `80`) |

---

## File Upload Persistence

Uploaded videos are stored in a Docker volume named `uploads`. To back them up:

```bash
docker run --rm -v pageflow_uploads:/data -v $(pwd):/backup alpine \
  tar czf /backup/uploads-backup.tar.gz /data
```
