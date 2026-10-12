/**
 * Окно передачи лида: поиск коллеги, выбор, подтверждение.
 *
 * Компонент сам загружает список коллег (`GET /users/colleagues`) и держит
 * только строку поиска и выбранного сотрудника; имя лида, «идёт отправка»,
 * текст ошибки и обработчики приходят пропсами. Запрос передачи и переход
 * на доску живут в `LeadFormPage.tsx`.
 *
 * Что уже покрыто на уровне страницы (`lead-form-flow.test.tsx`) и здесь
 * намеренно НЕ дублируется: доступность кнопки передачи в карточке (админ
 * и проигранный лид, запрет у неранятого лида), открытие окна, полный путь
 * из двух шагов с `POST /crm/leads/10/transfer {user_id}`, возврат на доску
 * после успеха и исчезновение ошибки при повторном открытии окна.
 *
 * Здесь закреплено то, чего страница не видит: состояния загрузки и пустого
 * списка, ограничение списка восемью строками, поиск по части имени без учёта
 * регистра, шаг подтверждения, кнопка «Назад» с сохранением поиска, блокировка
 * на время отправки и состав текстов на обоих шагах. Новых правил не добавлено.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransferDialog } from "./TransferDialog";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

const KUZNETSOV = {
  id: 2,
  first_name: "Денис",
  last_name: "Кузнецов",
  full_name: "Денис Кузнецов",
};
const PETROVA = { id: 3, first_name: "Мария", last_name: "Петрова", full_name: "Мария Петрова" };

/** Девять коллег: на пустом поиске окно показывает только первых восемь. */
const MANY_COLLEAGUES = [
  KUZNETSOV,
  PETROVA,
  ...Array.from({ length: 7 }, (_, index) => ({
    id: 10 + index,
    first_name: "Иван",
    last_name: `Сидоров${index + 1}`,
    full_name: `Иван Сидоров${index + 1}`,
  })),
];

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

type Props = {
  leadName?: string;
  leadIsLost?: boolean;
  pending?: boolean;
  error?: string;
};

function renderDialog(props: Props = {}) {
  const handlers = {
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };
  const view = renderWithProviders(
    <TransferDialog leadName="ООО Ромашка" pending={false} error="" {...handlers} {...props} />,
  );
  return { ...view, handlers };
}

function searchInput() {
  return screen.getByPlaceholderText("Фамилия или имя");
}

/** Кнопки выбора сотрудника в списке (в порядке разметки). */
function colleagueButtons() {
  return screen
    .getAllByRole("button")
    .filter((button) => button.getAttribute("aria-label") === null)
    .map((button) => button.textContent)
    .filter((text) => text && !["Назад", "Передать", "Передаём…", "Отмена"].includes(text));
}

/** Задерживаем только загрузку списка коллег. */
function loads(ms: number) {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/users/colleagues")) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    return inner(input, init);
  });
}

async function openConfirmation(name = "Денис Кузнецов") {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name }));
  return user;
}

describe("Передача лида", () => {
  it("пока список коллег в пути, показывается загрузка, а выбирать не из чего", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV, PETROVA] }]);
    loads(300);

    renderDialog();

    expect(screen.getByRole("dialog", { name: "Передача лида" })).toBeVisible();
    expect(screen.getByText("Загрузка…")).toBeVisible();
    expect(colleagueButtons()).toEqual([]);

    // Дождались ответа: загрузка сменяется списком.
    expect(await screen.findByRole("button", { name: "Денис Кузнецов" })).toBeVisible();
    expect(screen.queryByText("Загрузка…")).not.toBeInTheDocument();
  });

  it("если сотрудников нет, объясняется, кто их заводит", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [] }]);

    renderDialog();

    expect(
      await screen.findByText("Никого не нашли. Сотрудников заводит администратор."),
    ).toBeVisible();
    expect(colleagueButtons()).toEqual([]);
  });

  it("без поиска показываются первые восемь коллег", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: MANY_COLLEAGUES }]);

    renderDialog();
    await screen.findByRole("button", { name: "Денис Кузнецов" });

    // Девять человек — в списке только первые восемь.
    expect(colleagueButtons()).toHaveLength(8);
    expect(screen.queryByRole("button", { name: "Иван Сидоров7" })).not.toBeInTheDocument();
  });

  it("поиск находит по части фамилии без учёта регистра", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV, PETROVA] }]);

    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("button", { name: "Денис Кузнецов" });

    // Заглавные буквы в поиске не мешают: сравнение без учёта регистра.
    await user.type(searchInput(), "КУЗН");

    expect(colleagueButtons()).toEqual(["Денис Кузнецов"]);
    expect(screen.queryByRole("button", { name: "Мария Петрова" })).not.toBeInTheDocument();
  });

  it("поиск без совпадений показывает то же сообщение, что и пустой список", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV, PETROVA] }]);

    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("button", { name: "Денис Кузнецов" });

    await user.type(searchInput(), "Смит");

    expect(
      await screen.findByText("Никого не нашли. Сотрудников заводит администратор."),
    ).toBeVisible();
    expect(colleagueButtons()).toEqual([]);
  });

  it("поиск из одних пробелов показывает первые восемь, а не пустоту", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: MANY_COLLEAGUES }]);

    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("button", { name: "Денис Кузнецов" });

    // Пробелы отбрасываются: поиск считается пустым.
    await user.type(searchInput(), "   ");

    expect(colleagueButtons()).toHaveLength(8);
    expect(screen.queryByText(/Никого не нашли/)).not.toBeInTheDocument();
  });

  it("поиск тоже показывает не больше восьми совпадений", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: MANY_COLLEAGUES }]);

    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("button", { name: "Денис Кузнецов" });

    // Буква «о» есть в каждом из девяти имён: совпадений девять, а в списке — восемь.
    await user.type(searchInput(), "о");

    expect(colleagueButtons()).toHaveLength(8);
    expect(screen.queryByRole("button", { name: "Иван Сидоров7" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Никого не нашли/)).not.toBeInTheDocument();
  });

  it("выбор коллеги открывает подтверждение с его именем — запрос ещё не уходит", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV, PETROVA] }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog({ leadName: "ООО Вектор" });
    await screen.findByRole("button", { name: "Денис Кузнецов" });

    // Сам выбор ничего не передаёт: действие необратимое, нужен второй шаг.
    await user.click(screen.getByRole("button", { name: "Денис Кузнецов" }));
    expect(handlers.onConfirm).not.toHaveBeenCalled();

    expect(screen.getByText("Передать лид?")).toBeVisible();
    expect(screen.getByText(/перейдёт к сотруднику/)).toBeVisible();
    expect(screen.getByText("Денис Кузнецов")).toBeVisible();
    expect(screen.getByText(/ООО Вектор/)).toBeVisible();

    // На шаге подтверждения выбор сотрудника уже сделан: списка и поиска нет,
    // а вместо «Отмены» — «Назад» (закрыть можно Escape).
    expect(screen.queryByPlaceholderText("Фамилия или имя")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Назад" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Отмена" })).not.toBeInTheDocument();

    const writes = (server?.calls ?? []).filter((call) => call.method !== "GET");
    expect(writes).toHaveLength(0);
  });

  it("приписка про выход из проигрыша есть только у проигранного лида", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV] }]);
    const lost = renderDialog({ leadIsLost: true });
    await openConfirmation();
    expect(screen.getByText(/выйдет из проигрыша и вернётся на доску/)).toBeVisible();
    lost.unmount();

    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV] }]);
    renderDialog({ leadIsLost: false });
    await openConfirmation();
    expect(screen.queryByText(/выйдет из проигрыша/)).not.toBeInTheDocument();
  });

  it("«Назад» возвращает к выбору и сохраняет введённый поиск", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV, PETROVA] }]);

    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("button", { name: "Денис Кузнецов" });

    await user.type(searchInput(), "Кузн");
    await user.click(screen.getByRole("button", { name: "Денис Кузнецов" }));
    await user.click(screen.getByRole("button", { name: "Назад" }));

    // Поиск не потерян: в поле те же буквы, список по-прежнему отфильтрован.
    expect(searchInput()).toHaveValue("Кузн");
    expect(colleagueButtons()).toEqual(["Денис Кузнецов"]);
    expect(screen.queryByRole("button", { name: "Мария Петрова" })).not.toBeInTheDocument();
  });

  it("подтверждение передаёт наружу номер выбранного коллеги — один раз", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV, PETROVA] }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog();
    await openConfirmation("Мария Петрова");

    await user.click(screen.getByRole("button", { name: "Передать" }));

    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).toHaveBeenCalledWith(3);
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it("пока идёт отправка, кнопка говорит «Передаём…» и не принимает нажатий", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV] }]);

    const { handlers } = renderDialog({ pending: true });
    await openConfirmation();

    const pending = screen.getByRole("button", { name: "Передаём…" });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);

    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });

  it("ошибка страницы видна на шаге подтверждения и не мешает попробовать снова", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV] }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog({ error: "Нет прав на передачу" });
    await openConfirmation();

    expect(screen.getByText("Нет прав на передачу")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Передать" }));
    expect(handlers.onConfirm).toHaveBeenCalledWith(2);
  });

  it("пустой текст ошибки не добавляет на шаге подтверждения ни строчки", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV] }]);

    renderDialog({ error: "" });
    await openConfirmation();

    // Сверяем состав абзацев шага: пояснение о передаче — и всё.
    // Пустая ошибка не должна добавлять третьего (пустого) абзаца.
    const dialog = screen.getByRole("dialog", { name: "Передача лида" });
    const paragraphs = [...dialog.querySelectorAll("p")].map((node) => node.textContent);

    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain("перейдёт к сотруднику");
  });

  it("«Отмена» закрывает окно на шаге выбора и ничего не передаёт", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV] }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog();
    await screen.findByRole("button", { name: "Денис Кузнецов" });

    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });

  it("Escape закрывает окно и на шаге подтверждения", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV] }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog();
    await openConfirmation();

    await user.keyboard("{Escape}");

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });

  it("список коллег запрашивается один раз, повторных запросов нет", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/users/colleagues", response: [KUZNETSOV, PETROVA] }]);

    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("button", { name: "Денис Кузнецов" });

    await user.type(searchInput(), "Кузн");
    await user.click(screen.getByRole("button", { name: "Денис Кузнецов" }));
    await user.click(screen.getByRole("button", { name: "Назад" }));

    await waitFor(() => {
      const calls = (server?.calls ?? []).filter((call) =>
        call.url.startsWith("/api/v1/users/colleagues"),
      );
      expect(calls).toHaveLength(1);
    });
  });
});
