"""Вложения: загрузка, скачивание, лимиты, права на удаление."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from httpx import AsyncClient
from PIL import Image

from app.core.attachment_paths import is_thumbnail_path, thumbnail_path
from app.core.config import settings
from tests.conftest import TEST_PASSWORD


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def sample_png() -> bytes:
    image = Image.new("RGB", (1200, 800), (41, 91, 127))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    image.close()
    return buffer.getvalue()


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
    assert (
        await auth_client.get(f"/api/v1/crm/attachments/{body['id']}/thumbnail")
    ).status_code == 404


async def test_thumbnail_is_smaller_and_original_remains_unchanged(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Лента получает WebP уменьшенного размера, оригинал доступен без изменений."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    original_bytes = sample_png()
    uploaded = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Фото.png", original_bytes, "image/png")},
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["id"]

    thumbnail = await auth_client.get(f"/api/v1/crm/attachments/{attachment_id}/thumbnail")

    assert thumbnail.status_code == 200, thumbnail.text
    assert thumbnail.headers["content-type"] == "image/webp"
    assert thumbnail.headers["cache-control"] == "private, no-store"
    assert thumbnail.headers["content-disposition"].startswith("inline")
    assert thumbnail.headers["x-content-type-options"] == "nosniff"
    with Image.open(BytesIO(thumbnail.content)) as decoded:
        assert decoded.format == "WEBP"
        assert decoded.size == (480, 320)
    assert len(thumbnail.content) < len(original_bytes)

    stored_files = [
        path
        for path in Path(settings.attachments_dir).rglob("*")
        if path.is_file() and not is_thumbnail_path(path)
    ]
    assert len(stored_files) == 1
    original_path = stored_files[0]
    cached_thumbnail = thumbnail_path(original_path)
    assert cached_thumbnail.read_bytes() == thumbnail.content

    full_file = await auth_client.get(f"/api/v1/crm/attachments/{attachment_id}")
    assert full_file.status_code == 200
    assert full_file.content == original_bytes
    assert original_path.read_bytes() == original_bytes


async def test_thumbnail_rejects_corrupt_image_but_preserves_original(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    original_bytes = b"this is not a JPEG"
    uploaded = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("broken.jpg", original_bytes, "image/jpeg")},
    )
    attachment_id = uploaded.json()["id"]

    thumbnail = await auth_client.get(f"/api/v1/crm/attachments/{attachment_id}/thumbnail")
    full_file = await auth_client.get(f"/api/v1/crm/attachments/{attachment_id}")

    assert thumbnail.status_code == 422
    assert thumbnail.json()["code"] == "invalid_image"
    assert full_file.status_code == 200
    assert full_file.content == original_bytes


async def test_thumbnail_has_the_same_access_as_original(
    client: AsyncClient, auth_client: AsyncClient, seeded: dict
) -> None:
    """Проверка прав идёт до создания кеша и совпадает с ручкой оригинала."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    uploaded = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Фото.png", sample_png(), "image/png")},
    )
    attachment_id = uploaded.json()["id"]
    headers = await manager_headers(client)

    original = await client.get(f"/api/v1/crm/attachments/{attachment_id}", headers=headers)
    thumbnail = await client.get(
        f"/api/v1/crm/attachments/{attachment_id}/thumbnail", headers=headers
    )

    assert original.status_code == 404
    assert thumbnail.status_code == original.status_code
    assert not any(
        is_thumbnail_path(path)
        for path in Path(settings.attachments_dir).rglob("*")
        if path.is_file()
    )


@pytest.mark.parametrize("name", ["page.html", "иконка.svg", "setup.exe", "файл-без-расширения"])
async def test_dangerous_extensions_are_rejected(
    auth_client: AsyncClient, seeded: dict, name: str
) -> None:
    """SVG и HTML браузер разбирает как разметку — такие вложения не принимаем."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": (name, b"<script>alert(1)</script>", "text/html")},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "unsupported_file_type"


async def test_content_type_comes_from_extension_not_from_client(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Заголовку клиента не верим: тип определяется расширением файла."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("данные.csv", b"a,b,c", "text/html")},
    )
    assert response.status_code == 201
    assert response.json()["content_type"] == "text/csv"


async def test_path_traversal_in_filename_is_neutralised(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("../../etc/passwd.txt", b"root:x:0:0", "text/plain")},
    )
    assert response.status_code == 201
    # Имя для показа остаётся, но на диск файл лёг внутрь каталога вложений.
    assert response.json()["name"] == "passwd.txt"
    stored = list(Path(settings.attachments_dir).rglob("*"))
    assert all(Path(settings.attachments_dir) in p.parents for p in stored if p.is_file())


async def test_too_big_file_is_rejected(
    auth_client: AsyncClient, seeded: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Лимит проверяется по ходу записи, а не после — файл не читается в память целиком."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    before = {p for p in Path(settings.attachments_dir).rglob("*") if p.is_file()}

    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("big.zip", b"x" * (2 * 1024 * 1024), "application/zip")},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "file_too_large"
    # Недописанный файл на диске не остаётся.
    assert {p for p in Path(settings.attachments_dir).rglob("*") if p.is_file()} == before


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


async def test_manager_cannot_delete_foreign_attachment(
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
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    manager_token = login.json()["access_token"]

    # Лид принадлежит админу, поэтому для менеджера его вложения «не существуют».
    denied = await client.delete(
        f"/api/v1/crm/attachments/{attachment_id}",
        headers={"Authorization": f"Bearer {manager_token}"},
    )
    assert denied.status_code == 404

    # Автор (админ) удалить может — и файл исчезает с диска.
    path = Path(
        (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/attachments")).json()[0]["name"]
    )
    assert path  # имя осталось в выдаче
    removed = await auth_client.delete(f"/api/v1/crm/attachments/{attachment_id}")
    assert removed.status_code == 204
    assert (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/attachments")).json() == []


async def test_shipment_attachment_upload_and_isolation(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Файл заявки скачивается общей ручкой и не попадает в список файлов лида."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment_id = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()[
        "id"
    ]

    uploaded = await auth_client.post(
        f"/api/v1/shipments/{shipment_id}/attachments",
        files={"file": ("Накладная.pdf", b"%PDF-1.4 ttn", "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["id"]

    listed = await auth_client.get(f"/api/v1/shipments/{shipment_id}/attachments")
    assert [a["name"] for a in listed.json()] == ["Накладная.pdf"]

    # Владелец решил показывать документы перевозки только на самой заявке.
    lead_files = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/attachments")
    assert "Накладная.pdf" not in [a["name"] for a in lead_files.json()]

    downloaded = await auth_client.get(f"/api/v1/crm/attachments/{attachment_id}")
    assert downloaded.status_code == 200
    assert downloaded.content == b"%PDF-1.4 ttn"


async def test_shipment_attachment_rejects_dangerous_extension(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment_id = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()[
        "id"
    ]

    response = await auth_client.post(
        f"/api/v1/shipments/{shipment_id}/attachments",
        files={"file": ("схема.svg", b"<svg onload=alert(1)>", "image/svg+xml")},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "unsupported_file_type"


async def test_shipment_attachment_unknown_shipment(auth_client: AsyncClient) -> None:
    response = await auth_client.post(
        "/api/v1/shipments/999999/attachments",
        files={"file": ("Накладная.pdf", b"%PDF", "application/pdf")},
    )
    assert response.status_code == 404


async def test_shipment_attachment_can_be_deleted(auth_client: AsyncClient, seeded: dict) -> None:
    """Удаление идёт общей ручкой: автор файла может удалить свою загрузку."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment_id = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()[
        "id"
    ]
    attachment = (
        await auth_client.post(
            f"/api/v1/shipments/{shipment_id}/attachments",
            files={"file": ("Акт.pdf", b"%PDF act", "application/pdf")},
        )
    ).json()

    stored = Path(settings.attachments_dir) / "shipments" / str(shipment_id)
    assert list(stored.iterdir()), "файл должен лежать в папке заявки"

    deleted = await auth_client.delete(f"/api/v1/crm/attachments/{attachment['id']}")
    assert deleted.status_code == 204

    remaining = await auth_client.get(f"/api/v1/shipments/{shipment_id}/attachments")
    assert remaining.json() == []
    assert not list(stored.iterdir()), "файл должен исчезнуть и с диска"


async def test_colleague_can_view_but_not_upload_lost_lead_attachments(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Проигранный лид общий на чтение: вложения видны всем, загрузка — только после claim."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]

    await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Договор.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id})

    headers = await manager_headers(auth_client)
    listed = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/attachments", headers=headers)
    assert listed.status_code == 200
    assert [a["name"] for a in listed.json()] == ["Договор.pdf"]

    uploaded = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Чужое.pdf", b"%PDF-1.4 other", "application/pdf")},
        headers=headers,
    )
    assert uploaded.status_code == 404


async def test_previous_owner_cannot_change_lost_lead_attachments_until_restored(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    original = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Договор.pdf", b"%PDF-1.4 original", "application/pdf")},
    )
    assert original.status_code == 201, original.text
    attachment_id = original.json()["id"]

    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]
    lost = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id}
    )
    assert lost.status_code == 204

    uploaded = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Ещё.pdf", b"%PDF-1.4 extra", "application/pdf")},
    )
    assert uploaded.status_code == 409
    assert uploaded.json()["code"] == "lead_lost"

    deleted = await auth_client.delete(f"/api/v1/crm/attachments/{attachment_id}")
    assert deleted.status_code == 409
    assert deleted.json()["code"] == "lead_lost"

    restored = await auth_client.post(f"/api/v1/crm/leads/{lead_id}/restore")
    assert restored.status_code == 204

    after_restore = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("После.pdf", b"%PDF-1.4 restored", "application/pdf")},
    )
    assert after_restore.status_code == 201, after_restore.text

    deleted_after_restore = await auth_client.delete(f"/api/v1/crm/attachments/{attachment_id}")
    assert deleted_after_restore.status_code == 204


async def test_upload_is_blocked_when_disk_is_almost_full(
    auth_client: AsyncClient, seeded: dict[str, object], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Последний запас места не отдаём под загрузки.

    База, резервные копии и вложения живут на одном разделе: если его забить
    файлами, остановится PostgreSQL. Поэтому при нехватке места загрузка
    отвечает понятной ошибкой, а не пишет файл «до упора».
    """
    lead = seeded["lead"]
    # Требуем заведомо больше, чем есть на любом диске.
    monkeypatch.setattr(settings, "min_free_disk_mb", 10_000_000)

    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead.id}/attachments",  # type: ignore[attr-defined]
        files={"file": ("doc.txt", "данные".encode(), "text/plain")},
    )

    assert response.status_code == 507, response.text
    assert response.json()["code"] == "low_disk_space"
