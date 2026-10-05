#!/bin/sh
# -----------------------------------------------------------------------------
#  Deploy-hook для Certbot: вызывается ТОЛЬКО когда сертификат реально обновился.
#  Путь на сервере: /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
#  Права: chmod +x
#
#  Nginx живёт в контейнере, поэтому «перечитать сертификаты» = послать
#  процессу сигнал HUP (мягкая перезагрузка конфигурации, без простоя).
# -----------------------------------------------------------------------------
set -eu

CONTAINER="crm-nginx"

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
    docker kill --signal=HUP "$CONTAINER" >/dev/null 2>&1 \
        && echo "[certbot-hook] nginx перечитал сертификаты" \
        || docker restart "$CONTAINER" >/dev/null 2>&1
else
    echo "[certbot-hook] контейнер $CONTAINER не запущен — пропускаю reload"
fi
