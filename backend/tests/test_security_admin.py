"""Раздел «Безопасность»: журнал попыток входа и резервные копии."""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from tests.conftest import TEST_PASSWORD


async def test_failed_login_is_recorded(client: AsyncClient, seeded: dict[str, object]) -> None:
    await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": "wrong-one"},
    )
    await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": "wrong-two"},
    )

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    token = login.json()["access_token"]

    response = await client.get(
        "/api/v1/admin/login-attempts", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["username"] == "admin@crmdetroid.ru"
    # Две неудачные попытки сгруппированы в одну строку, удачная не считается.
    assert rows[0]["failures"] == 2


async def test_login_attempts_require_admin(client: AsyncClient, seeded: dict[str, object]) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    token = login.json()["access_token"]
    response = await client.get(
        "/api/v1/admin/login-attempts", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403


async def test_backups_report_missing_directory(auth_client: AsyncClient) -> None:
    """Каталога бэкапов в тестах нет — ручка должна сказать «устарело», а не упасть."""
    response = await auth_client.get("/api/v1/admin/backups")
    assert response.status_code == 200
    body = response.json()
    assert body["results"] == []
    assert body["is_stale"] is True
    assert body["last_backup_at"] is None


async def test_backups_report_counts_uploaded_files(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """После загрузки файла сводка по месту на диске видит его размер."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    payload = b"%PDF-1.4 " + b"x" * 500
    upload = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Договор.pdf", payload, "application/pdf")},
    )
    assert upload.status_code == 201, upload.text

    response = await auth_client.get("/api/v1/admin/backups")
    assert response.status_code == 200
    storage = response.json()["storage"]
    assert storage["files"] == 1
    assert storage["bytes"] == len(payload)


async def test_admin_can_delete_any_backup(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Админ удаляет копию — файл исчезает и из каталога, и из списка."""
    (tmp_path / "crm-2026-10-05.dump").write_bytes(b"old")
    (tmp_path / "crm-2026-10-06.dump").write_bytes(b"new")
    monkeypatch.setattr(settings, "backup_dir", str(tmp_path))

    response = await auth_client.delete("/api/v1/admin/backups/crm-2026-10-05.dump")
    assert response.status_code == 204
    assert not (tmp_path / "crm-2026-10-05.dump").exists()
    assert (tmp_path / "crm-2026-10-06.dump").exists()

    names = [f["name"] for f in (await auth_client.get("/api/v1/admin/backups")).json()["results"]]
    assert names == ["crm-2026-10-06.dump"]


async def test_delete_backup_rejects_foreign_names(
    auth_client: AsyncClient, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Мимо шаблона имён и каталога копий удалить ничего нельзя."""
    monkeypatch.setattr(settings, "backup_dir", str(tmp_path))
    for name in (
        "notes.txt",  # не похоже на имя копии
        "crm-dump",  # нет расширения .dump
        "crm-2026.dump.bak",  # постороннее расширение
        "crm-missing.dump",  # подходящее имя, но файла нет
        "%2E%2E%2Fcrm-secret.dump",  # попытка выйти из каталога
    ):
        response = await auth_client.delete(f"/api/v1/admin/backups/{name}")
        assert response.status_code == 404, name
    assert list(tmp_path.iterdir()) == []


async def test_delete_backup_is_admin_only(
    client: AsyncClient, seeded: dict[str, object], monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Менеджеру удаление копий недоступно, файл остаётся на месте."""
    (tmp_path / "crm-x.dump").write_bytes(b"x")
    monkeypatch.setattr(settings, "backup_dir", str(tmp_path))
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    token = login.json()["access_token"]

    response = await client.delete(
        "/api/v1/admin/backups/crm-x.dump",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    assert (tmp_path / "crm-x.dump").exists()


async def test_deleting_user_moves_leads_to_admin(
    auth_client: AsyncClient, client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Лиды уволенного сотрудника переезжают на доску администратора."""
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    stages = (await client.get("/api/v1/crm/stages", headers=headers)).json()
    # «Новый» есть и у администратора — карточка должна попасть в одноимённый этап.
    new_stage = next(s for s in stages if s["name"] == "Новый")
    await client.post(
        "/api/v1/crm/leads",
        json={"name": "ООО «Сирень»", "inn": "7451234565", "stage_id": new_stage["id"]},
        headers=headers,
    )

    removed = await auth_client.delete(f"/api/v1/admin/users/{manager_id}")
    assert removed.status_code == 204

    mine = (await auth_client.get("/api/v1/crm/leads")).json()["results"]
    moved = next(lead for lead in mine if lead["name"] == "ООО «Сирень»")
    assert moved["stage_name"] == "Новый"

    admin_stages = (await auth_client.get("/api/v1/crm/stages")).json()
    assert moved["stage_id"] in [s["id"] for s in admin_stages]


async def test_last_admin_cannot_demote_himself(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Единственный администратор не может снять с себя роль.

    Регрессия: раньше запрос проходил, и в системе не оставалось никого, кто
    может заводить сотрудников и смотреть бэкапы.
    """
    admin = seeded["admin"]
    response = await auth_client.patch(
        f"/api/v1/admin/users/{admin.id}",  # type: ignore[attr-defined]
        json={"role": "manager"},
    )
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "last_admin"


async def test_last_admin_cannot_disable_himself(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    admin = seeded["admin"]
    response = await auth_client.patch(
        f"/api/v1/admin/users/{admin.id}",  # type: ignore[attr-defined]
        json={"is_active": False},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "last_admin"


async def test_admin_can_step_down_when_there_is_another_admin(
    auth_client: AsyncClient, session: AsyncSession, seeded: dict[str, object]
) -> None:
    """Если администраторов двое — роль снять можно."""
    created = await auth_client.post(
        "/api/v1/admin/users",
        json={
            "email": "second-admin@crmdetroid.ru",
            "password": "SuperSecret123",
            "first_name": "Второй",
            "last_name": "Админ",
            "role": "admin",
        },
    )
    assert created.status_code == 201, created.text

    admin = seeded["admin"]
    response = await auth_client.patch(
        f"/api/v1/admin/users/{admin.id}",  # type: ignore[attr-defined]
        json={"role": "manager"},
    )
    assert response.status_code == 200, response.text


async def test_scan_backups_orders_by_freshness(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Список копий: свежие сверху, размер и время берутся одним stat (И-10)."""
    from app.services.admin import scan_backups as _scan_backups

    old = tmp_path / "crm-2026-10-01.dump"
    new = tmp_path / "crm-2026-10-06.dump"
    old.write_bytes(b"x" * 10)
    new.write_bytes(b"y" * 20)
    os.utime(old, (1_000_000, 1_000_000))
    os.utime(new, (2_000_000, 2_000_000))

    results, last_mtime = _scan_backups(tmp_path)

    assert [r["name"] for r in results] == ["crm-2026-10-06.dump", "crm-2026-10-01.dump"]
    assert results[0]["size"] == 20
    assert last_mtime == 2_000_000.0
    # Чужие файлы каталога в список копий не попадают.
    (tmp_path / "notes.txt").write_text("мусор")
    assert [r["name"] for r in _scan_backups(tmp_path)[0]] == [
        "crm-2026-10-06.dump",
        "crm-2026-10-01.dump",
    ]
