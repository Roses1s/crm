import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FormStatusbar, FormWorkspace } from "@/shared/ui/odoo-form";
import { renderWithProviders } from "@/test/utils";

describe("Рабочая область карточки", () => {
  it("на широком экране оставляет ленту боковой областью, а на узком отделяет её сверху", () => {
    renderWithProviders(
      <FormWorkspace aside={<div>Лента примечаний</div>}>
        <main>Форма лида</main>
      </FormWorkspace>,
    );

    expect(screen.getByRole("main")).toHaveTextContent("Форма лида");
    expect(screen.getByRole("complementary")).toHaveClass(
      "border-t",
      "lg:border-l",
      "lg:border-t-0",
      "lg:w-[var(--odoo-record-aside-width)]",
    );
  });

  it("без ленты отдаёт всю рабочую область форме", () => {
    renderWithProviders(
      <FormWorkspace>
        <main>Новый лид</main>
      </FormWorkspace>,
    );

    expect(screen.getByRole("main")).toHaveTextContent("Новый лид");
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});

describe("Статусбар карточки", () => {
  it("контрастно выделяет текущий этап и передаёт выбор другого этапа", () => {
    const onSelect = vi.fn();
    renderWithProviders(
      <FormStatusbar
        current={2}
        items={[
          { id: 1, name: "Новый" },
          { id: 2, name: "В работе" },
          { id: 3, name: "Переговоры" },
        ]}
        onSelect={onSelect}
      />,
    );

    const current = screen.getByRole("button", { name: "В работе" });
    expect(current).toHaveAttribute("aria-current", "step");
    expect(current).toHaveStyle("background-color: rgb(var(--odoo-statusbar-current))");
    expect(current).toHaveTextContent("В работе");

    fireEvent.click(screen.getByRole("button", { name: "Переговоры" }));
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("оставляет текущий этап в центре и открывает скрытые этапы с обеих сторон", () => {
    const onSelect = vi.fn();
    const items = Array.from({ length: 7 }, (_, index) => ({
      id: index + 1,
      name: `Этап ${index + 1}`,
    }));
    renderWithProviders(
      <FormStatusbar current={4} items={items} onSelect={onSelect} visibleCount={3} />,
    );

    expect(screen.getByRole("button", { name: "Этап 4" })).toHaveAttribute("aria-current", "step");
    fireEvent.click(screen.getByRole("button", { name: "Предыдущие этапы" }));

    // Регрессия: меню должно жить ВНЕ полосы с прокруткой — внутри неё оно
    // обрезается невидимой границей, и в браузере клик по «…» выглядел как
    // «ничего не происходит» (в jsdom layout нет, тест раньше этого не видел).
    const hiddenStage = screen.getByRole("button", { name: "Этап 1" });
    expect(hiddenStage.closest(".overflow-x-auto")).toBeNull();

    fireEvent.click(hiddenStage);
    expect(onSelect).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "Следующие этапы" }));
    fireEvent.click(screen.getByRole("button", { name: "Этап 7" }));
    expect(onSelect).toHaveBeenCalledWith(7);
  });
});
