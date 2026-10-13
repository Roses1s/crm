/**
 * Защита маршрутов: восстановление сессии по куке и уход на страницу входа.
 *
 * Проверяется настоящий `RequireAuth` вместе с настоящим `shared/api/auth.ts`:
 * подменяется только сеть (`POST /auth/refresh`), никаких подставных хуков и
 * заглушек состояния нет — иначе тесты показывали бы свои правила, а не те, что
 * работают в браузере.
 *
 * Состояние сессии живёт в переменных модуля `auth.ts` (токен, флаг
 * «восстановление выполнено», текущий «полёт» продления), и сброса для флага
 * нет. Поэтому каждая проверка получает свежую копию модулей через
 * `vi.resetModules()`: без неё тесты влияли бы друг на друга (флаг из прошлой
 * проверки отменял бы восстановление в следующей). Все части — React, роутер,
 * обёртка с провайдерами и сам `RequireAuth` — импортируются из одного нового
 * реестра, иначе React оказалось бы две копии и хуки сломались бы.
 *
 * Что уже покрыто в других файлах и здесь намеренно НЕ дублируется:
 * — внутренности продления сессии (повтор после 401, один общий «полёт» на
 *   пачку запросов, поколение сессии, очистка кеша при выходе) —
 *   `shared/api/auth-session.test.tsx` и `shared/api/client.test.ts`;
 * — уход на `/login` из HTTP-клиента при 401 посреди работы —
 *   `shared/api/client.test.ts`;
 * — проверка роли на `/admin` — `features/admin/AdminLayout.test.tsx`;
 * — вход через настоящую страницу и возврат в браузер — `login-flow.test.tsx`
 *   и `e2e/pagination.spec.ts`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { startFakeApi, type FakeServer } from "@/test/fake-api";

/** Ответ продления сессии: схема `accessTokenResponseSchema` требует все три поля. */
const COOKIE_TOKEN = {
  access_token: "токен-из-куки",
  token_type: "bearer",
  expires_in: 1800,
};

let server: FakeServer | undefined;
let modules: Modules | undefined;

afterEach(() => {
  // Убираем отрисованное дерево той же копией RTL, которой рисовали: общий
  // cleanup из setup-файла про свежие модули не знает. Токен чистить не нужно —
  // следующая проверка получит новую копию модулей с пустым состоянием.
  modules?.cleanup();
  modules = undefined;
  server?.restore();
  server = undefined;
});

/**
 * Свежая копия модулей на проверку: новый токен, новый флаг восстановления,
 * новый «полёт» продления.
 */
async function loadModules() {
  vi.resetModules();
  const rtl = await import("@testing-library/react");
  const { Route, Routes, useLocation } = await import("react-router-dom");
  const { renderWithProviders } = await import("@/test/utils");
  const { RequireAuth } = await import("@/app/RequireAuth");
  const auth = await import("@/shared/api/auth");
  const loaded = { ...rtl, Route, Routes, useLocation, renderWithProviders, RequireAuth, auth };
  modules = loaded;
  return loaded;
}

type Modules = Awaited<ReturnType<typeof loadModules>>;

/**
 * Два защищённых адреса и страница входа — как в `app/router.tsx`, но на
 * тестовом роутере в памяти (настоящий маршрутизатор создаётся один раз при
 * импорте модуля и хранил бы адрес между проверками).
 *
 * Страница входа показывает, какой адрес ей передал `RequireAuth`: именно так
 * проверяется `state.from` — состояние перехода читается из настоящего роутера.
 */
function renderRoutes(m: Modules, route: string, token?: string) {
  if (token) m.auth.setAccessToken(token);

  function LoginProbe() {
    const location = m.useLocation();
    const from = (location.state as { from?: string } | null)?.from;
    return (
      <div>
        <span>Страница входа</span>
        {from ? <span>вернёмся на {from}</span> : null}
      </div>
    );
  }

  function ProtectedProbe({ label }: { label: string }) {
    const location = m.useLocation();
    return (
      <div>
        <span>{label}</span>
        <span>адрес: {location.pathname}</span>
      </div>
    );
  }

  return m.renderWithProviders(
    <m.Routes>
      <m.Route path="/login" element={<LoginProbe />} />
      <m.Route
        path="/crm"
        element={
          <m.RequireAuth>
            <ProtectedProbe label="Доска лидов" />
          </m.RequireAuth>
        }
      />
      <m.Route
        path="/crm/leads/:id"
        element={
          <m.RequireAuth>
            <ProtectedProbe label="Карточка лида" />
          </m.RequireAuth>
        }
      />
    </m.Routes>,
    { route },
  );
}

/** Маршрут продления сессии: кука либо возвращает токен, либо отказывает. */
function refreshRoutes(response: unknown, status?: number) {
  return [{ method: "POST", path: "/auth/refresh", response, status }];
}

function refreshCalls() {
  return (
    server?.calls.filter((call) => call.method === "POST" && call.url.includes("/auth/refresh")) ??
    []
  );
}

/** Продление не отвечает, пока проверка его не отпустит: иначе «Загрузка…» не поймать. */
function refreshHangsUntilReleased() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET").toUpperCase() === "POST" && url.includes("/auth/refresh")) {
      await gate;
    }
    return inner(input, init);
  });
  return release;
}

describe("Защита маршрутов", () => {
  it("пока сессия восстанавливается, показывается «Загрузка…», а не страница входа", async () => {
    server = startFakeApi(refreshRoutes(COOKIE_TOKEN));
    const release = refreshHangsUntilReleased();

    const m = await loadModules();
    renderRoutes(m, "/crm");

    // Токена в памяти нет (страницу обновили), ответа ещё тоже: человек видит
    // нейтральную загрузку, а не мелькание экрана входа.
    expect(m.screen.getByText("Загрузка…")).toBeVisible();
    expect(m.screen.queryByText("Страница входа")).not.toBeInTheDocument();
    expect(m.screen.queryByText("Доска лидов")).not.toBeInTheDocument();

    // Отпускаем продление и доводим проверку до конца, не оставляя запрос висящим.
    release();

    expect(await m.screen.findByText("Доска лидов")).toBeVisible();
    expect(refreshCalls()).toHaveLength(1);
  });

  it("кука восстанавливает сессию: человек остаётся на своём адресе", async () => {
    server = startFakeApi(refreshRoutes(COOKIE_TOKEN));

    const m = await loadModules();
    renderRoutes(m, "/crm");

    expect(await m.screen.findByText("Доска лидов")).toBeVisible();
    // Никуда не ушли: адрес тот же, страница входа не показывалась.
    expect(m.screen.getByText("адрес: /crm")).toBeVisible();
    expect(m.screen.queryByText("Страница входа")).not.toBeInTheDocument();
    expect(m.screen.queryByText("Загрузка…")).not.toBeInTheDocument();

    // Продление одно, и токен из ответа теперь в памяти вкладки.
    expect(refreshCalls()).toHaveLength(1);
    expect(m.auth.getAccessToken()).toBe("токен-из-куки");
    expect(m.auth.isRestored()).toBe(true);
  });

  it("восстановить сессию не удалось: уводит на страницу входа, токена нет", async () => {
    server = startFakeApi(refreshRoutes({ detail: "Сессия истекла" }, 401));

    const m = await loadModules();
    renderRoutes(m, "/crm");

    // Первый отказ 401 концом сессии не считается: продление повторяется один
    // раз спустя задержку (REFRESH_RETRY_DELAY_MS в auth.ts) — отсюда ожидание.
    expect(await m.screen.findByText("Страница входа", {}, { timeout: 3000 })).toBeVisible();
    expect(m.screen.queryByText("Доска лидов")).not.toBeInTheDocument();
    expect(m.auth.getAccessToken()).toBeNull();
    expect(refreshCalls()).toHaveLength(2);
  });

  it("адрес, с которого выставили, сохраняется в состоянии перехода", async () => {
    server = startFakeApi(refreshRoutes({ detail: "Сессия истекла" }, 401));

    const m = await loadModules();
    renderRoutes(m, "/crm/leads/10");

    await m.screen.findByText("Страница входа", {}, { timeout: 3000 });
    // RequireAuth кладёт в состояние перехода путь, с которого пришёл человек:
    // после входа страница входа вернёт его обратно (LoginPage, строка 33).
    expect(m.screen.getByText("вернёмся на /crm/leads/10")).toBeVisible();
  });

  it("токен уже есть: содержимое сразу, лишнего продления сессии нет", async () => {
    server = startFakeApi(refreshRoutes(COOKIE_TOKEN));

    const m = await loadModules();
    renderRoutes(m, "/crm", "токен-в-памяти");

    // Без ожидания: с токеном в памяти защита пропускает сразу, «Загрузка…»
    // не показывается вовсе.
    expect(m.screen.getByText("Доска лидов")).toBeVisible();
    expect(m.screen.getByText("адрес: /crm")).toBeVisible();
    expect(m.screen.queryByText("Загрузка…")).not.toBeInTheDocument();
    expect(refreshCalls()).toHaveLength(0);
    expect(m.auth.getAccessToken()).toBe("токен-в-памяти");
  });

  it("повторного восстановления нет: сессию уже пробовали вернуть", async () => {
    server = startFakeApi(refreshRoutes({ detail: "Сессия истекла" }, 401));

    const m = await loadModules();
    const first = renderRoutes(m, "/crm");
    await m.screen.findByText("Страница входа", {}, { timeout: 3000 });
    expect(refreshCalls()).toHaveLength(2);
    first.unmount();

    // Та же копия модулей — как одна вкладка, где человек перешёл по другому
    // защищённому адресу. Флаг «восстановление выполнено» уже стоит.
    renderRoutes(m, "/crm");

    // На страницу входа уходит сразу, без «Загрузки…» и без новых запросов.
    expect(m.screen.getByText("Страница входа")).toBeVisible();
    expect(m.screen.queryByText("Загрузка…")).not.toBeInTheDocument();
    expect(refreshCalls()).toHaveLength(2);
  });
});
