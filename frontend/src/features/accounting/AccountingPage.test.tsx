import { screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { AccountingPage } from "./AccountingPage";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

let server: FakeServer | undefined;
const previousThemeClass = document.documentElement.className;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
  document.documentElement.className = previousThemeClass;
});

it("uses theme-aware colors instead of forcing the dark theme", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    {
      path: "/auth/me",
      response: {
        id: 1,
        email: "manager@example.com",
        first_name: "Мария",
        last_name: "Петрова",
        role: "manager",
        is_active: true,
      },
    },
  ]);

  const { container } = renderWithProviders(<AccountingPage />, { route: "/accounting" });

  expect(await screen.findByRole("heading", { name: "Бухгалтерия" })).toBeVisible();
  const page = container.firstElementChild;
  expect(page).toHaveClass("bg-odoo-bg", "text-odoo-text");
  expect(container.querySelector(".bg-odoo-dark")).not.toBeInTheDocument();
  const hasHardcodedLightText = [...container.querySelectorAll<HTMLElement>("[class]")].some(
    (element) => element.classList.contains("text-white/50"),
  );
  expect(hasHardcodedLightText).toBe(false);
  expect(screen.getByText("Счета-фактуры для клиентов").parentElement?.parentElement).toHaveClass(
    "bg-odoo-surface",
    "border-odoo-border-light",
  );
});
