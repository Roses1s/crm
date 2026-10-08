import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CustomersPage } from "@/features/customers/CustomersPage";
import type { Customer } from "@/shared/types";
import { renderWithProviders } from "@/test/utils";

const { useCustomersMock } = vi.hoisted(() => ({ useCustomersMock: vi.fn() }));

vi.mock("@/shared/api/hooks", () => ({ useCustomers: useCustomersMock }));
vi.mock("@/app/layout/Navbar", () => ({ Navbar: () => null }));

afterEach(() => {
  useCustomersMock.mockReset();
});

function customer(id: number, overrides: Partial<Customer> = {}): Customer {
  return {
    id,
    name: `Клиент ${id}`,
    inn: "7701234567",
    assigned_to_id: 1,
    assigned_to_name: "Мария Петрова",
    is_archived: false,
    can_open: true,
    loss_reason_name: null,
    logist_contact: "",
    logist_phone: "",
    logist_email: null,
    priority: 0,
    stage_name: "Новый",
    tags: [],
    updated_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

describe("Страница клиентов", () => {
  it("показывает найденных клиентов, поиск и ограничивает доступ к чужой карточке", () => {
    const open = customer(1, { name: "ООО Север" });
    const masked = customer(2, {
      name: "ООО Юг",
      can_open: false,
      logist_contact: null,
      logist_phone: null,
      logist_email: null,
      priority: null,
      stage_name: null,
    });
    useCustomersMock.mockReturnValue({
      data: { items: [open, masked], total: 2, limit: 60 },
      isLoading: false,
      hasNextPage: false,
    });

    renderWithProviders(<CustomersPage />, { route: "/customers?search=Север" });

    expect(screen.getByText("Клиенты")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Поиск" })).toHaveValue("Север");
    expect(useCustomersMock).toHaveBeenCalledWith("Север");
    expect(screen.getByRole("link", { name: /ООО Север/ })).toHaveAttribute("href", "/crm/leads/1");
    expect(screen.getByText("ООО Юг")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ООО Юг/ })).not.toBeInTheDocument();
    expect(screen.getByText("1-2 / 2")).toBeInTheDocument();
  });

  it("показывает состояние загрузки и сообщение для пустого результата", () => {
    useCustomersMock.mockReturnValue({ data: undefined, isLoading: true });
    const view = renderWithProviders(<CustomersPage />);

    expect(screen.getByText("Загрузка…")).toBeInTheDocument();

    useCustomersMock.mockReturnValue({
      data: { items: [], total: 0, limit: 60 },
      isLoading: false,
      hasNextPage: false,
    });
    view.rerender(<CustomersPage />);

    expect(screen.getByText("Клиенты не найдены.")).toBeInTheDocument();
    expect(screen.queryByText("Загрузка…")).not.toBeInTheDocument();
  });

  it("запрашивает следующую порцию клиентов по кнопке", async () => {
    const customers = Array.from({ length: 60 }, (_, index) => customer(index + 1));
    const fetchNextPage = vi.fn();
    useCustomersMock.mockReturnValue({
      data: { items: customers, total: 61, limit: 60 },
      isLoading: false,
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    });
    const user = userEvent.setup();

    renderWithProviders(<CustomersPage />);

    expect(screen.queryByText("Клиент 61")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Показать ещё 1 из 61" }));

    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("передаёт новый поисковый текст в запрос после небольшой задержки", async () => {
    useCustomersMock.mockReturnValue({
      data: { items: [], total: 0, limit: 60 },
      isLoading: false,
      hasNextPage: false,
    });
    renderWithProviders(<CustomersPage />);

    fireEvent.change(screen.getByRole("textbox", { name: "Поиск" }), {
      target: { value: "Транспорт" },
    });

    await waitFor(() => expect(useCustomersMock).toHaveBeenCalledWith("Транспорт"));
  });
});
