# ─── Stage 1: Build the frontend ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@10 --no-update-notifier

# Copy monorepo manifests first (layer-cache friendly)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared libraries consumed by the frontend
COPY lib/ ./lib/

# Copy the frontend source
COPY artifacts/fb-agency/ ./artifacts/fb-agency/

# Install all workspace dependencies
RUN pnpm install --no-frozen-lockfile

# Build args passed from docker-compose (VITE_BASE_PATH / VITE_PORT)
# The vite.config.ts reads BASE_PATH and PORT from the environment.
ARG VITE_BASE_PATH=/
ARG VITE_PORT=3000
ENV BASE_PATH=${VITE_BASE_PATH}
ENV PORT=${VITE_PORT}
ENV NODE_ENV=production

RUN pnpm --filter @workspace/fb-agency run build

# ─── Stage 2: Serve with nginx ────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/artifacts/fb-agency/dist/public /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
