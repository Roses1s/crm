import { act, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { clearAttachmentLoadQueue } from "@/shared/lib/attachment-load-queue";
import { clearBlobCache } from "@/shared/lib/blob-cache";
import { useNearViewport, useObjectUrl } from "@/shared/ui/file-preview-utils";
import type { Attachment } from "@/shared/types";

const attachmentBlob = vi.fn((id: number, signal?: AbortSignal) => {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return Promise.resolve(new Blob([`оригинал ${id}`]));
});
const attachmentThumbnailBlob = vi.fn((id: number, signal?: AbortSignal) => {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return Promise.resolve(new Blob([`миниатюра ${id}`]));
});
vi.mock("@/shared/api/hooks", () => ({
  attachmentBlob: (id: number, signal?: AbortSignal) => attachmentBlob(id, signal),
  attachmentThumbnailBlob: (id: number, signal?: AbortSignal) =>
    attachmentThumbnailBlob(id, signal),
}));

const FILE: Attachment = {
  id: 5,
  name: "фото.jpg",
  size: 2048,
  content_type: "image/jpeg",
  uploaded_by_name: "Мария Иванова",
  created_at: "2026-10-05T10:00:00Z",
};

function Thumb() {
  const { url } = useObjectUrl(FILE, true, "thumbnail");
  // Пока ссылки нет, картинку не рисуем — как в ленте чаттера.
  return url ? <img src={url} alt="миниатюра" /> : <span>Загрузка…</span>;
}

function OriginalPreview() {
  const { url } = useObjectUrl(FILE);
  return url ? <img src={url} alt="оригинал" /> : <span>Загрузка оригинала…</span>;
}

function LazyThumb({ file }: { file: Attachment }) {
  const ref = useRef<HTMLButtonElement>(null);
  const nearViewport = useNearViewport(ref);
  const { url } = useObjectUrl(file, nearViewport, "thumbnail");
  return (
    <button ref={ref} type="button">
      {url || "Загрузка…"}
    </button>
  );
}

function QueueThumb({ id }: { id: number }) {
  const { url } = useObjectUrl({ ...FILE, id }, true, "thumbnail");
  return <span>{url || "Загрузка…"}</span>;
}

afterEach(() => {
  clearAttachmentLoadQueue();
  clearBlobCache();
  attachmentBlob.mockReset();
  attachmentBlob.mockImplementation((id) => Promise.resolve(new Blob([`оригинал ${id}`])));
  attachmentThumbnailBlob.mockReset();
  attachmentThumbnailBlob.mockImplementation((id) =>
    Promise.resolve(new Blob([`миниатюра ${id}`])),
  );
  vi.unstubAllGlobals();
});

it("скачивает миниатюру один раз и показывает её из памяти вкладки", async () => {
  URL.createObjectURL = vi.fn(() => "blob:фото");
  URL.revokeObjectURL = vi.fn();

  const first = render(<Thumb />);
  await waitFor(() => expect(screen.getByAltText("миниатюра")).toHaveAttribute("src", "blob:фото"));
  first.unmount();

  render(<Thumb />);

  // Карточку открыли второй раз: миниатюра на месте сразу, сеть не тревожим.
  expect(screen.getByAltText("миниатюра")).toHaveAttribute("src", "blob:фото");
  expect(attachmentThumbnailBlob).toHaveBeenCalledTimes(1);
  expect(attachmentBlob).not.toHaveBeenCalled();
});

it("не смешивает миниатюру с оригиналом одного вложения", async () => {
  let nextUrl = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++nextUrl}`);

  render(
    <>
      <Thumb />
      <OriginalPreview />
    </>,
  );

  await waitFor(() => {
    expect(screen.getByAltText("миниатюра")).toHaveAttribute(
      "src",
      expect.stringMatching(/^blob:/),
    );
    expect(screen.getByAltText("оригинал")).toHaveAttribute("src", expect.stringMatching(/^blob:/));
  });
  expect(screen.getByAltText("миниатюра").getAttribute("src")).not.toBe(
    screen.getByAltText("оригинал").getAttribute("src"),
  );
  expect(attachmentThumbnailBlob).toHaveBeenCalledTimes(1);
  expect(attachmentBlob).toHaveBeenCalledTimes(1);
});

it("откладывает скачивание миниатюры, пока она далеко от экрана", async () => {
  const observers: Array<{ enter: () => void }> = [];
  class TestIntersectionObserver {
    constructor(private callback: IntersectionObserverCallback) {
      observers.push({
        enter: () =>
          this.callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          ),
      });
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
  URL.createObjectURL = vi.fn(() => "blob:фото");

  render(<LazyThumb file={FILE} />);

  expect(attachmentThumbnailBlob).not.toHaveBeenCalled();
  expect(observers).toHaveLength(1);
  act(() => observers[0].enter());

  await waitFor(() => expect(screen.getByText("blob:фото")).toBeVisible());
  expect(attachmentThumbnailBlob).toHaveBeenCalledTimes(1);
  expect(attachmentBlob).not.toHaveBeenCalled();
});

it("не запускает больше трёх скачиваний вложений одновременно", async () => {
  let active = 0;
  let maxActive = 0;
  let nextUrl = 0;
  const releases = new Map<number, (blob: Blob) => void>();
  attachmentThumbnailBlob.mockImplementation(
    (id) =>
      new Promise<Blob>((resolve) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        releases.set(id, (blob) => {
          active -= 1;
          resolve(blob);
        });
      }),
  );
  URL.createObjectURL = vi.fn(() => `blob:${++nextUrl}`);

  render(
    <>
      {Array.from({ length: 8 }, (_, index) => (
        <QueueThumb key={index + 1} id={index + 1} />
      ))}
    </>,
  );

  await waitFor(() => expect(attachmentThumbnailBlob).toHaveBeenCalledTimes(3));
  expect(maxActive).toBe(3);

  for (let id = 1; id <= 8; id += 1) {
    await waitFor(() => expect(releases.has(id)).toBe(true));
    await act(async () => releases.get(id)?.(new Blob([`картинка ${id}`])));
  }

  await waitFor(() => expect(screen.getAllByText(/^blob:/)).toHaveLength(8));
  expect(maxActive).toBe(3);
});
