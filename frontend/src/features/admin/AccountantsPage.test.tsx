import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { AccountantsPage } from "./AccountantsPage";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

const INITIAL_ACCOUNTANTS = [
  { id: 1, name: "Пухова Елена Витальевна", is_active: true },
  { id: 2, name: "Архивный бухгалтер", is_active: false },
];

let server: FakeServer | undefined;
afterEach(() => {
  server?.restore();
  server = undefined;
});

function startAccountantApi() {
  let accountants = INITIAL_ACCOUNTANTS.map((accountant) => ({ ...accountant }));
  server = startFakeApi([
    { path: "/admin/accountants", response: () => accountants },
    {
      method: "POST",
      path: "/admin/accountants/1/restore",
      response: () => {
        accountants = accountants.map((accountant) =>
          accountant.id === 1 ? { ...accountant, is_active: true } : accountant,
        );
        return accountants.find((accountant) => accountant.id === 1);
      },
    },
    {
      method: "POST",
      path: "/admin/accountants",
      status: 201,
      response: (body: unknown) => {
        const created = {
          id: 3,
          name: (body as { name: string }).name,
          is_active: true,
        };
        accountants = [...accountants, created];
        return created;
      },
    },
    {
      method: "PATCH",
      path: "/admin/accountants/1",
      response: (body: unknown) => {
        const name = (body as { name: string }).name;
        accountants = accountants.map((accountant) =>
          accountant.id === 1 ? { ...accountant, name } : accountant,
        );
        return accountants.find((accountant) => accountant.id === 1);
      },
    },
    {
      method: "DELETE",
      path: "/admin/accountants/1",
      response: () => {
        accountants = accountants.map((accountant) =>
          accountant.id === 1 ? { ...accountant, is_active: false } : accountant,
        );
        return null;
      },
    },
  ]);
}

it("добавляет бухгалтера, нормализуя пробелы, и редактирует его ФИО", async () => {
  startAccountantApi();
  const user = userEvent.setup();
  renderWithProviders(<AccountantsPage />);

  await screen.findByText("Пухова Елена Витальевна");
  await user.click(screen.getByRole("button", { name: "Добавить бухгалтера" }));
  const addDialog = screen.getByRole("dialog", { name: "Добавление бухгалтера" });
  await user.type(within(addDialog).getByLabelText("ФИО"), "  Марина    Юрьевна  ");
  await user.click(within(addDialog).getByRole("button", { name: "Добавить" }));

  await waitFor(() => expect(server?.called("POST", "/admin/accountants")).toBe(true));
  const createCall = server?.calls.find(
    (call) => call.method === "POST" && call.url.endsWith("/admin/accountants"),
  );
  expect(createCall?.body).toEqual({ name: "Марина Юрьевна" });
  expect(await screen.findByText("Марина Юрьевна")).toBeVisible();

  const row = screen.getByText("Пухова Елена Витальевна").closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "Изменить" }));
  const editDialog = screen.getByRole("dialog", { name: "Изменение ФИО бухгалтера" });
  const nameInput = within(editDialog).getByLabelText("ФИО");
  await user.clear(nameInput);
  await user.type(nameInput, "Пухова Елена Николаевна");
  await user.click(within(editDialog).getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(server?.called("PATCH", "/admin/accountants/1")).toBe(true));
  expect(await screen.findByText("Пухова Елена Николаевна")).toBeVisible();
  const patchCall = server?.calls.find(
    (call) => call.method === "PATCH" && call.url.endsWith("/admin/accountants/1"),
  );
  expect(patchCall?.body).toEqual({ name: "Пухова Елена Николаевна" });
});

it("удаляет бухгалтера из активного справочника и позволяет восстановить его", async () => {
  startAccountantApi();
  const user = userEvent.setup();
  renderWithProviders(<AccountantsPage />);

  await screen.findByText("Пухова Елена Витальевна");
  const row = screen.getByText("Пухова Елена Витальевна").closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "Удалить" }));

  const dialog = screen.getByRole("dialog", { name: "Удаление бухгалтера" });
  expect(within(dialog).getByText(/останется в карточках/)).toBeVisible();
  await user.click(within(dialog).getByRole("button", { name: "Удалить" }));

  await waitFor(() => expect(server?.called("DELETE", "/admin/accountants/1")).toBe(true));
  const archivedRow = screen.getByText("Пухова Елена Витальевна").closest("tr")!;
  expect(within(archivedRow).getByText("Неактивен")).toBeVisible();
  await user.click(within(archivedRow).getByRole("button", { name: "Восстановить" }));

  await waitFor(() => expect(server?.called("POST", "/admin/accountants/1/restore")).toBe(true));
  const restoredRow = screen.getByText("Пухова Елена Витальевна").closest("tr")!;
  expect(within(restoredRow).getByText("Активен")).toBeVisible();
});
