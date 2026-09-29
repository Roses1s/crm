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
            "city_loading": "Челябинск",
            "city_unloading": "Новосибирск",
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
        f"/api/v1/shipments/{shipment_id}/status", json={"status": "in_transit"}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "in_transit"


async def test_carriers_list(auth_client: AsyncClient, seeded: dict) -> None:
    carriers = await auth_client.get("/api/v1/carriers")
    assert [c["name"] for c in carriers.json()] == ["ООО «АвтоТрансЛайн»"]


async def test_launcher_apps_depend_on_role(auth_client: AsyncClient) -> None:
    apps = await auth_client.get("/api/v1/launcher/apps")
    slugs = [a["slug"] for a in apps.json()]
    assert slugs == ["crm", "shipments", "admin"]
