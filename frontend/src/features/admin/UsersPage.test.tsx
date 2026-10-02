/**
 * «Пользователи»: форма создания/редактирования — не постоянно видимый
 * инлайн-блок, а модальное окно, открываемое по кнопке.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { UsersPage } from "./UsersPage";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

const USERS = [
  {
    id: 1,
    email: "admin@example.com",
    first_name: "Админ",
    last_name: "Админов",
    role: "admin",
    is_active: true,
  },
  {
    id: 2,
    email: "manager@example.com",
    first_name: "Пётр",
    last_name: "Петров",
    role: "manager",
    is_active: true,
  },
];

let server: FakeServer | undefined;
afterEach(() => {
  server?.restore();
  server = undefined;
});

it("форма создания скрыта за кнопкой «Создать», а не всегда на экране", async () => {
  server = startFakeApi([{ path: "/admin/users", response: USERS }]);
  renderWithProviders(<UsersPage />);

  await screen.findByText("admin@example.com");
  expect(screen.queryByPlaceholderText("email")).not.toBeInTheDocument();

  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Создать" }));

  const dialog = await screen.findByPlaceholderText("email");
  expect(dialog).toBeVisible();
});

it("«Изменить» открывает ту же форму, предзаполненную данными пользователя", async () => {
  server = startFakeApi([
    { path: "/admin/users", response: USERS },
    {
      method: "PATCH",
      path: "/admin/users/2",
      response: (body: unknown) => ({ ...USERS[1], ...(body as object) }),
    },
  ]);
  renderWithProviders(<UsersPage />);
  const user = userEvent.setup();

  await screen.findByText("manager@example.com");
  const row = screen.getByText("manager@example.com").closest("tr")!;
  await user.click(within(row).getByRole("button", { name: "Изменить" }));

  const emailInput = (await screen.findByPlaceholderText("email")) as HTMLInputElement;
  expect(emailInput.value).toBe("manager@example.com");
  expect(screen.getByText(/Изменить пользователя/)).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(server?.called("PATCH", "/admin/users/2")).toBe(true));
});
