import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it } from "vitest";

import { LeadBoard } from "./LeadBoard";

// В jsdom нет настоящего перетаскивания: подставляем простой dataTransfer
// с тем же контрактом setData/getData, которым пользуется компонент.
function makeDataTransfer(): DataTransfer {
  const store: Record<string, string> = {};
  return {
    setData: (type: string, value: string) => {
      store[type] = value;
    },
    getData: (type: string) => store[type] ?? "",
    effectAllowed: "move",
    dropEffect: "move",
  } as unknown as DataTransfer;
}

function column(name: string): HTMLElement {
  return screen.getByRole("region", { name: `Колонка ${name}` });
}

it("показывает шесть колонок этапов владельца в заданном порядке", () => {
  render(<LeadBoard />);

  const headings = screen.getAllByRole("heading", { level: 2 });
  expect(headings.map((heading) => heading.textContent)).toEqual([
    "Новый",
    "Перезвонить",
    "Вышел на ЛПР",
    "Потенциальный",
    "Уехали",
    "Ждем заявку",
  ]);
});

it("карточки содержат имя, компанию, сумму, источник и время", () => {
  render(<LeadBoard />);

  const newColumn = column("Новый");
  expect(within(newColumn).getByText("Игорь Мальцев")).toBeInTheDocument();
  expect(within(newColumn).getByText("Волга-Строй")).toBeInTheDocument();
  expect(within(newColumn).getByText("1 250 000 ₽")).toBeInTheDocument();
  expect(within(newColumn).getByText("Звонок")).toBeInTheDocument();
  expect(within(newColumn).getByText("1 ч назад")).toBeInTheDocument();

  // Распределение вымышленных лидов по колонкам: 3/3/3/3/2/2.
  expect(within(column("Новый")).getAllByRole("listitem")).toHaveLength(3);
  expect(within(column("Перезвонить")).getAllByRole("listitem")).toHaveLength(3);
  expect(within(column("Вышел на ЛПР")).getAllByRole("listitem")).toHaveLength(3);
  expect(within(column("Потенциальный")).getAllByRole("listitem")).toHaveLength(3);
  expect(within(column("Уехали")).getAllByRole("listitem")).toHaveLength(2);
  expect(within(column("Ждем заявку")).getAllByRole("listitem")).toHaveLength(2);
});

it("перетаскивание переносит карточку в другую колонку и меняет счётчики", () => {
  render(<LeadBoard />);

  const from = column("Новый");
  const to = column("Перезвонить");
  const card = within(from).getByText("Игорь Мальцев").closest("article");
  expect(card).not.toBeNull();

  const dataTransfer = makeDataTransfer();
  fireEvent.dragStart(card as HTMLElement, { dataTransfer });
  fireEvent.dragOver(within(to).getByRole("list"), { dataTransfer });
  fireEvent.drop(within(to).getByRole("list"), { dataTransfer });

  expect(within(to).getByText("Игорь Мальцев")).toBeInTheDocument();
  expect(within(from).queryByText("Игорь Мальцев")).not.toBeInTheDocument();
  expect(within(from).getAllByRole("listitem")).toHaveLength(2);
  expect(within(to).getAllByRole("listitem")).toHaveLength(4);
});

it("повторный перенос той же карточки работает и не дублирует её", () => {
  render(<LeadBoard />);

  const dataTransfer = makeDataTransfer();
  const card = within(column("Новый")).getByText("Анна Смирнова").closest("article");
  fireEvent.dragStart(card as HTMLElement, { dataTransfer });
  fireEvent.drop(within(column("Уехали")).getByRole("list"), { dataTransfer });

  expect(within(column("Уехали")).getAllByText("Анна Смирнова")).toHaveLength(1);
  expect(within(column("Новый")).queryByText("Анна Смирнова")).not.toBeInTheDocument();

  // Перетаскивание в ту же колонку ничего не ломает.
  const again = within(column("Уехали")).getByText("Анна Смирнова").closest("article");
  fireEvent.dragStart(again as HTMLElement, { dataTransfer });
  fireEvent.drop(within(column("Уехали")).getByRole("list"), { dataTransfer });
  expect(within(column("Уехали")).getAllByText("Анна Смирнова")).toHaveLength(1);
  expect(within(column("Уехали")).getAllByRole("listitem")).toHaveLength(3);
});

it("по умолчанию светлая тема; переключатель ставит тёмную и запоминает выбор", () => {
  window.localStorage.removeItem("crm2.theme");
  render(<LeadBoard />);

  const root = document.querySelector("[data-theme]");
  expect(root).not.toBeNull();
  expect(root?.getAttribute("data-theme")).toBe("light");

  const lightButton = screen.getByRole("button", { name: "Светлая" });
  const darkButton = screen.getByRole("button", { name: "Тёмная" });
  expect(lightButton).toHaveAttribute("aria-pressed", "true");
  expect(darkButton).toHaveAttribute("aria-pressed", "false");

  fireEvent.click(darkButton);
  expect(root?.getAttribute("data-theme")).toBe("dark");
  expect(darkButton).toHaveAttribute("aria-pressed", "true");
  expect(lightButton).toHaveAttribute("aria-pressed", "false");
  expect(window.localStorage.getItem("crm2.theme")).toBe("dark");

  // Убираем выбор за собой, чтобы не влиять на другие тесты.
  window.localStorage.removeItem("crm2.theme");
});
