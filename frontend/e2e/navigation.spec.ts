import { expect, test, type Page } from "@playwright/test";

const EMAIL = "playwright@crmdetroid.ru";
const PASSWORD = "BrowserTest123!";

async function fillCredentials(page: Page) {
  await page.getByLabel("Email").fill(EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
}

async function signIn(page: Page) {
  await page.goto("/login");
  await fillCredentials(page);
  await expect(page).toHaveURL(/\/$/);
}

test("защищённый адрес после входа возвращает на исходный маршрут", async ({ page }) => {
  await page.goto("/crm");
  await expect(page).toHaveURL(/\/login$/);

  // Не открываем /login повторно: LoginPage должна сохранить location.state.from.
  await fillCredentials(page);

  await expect(page).toHaveURL(/\/crm$/);
  // На первой странице канбана 20 лидов; 001 загружается отдельной страницей.
  await expect(page.getByText("Тестовый клиент 021")).toBeVisible();
});

test("лаунчер, вложенный маршрут /admin и неизвестный адрес", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Приложения" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Администрирование/ })).toBeVisible();

  // У /admin нет собственной страницы: корневой маршрут должен открыть users.
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { name: "Пользователи" })).toBeVisible();

  await page.goto("/this-route-does-not-exist");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Приложения" })).toBeVisible();
});
