"""Лиды: список, фильтры, создание, смена этапа, лента."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from pathlib import Path

import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.config import settings
from app.core.errors import AppError
from app.models.crm import Lead, Stage
from app.models.user import User
from app.schemas.crm import LeadUpdate
from app.services.leads import update_lead
from tests.conftest import TEST_DATABASE_URL, TEST_PASSWORD


async def create_manager_stage(session, owner_id: int) -> Stage:
    stage = Stage(name="Этап менеджера", sequence=1, owner_id=owner_id)
    session.add(stage)
    await session.commit()
    await session.refresh(stage)
    return stage


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def patch_lead(
    client: AsyncClient,
    lead_id: int,
    payload: dict[str, object],
    *,
    headers: dict[str, str] | None = None,
) -> Response:
    """Добавляет к PATCH версию карточки, которую клиент только что прочитал."""
    response = await client.get(f"/api/v1/crm/leads/{lead_id}", headers=headers)
    assert response.status_code == 200, response.text
    body = {**payload, "expected_updated_at": response.json()["updated_at"]}
    return await client.patch(f"/api/v1/crm/leads/{lead_id}", json=body, headers=headers)


async def test_lead_patch_requires_the_version_seen_by_the_client(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    lead = seeded["lead"]
    response = await auth_client.patch(
        f"/api/v1/crm/leads/{lead.id}",  # type: ignore[attr-defined]
        json={"name": "Не должно сохраниться"},
    )

    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_error"
    current = await auth_client.get(f"/api/v1/crm/leads/{lead.id}")  # type: ignore[attr-defined]
    assert current.json()["name"] == lead.name  # type: ignore[attr-defined]


async def test_stale_lead_patch_cannot_overwrite_a_newer_change(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    original = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}")).json()
    version_seen = original["updated_at"]

    first = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}",
        json={"name": "Название, сохранённое первым", "expected_updated_at": version_seen},
    )
    assert first.status_code == 200, first.text
    assert first.json()["updated_at"] != version_seen

    stale = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}",
        json={"logist_contact": "Устаревшее значение", "expected_updated_at": version_seen},
    )
    assert stale.status_code == 409, stale.text
    assert stale.json()["code"] == "lead_conflict"

    current = await auth_client.get(f"/api/v1/crm/leads/{lead_id}")
    assert current.json()["name"] == "Название, сохранённое первым"
    assert current.json()["logist_contact"] == original["logist_contact"]


@pytest.mark.skipif(
    TEST_DATABASE_URL.startswith("sqlite"), reason="Параллельные сессии проверяются на PostgreSQL"
)
async def test_two_parallel_patches_only_save_one_version(
    engine, seeded: dict[str, object]
) -> None:
    """Два одновременных PATCH с одной версией не могут сохранить обе правки."""
    lead = seeded["lead"]
    admin = seeded["admin"]
    lead_id = lead.id  # type: ignore[attr-defined]
    admin_id = admin.id  # type: ignore[attr-defined]
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as db:
        current = await db.get(Lead, lead_id)
        assert current is not None
        expected_updated_at = current.updated_at

    barrier = asyncio.Barrier(2)

    async def save(name: str) -> str:
        async with maker() as db:
            user = await db.get(User, admin_id)
            assert user is not None
            await barrier.wait()
            try:
                await update_lead(
                    db,
                    user,
                    lead_id,
                    LeadUpdate(name=name, expected_updated_at=expected_updated_at),
                )
                return "saved"
            except AppError as exc:
                await db.rollback()
                return exc.code

    outcomes = await asyncio.gather(save("Первый вариант"), save("Второй вариант"))
    assert outcomes.count("saved") == 1
    assert outcomes.count("lead_conflict") == 1

    async with maker() as db:
        current = await db.get(Lead, lead_id)
        assert current is not None
        assert current.name in {"Первый вариант", "Второй вариант"}


async def test_list_leads_is_paginated(auth_client: AsyncClient) -> None:
    response = await auth_client.get("/api/v1/crm/leads")
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["next"] is None
    lead = body["results"][0]
    assert lead["stage_name"] == "Новый"
    assert lead["assigned_to_name"] == "Артём Соколов"
    assert lead["accountant_name"] is None
    assert [t["name"] for t in lead["tags"]] == ["Крупный клиент"]


async def test_tied_lead_timestamps_do_not_duplicate_or_skip_pages(
    auth_client: AsyncClient,
    session,
    seeded: dict[str, object],
) -> None:
    """Одинаковое время изменения не должно ломать границы страниц."""
    stamp = datetime(2026, 10, 1, 10, 0, tzinfo=UTC)
    original = seeded["lead"]
    original.updated_at = stamp  # type: ignore[attr-defined]
    stage = seeded["stage_new"]
    admin = seeded["admin"]
    extra = [
        Lead(
            name=f"Тестовый лид {index}",
            inn=f"770000000{index}",
            stage_id=stage.id,  # type: ignore[attr-defined]
            assigned_to_id=admin.id,  # type: ignore[attr-defined]
            updated_at=stamp,
        )
        for index in (1, 2)
    ]
    session.add_all(extra)
    await session.commit()

    expected = sorted(
        [original.id, *(lead.id for lead in extra)],  # type: ignore[attr-defined]
        reverse=True,
    )
    actual = []
    for page_number in range(1, 4):
        response = await auth_client.get(
            "/api/v1/crm/leads",
            params={"page": page_number, "page_size": 1},
        )
        assert response.status_code == 200, response.text
        actual.extend(row["id"] for row in response.json()["results"])

    assert actual == expected


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
        json={
            "name": "ООО «Ромашка»",
            "inn": "5404123455",
            "stage_id": stage_id,
            "priority": 2,
            "accountant_name": "Пухова Елена Витальевна",
        },
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["assigned_to_email"] == "admin@crmdetroid.ru"
    assert ok.json()["accountant_name"] == "Пухова Елена Витальевна"


async def test_accountant_can_be_changed_cleared_and_is_validated(
    auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    changed = await patch_lead(
        auth_client, lead_id, {"accountant_name": "Кузьмина Виктория Павловна"}
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["accountant_name"] == "Кузьмина Виктория Павловна"

    persisted = await auth_client.get(f"/api/v1/crm/leads/{lead_id}")
    assert persisted.json()["accountant_name"] == "Кузьмина Виктория Павловна"

    cleared = await patch_lead(auth_client, lead_id, {"accountant_name": None})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["accountant_name"] is None

    invalid = await patch_lead(auth_client, lead_id, {"accountant_name": "Неизвестный бухгалтер"})
    assert invalid.status_code == 422


async def test_stage_change_is_written_to_timeline(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    talks_id = seeded["stage_talks"].id  # type: ignore[attr-defined]

    patch = await patch_lead(auth_client, lead_id, {"stage_id": talks_id})
    assert patch.status_code == 200
    assert patch.json()["stage_name"] == "Переговоры"

    timeline = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")
    entries = timeline.json()
    assert entries[0]["type"] == "history"
    assert entries[0]["old_value"] == "Новый"
    assert entries[0]["new_value"] == "Переговоры"


async def test_manager_can_only_create_lead_on_own_board(
    auth_client: AsyncClient, seeded: dict, session
) -> None:
    manager = seeded["manager"]
    own_stage = await create_manager_stage(session, manager.id)  # type: ignore[attr-defined]

    headers = await manager_headers(auth_client)
    base = {"name": "ООО «Ромашка»", "inn": "5404123455"}

    foreign = await auth_client.post(
        "/api/v1/crm/leads",
        json={**base, "stage_id": seeded["stage_new"].id},  # type: ignore[attr-defined]
        headers=headers,
    )
    assert foreign.status_code == 404

    own = await auth_client.post(
        "/api/v1/crm/leads", json={**base, "stage_id": own_stage.id}, headers=headers
    )
    assert own.status_code == 201, own.text
    assert own.json()["assigned_to_id"] == manager.id  # type: ignore[attr-defined]
    assert own.json()["stage_id"] == own_stage.id


async def test_admin_creates_lead_for_manager_only_on_managers_board(
    auth_client: AsyncClient, seeded: dict, session
) -> None:
    manager = seeded["manager"]
    manager_stage = await create_manager_stage(session, manager.id)  # type: ignore[attr-defined]
    base = {
        "name": "ООО «Ромашка»",
        "inn": "5404123455",
        "assigned_to_id": manager.id,  # type: ignore[attr-defined]
    }

    foreign = await auth_client.post(
        "/api/v1/crm/leads",
        json={**base, "stage_id": seeded["stage_new"].id},  # type: ignore[attr-defined]
    )
    assert foreign.status_code == 404

    own = await auth_client.post("/api/v1/crm/leads", json={**base, "stage_id": manager_stage.id})
    assert own.status_code == 201, own.text
    assert own.json()["assigned_to_id"] == manager.id  # type: ignore[attr-defined]


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

    patch = await patch_lead(auth_client, lead.id, {"stage_id": foreign_stage.id})
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
    await patch_lead(auth_client, lead_id, {"stage_id": talks_id})

    timeline = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")
    history_id = timeline.json()[0]["id"]

    bad = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}/timeline/{history_id}", json={"body": "нельзя"}
    )
    assert bad.status_code == 400


async def test_note_can_be_edited_only_by_author(auth_client: AsyncClient, seeded: dict) -> None:
    """Править примечание может только его автор — даже администратору нельзя (Б-11).

    Строка ленты подписана именем автора: правка чужого текста выглядела бы
    как его слова. Нуждающуюся в правке запись можно удалить и написать свою.
    """
    headers = await manager_headers(auth_client)
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]
    stage_id = (await auth_client.get("/api/v1/crm/stages", headers=headers)).json()[0]["id"]
    lead_id = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Автор примечания»", "inn": "7451234565", "stage_id": stage_id},
            headers=headers,
        )
    ).json()["id"]

    entry_id = (
        await auth_client.post(
            f"/api/v1/crm/leads/{lead_id}/notes",
            json={"body": "заметка менеджера"},
            headers=headers,
        )
    ).json()["id"]

    # Автор правит свободно; в ответе виден номер автора.
    edited = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}/timeline/{entry_id}",
        json={"body": "исправленная заметка"},
        headers=headers,
    )
    assert edited.status_code == 200
    assert edited.json()["body"] == "исправленная заметка"
    assert edited.json()["author_id"] == manager_id

    # Администратор видит этот лид, но править чужое примечание не может.
    denied = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}/timeline/{entry_id}",
        json={"body": "правка администратора"},
    )
    assert denied.status_code == 403


async def test_note_and_stage_record_are_deletable_but_other_history_is_not(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Запись о смене этапа убирает любой сотрудник, остальная история защищена."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    talks_id = seeded["stage_talks"].id  # type: ignore[attr-defined]
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]
    await patch_lead(auth_client, lead_id, {"stage_id": talks_id})
    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/notes", json={"body": "заметка"})
    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/transfer", json={"user_id": manager_id})

    entries = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")).json()
    note = next(entry for entry in entries if entry["type"] == "note")
    stage = next(entry for entry in entries if entry["field_label"] == "Этапы лидов")
    seller = next(entry for entry in entries if entry["field_label"] == "Продавец")
    assert stage["is_stage_change"] is True
    assert note["is_stage_change"] is False
    assert seller["is_stage_change"] is False

    protected = await auth_client.delete(f"/api/v1/crm/leads/{lead_id}/timeline/{seller['id']}")
    assert protected.status_code == 400
    assert protected.json()["code"] == "history_immutable"

    for entry_id in (stage["id"], note["id"]):
        deleted = await auth_client.delete(f"/api/v1/crm/leads/{lead_id}/timeline/{entry_id}")
        assert deleted.status_code == 204

    after = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")).json()
    assert [entry["id"] for entry in after] == [seller["id"]]


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


async def test_restore_rejects_second_restore(auth_client: AsyncClient, seeded: dict) -> None:
    """Повторное восстановление не должно повторно менять владельца и историю."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]
    lost = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id}
    )
    assert lost.status_code == 204

    first = await auth_client.post(f"/api/v1/crm/leads/{lead_id}/restore")
    assert first.status_code == 204
    second = await auth_client.post(f"/api/v1/crm/leads/{lead_id}/restore")
    assert second.status_code == 400
    assert second.json()["code"] == "not_lost"


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
    patched = await patch_lead(auth_client, lead_id, {"name": "Новое имя"}, headers=headers)
    assert patched.status_code == 404

    noted = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/notes", json={"body": "привет"}, headers=headers
    )
    assert noted.status_code == 404


async def test_lost_lead_is_read_only_until_restored(
    auth_client: AsyncClient, seeded: dict, session
) -> None:
    manager = seeded["manager"]
    manager_id = manager.id  # type: ignore[attr-defined]
    manager_stage = await create_manager_stage(session, manager_id)
    headers = await manager_headers(auth_client)

    created = await auth_client.post(
        "/api/v1/crm/leads",
        json={
            "name": "ООО «Ромашка»",
            "inn": "5404123455",
            "stage_id": manager_stage.id,
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    lead_id = created.json()["id"]

    note = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/notes",
        json={"body": "До проигрыша"},
        headers=headers,
    )
    assert note.status_code == 201, note.text
    entry_id = note.json()["id"]

    lost = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/lose",
        json={"reason_id": seeded["loss_reason"].id},  # type: ignore[attr-defined]
        headers=headers,
    )
    assert lost.status_code == 204

    admin_edit = await patch_lead(auth_client, lead_id, {"name": "Правка администратора"})
    assert admin_edit.status_code == 409
    assert admin_edit.json()["code"] == "lead_lost"

    owner_edit = await patch_lead(
        auth_client, lead_id, {"name": "Правка прежнего ответственного"}, headers=headers
    )
    assert owner_edit.status_code == 409
    assert owner_edit.json()["code"] == "lead_lost"

    note_after_loss = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/notes",
        json={"body": "Запись до восстановления"},
        headers=headers,
    )
    assert note_after_loss.status_code == 409
    assert note_after_loss.json()["code"] == "lead_lost"

    edit_note_after_loss = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}/timeline/{entry_id}",
        json={"body": "Исправление до восстановления"},
        headers=headers,
    )
    assert edit_note_after_loss.status_code == 409
    assert edit_note_after_loss.json()["code"] == "lead_lost"

    delete_note_after_loss = await auth_client.delete(
        f"/api/v1/crm/leads/{lead_id}/timeline/{entry_id}", headers=headers
    )
    assert delete_note_after_loss.status_code == 409
    assert delete_note_after_loss.json()["code"] == "lead_lost"

    restored = await auth_client.post(f"/api/v1/crm/leads/{lead_id}/restore", headers=headers)
    assert restored.status_code == 204

    edited = await patch_lead(
        auth_client, lead_id, {"name": "После восстановления"}, headers=headers
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["name"] == "После восстановления"

    note_after_restore = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/notes",
        json={"body": "Можно после восстановления"},
        headers=headers,
    )
    assert note_after_restore.status_code == 201, note_after_restore.text


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
    auth_client: AsyncClient, seeded: dict, session
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
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]
    manager_stage = await create_manager_stage(session, manager_id)
    manager_lead = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={
                "name": "ООО «Чужой»",
                "inn": "7447112236",
                "stage_id": manager_stage.id,
            },
            headers=await manager_headers(auth_client),
        )
    ).json()

    pager = (await auth_client.get(f"/api/v1/crm/leads/{admin_lead_id}/pager")).json()
    assert pager["total"] == 2  # только два лида админа, лид менеджера не считается
    assert manager_lead["id"] not in (pager["prev_id"], pager["next_id"])
    # Оба лида админа в одном этапе; открытый — старше по номеру, поэтому он
    # первый, а сосед — второй лид админа, а не лид менеджера.
    assert pager["position"] == 1
    assert pager["prev_id"] is None
    assert pager["next_id"] == second_admin_lead["id"]


async def test_pager_follows_board_reading_order(auth_client: AsyncClient, seeded: dict) -> None:
    """Листалка идёт по доске: колонка за колонкой, внутри колонки — по номеру.

    Раньше позиция считалась по времени изменения и не совпадала с доской:
    верхняя карточка показывалась, например, «4 из 6».
    """
    stage_new = seeded["stage_new"].id  # type: ignore[attr-defined]
    stage_talks = seeded["stage_talks"].id  # type: ignore[attr-defined]

    # Лид в «Переговорах» создаём РАНЬШЕ лида в «Новом»: по доске он всё равно
    # дальше — колонка «Новый» стоит первой.
    in_talks = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Ранний, но дальний»", "inn": "5404123455", "stage_id": stage_talks},
        )
    ).json()
    in_new = (
        await auth_client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Поздний, но ближний»", "inn": "7447112236", "stage_id": stage_new},
        )
    ).json()

    # Все три лида на доске админа; порядок чтения: сид-лид (Новый),
    # «Поздний» (Новый), «Ранний» (Переговоры).
    first_id = seeded["lead"].id  # type: ignore[attr-defined]

    # Проверяем каждый: позиция и соседи обязаны следовать порядку доски,
    # а не времени создания (у «Раннего» номер меньше, чем у «Позднего»).
    seeded_pager = (await auth_client.get(f"/api/v1/crm/leads/{first_id}/pager")).json()
    assert seeded_pager == {
        "position": 1,
        "total": 3,
        "prev_id": None,
        "next_id": in_new["id"],
    }

    new_pager = (await auth_client.get(f"/api/v1/crm/leads/{in_new['id']}/pager")).json()
    assert new_pager == {
        "position": 2,
        "total": 3,
        "prev_id": first_id,
        "next_id": in_talks["id"],
    }

    talks_pager = (await auth_client.get(f"/api/v1/crm/leads/{in_talks['id']}/pager")).json()
    assert talks_pager == {
        "position": 3,
        "total": 3,
        "prev_id": in_new["id"],
        "next_id": None,
    }


async def test_page_number_is_bounded(auth_client: AsyncClient) -> None:
    response = await auth_client.get("/api/v1/crm/leads?page=10001")
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


async def test_missing_lead_is_404(auth_client: AsyncClient) -> None:
    response = await auth_client.get("/api/v1/crm/leads/999")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


async def test_manager_cannot_delete_lead_permanently(
    auth_client: AsyncClient, seeded: dict, session
) -> None:
    """Безвозвратное удаление — право только администратора, менеджер видит 403.

    Лид для проверки должен принадлежать самому менеджеру: на чужом он получил
    бы 404 ещё на проверке видимости, и роль ни при чём было бы не проверить.
    """
    headers = await manager_headers(auth_client)
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]
    manager_stage = await create_manager_stage(session, manager_id)
    stage_id = manager_stage.id
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


async def test_null_inn_is_rejected_with_422(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Явный null в обязательном поле — понятная ошибка, а не 500.

    Регрессия: валидатор ИНН получал None и падал TypeError'ом, который
    Pydantic не превращает в 422, поэтому запрос доходил до обработчика
    «внутренняя ошибка сервера».
    """
    lead = seeded["lead"]
    response = await patch_lead(auth_client, lead.id, {"inn": None})  # type: ignore[attr-defined]
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_error"


async def test_unknown_field_in_patch_is_rejected(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Опечатка в имени поля — ошибка, а не тихий 200 без изменений."""
    lead = seeded["lead"]
    response = await patch_lead(auth_client, lead.id, {"nme": "опечатка"})  # type: ignore[attr-defined]
    assert response.status_code == 422, response.text


async def test_explicit_null_in_required_field_is_rejected(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Явный null в обязательном поле — понятная ошибка до обращения к базе."""
    lead = seeded["lead"]
    response = await patch_lead(auth_client, lead.id, {"logist_contact": None})  # type: ignore[attr-defined]
    assert response.status_code == 422, response.text
    assert "нельзя очистить" in response.text


async def test_nullable_field_can_be_cleared(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Необязательное поле (почта логиста) очищается штатно."""
    lead = seeded["lead"]
    response = await patch_lead(auth_client, lead.id, {"logist_email": None})  # type: ignore[attr-defined]
    assert response.status_code == 200, response.text
    assert response.json()["logist_email"] is None


async def test_unknown_tag_does_not_wipe_existing_tags(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Несуществующий тег — ошибка; прежние теги карточки остаются на месте."""
    lead = seeded["lead"]
    response = await patch_lead(auth_client, lead.id, {"tag_ids": [999999]})  # type: ignore[attr-defined]
    assert response.status_code == 404, response.text

    card = await auth_client.get(f"/api/v1/crm/leads/{lead.id}")  # type: ignore[attr-defined]
    assert [tag["name"] for tag in card.json()["tags"]] == ["Крупный клиент"]


async def test_search_does_not_treat_percent_as_wildcard(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """`%` и `_` в поиске — обычные символы, а не маска «что угодно»."""
    for needle in ("%", "_"):
        found = await auth_client.get("/api/v1/crm/leads", params={"search": needle})
        assert found.json()["count"] == 0, f"поиск «{needle}» вернул записи"

    customers = await auth_client.get("/api/v1/crm/customers", params={"search": "%"})
    assert customers.json()["count"] == 0
