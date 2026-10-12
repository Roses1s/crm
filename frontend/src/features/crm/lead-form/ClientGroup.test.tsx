/**
 * Блок «Информация о клиенте» карточки лида.
 *
 * Компонент без собственного состояния: значения приходят через props, правки
 * уходят наверх обработчиками — по одному на поле. Проверяем проводку
 * (каждое поле отдаёт своё значение в свой обработчик и ни в какой другой),
 * подписи, id, тип и подсказки полей, а также `readOnly` — единственное
 * правило, которое блок знает: у проигранной карточки и при конфликте версий
 * поля недоступны.
 *
 * Тесты появились вместе с переносом блока из `LeadFormPage.tsx`: до переноса
 * обработчики телефона и почты не исполнялись ни одним тестом, а блокировка
 * этих полей у проигранной карточки не проверялась вовсе.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClientGroup } from "@/features/crm/lead-form/ClientGroup";

const VALUES = {
  logistContact: "Иван",
  logistPhone: "+7 900 000-00-00",
  logistEmail: "ivan@example.ru",
};

function renderGroup(values: Partial<typeof VALUES> = {}, readOnly = false) {
  const handlers = {
    onLogistContactChange: vi.fn(),
    onLogistPhoneChange: vi.fn(),
    onLogistEmailChange: vi.fn(),
  };
  const view = render(<ClientGroup {...VALUES} {...values} readOnly={readOnly} {...handlers} />);
  return { ...view, handlers };
}

describe("ClientGroup", () => {
  it("каждое поле отдаёт значение только своему обработчику", async () => {
    const fields = [
      { label: "Контакт логиста/ЛПР", own: "onLogistContactChange", typed: "Пётр" },
      { label: "Телефон логиста", own: "onLogistPhoneChange", typed: "+7 900 111-22-33" },
      { label: "Email логиста", own: "onLogistEmailChange", typed: "p@example.ru" },
    ] as const;

    const user = userEvent.setup();
    const { handlers } = renderGroup({ logistContact: "", logistPhone: "", logistEmail: "" });

    for (const field of fields) {
      for (const handler of Object.values(handlers)) handler.mockClear();

      // Вставляем значение целиком: контролируемое поле по буквам отдаёт
      // по одному символу, а нам нужна строка как в жизни.
      const host = screen.getByLabelText(field.label);
      await user.click(host);
      await user.paste(field.typed);

      expect(handlers[field.own], `поле «${field.label}»`).toHaveBeenCalledWith(field.typed);
      for (const other of fields) {
        if (other.own !== field.own) {
          expect(
            handlers[other.own],
            `поле «${field.label}» задело ${other.own}`,
          ).not.toHaveBeenCalled();
        }
      }
    }
  });

  it("подписи, id, тип и порядок полей сохранены", () => {
    renderGroup();

    const contact = screen.getByLabelText("Контакт логиста/ЛПР");
    const phone = screen.getByLabelText("Телефон логиста");
    const email = screen.getByLabelText("Email логиста");

    expect(contact).toHaveAttribute("id", "lead-contact");
    expect(phone).toHaveAttribute("id", "lead-logist-phone");
    expect(email).toHaveAttribute("id", "lead-email");
    // Почта остаётся полем типа email — как было в странице.
    expect(email).toHaveAttribute("type", "email");
    expect(contact).toHaveAttribute("placeholder", "Фамилия Имя");
    expect(phone).toHaveAttribute("placeholder", "+7 900 000-00-00");
    expect(email).toHaveAttribute("placeholder", "name@example.ru");

    // Порядок полей прежний: контакт → телефон → почта.
    expect(contact.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(phone.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Информация о клиенте")).toBeVisible();
  });

  it("readOnly блокирует все три поля, без него поля доступны", () => {
    const { unmount } = renderGroup({}, true);
    for (const label of ["Контакт логиста/ЛПР", "Телефон логиста", "Email логиста"]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
    unmount();

    renderGroup();
    for (const label of ["Контакт логиста/ЛПР", "Телефон логиста", "Email логиста"]) {
      expect(screen.getByLabelText(label)).toBeEnabled();
    }
  });

  it("собственного состояния нет: смена props сразу меняет поля", () => {
    const { rerender } = renderGroup();

    rerender(
      <ClientGroup
        logistContact="Пётр"
        logistPhone="+7 900 555-55-55"
        logistEmail="petr@example.ru"
        readOnly={false}
        onLogistContactChange={vi.fn()}
        onLogistPhoneChange={vi.fn()}
        onLogistEmailChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Контакт логиста/ЛПР")).toHaveValue("Пётр");
    expect(screen.getByLabelText("Телефон логиста")).toHaveValue("+7 900 555-55-55");
    expect(screen.getByLabelText("Email логиста")).toHaveValue("petr@example.ru");
  });
});
