import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { clearBlobCache } from "@/shared/lib/blob-cache";
import { useObjectUrl } from "@/shared/ui/file-preview-utils";
import type { Attachment } from "@/shared/types";

const attachmentBlob = vi.fn((id: number) => Promise.resolve(new Blob([`картинка ${id}`])));
vi.mock("@/shared/api/hooks", () => ({
  attachmentBlob: (id: number) => attachmentBlob(id),
}));

const FILE: Attachment = {
  id: 5,
  name: "фото.jpg",
  size: 2048,
  content_type: "image/jpeg",
  created_at: "2026-10-05T10:00:00Z",
};

function Thumb() {
  const { url } = useObjectUrl(FILE);
  // Пока ссылки нет, картинку не рисуем — как в ленте чаттера.
  return url ? <img src={url} alt="вложение" /> : <span>Загрузка…</span>;
}

afterEach(() => {
  clearBlobCache();
  attachmentBlob.mockClear();
});

it("скачивает вложение один раз и показывает его из памяти вкладки", async () => {
  URL.createObjectURL = vi.fn(() => "blob:фото");
  URL.revokeObjectURL = vi.fn();

  const first = render(<Thumb />);
  await waitFor(() => expect(screen.getByAltText("вложение")).toHaveAttribute("src", "blob:фото"));
  first.unmount();

  render(<Thumb />);

  // Карточку открыли второй раз: картинка на месте сразу, сеть не тревожим.
  expect(screen.getByAltText("вложение")).toHaveAttribute("src", "blob:фото");
  expect(attachmentBlob).toHaveBeenCalledTimes(1);
});
