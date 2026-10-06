/**
 * Раздел «Безопасность»: порядок блоков и наполнение.
 *
 * Сеть подменяется целиком: страница только читает данные и рисует блоки,
 * поэтому достаточно убедиться, что блоки идут в согласованном порядке и
 * список копий показывается.
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SecurityPage } from "@/features/admin/SecurityPage";
import { renderWithProviders } from "@/test/utils";

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
});
