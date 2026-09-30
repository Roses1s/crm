"""Конфигурация Gunicorn 23 для продакшена.

Запуск: gunicorn app.main:app -c gunicorn.conf.py
"""

from __future__ import annotations

import multiprocessing
import os

bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")

# UvicornWorker — ASGI-воркер: Gunicorn управляет процессами,
# uvicorn внутри каждого обрабатывает асинхронные запросы.
worker_class = "uvicorn.workers.UvicornWorker"

# На VPS с 2 ГБ памяти держим 2 воркера: формула 2*CPU+1 съест всю память.
workers = int(os.getenv("GUNICORN_WORKERS", min(multiprocessing.cpu_count(), 2)))

timeout = int(os.getenv("GUNICORN_TIMEOUT", 60))
graceful_timeout = 30
keepalive = 5

# Доверяем заголовкам X-Forwarded-* от nginx.
# Приложение стоит за обратным прокси в отдельной docker-сети и снаружи
# напрямую недоступно, поэтому единственный, кто к нему подключается, — nginx.
# Без этого uvicorn видит IP docker-шлюза вместо реального клиента, и тогда
# ограничение частоты запросов и журнал аудита ошибочно считают всех одним IP.
# По умолчанию "*" (доверяем любому пиру); можно сузить через переменную.
forwarded_allow_ips = os.getenv("GUNICORN_FORWARDED_ALLOW_IPS", "*")

# Профилактика утечек памяти: воркер перезапускается после N запросов.
max_requests = 1000
max_requests_jitter = 100

accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info").lower()
capture_output = True
preload_app = False
