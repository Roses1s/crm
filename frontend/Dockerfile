# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
#  Фронтенд CRM Detroid: сборка Vite -> раздача статики nginx.
#  Node остаётся только в builder-слое, в финальном образе ~25 МБ nginx.
#
#  Образы закреплены по digest (И-02/И-03 ревью 06.10): nginx обновлён
#  1.27 -> 1.30 (актуальная стабильная ветка), и оба образа больше не
#  «плавают» с тегом. Обновление осознанное: новый digest с hub.docker.com,
#  правка здесь и в docker-compose.yml, пересборка. Digest-ы взяты
#  06.10.2026.
# ---------------------------------------------------------------------------

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS builder

WORKDIR /build

# Слой зависимостей кешируется отдельно от кода.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
FROM nginx:1.30-alpine@sha256:0985e772fb9f729e6fa0980da05fca5d9c468e870eed43071545afa9d2e27d94 AS runtime

COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q -O - http://127.0.0.1/ >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]
