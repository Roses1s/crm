import { renderWithProviders } from "@/test/utils";
import { Modal } from "./modal";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";

function Harness() {
  const [open, setOpen] = useState(false);
  // Кнопка, открывшая окно: после закрытия фокус должен вернуться на неё.
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть
      </button>
      {open && (
        <Modal label="Тестовое окно" onClose={() => setOpen(false)}>
          <button type="button">Первый</button>
          <button type="button">Последний</button>
        </Modal>
      )}
    </>
  );
}

it("модальное окно — настоящий диалог (Ф-04): семантика, фокус, Esc", async () => {
  const user = userEvent.setup();
  renderWithProviders(<Harness />);

  // Окно открывает кнопка — фокус должен вернуться именно на неё.
  await user.click(screen.getByRole("button", { name: "Открыть" }));

  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(dialog).toHaveAttribute("aria-label", "Тестовое окно");

  // Фокус сразу внутри окна, на первом интерактивном элементе.
  expect(screen.getByRole("button", { name: "Первый" })).toHaveFocus();

  // Tab не выпускает фокус за пределы окна: с последнего элемента — на первый.
  await user.tab();
  expect(screen.getByRole("button", { name: "Последний" })).toHaveFocus();
  await user.tab();
  expect(screen.getByRole("button", { name: "Первый" })).toHaveFocus();

  // Esc закрывает окно, фокус возвращается на открывшую кнопку.
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Открыть" })).toHaveFocus();
});

it("закрытие происходит только кнопкой или Esc, не кликом по затемнению", async () => {
  const onClose = vi.fn();
  renderWithProviders(
    <Modal label="Окно" onClose={onClose}>
      <p>Содержимое</p>
    </Modal>,
  );
  const user = userEvent.setup();

  // Клик мимо (по затемнению) ничего не закрывает — как и раньше.
  await user.click(screen.getByRole("dialog").parentElement!);
  expect(onClose).not.toHaveBeenCalled();
});
