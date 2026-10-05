/**
 * Регресс на баг «цвет тега при редактировании не сохраняется».
 *
 * Было: клик по цвету только менял черновик, реальное сохранение требовало
 * отдельного клика на «Сохранить» — а закрытие списка (клик мимо) молча
 * отбрасывало выбранный цвет. Теперь цвет применяется сразу по клику.
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";

import { TagsField } from "./TagsField";
import { useTags } from "@/shared/api/hooks";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

let server: FakeServer | undefined;
afterEach(() => server?.restore());

function Harness() {
  const { data: allTags = [] } = useTags();
  return <TagsField all={allTags} value={[1]} onChange={() => {}} />;
}

it("цвет тега сохраняется сразу по клику на пресет, без отдельного «Сохранить»", async () => {
  let current = { id: 1, name: "Важное", color: "#112233" };
  server = startFakeApi([
    { method: "GET", path: "/crm/tags", response: () => [current] },
    {
      method: "PATCH",
      path: "/crm/tags/1",
      response: (body: unknown) => {
        current = { ...current, ...(body as object) };
        return current;
      },
    },
  ]);

  renderWithProviders(<Harness />);
  const user = userEvent.setup();

  await screen.findByText("Важное");
  await user.click(screen.getByRole("button", { name: "Теги" }));
  await user.click(await screen.findByRole("button", { name: "Изменить тег Важное" }));
  await user.click(await screen.findByRole("button", { name: "Цвет #1e8449" }));

  // Клик мимо (закрытие списка) не должен ничего откатывать — цвет уже ушёл
  // на сервер в момент выбора, а не по отдельной кнопке «Сохранить».
  await waitFor(() => expect(server?.called("PATCH", "/crm/tags/1")).toBe(true));
  const call = server?.calls.find((c) => c.method === "PATCH");
  expect((call?.body as { color?: string })?.color).toBe("#1e8449");

  await user.click(screen.getByRole("button", { name: "Закрыть" }));
  expect(current.color).toBe("#1e8449");
});

it("«Отмена» откатывает уже автосохранённый цвет (а не только закрывает панель)", async () => {
  let current = { id: 1, name: "Важное", color: "#112233" };
  server = startFakeApi([
    { method: "GET", path: "/crm/tags", response: () => [current] },
    {
      method: "PATCH",
      path: "/crm/tags/1",
      response: (body: unknown) => {
        current = { ...current, ...(body as object) };
        return current;
      },
    },
  ]);

  renderWithProviders(<Harness />);
  const user = userEvent.setup();

  await screen.findByText("Важное");
  await user.click(screen.getByRole("button", { name: "Теги" }));
  await user.click(await screen.findByRole("button", { name: "Изменить тег Важное" }));
  await user.click(await screen.findByRole("button", { name: "Цвет #1e8449" }));

  // Цвет уже ушёл на сервер по клику на пресет...
  await waitFor(() => expect(current.color).toBe("#1e8449"));

  // ...но «Отмена» — это именно отмена: должна откатить его обратно на то,
  // что было у тега до открытия панели редактирования.
  await user.click(screen.getByRole("button", { name: "Отмена" }));
  await waitFor(() => expect(current.color).toBe("#112233"));
});
