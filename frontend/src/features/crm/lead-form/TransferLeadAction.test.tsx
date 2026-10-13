/**
 * Действие «Передать лид»: сам запрос, текст ошибки и сообщения странице.
 *
 * Тесты написаны ДО переноса кода (порядок согласован с владельцем 12.10.2026):
 * сначала поведение закрепляла временная обвязка, повторявшая подключение
 * страницы, и только потом появился сам `TransferLeadAction.tsx`. Обвязка
 * удалена — проверки ниже обращаются к настоящему действию, а сами сценарии при
 * переносе не менялись.
 *
 * Что уже покрыто в других файлах и здесь намеренно НЕ дублируется:
 * — разметка окна (загрузка, пустой список, восемь строк, поиск, «Назад»,
 *   состав текстов обоих шагов) — `TransferDialog.test.tsx`;
 * — путь «карточка → два шага → запрос → доска», доступность кнопки передачи
 *   (новая карточка, проигранный лид у не-администратора) и исчезновение ошибки
 *   при повторном открытии — сквозные сценарии `lead-form-flow.test.tsx`.
 *
 * Здесь закреплено только то, чем владеет действие: какой запрос и с каким
 * номером сотрудника уходит, что показывается при разных отказах, что повторная
 * отправка невозможна, пока ответа нет, и какие два сообщения получает страница
 * — «закрой окно» и «лид передан».
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TransferLeadAction } from "./TransferLeadAction";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

const KUZNETSOV = {
  id: 2,
  first_name: "Денис",
  last_name: "Кузнецов",
  full_name: "Денис Кузнецов",
};
const SOKOLOVA = {
  id: 7,
  first_name: "Анна",
  last_name: "Соколова",
  full_name: "Анна Соколова",
};
const COLLEAGUES = [KUZNETSOV, SOKOLOVA];

const TRANSFER_PATH = "/crm/leads/10/transfer";

/** Пропсы действия — берутся из самого компонента, отдельной копии нет. */
type ActionProps = ComponentProps<typeof TransferLeadAction>;

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

function renderAction(overrides: Partial<ActionProps> = {}) {
  const handlers = { onCancel: vi.fn(), onTransferred: vi.fn() };
  const view = renderWithProviders(
    <TransferLeadAction
      leadId={10}
      leadName="ООО Ромашка"
      leadIsLost={false}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...view, handlers };
}

/** Маршруты окна: список коллег и ответ на саму передачу. */
function transferRoutes(transfer: { response: unknown; status?: number } = { response: null }) {
  return [
    { path: "/users/colleagues", response: COLLEAGUES },
    { method: "POST", path: TRANSFER_PATH, response: transfer.response, status: transfer.status },
  ];
}

function transferCalls() {
  return (
    server?.calls.filter((call) => call.method === "POST" && call.url.includes("/transfer")) ?? []
  );
}

function confirmButton() {
  return screen.getByRole("button", { name: /Передать|Передаём…/ });
}

/** Два шага окна: выбрали сотрудника и оказались на подтверждении. */
async function chooseColleague(user: ReturnType<typeof userEvent.setup>, fullName: string) {
  await user.click(await screen.findByRole("button", { name: fullName }));
  return screen.getByRole("heading", { name: "Передать лид?" });
}

/** Ответ на передачу приходит не мгновенно — состояние ожидания иначе не поймать. */
function transferRespondsSlowly(ms: number) {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET").toUpperCase() === "POST" && url.includes("/transfer")) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    return inner(input, init);
  });
}

describe("Действие «Передать лид»", () => {
  it("выбранный сотрудник уходит на сервер только после подтверждения", async () => {
    setAccessToken("токен");
    server = startFakeApi(transferRoutes());

    const user = userEvent.setup();
    const { handlers } = renderAction();

    // Первый шаг: окно открылось, имя лида на месте, запроса ещё нет.
    expect(await screen.findByRole("heading", { name: "Кому передать лид" })).toBeVisible();
    expect(server.called("GET", "/users/colleagues")).toBe(true);
    expect(transferCalls()).toHaveLength(0);

    // Второй шаг: выбрали не первого в списке — иначе номер не отличить от любого.
    await chooseColleague(user, "Анна Соколова");
    expect(screen.getByText(/ООО Ромашка/)).toBeVisible();
    expect(transferCalls()).toHaveLength(0);
    expect(handlers.onTransferred).not.toHaveBeenCalled();
    // До ответа сервера своих сообщений у действия нет: общий текст не висит
    // с самого открытия, а появляется только после отказа.
    expect(screen.queryByText("Не удалось передать лид")).not.toBeInTheDocument();

    await user.click(confirmButton());

    await waitFor(() => expect(handlers.onTransferred).toHaveBeenCalledTimes(1));
    expect(transferCalls()).toHaveLength(1);
    expect(transferCalls()[0].body).toEqual({ user_id: 7 });
    // Успех — это переход, а не отмена: страница не должна закрывать окно молча.
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it("пока ответа нет, повторная отправка невозможна", async () => {
    setAccessToken("токен");
    server = startFakeApi(transferRoutes());
    transferRespondsSlowly(300);

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await chooseColleague(user, "Денис Кузнецов");

    await user.click(confirmButton());

    const pending = await screen.findByRole("button", { name: "Передаём…" });
    expect(pending).toBeDisabled();
    // Запрос уходит со следующего тика — отсюда waitFor, а не сразу.
    await waitFor(() => expect(transferCalls()).toHaveLength(1));

    // Нажатие по заблокированной кнопке второго запроса не делает.
    fireEvent.click(pending);
    expect(transferCalls()).toHaveLength(1);

    await waitFor(() => expect(handlers.onTransferred).toHaveBeenCalledTimes(1));
    expect(transferCalls()).toHaveLength(1);
  });

  it("отказ сервера остаётся в окне, выбранный сотрудник не теряется", async () => {
    setAccessToken("токен");
    server = startFakeApi(
      transferRoutes({ response: { detail: "Нет прав на передачу" }, status: 403 }),
    );
    transferRespondsSlowly(200);

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await chooseColleague(user, "Анна Соколова");

    await user.click(confirmButton());

    expect(await screen.findByText("Нет прав на передачу")).toBeVisible();
    expect(handlers.onTransferred).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
    // Окно не закрылось и не вернулось к поиску: попытку можно повторить.
    expect(screen.getByRole("heading", { name: "Передать лид?" })).toBeVisible();
    expect(screen.getByText("Анна Соколова")).toBeVisible();
    expect(confirmButton()).toBeEnabled();

    // Повторная попытка: передача, в отличие от проигрыша, прошлый текст не
    // стирает — он остаётся на экране, пока идёт новый запрос. Закрепляем как
    // есть, чтобы перенос не поменял порядок молча.
    await user.click(confirmButton());
    expect(screen.getByText("Нет прав на передачу")).toBeVisible();
    expect(screen.getByRole("button", { name: "Передаём…" })).toBeDisabled();

    await waitFor(() => expect(transferCalls()).toHaveLength(2));
    expect(handlers.onTransferred).not.toHaveBeenCalled();
  });

  it("отказ без текста объясняется общим сообщением", async () => {
    setAccessToken("токен");
    // Сервер вернул пустой detail: показывать нечего, остаётся общий текст.
    server = startFakeApi(transferRoutes({ response: { detail: "" }, status: 500 }));

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await chooseColleague(user, "Денис Кузнецов");

    await user.click(confirmButton());

    expect(await screen.findByText("Не удалось передать лид")).toBeVisible();
    expect(handlers.onTransferred).not.toHaveBeenCalled();
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it("флаг проигрыша проходит через действие: приписка есть только у проигранного лида", async () => {
    setAccessToken("токен");
    server = startFakeApi(transferRoutes());

    const user = userEvent.setup();
    const lost = renderAction({ leadIsLost: true });
    await chooseColleague(user, "Анна Соколова");
    expect(screen.getByText(/Лид также выйдет из проигрыша и вернётся на доску/)).toBeVisible();
    lost.unmount();

    // Тот же шаг у активного лида: действие не должно подставлять флаг само.
    renderAction({ leadIsLost: false });
    await chooseColleague(user, "Анна Соколова");
    expect(screen.queryByText(/выйдет из проигрыша/)).not.toBeInTheDocument();
  });

  it("«Отмена» закрывает окно и ничего не отправляет", async () => {
    setAccessToken("токен");
    server = startFakeApi(transferRoutes());

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await chooseColleague(user, "Анна Соколова");

    // «Отмена» есть только на первом шаге — возвращаемся «Назад».
    await user.click(screen.getByRole("button", { name: "Назад" }));
    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onTransferred).not.toHaveBeenCalled();
    expect(transferCalls()).toHaveLength(0);
  });

  it("Escape на шаге подтверждения закрывает окно и ничего не отправляет", async () => {
    setAccessToken("токен");
    server = startFakeApi(transferRoutes());

    const user = userEvent.setup();
    const { handlers } = renderAction();
    await chooseColleague(user, "Анна Соколова");

    await user.keyboard("{Escape}");

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onTransferred).not.toHaveBeenCalled();
    expect(transferCalls()).toHaveLength(0);
  });

  it("повторное открытие начинается с чистого окна", async () => {
    setAccessToken("токен");
    server = startFakeApi(
      transferRoutes({ response: { detail: "Нет прав на передачу" }, status: 403 }),
    );

    const user = userEvent.setup();
    const first = renderAction();
    await chooseColleague(user, "Анна Соколова");
    await user.click(confirmButton());
    expect(await screen.findByText("Нет прав на передачу")).toBeVisible();

    // Страница закрыла окно — действие размонтировалось вместе с ошибкой.
    first.unmount();

    renderAction();

    expect(await screen.findByRole("heading", { name: "Кому передать лид" })).toBeVisible();
    expect(screen.queryByText("Нет прав на передачу")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Передать лид?" })).not.toBeInTheDocument();
    // Ничего не переотправлялось: заново окно только открыли.
    expect(transferCalls()).toHaveLength(1);
  });
});
