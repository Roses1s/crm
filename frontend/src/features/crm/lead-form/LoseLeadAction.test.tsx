/**
 * Действие «Отметить проигрышем»: сам запрос, текст ошибки и сообщения странице.
 *
 * Разметку окна (список причин, «Загрузка…», пустой справочник, кнопки) держат
 * свои тесты — `LoseLeadDialog.test.tsx`, а путь «карточка → запрос → доска»
 * целиком — сквозные сценарии `lead-form-flow.test.tsx`. Здесь только то, чем
 * владеет действие: какой запрос уходит, что показывается при разных отказах,
 * что происходит с кнопкой, пока ответа нет, и какие два сообщения получает
 * страница — «закрой окно» и «лид отмечен».
 *
 * Повторное открытие окна в жизни выглядит как размонтирование действия
 * (страница убирает окно целиком), поэтому последняя проверка монтирует
 * компонент заново — как после закрытия и нового нажатия.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoseLeadAction } from "./LoseLeadAction";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

const REASONS = [
  { id: 1, name: "Перестал возить" },
  { id: 2, name: "Ушёл к конкуренту" },
];

const LOSE_PATH = "/crm/leads/10/lose";

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

function renderAction() {
  const handlers = { onCancel: vi.fn(), onLosed: vi.fn() };
  const view = renderWithProviders(
    <LoseLeadAction leadId={10} leadName="ООО Ромашка" {...handlers} />,
  );
  return { ...view, handlers };
}

/** Маршруты окна: справочник причин и ответ на сам проигрыш. */
function loseRoutes(lose: { response: unknown; status?: number } = { response: null }) {
  return [
    { path: "/crm/loss-reasons", response: REASONS },
    { method: "POST", path: LOSE_PATH, response: lose.response, status: lose.status },
  ];
}

function loseCalls() {
  return server?.calls.filter((call) => call.method === "POST" && call.url.includes("/lose")) ?? [];
}

function confirmButton() {
  return screen.getByRole("button", { name: /Отметить проигрышем|Отмечаем…/ });
}

/** Ответ на проигрыш приходит не мгновенно — состояние ожидания иначе не поймать. */
function loseRespondsSlowly(ms: number) {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET").toUpperCase() === "POST" && url.includes("/lose")) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    return inner(input, init);
  });
}

/** Сеть пропала: справочник причин загружается, а запрос проигрыша обрывается. */
function loseLosesConnection() {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET").toUpperCase() === "POST" && url.includes("/lose")) {
      throw new TypeError("Failed to fetch");
    }
    return inner(input, init);
  });
}

describe("Действие «Отметить проигрышем»", () => {
  it("до подтверждения запрос не уходит, окно показывает имя лида", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes());

    const { handlers } = renderAction();

    expect(await screen.findByRole("radio", { name: "Перестал возить" })).toBeVisible();
    expect(screen.getByText(/ООО Ромашка/)).toBeVisible();
    // Открытие окна ничего не решает: выбор причины сам по себе не отправляется.
    expect(loseCalls()).toHaveLength(0);
    expect(handlers.onLosed).not.toHaveBeenCalled();
  });

  it("подтверждение отправляет выбранную причину и сообщает странице об успехе", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes());

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await screen.findByRole("radio", { name: "Ушёл к конкуренту" });

    await user.click(screen.getByRole("radio", { name: "Ушёл к конкуренту" }));
    await user.click(confirmButton());

    await waitFor(() => expect(handlers.onLosed).toHaveBeenCalledTimes(1));
    expect(loseCalls()).toHaveLength(1);
    expect(loseCalls()[0].body).toEqual({ reason_id: 2 });
    // Успех — это переход, а не отмена: страница не должна закрывать окно молча.
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it("пока ответа нет, кнопка говорит «Отмечаем…» и второй раз не отправляет", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes());
    loseRespondsSlowly(300);

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(confirmButton());

    const pending = await screen.findByRole("button", { name: "Отмечаем…" });
    expect(pending).toBeDisabled();
    // Запрос уходит со следующего тика — отсюда waitFor, а не сразу.
    await waitFor(() => expect(loseCalls()).toHaveLength(1));

    // Нажатие по заблокированной кнопке второго запроса не делает.
    fireEvent.click(pending);
    expect(loseCalls()).toHaveLength(1);

    await waitFor(() => expect(handlers.onLosed).toHaveBeenCalledTimes(1));
    expect(loseCalls()).toHaveLength(1);
  });

  it("ошибка сервера остаётся в окне, успеха страница не получает", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes({ response: { detail: "Причина не найдена" }, status: 404 }));

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(confirmButton());

    expect(await screen.findByText("Причина не найдена")).toBeVisible();
    expect(handlers.onLosed).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
    // Окно не закрылось: выбор не потерян, попытку можно повторить.
    expect(screen.getByRole("radio", { name: "Перестал возить" })).toBeChecked();
    expect(confirmButton()).toBeEnabled();
  });

  it("конфликт версий объясняется общим текстом", async () => {
    setAccessToken("токен");
    server = startFakeApi(
      loseRoutes({
        response: { detail: "Лид уже изменён", code: "lead_conflict" },
        status: 409,
      }),
    );

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(confirmButton());

    expect(await screen.findByText(/Другой пользователь уже изменил карточку/)).toBeVisible();
    expect(handlers.onLosed).not.toHaveBeenCalled();
  });

  it("отказ в правах объясняется общим текстом", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes({ response: { detail: "Запрещено" }, status: 403 }));

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(confirmButton());

    expect(await screen.findByText("Недостаточно прав для этого действия")).toBeVisible();
    expect(handlers.onLosed).not.toHaveBeenCalled();
  });

  it("ошибка полей объясняется общим текстом", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes({ response: { detail: "Некорректный запрос" }, status: 422 }));

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(confirmButton());

    expect(
      await screen.findByText(
        "Проверьте поля: ИНН должен быть из 10 или 12 цифр с верной контрольной суммой",
      ),
    ).toBeVisible();
    expect(handlers.onLosed).not.toHaveBeenCalled();
  });

  it("обрыв связи показывается общим текстом и не выдаётся за успех", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes());
    loseLosesConnection();

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(confirmButton());

    expect(await screen.findByText("Не удалось отметить лид проигранным")).toBeVisible();
    expect(handlers.onLosed).not.toHaveBeenCalled();
  });

  it("повторная попытка стирает прошлый текст ошибки", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes({ response: { detail: "Причина не найдена" }, status: 404 }));
    loseRespondsSlowly(300);

    const user = userEvent.setup();
    renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(confirmButton());
    expect(await screen.findByText("Причина не найдена")).toBeVisible();

    // Вторая попытка: прошлый текст уходит сразу, не дожидаясь ответа.
    await user.click(confirmButton());
    expect(screen.queryByText("Причина не найдена")).not.toBeInTheDocument();

    expect(await screen.findByText("Причина не найдена")).toBeVisible();
    expect(loseCalls()).toHaveLength(2);
  });

  it("«Отмена» закрывает окно и ничего не отправляет", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes());

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onLosed).not.toHaveBeenCalled();
    expect(loseCalls()).toHaveLength(0);
  });

  it("Escape закрывает окно и ничего не отправляет", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes());

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.keyboard("{Escape}");

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onLosed).not.toHaveBeenCalled();
    expect(loseCalls()).toHaveLength(0);
  });

  it("повторное открытие начинается с чистого окна", async () => {
    setAccessToken("токен");
    server = startFakeApi(loseRoutes({ response: { detail: "Причина не найдена" }, status: 404 }));

    const user = userEvent.setup();
    const first = renderAction();
    await screen.findByRole("radio", { name: "Перестал возить" });
    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(confirmButton());
    expect(await screen.findByText("Причина не найдена")).toBeVisible();

    // Страница закрыла окно — действие размонтировалось вместе с ошибкой.
    first.unmount();

    renderAction();

    expect(await screen.findByRole("radio", { name: "Перестал возить" })).toBeVisible();
    expect(screen.queryByText("Причина не найдена")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Перестал возить" })).not.toBeChecked();
    // Ничего не переотправлялось: заново окно только открыли.
    expect(loseCalls()).toHaveLength(1);
  });
});
