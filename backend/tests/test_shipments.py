"""Заявки и справочники."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import TEST_PASSWORD


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_create_and_read_shipment(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    carrier_id = seeded["carrier"].id  # type: ignore[attr-defined]

    created = await auth_client.post(
        "/api/v1/shipments",
        json={
            "lead_id": lead_id,
            "carrier_id": carrier_id,
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
    # Номер заявки по умолчанию = её id, но его можно свободно переименовать.
    assert body["number"] == str(body["id"])

    listed = await auth_client.get("/api/v1/shipments")
    assert listed.json()["count"] == 1

    by_lead = await auth_client.get(f"/api/v1/leads/{lead_id}/shipments")
    assert len(by_lead.json()) == 1


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
    carrier_id = seeded["carrier"].id  # type: ignore[attr-defined]
    created = await auth_client.post(
        "/api/v1/shipments", json={"lead_id": lead_id, "carrier_id": carrier_id}
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


async def test_carriers_list(auth_client: AsyncClient, seeded: dict) -> None:
    carriers = await auth_client.get("/api/v1/carriers")
    assert [c["name"] for c in carriers.json()] == ["ООО «АвтоТрансЛайн»"]


async def test_create_carrier_validates_inn_checksum(auth_client: AsyncClient) -> None:
    """У перевозчика та же проверка контрольной суммы ИНН, что и у лида."""
    bad = await auth_client.post(
        "/api/v1/carriers", json={"name": "ООО «Плохой ИНН»", "inn": "7700000001"}
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "validation_error"

    ok = await auth_client.post(
        "/api/v1/carriers", json={"name": "ООО «Хороший ИНН»", "inn": "7707083893"}
    )
    assert ok.status_code == 201, ok.text


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
