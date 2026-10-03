import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import { renderWithProviders } from "@/test/utils";
import { FilePreview } from "@/shared/ui/file-preview";

vi.mock("@/shared/api/hooks", () => ({
  attachmentBlob: vi.fn(() => new Promise<Blob>(() => undefined)),
  downloadAttachment: vi.fn(),
}));

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
        created_at: "2026-10-02T10:00:00Z",
      }}
      onClose={onClose}
    />,
  );

  expect(screen.getByRole("dialog", { name: "Просмотр файла договор.pdf" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Закрыть просмотр файла" }));

  expect(onClose).toHaveBeenCalledOnce();
});
