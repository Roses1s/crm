/**
 * Полоса этапов карточки лида: кнопки действий слева и этапы воронки справа.
 *
 * Компонент без собственного состояния и без запросов: значения приходят через
 * props, нажатия уходят наружу обработчиками. Проверяем разметку (подписи,
 * подсказки, порядок кнопок), все сочетания правил видимости и блокировок,
 * перенесённые из `LeadFormPage.tsx` дословно, и то, что каждое нажатие уходит
 * ровно в свой обработчик — один раз и без «чужих» вызовов.
 *
 * Отдельно закреплено, что компонент возвращает фрагмент: в разметке нет ни
 * своего `<div>`, ни лишнего уровня — панель и плашка ошибки остаются соседями.
 *
 * Тесты появились вместе с переносом полосы из `LeadFormPage.tsx` (шаг 16В):
 * до переноса эти кнопки и правила проверялись сквозными сценариями страницы.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeadStageBar } from "@/features/crm/lead-form/LeadStageBar";

const STAGES = [
  { id: 1, name: "Новый", sequence: 1, color: "#6b7280" },
  { id: 2, name: "В работе", sequence: 2, color: "#2563eb" },
  { id: 3, name: "Доставлено", sequence: 3, color: "#16a34a" },
];

type Props = {
  stages?: typeof STAGES;
  currentStageId?: number;
  isNew?: boolean;
  isArchived?: boolean;
  isOwner?: boolean;
  saving?: boolean;
  readOnly?: boolean;
  restorePending?: boolean;
  restoreError?: string;
};

/** Кнопки левой части полосы в том порядке, в каком они стоят в разметке. */
function leftButtons(container: HTMLElement) {
  const left = container.querySelector(".flex.flex-wrap.items-center.gap-1");
  return [...(left?.querySelectorAll("button") ?? [])].map((button) => button.textContent);
}

function renderBar(props: Props = {}) {
  const handlers = {
    onSelectStage: vi.fn(),
    onCreateShipment: vi.fn(),
    onRestore: vi.fn(),
    onLose: vi.fn(),
  };
  const view = render(
    <LeadStageBar
      stages={STAGES}
      currentStageId={2}
      isNew={false}
      isArchived={false}
      isOwner={false}
      saving={false}
      readOnly={false}
      restorePending={false}
      restoreError=""
      {...handlers}
      {...props}
    />,
  );
  return { ...view, handlers };
}

/** Ни один обработчик не вызван: проверяем всю четвёрку сразу. */
function expectSilence(handlers: ReturnType<typeof renderBar>["handlers"]) {
  Object.values(handlers).forEach((handler) => expect(handler).not.toHaveBeenCalled());
}

describe("LeadStageBar", () => {
  it("«Создать заявку» уходит ровно в свой обработчик", async () => {
    const user = userEvent.setup();
    const { handlers } = renderBar();

    await user.click(screen.getByRole("button", { name: "Создать заявку" }));

    expect(handlers.onCreateShipment).toHaveBeenCalledTimes(1);
    expect(handlers.onSelectStage).not.toHaveBeenCalled();
    expect(handlers.onRestore).not.toHaveBeenCalled();
    expect(handlers.onLose).not.toHaveBeenCalled();
  });

  it("«Проигрыш» уходит ровно в свой обработчик и не блокируется", async () => {
    const user = userEvent.setup();
    const { handlers } = renderBar();

    const lose = screen.getByRole("button", { name: "Проигрыш" });
    expect(lose).toBeEnabled();
    await user.click(lose);

    expect(handlers.onLose).toHaveBeenCalledTimes(1);
    expect(handlers.onCreateShipment).not.toHaveBeenCalled();
    expect(handlers.onSelectStage).not.toHaveBeenCalled();
    expect(handlers.onRestore).not.toHaveBeenCalled();
  });

  it("чужой лид: «Взять себе» с подсказкой и вызовом восстановления", async () => {
    const user = userEvent.setup();
    const { handlers } = renderBar({ isArchived: true, isOwner: false });

    const take = screen.getByRole("button", { name: "Взять себе" });
    expect(take).toHaveAttribute("title", "Забрать лид себе: он перейдёт на вашу доску");
    expect(screen.queryByRole("button", { name: "Восстановить" })).not.toBeInTheDocument();

    await user.click(take);

    expect(handlers.onRestore).toHaveBeenCalledTimes(1);
    expect(handlers.onLose).not.toHaveBeenCalled();
  });

  it("свой лид: «Восстановить» с подсказкой владельца", async () => {
    const user = userEvent.setup();
    const { handlers } = renderBar({ isArchived: true, isOwner: true });

    const restore = screen.getByRole("button", { name: "Восстановить" });
    expect(restore).toHaveAttribute("title", "Вернуть лид на доску");
    expect(screen.queryByRole("button", { name: "Взять себе" })).not.toBeInTheDocument();

    await user.click(restore);

    expect(handlers.onRestore).toHaveBeenCalledTimes(1);
  });

  it("во время восстановления кнопка показывает ожидание и заблокирована", () => {
    const { handlers } = renderBar({ isArchived: true, restorePending: true });

    const pending = screen.getByRole("button", { name: "Восстанавливаем…" });
    expect(pending).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Взять себе" })).not.toBeInTheDocument();

    // Нажатие по заблокированной кнопке не уходит наружу даже «силой».
    fireEvent.click(pending);
    expectSilence(handlers);
  });

  it("у новой карточки кнопок нет, а этапы остаются", () => {
    const { handlers } = renderBar({ isNew: true, currentStageId: 1 });

    expect(screen.queryByRole("button", { name: "Создать заявку" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Проигрыш" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Взять себе|Восстановить/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Новый" })).toBeEnabled();
    expectSilence(handlers);
  });

  it("у проигранного лида нет «Создать заявку» и «Проигрыш», но есть возврат лида", () => {
    renderBar({ isArchived: true });

    expect(screen.queryByRole("button", { name: "Создать заявку" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Проигрыш" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Взять себе" })).toBeVisible();
  });

  it("выбор этапа уходит наружу один раз и с нужным номером", async () => {
    const user = userEvent.setup();
    const { handlers } = renderBar();

    await user.click(screen.getByRole("button", { name: "Доставлено" }));

    expect(handlers.onSelectStage).toHaveBeenCalledTimes(1);
    expect(handlers.onSelectStage).toHaveBeenCalledWith(3);
    expect(handlers.onCreateShipment).not.toHaveBeenCalled();
    expect(handlers.onRestore).not.toHaveBeenCalled();
    expect(handlers.onLose).not.toHaveBeenCalled();
  });

  it("активным помечен только текущий этап", () => {
    renderBar({ currentStageId: 2 });

    expect(screen.getByRole("button", { name: "В работе" })).toHaveAttribute(
      "aria-current",
      "step",
    );
    expect(screen.getByRole("button", { name: "Новый" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: "Доставлено" })).not.toHaveAttribute("aria-current");
  });

  it("этапы заблокированы, пока идёт сохранение", () => {
    renderBar({ saving: true });

    expect(screen.getByRole("button", { name: "В работе" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Доставлено" })).toBeDisabled();
    // Кнопки действий при этом остаются доступными: блокировка только у этапов.
    expect(screen.getByRole("button", { name: "Проигрыш" })).toBeEnabled();
  });

  it("в карточке «только чтение» этапы заблокированы", () => {
    renderBar({ readOnly: true });

    expect(screen.getByRole("button", { name: "В работе" })).toBeDisabled();
  });

  it("без сохранения и запретов этапы доступны", () => {
    renderBar();

    expect(screen.getByRole("button", { name: "В работе" })).toBeEnabled();
  });

  it("плашка ошибки восстановления показывается только с текстом", () => {
    const { unmount } = renderBar({
      isArchived: true,
      restoreError: "Не удалось восстановить лид",
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Не удалось восстановить лид");
    unmount();

    renderBar({ isArchived: true });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("слева всегда одна кнопка действия: заявка у активного, возврат у проигранного", () => {
    // У активного лида — заявка и проигрыш; у проигранного — только возврат лида:
    // заявку у проигранного не создать, а проигрыш уже случился.
    const active = renderBar();
    expect(leftButtons(active.container)).toEqual(["Создать заявку", "Проигрыш"]);
    active.unmount();

    const owner = renderBar({ isArchived: true, isOwner: true });
    expect(leftButtons(owner.container)).toEqual(["Восстановить"]);
    owner.unmount();

    const other = renderBar({ isArchived: true });
    expect(leftButtons(other.container)).toEqual(["Взять себе"]);
  });

  it("компонент не добавляет своей обёртки: панель и плашка — соседи", () => {
    const { container, unmount } = renderBar();
    expect(container.children).toHaveLength(1);
    expect(container.firstElementChild?.className).toContain("sticky");
    unmount();

    const withError = renderBar({ isArchived: true, restoreError: "Не удалось восстановить лид" });
    expect(withError.container.children).toHaveLength(2);
    // Плашка лежит сразу за панелью, а не внутри дополнительного слоя.
    expect(withError.container.firstElementChild?.nextElementSibling).toHaveAttribute(
      "role",
      "alert",
    );
  });
});
