import { expect, test, type Page } from "@playwright/test";

const EMAIL = "playwright@crmdetroid.ru";
const PASSWORD = "BrowserTest123!";
const SEARCH = "Тестовый клиент";
const encodedSearch = encodeURIComponent(SEARCH);

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.locator('input[autocomplete="current-password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function waitForPageRequest(page: Page, path: string, expected: Record<string, string>) {
  return page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname === `/api/v1${path}` &&
      Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value)
    );
  });
}

test.beforeEach(async ({ page }) => {
  await signIn(page);
});

test("Канбан загружает лиды отдельно для каждой колонки", async ({ page }) => {
  await page.goto("/crm");

  const firstStage = page.getByTestId("kanban-column-1");
  const secondStage = page.getByTestId("kanban-column-2");
  await expect(firstStage.getByLabel("Лидов в этапе: 21")).toBeVisible();
  await expect(secondStage.getByLabel("Лидов в этапе: 140")).toBeVisible();
  await expect(firstStage.getByRole("button", { name: "Показать ещё 1 из 21" })).toBeVisible();
  await expect(secondStage.getByRole("button", { name: "Показать ещё 20 из 140" })).toBeVisible();

  const nextPage = waitForPageRequest(page, "/crm/leads", {
    stage: "1",
    page: "2",
    page_size: "20",
  });
  await firstStage.getByRole("button", { name: "Показать ещё 1 из 21" }).click();
  await nextPage;

  await expect(firstStage.getByRole("heading", { name: /^Тестовый клиент 001/ })).toBeVisible();
  await expect(firstStage.getByRole("button", { name: /Показать ещё/ })).toHaveCount(0);
  // Нажатие в первой колонке не загружает и не скрывает страницу второй.
  await expect(secondStage.getByRole("button", { name: "Показать ещё 20 из 140" })).toBeVisible();
  await expect(secondStage.getByText("Тестовый клиент 022")).toHaveCount(0);
});

test("список лидов догружает страницы с тем же поиском", async ({ page }) => {
  await page.goto(`/crm?view=list&search=${encodedSearch}`);

  await expect(page.getByText("Тестовый клиент 082")).toBeVisible();
  await expect(page.getByText("Тестовый клиент 081")).toHaveCount(0);
  await expect(page.getByText("1-80 / 161")).toBeVisible();

  const nextPage = waitForPageRequest(page, "/crm/leads", {
    page: "2",
    page_size: "80",
    search: SEARCH,
  });
  await page.getByRole("button", { name: "Показать ещё 80 из 161" }).click();
  await nextPage;

  await expect(page.getByText("Тестовый клиент 081")).toBeVisible();
  await expect(page.getByText("1-160 / 161")).toBeVisible();
  await expect(page.getByRole("button", { name: "Показать ещё 1 из 161" })).toBeVisible();
});

test("клиенты догружаются порциями по 60 с сохранением поиска", async ({ page }) => {
  await page.goto(`/customers?search=${encodedSearch}`);

  await expect(page.getByText("Тестовый клиент 161")).toBeVisible();
  await expect(page.getByText("Тестовый клиент 101")).toHaveCount(0);
  await expect(page.getByText("1-60 / 161")).toBeVisible();

  const nextPage = waitForPageRequest(page, "/crm/customers", {
    page: "2",
    page_size: "60",
    search: SEARCH,
  });
  await page.getByRole("button", { name: "Показать ещё 60 из 161" }).click();
  await nextPage;

  await expect(page.getByText("Тестовый клиент 101")).toBeVisible();
  await expect(page.getByText("1-120 / 161")).toBeVisible();
});

test("заявки догружаются, сохраняя статус и поиск", async ({ page }) => {
  await page.goto(`/shipments?status=new&search=${encodedSearch}`);

  await expect(page.getByRole("link", { name: "PW-161" })).toBeVisible();
  await expect(page.getByRole("link", { name: "PW-081" })).toHaveCount(0);
  await expect(page.getByText("1-80 / 161")).toBeVisible();

  const nextPage = waitForPageRequest(page, "/shipments", {
    page: "2",
    page_size: "80",
    status: "new",
    search: SEARCH,
  });
  await page.getByRole("button", { name: "Показать ещё 80 из 161" }).click();
  await nextPage;

  await expect(page.getByRole("link", { name: "PW-081" })).toBeVisible();
  await expect(page.getByText("1-160 / 161")).toBeVisible();
});

test("карточка не теряется при перетаскивании между этапами", async ({ page }) => {
  await page.goto("/crm");

  const firstStage = page.getByTestId("kanban-column-1");
  const secondStage = page.getByTestId("kanban-column-2");
  const source = firstStage.locator('[aria-label="Переместить Тестовый клиент 021"]');
  const target = secondStage.locator('[aria-label="Переместить Тестовый клиент 161"]');
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  const moved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/crm/leads/") && response.request().method() === "PATCH",
  );
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  expect((await moved).ok()).toBe(true);

  await expect(firstStage.getByLabel("Лидов в этапе: 20")).toBeVisible();
  await expect(secondStage.getByLabel("Лидов в этапе: 141")).toBeVisible();
  await expect(secondStage.locator('[aria-label="Переместить Тестовый клиент 021"]')).toBeVisible();
  await expect(firstStage.locator('[aria-label="Переместить Тестовый клиент 021"]')).toHaveCount(0);
});
