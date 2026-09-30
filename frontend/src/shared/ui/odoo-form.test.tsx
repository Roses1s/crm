import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FormWorkspace } from "@/shared/ui/odoo-form";
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
