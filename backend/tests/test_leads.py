"""Лиды: список, фильтры, создание, смена этапа, лента."""

from __future__ import annotations

from pathlib import Path

from httpx import AsyncClient

from app.core.config import settings
from tests.conftest import TEST_PASSWORD


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_list_leads_is_paginated(auth_client: AsyncClient) -> None:
    response = await auth_client.get("/api/v1/crm/leads")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["next"] is None
    lead = body["results"][0]
    assert lead["stage_name"] == "Новый"
    assert lead["assigned_to_name"] == "Артём Соколов"
    assert [t["name"] for t in lead["tags"]] == ["Крупный клиент"]


async def test_search_filter(auth_client: AsyncClient) -> None:
    hit = await auth_client.get("/api/v1/crm/leads", params={"search": "Уралпром"})
    miss = await auth_client.get("/api/v1/crm/leads", params={"search": "Ромашка"})
    assert hit.json()["count"] == 1
    assert miss.json()["count"] == 0


async def test_create_lead_validates_inn(auth_client: AsyncClient, seeded: dict) -> None:
    stage_id = seeded["stage_new"].id  # type: ignore[attr-defined]
    bad = await auth_client.post(
        "/api/v1/crm/leads",
        json={"name": "ООО «Ромашка»", "inn": "1234567890", "stage_id": stage_id},
    )
    assert bad.status_code == 422
    assert bad.json()["code"] == "validation_error"

    ok = await auth_client.post(
        "/api/v1/crm/leads",
        json={"name": "ООО «Ромашка»", "inn": "5404123455", "stage_id": stage_id, "priority": 2},
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["assigned_to_email"] == "admin@crmdetroid.ru"


async def test_stage_change_is_written_to_timeline(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    talks_id = seeded["stage_talks"].id  # type: ignore[attr-defined]

    patch = await auth_client.patch(f"/api/v1/crm/leads/{lead_id}", json={"stage_id": talks_id})
    assert patch.status_code == 200
    assert patch.json()["stage_name"] == "Переговоры"

    timeline = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")
    entries = timeline.json()
    assert entries[0]["type"] == "history"
    assert entries[0]["old_value"] == "Новый"
    assert entries[0]["new_value"] == "Переговоры"


async def test_cannot_move_lead_to_stage_of_another_board(
    auth_client: AsyncClient, seeded: dict, session
) -> None:
    """PATCH лида не должен принимать stage_id с чужой личной доски.

    Иначе лид получает stage_id, которого нет среди колонок доски своего
    владельца, и карточка пропадает из любого канбана (см. docs/CODE_REVIEW.md).
    """
    from app.models.crm import Stage

    lead = seeded["lead"]  # type: ignore[index]
    manager = seeded["manager"]  # type: ignore[index]

    foreign_stage = Stage(name="Чужой этап", sequence=1, color="red", owner_id=manager.id)
    session.add(foreign_stage)
    await session.commit()
    await session.refresh(foreign_stage)

    patch = await auth_client.patch(
        f"/api/v1/crm/leads/{lead.id}", json={"stage_id": foreign_stage.id}
    )
    assert patch.status_code == 404

    # Лид остался на прежнем, своём этапе.
    check = await auth_client.get(f"/api/v1/crm/leads/{lead.id}")
    assert check.json()["stage_id"] == seeded["stage_new"].id  # type: ignore[index]


async def test_note_appears_in_timeline(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    created = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/notes", json={"body": "Созвонились, ждём заявку"}
    )
    assert created.status_code == 201

    timeline = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")
    assert timeline.json()[0]["body"] == "Созвонились, ждём заявку"


async def test_note_can_be_edited(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    created = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/notes", json={"body": "Черновик"}
    )
    entry_id = created.json()["id"]

    edited = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}/timeline/{entry_id}", json={"body": "Исправлено"}
    )
    assert edited.status_code == 200
    assert edited.json()["body"] == "Исправлено"

    timeline = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")
    assert timeline.json()[0]["body"] == "Исправлено"


async def test_history_entry_cannot_be_edited(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    talks_id = seeded["stage_talks"].id  # type: ignore[attr-defined]
    await auth_client.patch(f"/api/v1/crm/leads/{lead_id}", json={"stage_id": talks_id})

    timeline = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")
    history_id = timeline.json()[0]["id"]

    bad = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}/timeline/{history_id}", json={"body": "нельзя"}
    )
    assert bad.status_code == 400


async def test_note_can_be_deleted_but_history_is_immutable(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    talks_id = seeded["stage_talks"].id  # type: ignore[attr-defined]
    await auth_client.patch(f"/api/v1/crm/leads/{lead_id}", json={"stage_id": talks_id})
    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/notes", json={"body": "заметка"})

    entries = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")).json()
    note = next(entry for entry in entries if entry["type"] == "note")
    history = next(entry for entry in entries if entry["type"] == "history")

    protected = await auth_client.delete(f"/api/v1/crm/leads/{lead_id}/timeline/{history['id']}")
    assert protected.status_code == 400
    assert protected.json()["code"] == "history_immutable"

    deleted = await auth_client.delete(f"/api/v1/crm/leads/{lead_id}/timeline/{note['id']}")
    assert deleted.status_code == 204

    after = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")).json()
    assert [entry["id"] for entry in after] == [history["id"]]


async def test_delete_missing_entry_is_404(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    response = await auth_client.delete(f"/api/v1/crm/leads/{lead_id}/timeline/999")
    assert response.status_code == 404


async def test_lose_hides_lead_from_default_list(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]
    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id}
    )
    assert response.status_code == 204

    assert (await auth_client.get("/api/v1/crm/leads")).json()["count"] == 0
    archived = await auth_client.get("/api/v1/crm/leads", params={"is_archived": True})
    assert archived.json()["count"] == 1

    lead = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}")).json()
    assert lead["is_archived"] is True
    assert lead["loss_reason_name"] == "Перестал возить"

    timeline = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")).json()
    labels = {e["field_label"]: (e["old_value"], e["new_value"]) for e in timeline}
    assert labels["Активный"] == ("Да", "Нет")
    assert labels["Причина проигрыша"] == ("—", "Перестал возить")


async def test_lose_requires_existing_reason(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    response = await auth_client.post(f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": 999})
    assert response.status_code == 404


async def test_manager_cannot_lose_colleagues_lead(auth_client: AsyncClient, seeded: dict) -> None:
    """Отметить проигрышем можно только свою карточку — чужая для менеджера не видна."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]
    headers = await manager_headers(auth_client)
    response = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id}, headers=headers
    )
    assert response.status_code == 404


async def test_restore_lets_colleague_claim_a_lost_lead(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Проигранный лид — общий: менеджер может открыть его и забрать себе."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]
    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id})

    headers = await manager_headers(auth_client)

    # До восстановления менеджер видит карточку (она проиграна — общая), но
    # изменить/забрать себе может только явным действием restore.
    seen = await auth_client.get(f"/api/v1/crm/leads/{lead_id}", headers=headers)
    assert seen.status_code == 200
    assert seen.json()["loss_reason_name"] == "Перестал возить"

    restored = await auth_client.post(f"/api/v1/crm/leads/{lead_id}/restore", headers=headers)
    assert restored.status_code == 204

    lead = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}", headers=headers)).json()
    assert lead["is_archived"] is False
    assert lead["loss_reason_name"] is None
    assert lead["assigned_to_email"] == "manager@crmdetroid.ru"

    timeline = (
        await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline", headers=headers)
    ).json()
    labels = [e["field_label"] for e in timeline]
    assert "Активный" in labels
    assert "Продавец" in labels


async def test_restore_fails_for_active_lead(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    response = await auth_client.post(f"/api/v1/crm/leads/{lead_id}/restore")
    assert response.status_code == 400
    assert response.json()["code"] == "not_lost"


async def test_manager_cannot_edit_or_note_foreign_lost_lead(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Смотреть проигранный чужой лид можно, а менять/писать в него — нет, пока не забрал себе."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]
    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id})

    headers = await manager_headers(auth_client)
    patched = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}", json={"name": "Новое имя"}, headers=headers
    )
    assert patched.status_code == 404

    noted = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/notes", json={"body": "привет"}, headers=headers
    )
    assert noted.status_code == 404


async def test_admin_transfer_restores_lost_lead_to_any_employee(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Админ может назначить проигранный лид любому сотруднику — он восстанавливается."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]
    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id})

    transferred = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/transfer", json={"user_id": manager_id}
    )
    assert transferred.status_code == 204

    lead = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}")).json()
    assert lead["is_archived"] is False
    assert lead["assigned_to_id"] == manager_id


async def test_pager_reports_position(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    response = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/pager")
    assert response.json() == {"position": 1, "total": 1, "prev_id": None, "next_id": None}


async def test_admin_pager_does_not_leak_into_another_managers_board(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Листая карточки под админом, нельзя попасть на лида другого менеджера.

    Раньше диапазон листания для администратора считался по всей базе сразу —
    соседней карточкой могла оказаться чужая, с доски другого сотрудника.
    """
    stage_id = seeded["stage_new"].id  # type: ignore[attr-defined]
    admin_lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    # Второй лид на доске админа — чтобы было куда листать внутри своей доски.
    second_admin_lead = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Второй»", "inn": "5404123455", "stage_id": stage_id},
        )
    ).json()

    # Лид менеджера на отдельной доске — не должен попасть в диапазон листания админа.
    manager_lead = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Чужой»", "inn": "7447112236", "stage_id": stage_id},
            headers=await manager_headers(auth_client),
        )
    ).json()

    pager = (await auth_client.get(f"/api/v1/crm/leads/{admin_lead_id}/pager")).json()
    assert pager["total"] == 2  # только два лида админа, лид менеджера не считается
    assert manager_lead["id"] not in (pager["prev_id"], pager["next_id"])
    # Открытый лид — самый старый из двух своих, поэтому сосед — второй лид
    # админа (более новый по времени изменения), а не лид менеджера.
    assert pager["prev_id"] == second_admin_lead["id"]


async def test_missing_lead_is_404(auth_client: AsyncClient) -> None:
    response = await auth_client.get("/api/v1/crm/leads/999")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_manager_cannot_delete_lead_permanently(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Безвозвратное удаление — право только администратора, менеджер видит 403.

    Лид для проверки должен принадлежать самому менеджеру: на чужом он получил
    бы 404 ещё на проверке видимости, и роль ни при чём было бы не проверить.
    """
    headers = await manager_headers(auth_client)
    stage_id = seeded["stage_new"].id  # type: ignore[attr-defined]
    own_lead = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Своё дело»", "inn": "5404123455", "stage_id": stage_id},
            headers=headers,
        )
    ).json()

    response = await auth_client.delete(
        f"/api/v1/crm/leads/{own_lead['id']}/permanent", headers=headers
    )
    assert response.status_code == 403
    assert response.json()["code"] == "permission_denied"

    # Лид остался на месте.
    assert (
        await auth_client.get(f"/api/v1/crm/leads/{own_lead['id']}", headers=headers)
    ).status_code == 200


async def test_admin_deletes_lead_with_everything_attached(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Удаление администратором стирает заявку, ленту и файлы — и с диска тоже."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    # Заявка с вложением.
    shipment = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()
    shipment_file = await auth_client.post(
        f"/api/v1/shipments/{shipment['id']}/attachments",
        files={"file": ("Накладная.pdf", b"%PDF-1.4 ttn", "application/pdf")},
    )
    assert shipment_file.status_code == 201, shipment_file.text

    # Вложение самого лида и запись в ленте.
    lead_file = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Договор.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert lead_file.status_code == 201, lead_file.text
    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/notes", json={"body": "заметка"})

    saved_paths = [
        Path(settings.attachments_dir) / str(lead_id),
        Path(settings.attachments_dir) / "shipments" / str(shipment["id"]),
    ]
    files_on_disk = [p for root in saved_paths if root.exists() for p in root.glob("*")]
    assert len(files_on_disk) == 2  # файл лида и файл заявки реально легли на диск

    deleted = await auth_client.delete(f"/api/v1/crm/leads/{lead_id}/permanent")
    assert deleted.status_code == 204

    # Лид пропал целиком — его не видно даже среди архивных.
    assert (await auth_client.get(f"/api/v1/crm/leads/{lead_id}")).status_code == 404
    assert (await auth_client.get("/api/v1/crm/leads")).json()["count"] == 0
    archived = await auth_client.get("/api/v1/crm/leads", params={"is_archived": True})
    assert archived.json()["count"] == 0
    assert (await auth_client.get(f"/api/v1/shipments/{shipment['id']}")).status_code == 404

    # Файлы стёрты с диска, а не просто помечены в базе.
    for p in files_on_disk:
        assert not p.exists()


async def test_delete_missing_lead_permanently_is_404(auth_client: AsyncClient) -> None:
    response = await auth_client.delete("/api/v1/crm/leads/999/permanent")
    assert response.status_code == 404
