# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
#  Фронтенд CRM Detroid: сборка Vite -> раздача статики nginx.
#  Node остаётся только в builder-слое, в финальном образе ~25 МБ nginx.
# ---------------------------------------------------------------------------

FROM node:22-alpine AS builder

WORKDIR /build

# Слой зависимостей кешируется отдельно от кода.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O - http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
