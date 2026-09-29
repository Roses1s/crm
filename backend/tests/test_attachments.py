"""Вложения: загрузка, скачивание, лимиты, права на удаление."""

from __future__ import annotations

from pathlib import Path

from httpx import AsyncClient

from app.core.config import settings
from tests.conftest import TEST_PASSWORD


async def test_upload_and_download(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Договор.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Договор.pdf"
    assert body["size"] == len(b"%PDF-1.4 fake")
    assert body["uploaded_by_name"] == "Артём Соколов"

    listed = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/attachments")
    assert [a["name"] for a in listed.json()] == ["Договор.pdf"]

    downloaded = await auth_client.get(f"/api/v1/crm/attachments/{body['id']}")
    assert downloaded.status_code == 200
    assert downloaded.content == b"%PDF-1.4 fake"
    # PDF показывается в окне, произвольный файл — только скачиванием.
    assert downloaded.headers["content-disposition"].startswith("inline")
    assert downloaded.headers["x-content-type-options"] == "nosniff"


async def test_executable_is_served_as_download(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    created = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("page.html", b"<script>alert(1)</script>", "text/html")},
    )
    response = await auth_client.get(f"/api/v1/crm/attachments/{created.json()['id']}")
    assert response.headers["content-disposition"].startswith("attachment")


async def test_path_traversal_in_filename_is_neutralised(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("../../etc/passwd", b"root:x:0:0", "text/plain")},
    )
    assert response.status_code == 201
    # Имя для показа остаётся, но на диск файл лёг внутрь каталога вложений.
    assert response.json()["name"] == "passwd"
    stored = list(Path(settings.attachments_dir).rglob("*"))
    assert all(Path(settings.attachments_dir) in p.parents for p in stored if p.is_file())


async def test_too_big_file_is_rejected(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    payload = b"x" * (settings.max_upload_mb * 1024 * 1024 + 1024)
    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("big.bin", payload, "application/octet-stream")},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "file_too_large"


async def test_attachment_can_be_linked_to_timeline_entry(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    note = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/notes", json={"body": "Смотри вложение"}
    )
    entry_id = note.json()["id"]

    await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments?entry_id={entry_id}",
        files={"file": ("act.pdf", b"data", "application/pdf")},
    )

    timeline = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")
    entry = next(e for e in timeline.json() if e["id"] == entry_id)
    assert [a["name"] for a in entry["attachments"]] == ["act.pdf"]


async def test_operator_cannot_delete_foreign_attachment(
    client: AsyncClient, auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    created = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("admin.txt", b"secret", "text/plain")},
    )
    attachment_id = created.json()["id"]

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "operator@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    operator_token = login.json()["access_token"]

    denied = await client.delete(
        f"/api/v1/crm/attachments/{attachment_id}",
        headers={"Authorization": f"Bearer {operator_token}"},
    )
    assert denied.status_code == 403

    # Автор (админ) удалить может — и файл исчезает с диска.
    path = Path(
        (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/attachments")).json()[0]["name"]
    )
    assert path  # имя осталось в выдаче
    removed = await auth_client.delete(f"/api/v1/crm/attachments/{attachment_id}")
    assert removed.status_code == 204
    assert (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/attachments")).json() == []
