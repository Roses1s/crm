/**
 * Шапка карточки лида: «Новый», «хлебные крошки», «Сохранить/Отменить»,
 * меню «Действия», «Все заявки» и листалка соседних лидов.
 *
 * Компонент без собственного состояния и без запросов: значения приходят через
 * props, нажатия уходят наружу обработчиками. Проверяем разметку (подписи,
 * ссылки, порядок), правила видимости и блокировки, которые перенесены из
 * `LeadFormPage.tsx` дословно, и то, что каждое нажатие уходит ровно в свой
 * обработчик — один раз и без «чужих» вызовов.
 *
 * Тесты появились вместе с переносом шапки из `LeadFormPage.tsx` (шаг 16Б):
 * до переноса эти кнопки проверялись только сквозными сценариями страницы.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { LeadHeaderBar } from "@/features/crm/lead-form/LeadHeaderBar";

type Props = {
  leadName?: string;
  isNew?: boolean;
  isArchived?: boolean;
  isAdmin?: boolean;
  dirty?: boolean;
  readOnly?: boolean;
  saving?: boolean;
  actionsOpen?: boolean;
  deletePending?: boolean;
  shipmentsCount?: number;
  pager?: {
    position: number;
    total: number;
    prev_id: number | null;
    next_id: number | null;
  } | null;
};

function renderBar(props: Props = {}) {
  const handlers = {
    onNew: vi.fn(),
    onSave: vi.fn(),
    onDiscard: vi.fn(),
    onActionsOpenChange: vi.fn(),
    onOpenLose: vi.fn(),
    onOpenDelete: vi.fn(),
    onPrevLead: vi.fn(),
    onNextLead: vi.fn(),
  };
  const view = render(
    <MemoryRouter>
      <LeadHeaderBar
        leadName={props.leadName ?? "ООО Ромашка"}
        isNew={props.isNew ?? false}
        isArchived={props.isArchived ?? false}
        isAdmin={props.isAdmin ?? false}
        dirty={props.dirty ?? false}
        readOnly={props.readOnly ?? false}
        saving={props.saving ?? false}
        actionsOpen={props.actionsOpen ?? false}
        deletePending={props.deletePending ?? false}
        shipmentsCount={props.shipmentsCount ?? 2}
        pager={
          props.pager === undefined
            ? { position: 2, total: 3, prev_id: 9, next_id: 11 }
            : props.pager
        }
        {...handlers}
      />
    </MemoryRouter>,
  );
  return { ...view, handlers };
}

function actionsButton(): HTMLElement {
  return screen.getByRole("button", { name: "Действия" });
}

describe("LeadHeaderBar", () => {
  it("«Лиды» ведёт на доску, пустое название показывается как «Новый лид»", () => {
    const view = renderBar();

    expect(screen.getByRole("link", { name: "Лиды" })).toHaveAttribute("href", "/crm");
    expect(screen.getByText("ООО Ромашка")).toBeVisible();
    view.unmount();

    // Новая карточка без названия: в крошках — понятная подпись, а не пустота.
    renderBar({ leadName: "", isNew: true, pager: null });
    expect(screen.getByText("Новый лид")).toBeVisible();
  });

  it("«Новый» уходит наружу ровно один раз и не задевает другие обработчики", async () => {
    const user = userEvent.setup();
    const { handlers } = renderBar();

    await user.click(screen.getByRole("button", { name: "Новый" }));

    expect(handlers.onNew).toHaveBeenCalledTimes(1);
    expect(handlers.onSave).not.toHaveBeenCalled();
    expect(handlers.onDiscard).not.toHaveBeenCalled();
    expect(handlers.onActionsOpenChange).not.toHaveBeenCalled();
  });

  it("«Сохранить» и «Отменить» видны только при правках и не в карточке «только чтение»", async () => {
    const user = userEvent.setup();

    // Правок нет — блока сохранения нет вовсе (как на странице: он вернёт null).
    const clean = renderBar({ dirty: false });
    expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
    clean.unmount();

    // Есть правки — обе кнопки на месте и уходят в свои обработчики.
    const dirty = renderBar({ dirty: true });
    await user.click(screen.getByRole("button", { name: "Сохранить" }));
    await user.click(screen.getByRole("button", { name: "Отменить изменения" }));
    expect(dirty.handlers.onSave).toHaveBeenCalledTimes(1);
    expect(dirty.handlers.onDiscard).toHaveBeenCalledTimes(1);
    dirty.unmount();

    // Карточка проиграна (только чтение) — правки показывать нечего.
    renderBar({ dirty: true, readOnly: true });
    expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
  });

  it("во время сохранения кнопки сохранения заблокированы", () => {
    renderBar({ dirty: true, saving: true });

    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Отменить изменения" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Сохранить" })).toHaveAttribute(
      "title",
      "Сохранение…",
    );
  });

  it("у новой карточки нет меню, счётчика заявок и листалки", () => {
    renderBar({ isNew: true, leadName: "" });

    expect(screen.queryByRole("button", { name: "Действия" })).not.toBeInTheDocument();
    expect(screen.queryByText("Все заявки")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Предыдущий лид" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Следующий лид" })).not.toBeInTheDocument();
  });

  it("меню «Действия»: шестерёнка переключает, подложка закрывает", async () => {
    const user = userEvent.setup();

    const closed = renderBar({ actionsOpen: false });
    await user.click(actionsButton());
    expect(closed.handlers.onActionsOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("button", { name: "Удалить лид" })).not.toBeInTheDocument();
    closed.unmount();

    const open = renderBar({ actionsOpen: true, isAdmin: true });
    await user.click(actionsButton());
    expect(open.handlers.onActionsOpenChange).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(open.handlers.onActionsOpenChange).toHaveBeenLastCalledWith(false);
    expect(open.handlers.onActionsOpenChange).toHaveBeenCalledTimes(2);
  });

  it("состав меню: роль и состояние лида решают, какие пункты видны", async () => {
    const user = userEvent.setup();

    // Активный лид у администратора: оба пункта, каждый уходит в свой обработчик.
    const both = renderBar({ actionsOpen: true, isAdmin: true });
    expect(screen.getByRole("button", { name: "Отметить проигрышем" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Удалить лид" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Отметить проигрышем" }));
    expect(both.handlers.onOpenLose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Удалить лид" }));
    expect(both.handlers.onOpenDelete).toHaveBeenCalledTimes(1);
    expect(both.handlers.onNew).not.toHaveBeenCalled();
    both.unmount();

    // Проигранный лид: отметить проигрышем нечего, удалить — можно.
    const archived = renderBar({ actionsOpen: true, isAdmin: true, isArchived: true });
    expect(screen.queryByRole("button", { name: "Отметить проигрышем" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить лид" })).toBeVisible();
    archived.unmount();

    // Не администратор: пункта удаления нет.
    const manager = renderBar({ actionsOpen: true, isAdmin: false });
    expect(screen.getByRole("button", { name: "Отметить проигрышем" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Удалить лид" })).not.toBeInTheDocument();
    manager.unmount();

    // Проигранный лид у не администратора: меню открывается, но пустое.
    renderBar({ actionsOpen: true, isAdmin: false, isArchived: true });
    expect(screen.getByRole("button", { name: "Закрыть" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Отметить проигрышем" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить лид" })).not.toBeInTheDocument();
  });

  it("во время удаления пункт «Удалить лид» заблокирован", () => {
    renderBar({ actionsOpen: true, isAdmin: true, deletePending: true });

    expect(screen.getByRole("button", { name: "Удалить лид" })).toBeDisabled();
  });

  it("«Все заявки» показывает число из props", () => {
    const { unmount } = renderBar({ shipmentsCount: 7 });
    expect(screen.getByText("Все заявки")).toBeVisible();
    expect(screen.getByText("7")).toBeVisible();
    unmount();

    renderBar({ shipmentsCount: 0 });
    expect(screen.getByText("0")).toBeVisible();
  });

  it("листалка: счётчик, свои обработчики и блокировка на краях списка", async () => {
    const user = userEvent.setup();

    const middle = renderBar({ pager: { position: 2, total: 3, prev_id: 9, next_id: 11 } });
    expect(screen.getByText("2 / 3")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Предыдущий лид" }));
    expect(middle.handlers.onPrevLead).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Следующий лид" }));
    expect(middle.handlers.onNextLead).toHaveBeenCalledTimes(1);
    middle.unmount();

    // Первая карточка списка: назад идти некуда.
    const first = renderBar({ pager: { position: 1, total: 3, prev_id: null, next_id: 10 } });
    expect(screen.getByRole("button", { name: "Предыдущий лид" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Следующий лид" })).toBeEnabled();
    first.unmount();

    // Последняя карточка списка: наоборот.
    const last = renderBar({ pager: { position: 3, total: 3, prev_id: 10, next_id: null } });
    expect(screen.getByRole("button", { name: "Предыдущий лид" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Следующий лид" })).toBeDisabled();
    last.unmount();

    // Данных листалки ещё нет — блока нет вовсе (как было на странице).
    renderBar({ pager: null });
    expect(screen.queryByRole("button", { name: "Предыдущий лид" })).not.toBeInTheDocument();
  });

  it("порядок элементов прежний: «Новый», крошки, меню, сохранение, счётчик, листалка", () => {
    renderBar({ dirty: true, actionsOpen: true, isAdmin: true });

    // Порядок такой же, как в ControlPanel: панель рисует слоты в этом
    // порядке, и шапка передаёт их как раньше.
    const nodes = [
      screen.getByRole("button", { name: "Новый" }),
      screen.getByRole("navigation", { name: "Хлебные крошки" }),
      actionsButton(),
      screen.getByRole("button", { name: "Сохранить" }),
      screen.getByText("Все заявки"),
      screen.getByRole("button", { name: "Предыдущий лид" }),
    ];
    for (let i = 0; i < nodes.length - 1; i += 1) {
      expect(
        nodes[i]!.compareDocumentPosition(nodes[i + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING,
        `элемент ${i} должен быть раньше элемента ${i + 1}`,
      ).toBeTruthy();
    }
  });

  it("собственного состояния нет: смена props сразу меняет шапку", () => {
    const { rerender, handlers } = renderBar({ actionsOpen: false, deletePending: false });

    rerender(
      <MemoryRouter>
        <LeadHeaderBar
          leadName="ООО Лютик"
          isNew={false}
          isArchived={false}
          isAdmin
          dirty={false}
          readOnly={false}
          saving={false}
          actionsOpen
          deletePending
          shipmentsCount={5}
          pager={null}
          {...handlers}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("ООО Лютик")).toBeVisible();
    expect(screen.getByRole("button", { name: "Удалить лид" })).toBeDisabled();
    expect(screen.getByText("5")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Предыдущий лид" })).not.toBeInTheDocument();
  });
});
