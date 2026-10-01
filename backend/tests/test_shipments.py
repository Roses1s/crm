"""Заявки и справочники."""

from __future__ import annotations

from httpx import AsyncClient


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

    listed = await auth_client.get("/api/v1/shipments")
    assert listed.json()["count"] == 1

    by_lead = await auth_client.get(f"/api/v1/leads/{lead_id}/shipments")
    assert len(by_lead.json()) == 1


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


async def test_launcher_apps_depend_on_role(auth_client: AsyncClient) -> None:
    apps = await auth_client.get("/api/v1/launcher/apps")
    slugs = [a["slug"] for a in apps.json()]
    assert slugs == ["crm", "shipments", "admin"]
