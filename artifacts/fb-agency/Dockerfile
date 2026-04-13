FROM node:22-slim AS builder

WORKDIR /app

RUN npm install -g pnpm@10 --no-update-notifier

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/ ./lib/
COPY artifacts/fb-agency/ ./artifacts/fb-agency/

RUN pnpm install --frozen-lockfile

ARG VITE_BASE_PATH=/
ARG VITE_PORT=3000

WORKDIR /app/artifacts/fb-agency
RUN BASE_PATH=${VITE_BASE_PATH} PORT=${VITE_PORT} pnpm run build

FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/artifacts/fb-agency/dist/public /usr/share/nginx/html
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
