import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { attachmentBlob, attachmentThumbnailBlob } from "@/shared/api/hooks";
import { clearAttachmentLoadQueue } from "@/shared/lib/attachment-load-queue";
import { clearBlobCache } from "@/shared/lib/blob-cache";
import { renderWithProviders } from "@/test/utils";
import { FilePreview } from "@/shared/ui/file-preview";

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

vi.mock("@/shared/api/hooks", () => ({
  attachmentBlob: vi.fn(() => new Promise<Blob>(() => undefined)),
  attachmentThumbnailBlob: vi.fn(() => new Promise<Blob>(() => undefined)),
  downloadAttachment: vi.fn(),
}));

afterEach(() => {
  cleanup();
  act(() => {
    clearAttachmentLoadQueue();
    clearBlobCache();
  });
  vi.mocked(attachmentBlob).mockReset();
  vi.mocked(attachmentBlob).mockImplementation(() => new Promise<Blob>(() => undefined));
  vi.mocked(attachmentThumbnailBlob).mockReset();
  vi.mocked(attachmentThumbnailBlob).mockImplementation(() => new Promise<Blob>(() => undefined));
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

it("закрывает просмотр файла кнопкой-фоном", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();

  renderWithProviders(
    <FilePreview
      file={{
        id: 1,
        name: "договор.pdf",
        size: 1024,
        content_type: "application/pdf",
        uploaded_by_name: "Мария Иванова",
        created_at: "2026-10-02T10:00:00Z",
      }}
      onClose={onClose}
    />,
  );

  expect(screen.getByRole("dialog", { name: "Просмотр файла договор.pdf" })).toBeInTheDocument();
  await waitFor(() => expect(attachmentBlob).toHaveBeenCalledOnce());
  expect(attachmentThumbnailBlob).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Закрыть просмотр файла" }));

  expect(onClose).toHaveBeenCalledOnce();
});

it("приближает фотографию, позволяет вернуть масштаб и не меняет сам файл", async () => {
  vi.mocked(attachmentBlob).mockResolvedValue(new Blob(["фото"]));
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();

  const user = userEvent.setup();
  renderWithProviders(
    <FilePreview
      file={{
        id: 2,
        name: "фото.jpg",
        size: 128,
        content_type: "image/jpeg",
        uploaded_by_name: "Мария Иванова",
        created_at: "2026-10-02T10:00:00Z",
      }}
      onClose={() => {}}
    />,
  );

  const image = await screen.findByAltText("фото.jpg");
  expect(image).toHaveAttribute("src", "blob:photo");
  expect(screen.getByText("100%")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Увеличить фото" }));
  expect(screen.getByText("125%")).toBeVisible();
  expect(image).toHaveStyle({ transform: "translate(0px, 0px) scale(1.25)" });

  // На увеличенном изображении можно перетащить область просмотра.
  const viewport = image.parentElement!;
  Object.defineProperty(image, "clientWidth", { configurable: true, value: 200 });
  Object.defineProperty(image, "clientHeight", { configurable: true, value: 120 });
  Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 100 });
  Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 80 });
  fireEvent.pointerDown(image, { pointerId: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(image, { pointerId: 1, clientX: 50, clientY: 30 });
  expect(image).toHaveStyle({ transform: "translate(40px, 20px) scale(1.25)" });
  fireEvent.pointerUp(image, { pointerId: 1, clientX: 50, clientY: 30 });

  await user.click(screen.getByRole("button", { name: "Уменьшить фото" }));
  expect(screen.getByText("100%")).toBeVisible();
  expect(image).toHaveStyle({ transform: "translate(0px, 0px) scale(1)" });

  await user.click(screen.getByRole("button", { name: "Увеличить фото" }));
  await user.click(screen.getByRole("button", { name: "Сбросить масштаб" }));
  expect(screen.getByText("100%")).toBeVisible();
  expect(image).toHaveStyle({ transform: "translate(0px, 0px) scale(1)" });
});
