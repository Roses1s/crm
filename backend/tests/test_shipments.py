"""Заявки и справочники."""

from __future__ import annotations

from decimal import Decimal

from asyncpg.exceptions import UniqueViolationError
from httpx import AsyncClient
from sqlalchemy.exc import IntegrityError

from app.core.errors import _classify_integrity_error
from tests.conftest import TEST_PASSWORD


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def test_asyncpg_shipment_number_constraint_has_specific_conflict_code() -> None:
    """asyncpg передаёт имя ограничения напрямую, не через ``diag``."""
    orig = UniqueViolationError("duplicate key")
    orig.constraint_name = "uq_shipments_number"
    exc = IntegrityError("UPDATE shipments", {}, orig)

    assert _classify_integrity_error(exc) == (
        "shipment_number_conflict",
        "Номер заявки уже используется",
        409,
    )


async def test_create_and_read_shipment(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    created = await auth_client.post(
        "/api/v1/shipments",
        json={
            "lead_id": lead_id,
            "carrier_name": "ООО «АвтоТрансЛайн»",
            "carrier_inn": "7447112236",
            "carrier_contact": "Логист Иванов",
            "loading_cities": ["Челябинск"],
            "unloading_cities": ["Новосибирск"],
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["route"] == "Челябинск → Новосибирск"
    assert body["status"] == "new"
    assert body["lead_name"] == "ООО «Уралпромснаб»"
    assert body["carrier_name"] == "ООО «АвтоТрансЛайн»"
    assert body["carrier_inn"] == "7447112236"
    assert body["carrier_contact"] == "Логист Иванов"
    # Обычно номер по умолчанию равен id; при занятом id сервис добавляет суффикс.
    assert body["number"] == str(body["id"])

    listed = await auth_client.get("/api/v1/shipments")
    listed_body = listed.json()
    assert listed_body["count"] == 1
    assert listed_body["results"][0]["lead_name"] == "ООО «Уралпромснаб»"
    assert listed_body["results"][0]["seller_name"] == "Артём Соколов"

    by_lead = await auth_client.get(f"/api/v1/leads/{lead_id}/shipments")
    assert len(by_lead.json()) == 1


async def test_shipment_created_at_is_choosable_and_editable(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Заявку часто заводят в CRM позже, чем она реально возникла — нужно
    уметь указать дату создания задним числом при заведении и поправить её
    потом, а если не трогать поле вовсе — работает обычный now() из базы."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    # 1. Не передали created_at — подставляется текущее время сервером.
    default_created = (
        await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})
    ).json()
    assert default_created["created_at"]  # просто не пусто

    # 2. Указали дату создания явно при заведении заявки — задним числом.
    backdated = await auth_client.post(
        "/api/v1/shipments",
        json={"lead_id": lead_id, "created_at": "2026-01-15T09:30:00+00:00"},
    )
    assert backdated.status_code == 201, backdated.text
    assert backdated.json()["created_at"].startswith("2026-01-15T09:30:00")

    # 3. Дату создания можно поправить и у уже существующей заявки.
    shipment_id = backdated.json()["id"]
    patched = await auth_client.patch(
        f"/api/v1/shipments/{shipment_id}",
        json={"created_at": "2025-12-01T00:00:00+00:00"},
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["created_at"].startswith("2025-12-01T00:00:00")

    # Заявка со старой датой создания должна и в списке её показывать.
    fetched = await auth_client.get(f"/api/v1/shipments/{shipment_id}")
    assert fetched.json()["created_at"].startswith("2025-12-01T00:00:00")


async def test_shipment_number_is_editable(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()

    updated = await auth_client.patch(
        f"/api/v1/shipments/{shipment['id']}", json={"number": "ЗНТ-042"}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["number"] == "ЗНТ-042"

    again = await auth_client.get(f"/api/v1/shipments/{shipment['id']}")
    assert again.json()["number"] == "ЗНТ-042"


async def test_shipment_number_conflict_on_create(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    payload = {"lead_id": lead_id, "number": "ЗНТ-042"}

    created = await auth_client.post("/api/v1/shipments", json=payload)
    assert created.status_code == 201, created.text

    duplicate = await auth_client.post("/api/v1/shipments", json=payload)
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["code"] == "shipment_number_conflict"
    assert duplicate.json()["detail"] == "Номер заявки уже используется"


async def test_shipment_number_conflict_on_update(
    auth_client: AsyncClient, seeded: dict, session
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    first = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()
    second = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()

    claimed = await auth_client.patch(
        f"/api/v1/shipments/{first['id']}", json={"number": "ЗНТ-042"}
    )
    assert claimed.status_code == 200, claimed.text

    duplicate = await auth_client.patch(
        f"/api/v1/shipments/{second['id']}", json={"number": "ЗНТ-042"}
    )
    assert duplicate.status_code == 409, duplicate.text
    assert duplicate.json()["code"] == "shipment_number_conflict"
    # В тестовой обвязке одна сессия переиспользуется между запросами;
    # реальная зависимость FastAPI откатывает её после IntegrityError сама.
    await session.rollback()

    unchanged = await auth_client.get(f"/api/v1/shipments/{second['id']}")
    assert unchanged.json()["number"] == str(second["id"])


async def test_default_shipment_number_avoids_a_custom_number(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    first = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()
    second = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()

    next_id = second["id"] + 1
    reserved = await auth_client.patch(
        f"/api/v1/shipments/{first['id']}", json={"number": str(next_id)}
    )
    assert reserved.status_code == 200, reserved.text

    created = await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})
    assert created.status_code == 201, created.text
    assert created.json()["id"] == next_id
    assert created.json()["number"] == f"{next_id}-2"


async def test_shipment_number_cannot_be_blanked(auth_client: AsyncClient, seeded: dict) -> None:
    """Номер — единственный видимый идентификатор заявки: стереть его в PATCH
    пустой строкой нельзя (иначе заявка молча теряет имя без отката)."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()

    blanked = await auth_client.patch(f"/api/v1/shipments/{shipment['id']}", json={"number": ""})
    assert blanked.status_code == 422

    unchanged = await auth_client.get(f"/api/v1/shipments/{shipment['id']}")
    assert unchanged.json()["number"] == str(shipment["id"])


async def test_shipments_search(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    created = await auth_client.post(
        "/api/v1/shipments",
        json={"lead_id": lead_id, "carrier_name": "ООО «АвтоТрансЛайн»"},
    )
    shipment = created.json()
    await auth_client.patch(f"/api/v1/shipments/{shipment['id']}", json={"number": "ЗНТ-777"})

    by_number = await auth_client.get("/api/v1/shipments?search=ЗНТ-777")
    assert by_number.json()["count"] == 1

    by_lead_name = await auth_client.get("/api/v1/shipments?search=Уралпромснаб")
    assert by_lead_name.json()["count"] == 1

    by_carrier_name = await auth_client.get("/api/v1/shipments?search=АвтоТрансЛайн")
    assert by_carrier_name.json()["count"] == 1

    no_match = await auth_client.get("/api/v1/shipments?search=несуществующий-текст")
    assert no_match.json()["count"] == 0


async def test_shipments_search_escapes_like_wildcards(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """«%» и «_» в строке поиска — это литералы, а не маска ILIKE."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()
    await auth_client.patch(f"/api/v1/shipments/{shipment['id']}", json={"number": "50%"})

    literal_match = await auth_client.get("/api/v1/shipments?search=50%25")
    assert literal_match.json()["count"] == 1

    # Без экранирования «50» тоже матчился бы (ILIKE «%50%» воспринял бы
    # «%» как спецсимвол маски) — здесь проверяем, что это не так: другая
    # заявка без «%» в номере под такой поиск не попадает.
    other = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()
    await auth_client.patch(f"/api/v1/shipments/{other['id']}", json={"number": "50"})
    still_one = await auth_client.get("/api/v1/shipments?search=50%25")
    assert still_one.json()["count"] == 1


async def test_status_transition(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment_id = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()[
        "id"
    ]

    response = await auth_client.patch(
        f"/api/v1/shipments/{shipment_id}/status", json={"status": "loaded"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "loaded"


async def test_status_cannot_bypass_history_through_generic_patch(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()

    bypass = await auth_client.patch(
        f"/api/v1/shipments/{shipment['id']}", json={"status": "loaded"}
    )
    assert bypass.status_code == 422
    assert bypass.json()["code"] == "validation_error"

    unchanged = await auth_client.get(f"/api/v1/shipments/{shipment['id']}")
    assert unchanged.json()["status"] == "new"
    timeline = await auth_client.get(f"/api/v1/shipments/{shipment['id']}/timeline")
    assert timeline.json() == []


async def test_status_change_is_written_to_shipment_timeline(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment_id = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()[
        "id"
    ]

    await auth_client.patch(f"/api/v1/shipments/{shipment_id}/status", json={"status": "loaded"})

    timeline = await auth_client.get(f"/api/v1/shipments/{shipment_id}/timeline")
    entries = timeline.json()
    assert entries[0]["type"] == "history"
    assert entries[0]["old_value"] == "Новая"
    assert entries[0]["new_value"] == "Машина загрузилась"

    # Запись о переносе заявки между этапами разрешено убрать любому сотруднику.
    assert entries[0]["is_stage_change"] is True
    deleted = await auth_client.delete(
        f"/api/v1/shipments/{shipment_id}/timeline/{entries[0]['id']}"
    )
    assert deleted.status_code == 204
    assert (await auth_client.get(f"/api/v1/shipments/{shipment_id}/timeline")).json() == []

    # Лента лида не должна показывать записи заявки.
    lead_timeline = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")
    assert all(e["field_label"] != "Этап" for e in lead_timeline.json())


async def test_shipment_note_crud(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment_id = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()[
        "id"
    ]

    created = await auth_client.post(
        f"/api/v1/shipments/{shipment_id}/notes", json={"body": "Черновик"}
    )
    assert created.status_code == 201
    entry_id = created.json()["id"]

    edited = await auth_client.patch(
        f"/api/v1/shipments/{shipment_id}/timeline/{entry_id}", json={"body": "Исправлено"}
    )
    assert edited.status_code == 200
    assert edited.json()["body"] == "Исправлено"

    deleted = await auth_client.delete(f"/api/v1/shipments/{shipment_id}/timeline/{entry_id}")
    assert deleted.status_code == 204

    after = await auth_client.get(f"/api/v1/shipments/{shipment_id}/timeline")
    assert after.json() == []


async def test_shipment_note_can_be_edited_only_by_author(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Примечание заявки правит только автор — та же защита, что у лидов (Б-11)."""
    headers = await manager_headers(auth_client)
    stage_id = (await auth_client.get("/api/v1/crm/stages", headers=headers)).json()[0]["id"]
    lead_id = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Автор примечания»", "inn": "7451234565", "stage_id": stage_id},
            headers=headers,
        )
    ).json()["id"]
    shipment_id = (
        await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id}, headers=headers)
    ).json()["id"]
    entry_id = (
        await auth_client.post(
            f"/api/v1/shipments/{shipment_id}/notes",
            json={"body": "заметка менеджера"},
            headers=headers,
        )
    ).json()["id"]

    edited = await auth_client.patch(
        f"/api/v1/shipments/{shipment_id}/timeline/{entry_id}",
        json={"body": "исправленная заметка"},
        headers=headers,
    )
    assert edited.status_code == 200

    denied = await auth_client.patch(
        f"/api/v1/shipments/{shipment_id}/timeline/{entry_id}",
        json={"body": "правка администратора"},
    )
    assert denied.status_code == 403


async def test_reassign_shipment_moves_history_and_attachments_atomically(
    auth_client: AsyncClient, seeded: dict, session
) -> None:
    """Перенос заявки меняет lead_id всего агрегата, поэтому удаление старого
    лида больше не уничтожает историю и файлы перенесённой заявки."""
    from sqlalchemy import select

    from app.models.timeline import Attachment, TimelineEntry

    old_lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    stage_id = seeded["stage_new"].id  # type: ignore[attr-defined]
    new_lead = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Новый клиент»", "inn": "5404123455", "stage_id": stage_id},
        )
    ).json()
    shipment = (await auth_client.post("/api/v1/shipments", json={"lead_id": old_lead_id})).json()
    shipment_id = shipment["id"]

    await auth_client.post(
        f"/api/v1/shipments/{shipment_id}/notes", json={"body": "важная заметка"}
    )
    await auth_client.patch(f"/api/v1/shipments/{shipment_id}/status", json={"status": "loaded"})
    uploaded = await auth_client.post(
        f"/api/v1/shipments/{shipment_id}/attachments",
        files={"file": ("Накладная.pdf", b"%PDF-1.4 important", "application/pdf")},
    )
    assert uploaded.status_code == 201, uploaded.text
    attachment_id = uploaded.json()["id"]

    moved = await auth_client.patch(
        f"/api/v1/shipments/{shipment_id}", json={"lead_id": new_lead["id"]}
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["lead_id"] == new_lead["id"]

    timeline_lead_ids = list(
        (
            await session.execute(
                select(TimelineEntry.lead_id).where(TimelineEntry.shipment_id == shipment_id)
            )
        ).scalars()
    )
    attachment_lead_ids = list(
        (
            await session.execute(
                select(Attachment.lead_id).where(Attachment.shipment_id == shipment_id)
            )
        ).scalars()
    )
    assert timeline_lead_ids == [new_lead["id"], new_lead["id"]]
    assert attachment_lead_ids == [new_lead["id"]]

    deleted_old = await auth_client.delete(f"/api/v1/crm/leads/{old_lead_id}/permanent")
    assert deleted_old.status_code == 204
    assert (await auth_client.get(f"/api/v1/shipments/{shipment_id}")).status_code == 200
    assert (await auth_client.get(f"/api/v1/crm/attachments/{attachment_id}")).status_code == 200
    timeline = await auth_client.get(f"/api/v1/shipments/{shipment_id}/timeline")
    assert len(timeline.json()) == 2


async def test_reassignment_enforces_target_access_and_removes_old_owner_access(
    auth_client: AsyncClient, seeded: dict
) -> None:
    admin_lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    headers = await manager_headers(auth_client)
    stages = await auth_client.get("/api/v1/crm/stages", headers=headers)
    manager_stage_id = stages.json()[0]["id"]
    manager_lead = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={
                "name": "ООО «Свой клиент менеджера»",
                "inn": "5404123455",
                "stage_id": manager_stage_id,
            },
            headers=headers,
        )
    ).json()
    shipment = (
        await auth_client.post(
            "/api/v1/shipments", json={"lead_id": manager_lead["id"]}, headers=headers
        )
    ).json()

    forbidden = await auth_client.patch(
        f"/api/v1/shipments/{shipment['id']}",
        json={"lead_id": admin_lead_id},
        headers=headers,
    )
    assert forbidden.status_code == 404

    unchanged = await auth_client.get(f"/api/v1/shipments/{shipment['id']}", headers=headers)
    assert unchanged.status_code == 200
    assert unchanged.json()["lead_id"] == manager_lead["id"]

    # Администратор вправе перенести заявку к своему лиду. После переноса
    # прежний владелец не должен видеть её ни по прямому URL, ни в своём списке.
    moved_by_admin = await auth_client.patch(
        f"/api/v1/shipments/{shipment['id']}", json={"lead_id": admin_lead_id}
    )
    assert moved_by_admin.status_code == 200, moved_by_admin.text
    assert moved_by_admin.json()["lead_id"] == admin_lead_id
    assert (
        await auth_client.get(f"/api/v1/shipments/{shipment['id']}", headers=headers)
    ).status_code == 404
    manager_shipments = await auth_client.get("/api/v1/shipments", headers=headers)
    assert manager_shipments.json()["count"] == 0


async def test_database_rejects_mismatched_shipment_lead(
    auth_client: AsyncClient, seeded: dict, session
) -> None:
    """Составной FK — последний рубеж, если будущий код забудет перенести
    дочерние строки. SQLite не включает FK в тестах, проверка идёт в CI/Postgres."""
    import pytest
    from sqlalchemy.exc import IntegrityError

    from app.models.timeline import TimelineEntry

    if session.get_bind().dialect.name == "sqlite":
        pytest.skip("Составные внешние ключи проверяет PostgreSQL job")

    old_lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    stage_id = seeded["stage_new"].id  # type: ignore[attr-defined]
    new_lead = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Другой клиент»", "inn": "5404123455", "stage_id": stage_id},
        )
    ).json()
    shipment = (await auth_client.post("/api/v1/shipments", json={"lead_id": old_lead_id})).json()

    session.add(TimelineEntry(shipment_id=shipment["id"], lead_id=new_lead["id"], body="ошибка"))
    with pytest.raises(IntegrityError):
        await session.commit()
    await session.rollback()


async def test_shipment_carrier_is_free_text_without_directory(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Перевозчика больше нет как отдельной сущности — просто текст в заявке,
    любой, без справочника и без проверки на пересечение с другими записями."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    created = await auth_client.post(
        "/api/v1/shipments",
        json={
            "lead_id": lead_id,
            "carrier_name": "ИП Новиков",
            "carrier_contact": "+7 900 111-22-33",
        },
    )
    assert created.status_code == 201, created.text
    shipment_id = created.json()["id"]
    assert created.json()["carrier_name"] == "ИП Новиков"
    assert created.json()["carrier_inn"] == ""

    # Можно взять точно такое же название/ИНН ещё раз — никакого конфликта.
    again = await auth_client.post(
        "/api/v1/shipments", json={"lead_id": lead_id, "carrier_name": "ИП Новиков"}
    )
    assert again.status_code == 201, again.text

    # Перевозчика можно поменять и на самой заявке.
    patched = await auth_client.patch(
        f"/api/v1/shipments/{shipment_id}", json={"carrier_name": "ООО «Другой перевозчик»"}
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["carrier_name"] == "ООО «Другой перевозчик»"


async def test_shipment_carrier_inn_validates_checksum_when_provided(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """ИНН перевозчика в заявке необязателен, но если его ввели — проверяем
    контрольную сумму (как у лида), без сверки с другими записями."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    blank = await auth_client.post(
        "/api/v1/shipments", json={"lead_id": lead_id, "carrier_name": "ИП Петров"}
    )
    assert blank.status_code == 201, blank.text
    assert blank.json()["carrier_inn"] == ""

    bad = await auth_client.post(
        "/api/v1/shipments", json={"lead_id": lead_id, "carrier_inn": "7700000001"}
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "validation_error"

    ok = await auth_client.post(
        "/api/v1/shipments", json={"lead_id": lead_id, "carrier_inn": "7707083893"}
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["carrier_inn"] == "7707083893"


async def test_shipment_rejects_negative_price_and_weight(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    bad_price = await auth_client.post(
        "/api/v1/shipments", json={"lead_id": lead_id, "customer_price": "-100"}
    )
    assert bad_price.status_code == 422

    bad_weight = await auth_client.post(
        "/api/v1/shipments", json={"lead_id": lead_id, "cargo_weight": "-1"}
    )
    assert bad_weight.status_code == 422


async def test_launcher_apps_depend_on_role(auth_client: AsyncClient) -> None:
    apps = await auth_client.get("/api/v1/launcher/apps")
    slugs = [a["slug"] for a in apps.json()]
    assert slugs == ["crm", "shipments", "customers", "admin", "accounting"]


async def test_colleague_can_view_but_not_change_shipment_of_lost_lead(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Заявка проигранного лида видна любому, менять её может только владелец лида."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]

    shipment = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()
    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id})

    headers = await manager_headers(auth_client)
    seen = await auth_client.get(f"/api/v1/shipments/{shipment['id']}", headers=headers)
    assert seen.status_code == 200

    changed = await auth_client.patch(
        f"/api/v1/shipments/{shipment['id']}/status", json={"status": "checked"}, headers=headers
    )
    assert changed.status_code == 404


async def test_shipments_list_margin_and_totals(auth_client: AsyncClient, seeded: dict) -> None:
    """Колонки «Маржа» и «Всего»: сервер считает значения в каждой строке и
    итоги по всему фильтру — не только по открытой странице списка."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    # Заказчик 244 000 с НДС 22% (без НДС — 200 000), перевозчик 100 000 без
    # НДС: маржа = (200 000 − 100 000) × 0,75 = 75 000.
    first = (
        await auth_client.post(
            "/api/v1/shipments",
            json={
                "lead_id": lead_id,
                "customer_price": "244000",
                "customer_tax": "vat_22",
                "carrier_price": "100000",
                "carrier_tax": "no_vat",
            },
        )
    ).json()

    # Заказчик 122 000 с НДС 22% (без НДС — 100 000), перевозчик 80 000 без
    # НДС: маржа = 15 000.
    second = (
        await auth_client.post(
            "/api/v1/shipments",
            json={
                "lead_id": lead_id,
                "customer_price": "122000",
                "customer_tax": "vat_22",
                "carrier_price": "80000",
                "carrier_tax": "no_vat",
            },
        )
    ).json()

    # Третья заявка без цен: в колонках прочерк, в итоги не входит.
    unpriced = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()

    page = (await auth_client.get("/api/v1/shipments")).json()
    by_id = {item["id"]: item for item in page["results"]}
    assert Decimal(by_id[first["id"]]["margin"]) == Decimal("75000.00")
    assert Decimal(by_id[first["id"]]["customer_total"]) == Decimal("244000.00")
    assert by_id[unpriced["id"]]["margin"] is None
    assert by_id[unpriced["id"]]["customer_total"] is None

    # Итоги: 75 000 + 15 000 = 90 000 маржи; 366 000 заказчику.
    totals = page["totals"]
    assert Decimal(totals["margin"]) == Decimal("90000.00")
    assert Decimal(totals["customer_total"]) == Decimal("366000.00")

    # Итоги честны при маленькой странице: в results одна заявка, в totals — все.
    paged = (await auth_client.get("/api/v1/shipments?page_size=1")).json()
    assert len(paged["results"]) == 1
    assert Decimal(paged["totals"]["margin"]) == Decimal("90000.00")

    # Итоги следуют фильтру, а не смешивают все заявки подряд.
    await auth_client.patch(
        f"/api/v1/shipments/{second['id']}", json={"carrier_name": "Итог-Перевозчик"}
    )
    filtered = (await auth_client.get("/api/v1/shipments?search=Итог-Перевозчик")).json()
    assert filtered["count"] == 1
    assert Decimal(filtered["totals"]["margin"]) == Decimal("15000.00")
    assert Decimal(filtered["totals"]["customer_total"]) == Decimal("122000.00")

    empty = (await auth_client.get("/api/v1/shipments?search=несуществующий-текст")).json()
    assert empty["count"] == 0
    assert Decimal(empty["totals"]["margin"]) == Decimal("0.00")


async def test_shipments_totals_match_row_margins(auth_client: AsyncClient, seeded: dict) -> None:
    """Итоги считаются в SQL (Б-26), но обязаны сходиться со значениями в
    строках до копейки при любых ставках НДС — в том числе НДС 0% и без НДС.

    Цены в случаях подбираются без маржи на границе X.XX5: на PostgreSQL
    (прод) арифметика точная и границ не бывает, а вот float-округление
    в SQLite различается между сборками — 3.40 округляет 500.025 вверх,
    3.45+ — по значению double вниз. Граничные значения здесь проверяли
    бы версию SQLite, а не нашу формулу.
    """
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    cases = [
        ("10000", "vat_22", "5000", "no_vat"),
        ("1000.00", "vat_0", "333.25", "no_vat"),
        ("500", "no_vat", "122.00", "vat_22"),
    ]
    for customer_price, customer_tax, carrier_price, carrier_tax in cases:
        await auth_client.post(
            "/api/v1/shipments",
            json={
                "lead_id": lead_id,
                "customer_price": customer_price,
                "customer_tax": customer_tax,
                "carrier_price": carrier_price,
                "carrier_tax": carrier_tax,
            },
        )

    page = (await auth_client.get("/api/v1/shipments?page_size=3")).json()
    rows_margin = sum(
        (Decimal(row["margin"]) for row in page["results"] if row["margin"] is not None),
        Decimal("0"),
    )
    rows_total = sum(
        (Decimal(row["customer_total"]) for row in page["results"] if row["customer_total"]),
        Decimal("0"),
    )

    assert Decimal(page["totals"]["margin"]) == rows_margin
    assert Decimal(page["totals"]["customer_total"]) == rows_total


async def test_shipments_filter_by_employee(auth_client: AsyncClient, seeded: dict) -> None:
    """Фильтр «заявки сотрудника» — инструмент администратора.

    Админ получает заявки конкретного человека (итоги — тоже только его),
    менеджеру параметр отвечает 403: чужие заявки ему смотреть нельзя.
    """
    admin_id = seeded["admin"].id  # type: ignore[attr-defined]
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]

    # Заявка админа на его же лиде (цены — чтобы проверить итоги фильтра).
    await auth_client.post(
        "/api/v1/shipments",
        json={"lead_id": seeded["lead"].id, "customer_price": "100000", "carrier_price": "80000"},
    )

    # Лид и заявка менеджера: создаёт сам менеджер на своей доске.
    headers = await manager_headers(auth_client)
    stages = (await auth_client.get("/api/v1/crm/stages", headers=headers)).json()
    manager_lead = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={
                "name": "ООО «Менеджер-Клиент»",
                "inn": "5404123455",
                "stage_id": stages[0]["id"],
            },
            headers=headers,
        )
    ).json()
    await auth_client.post(
        "/api/v1/shipments",
        json={"lead_id": manager_lead["id"], "customer_price": "50000"},
        headers=headers,
    )

    # Админ видит заявки каждого сотрудника по отдельности.
    managers_list = (await auth_client.get(f"/api/v1/shipments?assigned_to={manager_id}")).json()
    assert managers_list["count"] == 1
    assert managers_list["results"][0]["lead_id"] == manager_lead["id"]
    assert Decimal(managers_list["totals"]["customer_total"]) == Decimal("50000.00")

    admins_list = (await auth_client.get(f"/api/v1/shipments?assigned_to={admin_id}")).json()
    assert admins_list["count"] == 1
    assert admins_list["results"][0]["lead_id"] == seeded["lead"].id

    # Менеджеру чужие заявки по фильтру не отдают — явный отказ, не пустой список.
    forbidden = await auth_client.get(f"/api/v1/shipments?assigned_to={admin_id}", headers=headers)
    assert forbidden.status_code == 403

    # Без параметра менеджер и так видит только свои заявки.
    own = (await auth_client.get("/api/v1/shipments", headers=headers)).json()
    assert own["count"] == 1
    assert own["results"][0]["lead_id"] == manager_lead["id"]


async def test_meta_returns_margin_rate(auth_client: AsyncClient) -> None:
    """Ставка вычета маржи приходит с сервера — фронтенд не хранит копию (Т-08)."""
    response = await auth_client.get("/api/v1/meta")
    assert response.status_code == 200
    assert Decimal(response.json()["margin_deduction_rate"]) == Decimal("0.25")
