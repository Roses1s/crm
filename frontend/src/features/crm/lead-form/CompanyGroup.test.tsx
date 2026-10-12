/**
 * Блок «Информация о компании» карточки лида.
 *
 * Компонент без собственного состояния и без запросов: название, ИНН, дубли
 * по ИНН, владелец и причина проигрыша приходят готовыми через props, правки
 * уходят наверх обработчиками. Устройство роли компонент не считает — решение
 * «администратор или нет» принимает страница и передаёт флаг `isAdmin`.
 *
 * Самое хрупкое место блока — кнопка «Продавец»: от комбинации «новая карточка,
 * проигранная карточка, роль» зависит и доступность кнопки, и текст подсказки.
 * Эти правила перенесены из `LeadFormPage.tsx` дословно, поэтому проверяются
 * все сочетания целиком: раньше кнопка не исполнялась ни одним тестом, и любая
 * правка легко сломала бы передачу лида молча.
 *
 * Тесты появились вместе с переносом блока из `LeadFormPage.tsx` (шаг 15).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompanyGroup } from "@/features/crm/lead-form/CompanyGroup";
import type { Customer } from "@/shared/types";

/** Существующий лид с тем же ИНН — так его отдаёт поиск по ИНН. */
const SAME_INN: Customer = {
  id: 99,
  name: "ООО «Вектор»",
  inn: "7701234567",
  assigned_to_id: 2,
  assigned_to_name: "Пётр Сидоров",
  is_archived: false,
  can_open: false,
  loss_reason_name: null,
  logist_contact: null,
  logist_phone: null,
  logist_email: null,
  priority: null,
  stage_name: null,
  tags: [],
  updated_at: "2026-10-01T10:00:00+03:00",
};

type Props = {
  name?: string;
  inn?: string;
  sameInn?: Customer[];
  owner?: string;
  ownerAvatar?: string;
  isNew?: boolean;
  readOnly?: boolean;
  isAdmin?: boolean;
  isArchived?: boolean;
  lossReasonName?: string | null;
};

function renderGroup(props: Props = {}) {
  const handlers = {
    onNameChange: vi.fn(),
    onInnChange: vi.fn(),
    onOpenTransfer: vi.fn(),
  };
  const view = render(
    <CompanyGroup
      name={props.name ?? "ООО Ромашка"}
      inn={props.inn ?? "7701234567"}
      sameInn={props.sameInn ?? []}
      owner={props.owner ?? "Админов Админ"}
      ownerAvatar={props.ownerAvatar ?? "АА"}
      isNew={props.isNew ?? false}
      readOnly={props.readOnly ?? false}
      isAdmin={props.isAdmin ?? false}
      isArchived={props.isArchived ?? false}
      lossReasonName={props.lossReasonName ?? null}
      {...handlers}
    />,
  );
  return { ...view, handlers };
}

function sellerButton(): HTMLButtonElement {
  // В блоке ровно одна кнопка — «Продавец»: так поиск не зависит от имени владельца.
  return screen.getByRole("button");
}

describe("CompanyGroup", () => {
  it("каждое поле отдаёт значение только своему обработчику", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup({ name: "", inn: "" });

    const company = screen.getByRole("textbox", { name: "Компания" });
    await user.click(company);
    await user.paste("ООО Лютик");

    const inn = screen.getByRole("textbox", { name: "ИНН" });
    await user.click(inn);
    await user.paste("770123456789");

    // Вставляем значение целиком: контролируемое поле по буквам отдаёт
    // по одному символу, а нам нужна строка как в жизни.
    expect(handlers.onNameChange).toHaveBeenCalledWith("ООО Лютик");
    expect(handlers.onNameChange).toHaveBeenCalledTimes(1);
    expect(handlers.onInnChange).toHaveBeenCalledWith("770123456789");
    expect(handlers.onInnChange).toHaveBeenCalledTimes(1);
    // Правки полей не должны уходить в передачу лида.
    expect(handlers.onOpenTransfer).not.toHaveBeenCalled();
  });

  it("подписи, id, подсказка и порядок полей сохранены", () => {
    renderGroup();

    const company = screen.getByRole("textbox", { name: "Компания" });
    const inn = screen.getByRole("textbox", { name: "ИНН" });

    expect(company).toHaveAttribute("id", "lead-company");
    expect(company).toHaveAttribute("placeholder", "например, ООО «Ромашка»");
    expect(inn).toHaveAttribute("id", "lead-inn");
    expect(inn).toHaveAttribute("placeholder", "10 или 12 цифр");
    // ИНН остаётся числовым полем — как было в странице.
    expect(inn).toHaveAttribute("inputMode", "numeric");
    // Подсказка про проверку ИНН — часть блока, а не отдельного поля.
    expect(screen.getByTitle("10 или 12 цифр, проверяется контрольная сумма ФНС")).toBeVisible();

    expect(screen.getByText("Информация о компании")).toBeVisible();
    // Порядок прежний: Компания → ИНН → Продавец.
    expect(company.compareDocumentPosition(inn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      inn.compareDocumentPosition(sellerButton()) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("предупреждение о дубле ИНН: с ответственным, без ответственного, без дубля", () => {
    const { unmount } = renderGroup({ sameInn: [SAME_INN] });
    expect(
      screen.getByText("Лид с таким ИНН уже есть: «ООО «Вектор»», ответственный — Пётр Сидоров", {
        exact: false,
      }),
    ).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Это просто предупреждение, сохранить можно.",
    );
    unmount();

    // Ответственный не заполнен — про него ничего не пишем, лишней запятой нет.
    const second = renderGroup({ sameInn: [{ ...SAME_INN, assigned_to_name: null }] });
    const warning = screen.getByRole("alert");
    expect(warning).toHaveTextContent("Лид с таким ИНН уже есть: «ООО «Вектор»».");
    expect(warning.textContent).not.toContain("ответственный");
    second.unmount();

    // Дубля нет — предупреждения нет вовсе.
    renderGroup({ sameInn: [] });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("владелец показывается с инициалами, без владельца — «Не назначен»", () => {
    const { unmount } = renderGroup({ owner: "Денис Кузнецов", ownerAvatar: "ДК" });
    expect(sellerButton()).toHaveTextContent("ДК");
    expect(sellerButton()).toHaveTextContent("Денис Кузнецов");
    unmount();

    renderGroup({ owner: "", ownerAvatar: "—" });
    expect(sellerButton()).toHaveTextContent("Не назначен");
  });

  /**
   * «Продавец»: доступность и подсказка зависят от трёх обстоятельств сразу —
   * карточка ещё не сохранена, карточка в архиве (только чтение) и роль.
   * Варианты перечислены явно, как в прежнем коде страницы.
   */
  const TRANSFER_CASES: {
    name: string;
    isNew?: boolean;
    readOnly?: boolean;
    isAdmin?: boolean;
    disabled: boolean;
    title: string;
  }[] = [
    {
      name: "новая карточка: не сохранить, пока лид не создан",
      isNew: true,
      disabled: true,
      title: "Сначала сохраните лид",
    },
    {
      name: "новая карточка у администратора — тоже ждём сохранения",
      isNew: true,
      isAdmin: true,
      disabled: true,
      title: "Сначала сохраните лид",
    },
    {
      name: "обычная карточка: передача доступна",
      disabled: false,
      title: "Передать лид другому сотруднику",
    },
    {
      name: "обычная карточка у администратора: тоже доступна",
      isAdmin: true,
      disabled: false,
      title: "Передать лид другому сотруднику",
    },
    {
      name: "проигранная карточка у администратора: передача разрешена",
      readOnly: true,
      isAdmin: true,
      disabled: false,
      title: "Передать лид другому сотруднику",
    },
    {
      name: "проигранная карточка у не-администратора: передача запрещена",
      readOnly: true,
      isAdmin: false,
      disabled: true,
      title: "Сначала восстановите лид, чтобы передать его",
    },
  ];

  it.each(TRANSFER_CASES)("кнопка «Продавец»: $name", ({ disabled, title, ...props }) => {
    renderGroup(props);

    if (disabled) {
      expect(sellerButton()).toBeDisabled();
    } else {
      expect(sellerButton()).toBeEnabled();
    }
    expect(sellerButton()).toHaveAttribute("title", title);
  });

  it("нажатие доступной кнопки уходит наружу ровно один раз, заблокированной — не уходит", async () => {
    const user = userEvent.setup();
    const { handlers, unmount } = renderGroup();
    await user.click(sellerButton());
    expect(handlers.onOpenTransfer).toHaveBeenCalledTimes(1);
    unmount();

    renderGroup({ isNew: true });
    await user.click(sellerButton());
    expect(handlers.onOpenTransfer).toHaveBeenCalledTimes(1);
  });

  it("строка «Причина проигрыша»: только у проигранной карточки, значение или прочерк", () => {
    const { unmount } = renderGroup({ isArchived: false });
    expect(screen.queryByText("Причина проигрыша")).not.toBeInTheDocument();
    unmount();

    const second = renderGroup({
      isArchived: true,
      readOnly: true,
      isAdmin: true,
      lossReasonName: "Перестал возить",
    });
    expect(screen.getByText("Причина проигрыша")).toBeVisible();
    expect(screen.getByText("Перестал возить")).toBeVisible();
    second.unmount();

    renderGroup({ isArchived: true, readOnly: true, isAdmin: true, lossReasonName: null });
    expect(screen.getByText("Причина проигрыша")).toBeVisible();
    // Пустая причина — прочерк, а не пустое место.
    expect(screen.getByText("—")).toBeVisible();
  });

  it("readOnly блокирует «Компанию» и «ИНН», без него поля доступны", () => {
    const { unmount } = renderGroup({ readOnly: true });
    expect(screen.getByRole("textbox", { name: "Компания" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "ИНН" })).toBeDisabled();
    unmount();

    renderGroup({ readOnly: false });
    expect(screen.getByRole("textbox", { name: "Компания" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "ИНН" })).toBeEnabled();
  });

  it("собственного состояния нет: смена props сразу меняет поля и строку причины", () => {
    const { rerender } = renderGroup({ name: "", inn: "" });

    rerender(
      <CompanyGroup
        name="ООО Лютик"
        inn="770123456789"
        sameInn={[]}
        owner="Денис Кузнецов"
        ownerAvatar="ДК"
        isNew={false}
        readOnly={false}
        isAdmin
        isArchived
        lossReasonName="Ушли к перевозчику"
        onNameChange={vi.fn()}
        onInnChange={vi.fn()}
        onOpenTransfer={vi.fn()}
      />,
    );

    expect(screen.getByRole("textbox", { name: "Компания" })).toHaveValue("ООО Лютик");
    expect(screen.getByRole("textbox", { name: "ИНН" })).toHaveValue("770123456789");
    expect(sellerButton()).toHaveTextContent("Денис Кузнецов");
    expect(screen.getByText("Ушли к перевозчику")).toBeVisible();
  });
});
