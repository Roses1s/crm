/**
 * Раздел «Безопасность»: порядок блоков и наполнение.
 *
 * Сеть подменяется целиком: страница только читает данные и рисует блоки,
 * поэтому достаточно убедиться, что блоки идут в согласованном порядке и
 * список копий показывается.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SecurityPage } from "@/features/admin/SecurityPage";
import { renderWithProviders } from "@/test/utils";

// Заготовка под проверку вызова удаления: vi.hoisted поднимает её выше
// vi.mock, чтобы фабрика мока могла на неё сослаться.
const { deleteMock } = vi.hoisted(() => ({ deleteMock: vi.fn() }));

vi.mock("@/shared/api/hooks", () => ({
  useBackups: () => ({
    data: {
      storage: { files: 3, bytes: 4096, free_bytes: 6_500_000_000 },
      results: [{ name: "crm-2026-10-05.dump", size: 40_960 }],
      last_backup_at: "2026-10-05T03:00:00+00:00",
      age_hours: 2,
      is_stale: false,
    },
  }),
  useLoginAttempts: () => ({
    data: [
      {
        id: 1,
        username: "unknown@crmdetroid.ru",
        ip_address: "203.0.113.7",
        attempt_time: "2026-10-06T05:00:00+00:00",
        failures: 2,
      },
    ],
  }),
  useRunBackup: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false }),
  useDeleteBackup: () => ({ mutate: deleteMock, isPending: false, isError: false }),
}));

describe("Раздел «Безопасность»", () => {
  it("показывает блоки в порядке: вложения, попытки входа, бэкапы", async () => {
    renderWithProviders(<SecurityPage />);

    // Порядок именно такой — по просьбе владельца: то, что смотрят чаще,
    // сверху, бэкапы внизу.
    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Вложения",
      "Неудачные попытки входа",
      "Бэкапы",
    ]);

    // Данные доезжают до экрана: копия в списке, попытка в таблице.
    expect(screen.getByText("crm-2026-10-05.dump")).toBeVisible();
    expect(screen.getByText("unknown@crmdetroid.ru")).toBeVisible();
  });

  it("удаляет копию только после подтверждения", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SecurityPage />);
    await screen.findByText("crm-2026-10-05.dump");

    // Клик по корзине сам по себе ничего не удаляет — сначала подтверждение.
    await user.click(screen.getByRole("button", { name: "Удалить crm-2026-10-05.dump" }));
    expect(screen.getByText("Удалить резервную копию?")).toBeVisible();
    expect(deleteMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.queryByText("Удалить резервную копию?")).not.toBeInTheDocument();

    // Повторяем и подтверждаем — удаление уходит с именем файла.
    await user.click(screen.getByRole("button", { name: "Удалить crm-2026-10-05.dump" }));
    await user.click(screen.getByRole("button", { name: "Удалить" }));
    expect(deleteMock).toHaveBeenCalledWith("crm-2026-10-05.dump", expect.anything());
  });
});
