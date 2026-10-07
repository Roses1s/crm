"""Проверки доверия к IP клиента за обратным прокси."""

from __future__ import annotations

import runpy
from pathlib import Path
from typing import Any

import pytest
import yaml
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

ROOT = Path(__file__).resolve().parents[2]
PROXY_ADDRESS = "${CRM_NGINX_PROXY_IP:-172.31.250.2}"


def test_gunicorn_does_not_trust_remote_proxy_headers_by_default(monkeypatch: Any) -> None:
    """Без настройки Gunicorn не доверяет заголовкам от удалённых узлов."""
    monkeypatch.delenv("GUNICORN_FORWARDED_ALLOW_IPS", raising=False)

    settings = runpy.run_path(str(ROOT / "backend" / "gunicorn.conf.py"))

    assert settings["forwarded_allow_ips"] == "127.0.0.1"


def test_gunicorn_accepts_the_configured_nginx_address(monkeypatch: Any) -> None:
    """Gunicorn получает доверенный IP через явную настройку контейнера."""
    monkeypatch.setenv("GUNICORN_FORWARDED_ALLOW_IPS", "172.31.250.2")

    settings = runpy.run_path(str(ROOT / "backend" / "gunicorn.conf.py"))

    assert settings["forwarded_allow_ips"] == "172.31.250.2"


def test_compose_trusts_only_the_static_nginx_address() -> None:
    """API и nginx делят отдельную сеть; других контейнеров в ней нет."""
    compose = yaml.safe_load((ROOT / "docker-compose.yml").read_text(encoding="utf-8"))
    services = compose["services"]
    backend = services["backend"]
    nginx = services["nginx"]

    assert backend["environment"]["GUNICORN_FORWARDED_ALLOW_IPS"] == PROXY_ADDRESS
    assert nginx["networks"]["proxy"]["ipv4_address"] == PROXY_ADDRESS

    proxy_peers = {
        name
        for name, service in services.items()
        if "proxy"
        in (
            service.get("networks", {}).keys()
            if isinstance(service.get("networks"), dict)
            else service.get("networks", [])
        )
    }
    assert proxy_peers == {"backend", "nginx"}
    assert compose["networks"]["proxy"]["ipam"]["config"][0]["subnet"] == (
        "${CRM_PROXY_SUBNET:-172.31.250.0/24}"
    )


def test_nginx_replaces_client_supplied_forwarded_for() -> None:
    """Nginx передаёт свой IP соединения, а не склеивает входной заголовок."""
    config = (ROOT / "deploy/nginx/conf.d/crmdetroid.ru.conf").read_text(encoding="utf-8")
    forwarded_for = [
        line.strip() for line in config.splitlines() if "proxy_set_header X-Forwarded-For" in line
    ]

    assert len(forwarded_for) == 3
    assert all(line.endswith("$remote_addr;") for line in forwarded_for)
    assert "$proxy_add_x_forwarded_for" not in config


@pytest.mark.parametrize(
    ("peer", "forwarded_for", "expected"),
    [
        ("172.31.250.2", "198.51.100.42", "198.51.100.42"),
        ("172.31.250.9", "203.0.113.77", "172.31.250.9"),
    ],
)
async def test_uvicorn_uses_forwarded_for_only_from_nginx(
    peer: str, forwarded_for: str, expected: str
) -> None:
    observed: list[tuple[str, int] | None] = []

    async def app(scope: dict[str, Any], _receive: Any, _send: Any) -> None:
        observed.append(scope["client"])

    scope = {
        "type": "http",
        "scheme": "http",
        "client": (peer, 8000),
        "headers": [(b"x-forwarded-for", forwarded_for.encode())],
    }
    middleware = ProxyHeadersMiddleware(app, trusted_hosts="172.31.250.2")

    async def receive() -> Any:
        raise AssertionError("Middleware не должно читать тело запроса")

    async def send(_message: Any) -> None:
        raise AssertionError("Тестовое ASGI-приложение не формирует ответ")

    await middleware(scope, receive, send)

    assert observed == [(expected, 0 if peer == "172.31.250.2" else 8000)]
