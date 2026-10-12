/**
 * Окно «Отметить проигрышем?»: список причин, выбор, ожидание, отмена.
 *
 * Компонент сам загружает справочник причин (`GET /crm/loss-reasons`) и держит
 * только выбор причины; всё остальное — имя лида, «идёт отправка», текст ошибки
 * и обработчики — приходит пропсами от страницы. Запрос проигрыша и переход
 * на доску живут в `LeadFormPage.tsx` и проверяются сквозными сценариями
 * карточки (`lead-form-flow.test.tsx`): окно открывается и из меню «Действия»,
 * и кнопкой «Проигрыш» в полосе этапов, поэтому здесь это не дублируется.
 *
 * Тесты закрепляют то, как окно ведёт себя сейчас: загрузка и пустой
 * справочник, выбор причины (без него подтвердить нельзя), передача выбранного
 * номера наружу, ожидание с подписью «Отмечаем…», текст ошибки и закрытие
 * по «Отмене» и Escape. Новых правил не добавлено.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LoseLeadDialog } from "./LoseLeadDialog";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

const REASONS = [
  { id: 1, name: "Перестал возить" },
  { id: 2, name: "Ушёл к конкуренту" },
];

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

type Props = {
  leadName?: string;
  pending?: boolean;
  error?: string;
};

function renderDialog(props: Props = {}) {
  const handlers = {
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
  };
  const view = renderWithProviders(
    <LoseLeadDialog leadName="ООО Ромашка" pending={false} error="" {...handlers} {...props} />,
  );
  return { ...view, handlers };
}

function confirmButton() {
  return screen.getByRole("button", { name: /Отметить проигрышем|Отмечаем…/ });
}

function loads(ms: number) {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/crm/loss-reasons")) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    return inner(input, init);
  });
}

describe("Отметка проигрыша", () => {
  it("пока причины не пришли, показывается загрузка и подтвердить нельзя", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);
    loads(300);

    renderDialog();

    expect(screen.getByRole("dialog", { name: "Отметка проигрыша" })).toBeVisible();
    expect(screen.getByText("Загрузка…")).toBeVisible();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(confirmButton()).toBeDisabled();

    // Дождались ответа: загрузка сменяется списком причин.
    expect(await screen.findByRole("radio", { name: "Перестал возить" })).toBeVisible();
    expect(screen.queryByText("Загрузка…")).not.toBeInTheDocument();
  });

  it("если причины не настроены, объясняется, что делать", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: [] }]);

    renderDialog();

    expect(
      await screen.findByText("Причины не настроены — обратитесь к администратору."),
    ).toBeVisible();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    // Выбирать нечего — подтвердить проигрыш нельзя.
    expect(confirmButton()).toBeDisabled();
  });

  it("причины показываются списком выбора с именем лида", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    renderDialog({ leadName: "ООО Вектор" });

    expect(await screen.findByRole("radio", { name: "Перестал возить" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "Ушёл к конкуренту" })).toBeVisible();
    expect(screen.getByText(/ООО Вектор/)).toBeVisible();
  });

  it("без выбранной причины подтвердить нельзя, с причиной — можно", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog();
    await screen.findByRole("radio", { name: "Перестал возить" });

    expect(confirmButton()).toBeDisabled();
    // Нажатие по заблокированной кнопке ничего не отправляет.
    fireEvent.click(confirmButton());
    expect(handlers.onConfirm).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));

    expect(screen.getByRole("radio", { name: "Перестал возить" })).toBeChecked();
    expect(confirmButton()).toBeEnabled();
  });

  it("выбрана ровно одна причина: новая заменяет прежнюю", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(screen.getByRole("radio", { name: "Ушёл к конкуренту" }));

    expect(screen.getByRole("radio", { name: "Перестал возить" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Ушёл к конкуренту" })).toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("подтверждение передаёт наружу номер выбранной причины — один раз", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog();
    await screen.findByRole("radio", { name: "Ушёл к конкуренту" });

    // Выбор сам по себе ничего не отправляет.
    await user.click(screen.getByRole("radio", { name: "Ушёл к конкуренту" }));
    expect(handlers.onConfirm).not.toHaveBeenCalled();

    await user.click(confirmButton());

    expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).toHaveBeenCalledWith(2);
    expect(handlers.onCancel).not.toHaveBeenCalled();
  });

  it("пока идёт отправка, кнопка говорит «Отмечаем…» и не принимает нажатий", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog({ pending: true });
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));

    const pending = screen.getByRole("button", { name: "Отмечаем…" });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);

    // Выбор причины при отправке не отменяет состояние ожидания:
    // повторного подтверждения не уходит.
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });

  it("ошибка страницы показывается в окне и не мешает повторной попытке", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog({ error: "Причина не найдена" });
    await screen.findByRole("radio", { name: "Перестал возить" });

    expect(screen.getByText("Причина не найдена")).toBeVisible();
    // Окно не закрылось: выбор не потерян, можно попробовать снова.
    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));
    await user.click(confirmButton());

    expect(handlers.onConfirm).toHaveBeenCalledWith(1);
  });

  it("пустой текст ошибки ничего не добавляет в окно", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    renderDialog({ error: "" });
    await screen.findByRole("radio", { name: "Перестал возить" });

    // Сверяем состав абзацев окна целиком: пояснение и подпись «Причина».
    // Пустая ошибка не должна добавлять третьего (пустого) абзаца.
    const dialog = screen.getByRole("dialog", { name: "Отметка проигрыша" });
    const paragraphs = [...dialog.querySelectorAll("p")].map((node) => node.textContent);

    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toContain("уйдёт с доски");
    expect(paragraphs[1]).toBe("Причина");
    expect(screen.queryByText("Причина не найдена")).not.toBeInTheDocument();
  });

  it("«Отмена» закрывает окно и ничего не отправляет", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog();
    await screen.findByRole("radio", { name: "Перестал возить" });
    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));

    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });

  it("Escape закрывает окно", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    const user = userEvent.setup();
    const { handlers } = renderDialog();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.keyboard("{Escape}");

    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    expect(handlers.onConfirm).not.toHaveBeenCalled();
  });

  it("выбор причины в одной строке не отправляет запрос проигрыша", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));

    // Окно само ничего не шлёт: запрос проигрыша уходит только после
    // подтверждения и живёт в странице.
    const writes = (server?.calls ?? []).filter((call) => call.method !== "GET");
    expect(writes).toHaveLength(0);
  });

  it("список причин запрашивается один раз, повторных запросов нет", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ path: "/crm/loss-reasons", response: REASONS }]);

    const user = userEvent.setup();
    renderDialog();
    await screen.findByRole("radio", { name: "Перестал возить" });

    await user.click(screen.getByRole("radio", { name: "Ушёл к конкуренту" }));
    await user.click(screen.getByRole("radio", { name: "Перестал возить" }));

    await waitFor(() => {
      const calls = (server?.calls ?? []).filter((call) =>
        call.url.startsWith("/api/v1/crm/loss-reasons"),
      );
      expect(calls).toHaveLength(1);
    });
  });
});
