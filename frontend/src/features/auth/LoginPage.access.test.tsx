/**
 * Страница входа: куда уводят настоящие переходы и что показывают отказы.
 *
 * Проверяется настоящий `LoginPage` вместе с настоящим `useLogin`, настоящим
 * HTTP-клиентом и настоящим состоянием сессии `shared/api/auth`: подменяется
 * только сеть (`POST /auth/login`). Переходы видны по настоящим маршрутам
 * роутера — пробные страницы показывают адрес, на который человека привёл
 * `navigate`, поэтому правила входа не переписаны в тесте второй раз.
 *
 * Что уже покрыто в других файлах и здесь намеренно НЕ дублируется:
 * — разметка экрана, отправка введённых данных и кнопка-«глаз» —
 *   `LoginPage.test.tsx` (там хуки подменены, поэтому переходы не видны);
 * — тело запроса `/auth/login` и сохранение токена на уровне хука —
 *   `login-flow.test.tsx`;
 * — вход в настоящем браузере — `e2e/pagination.spec.ts`.
 *
 * Состояние сессии живёт в переменных модуля `auth.ts`, и сброса для токена
 * «из коробки» нет: в `afterEach` сессия снимается настоящим `clearTokens()`,
 * поэтому проверки не зависят от порядка запуска и не влияют друг на друга.
 * Кеш запросов у каждой проверки свой — как в штатной обёртке `renderWithProviders`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/features/auth/LoginPage";
import { clearTokens, getAccessToken, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";

/** Ответ успешного входа: схема `accessTokenResponseSchema` требует все три поля. */
const TOKEN = {
  access_token: "токен-входа",
  token_type: "bearer",
  expires_in: 1800,
};

const EMAIL = "admin@crmdetroid.ru";
const PASSWORD = "Secret123";

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  // Настоящий выход из сессии: следующая проверка начинает с пустого токена.
  clearTokens();
});

/** Проба маршрута: показывает, куда человека привёл настоящий `navigate`. */
function RouteProbe({ label }: { label: string }) {
  const location = useLocation();
  return (
    <div>
      <span>{label}</span>
      <span>адрес: {location.pathname}</span>
    </div>
  );
}

/**
 * Экран входа на настоящем роутере в памяти. Рядом живут адреса, куда
 * `LoginPage` уводит после входа, а состояние перехода (`location.state.from`)
 * задаётся так же, как его кладёт защита маршрутов.
 */
function renderLoginPage({ from, token }: { from?: string; token?: string } = {}) {
  if (token) setAccessToken(token);

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/login", element: <LoginPage /> },
      { path: "/crm", element: <RouteProbe label="Доска лидов" /> },
      { path: "/", element: <RouteProbe label="Лаунчер" /> },
    ],
    { initialEntries: [{ pathname: "/login", state: from ? { from } : undefined }] },
  );

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Сервер входа: либо выдаёт токен, либо отказывает с указанным кодом. */
function loginRoute(response: unknown, status?: number) {
  server = startFakeApi([{ method: "POST", path: "/auth/login", response, status }]);
}

function callsTo(path: string) {
  return server?.calls.filter((call) => call.url.includes(path)) ?? [];
}

/** Заполнить оба поля и нажать «Войти» — как это делает человек. */
async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("name@crmdetroid.ru"), EMAIL);
  await user.type(screen.getByPlaceholderText("••••••••"), PASSWORD);
  await user.click(screen.getByRole("button", { name: "Войти" }));
}

/**
 * Держит запросы входа, пока проверка их не отпустит: иначе не поймать
 * состояние «отправили, ответа ещё нет». Попытки считает сама обёртка —
 * поддельный сервер видит запрос только после отпускания ворот.
 */
function holdLoginRequests(counter: { attempts: number }) {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const inner = globalThis.fetch;

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET").toUpperCase() === "POST" && url.includes("/auth/login")) {
      counter.attempts += 1;
      if (counter.attempts > 1) await gate;
    }
    return inner(input, init);
  });

  return release;
}

describe("Страница входа: переходы и отказы", () => {
  it("после успешного входа человек возвращается туда, откуда его выставили", async () => {
    loginRoute(TOKEN);
    const user = userEvent.setup();
    const router = renderLoginPage({ from: "/crm" });

    await signIn(user);

    // Переход настоящий: адрес сменился на тот, что лежал в состоянии перехода.
    expect(await screen.findByText("Доска лидов")).toBeVisible();
    expect(screen.getByText("адрес: /crm")).toBeVisible();
    expect(router.state.location.pathname).toBe("/crm");
    // Переход с заменой записи истории: кнопка «Назад» не вернёт на вход.
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.queryByRole("heading", { name: "CRM Детроид" })).not.toBeInTheDocument();

    // Сессия началась: токен из ответа в памяти вкладки, запрос один.
    expect(getAccessToken()).toBe("токен-входа");
    expect(callsTo("/auth/login")).toHaveLength(1);
  });

  it("если адреса возврата нет, после входа открывается лаунчер", async () => {
    loginRoute(TOKEN);
    const user = userEvent.setup();
    const router = renderLoginPage();

    await signIn(user);

    expect(await screen.findByText("Лаунчер")).toBeVisible();
    expect(screen.getByText("адрес: /")).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
    // Переход с заменой записи истории: кнопка «Назад» не вернёт на вход.
    expect(router.state.historyAction).toBe("REPLACE");
    expect(getAccessToken()).toBe("токен-входа");
    expect(callsTo("/auth/login")).toHaveLength(1);
  });

  it("кто уже вошёл, на странице входа не задерживается", () => {
    loginRoute(TOKEN);
    const router = renderLoginPage({ token: "токен-в-памяти" });

    // Без ожидания: защита срабатывает на первой же отрисовке.
    expect(screen.getByText("Лаунчер")).toBeVisible();
    expect(screen.getByText("адрес: /")).toBeVisible();
    expect(router.state.location.pathname).toBe("/");
    // Переход с заменой записи истории: кнопка «Назад» не вернёт на вход.
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.queryByRole("heading", { name: "CRM Детроид" })).not.toBeInTheDocument();

    // Спросить сервер никто не успел: сессия уже есть.
    expect(server?.calls).toHaveLength(0);
    expect(getAccessToken()).toBe("токен-в-памяти");
  });

  it("слишком много попыток входа: отдельное сообщение про минуту ожидания", async () => {
    loginRoute({ detail: "Too Many Requests" }, 429);
    const user = userEvent.setup();
    renderLoginPage();

    await signIn(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Слишком много попыток входа. Подождите минуту.");
    // Остались на странице входа, сессии нет.
    expect(screen.getByRole("heading", { name: "CRM Детроид" })).toBeVisible();
    expect(getAccessToken()).toBeNull();
    expect(callsTo("/auth/login")).toHaveLength(1);
  });

  it("сервер не отвечает: сообщение про недоступный сервер", async () => {
    loginRoute({ detail: "Internal Server Error" }, 500);
    const user = userEvent.setup();
    renderLoginPage();

    await signIn(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Сервер недоступен. Попробуйте позже.");
    expect(screen.getByRole("heading", { name: "CRM Детроид" })).toBeVisible();
    expect(getAccessToken()).toBeNull();
    expect(callsTo("/auth/login")).toHaveLength(1);
  });

  it("прочий отказ: «Неверный email или пароль», а не текст сервера", async () => {
    // Сервер отвечает своим текстом — на экране должна быть формулировка
    // страницы входа, иначе наружу утекали бы подробности отказа.
    loginRoute({ detail: "Учётная запись заблокирована" }, 401);
    const user = userEvent.setup();
    renderLoginPage();

    await signIn(user);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Неверный email или пароль");
    expect(alert).not.toHaveTextContent("Учётная запись заблокирована");
    expect(getAccessToken()).toBeNull();

    // Отказ на входе не запускает тихое продление сессии: запрос к
    // /auth/refresh означал бы лишнюю попытку и жёсткий переход из клиента.
    expect(callsTo("/auth/refresh")).toHaveLength(0);
  });

  it("неудачный вход не уводит со страницы входа", async () => {
    loginRoute({ detail: "Неверный email или пароль" }, 401);
    const user = userEvent.setup();
    const router = renderLoginPage({ from: "/crm" });

    await signIn(user);
    await screen.findByRole("alert");

    // Ни перехода по адресу возврата, ни жёсткой навигации: адрес прежний.
    expect(router.state.location.pathname).toBe("/login");
    expect(screen.queryByText("Доска лидов")).not.toBeInTheDocument();
    expect(screen.queryByText("Лаунчер")).not.toBeInTheDocument();

    // Введённое осталось в полях — человек правит пароль, а не набирает заново.
    expect(screen.getByPlaceholderText("name@crmdetroid.ru")).toHaveValue(EMAIL);
    expect(screen.getByPlaceholderText("••••••••")).toHaveValue(PASSWORD);
    expect(callsTo("/auth/refresh")).toHaveLength(0);
  });

  it("без действия человека повторных попыток входа нет", async () => {
    loginRoute({ detail: "Неверный email или пароль" }, 401);
    const user = userEvent.setup();
    renderLoginPage();

    await signIn(user);
    await screen.findByRole("alert");
    expect(callsTo("/auth/login")).toHaveLength(1);

    // Ждём дольше задержки, через которую клиент повторяет продление сессии
    // (REFRESH_RETRY_DELAY_MS в auth.ts): если код сам пробует ещё раз,
    // запрос здесь появится.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 700));
    });

    expect(callsTo("/auth/login")).toHaveLength(1);
    expect(server?.calls).toHaveLength(1);
    expect(callsTo("/auth/refresh")).toHaveLength(0);
    // Кнопка снова готова к работе — запрос завершился, а не висит.
    expect(screen.getByRole("button", { name: "Войти" })).toBeEnabled();
    expect(screen.getByRole("alert")).toHaveTextContent("Неверный email или пароль");
  });

  it("новая попытка стирает прежнюю ошибку, пока ответ не пришёл", async () => {
    loginRoute({ detail: "Неверный email или пароль" }, 401);
    const user = userEvent.setup();
    renderLoginPage();

    await signIn(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Неверный email или пароль");

    const counter = { attempts: 1 };
    const release = holdLoginRequests(counter);
    await user.click(screen.getByRole("button", { name: "Войти" }));

    // Отправили второй раз, ответа нет: прежней ошибки уже не видно, кнопка
    // занята и заблокирована — второй клик не отправит запрос повторно.
    await waitFor(() => expect(counter.attempts).toBe(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Входим…" })).toBeDisabled();

    release();

    expect(await screen.findByRole("alert")).toHaveTextContent("Неверный email или пароль");
    await waitFor(() => expect(callsTo("/auth/login")).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Войти" })).toBeEnabled();
  });
});
