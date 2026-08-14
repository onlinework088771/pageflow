# ─── Stage 1: Build the frontend ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@10 --no-update-notifier

# Copy monorepo manifests first (layer-cache friendly)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy shared libraries consumed by the frontend (exported as raw TS source)
COPY lib/ ./lib/

# Copy the frontend source
COPY artifacts/fb-agency/ ./artifacts/fb-agency/

# Install all workspace dependencies from the monorepo root
RUN pnpm install --frozen-lockfile

# Build args passed from docker-compose (VITE_BASE_PATH / VITE_PORT).
# vite.config.ts reads BASE_PATH and PORT from the environment.
ARG VITE_BASE_PATH=/
ARG VITE_PORT=3000
ENV BASE_PATH=${VITE_BASE_PATH}
ENV PORT=${VITE_PORT}
ENV NODE_ENV=production

# Change into the package directory — same pattern as the api-server Dockerfile.
# Running pnpm run build from inside the package dir ensures the local
# node_modules/.bin is on PATH and Vite resolves workspace imports correctly.
WORKDIR /app/artifacts/fb-agency
RUN pnpm run build

# ─── Stage 2: Serve with nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/artifacts/fb-agency/dist/public /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
