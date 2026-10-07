import { act, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { clearAttachmentLoadQueue } from "@/shared/lib/attachment-load-queue";
import { clearBlobCache } from "@/shared/lib/blob-cache";
import { useNearViewport, useObjectUrl } from "@/shared/ui/file-preview-utils";
import type { Attachment } from "@/shared/types";

const attachmentBlob = vi.fn((id: number, signal?: AbortSignal) => {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return Promise.resolve(new Blob([`картинка ${id}`]));
});
vi.mock("@/shared/api/hooks", () => ({
  attachmentBlob: (id: number, signal?: AbortSignal) => attachmentBlob(id, signal),
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

function LazyThumb({ file }: { file: Attachment }) {
  const ref = useRef<HTMLButtonElement>(null);
  const nearViewport = useNearViewport(ref);
  const { url } = useObjectUrl(file, nearViewport);
  return (
    <button ref={ref} type="button">
      {url || "Загрузка…"}
    </button>
  );
}

function QueueThumb({ id }: { id: number }) {
  const { url } = useObjectUrl({ ...FILE, id });
  return <span>{url || "Загрузка…"}</span>;
}

afterEach(() => {
  clearAttachmentLoadQueue();
  clearBlobCache();
  attachmentBlob.mockReset();
  attachmentBlob.mockImplementation((id) => Promise.resolve(new Blob([`картинка ${id}`])));
  vi.unstubAllGlobals();
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

  expect(attachmentBlob).not.toHaveBeenCalled();
  expect(observers).toHaveLength(1);
  act(() => observers[0].enter());

  await waitFor(() => expect(screen.getByText("blob:фото")).toBeVisible());
  expect(attachmentBlob).toHaveBeenCalledTimes(1);
});

it("не запускает больше трёх скачиваний вложений одновременно", async () => {
  let active = 0;
  let maxActive = 0;
  let nextUrl = 0;
  const releases = new Map<number, (blob: Blob) => void>();
  attachmentBlob.mockImplementation(
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

  await waitFor(() => expect(attachmentBlob).toHaveBeenCalledTimes(3));
  expect(maxActive).toBe(3);

  for (let id = 1; id <= 8; id += 1) {
    await waitFor(() => expect(releases.has(id)).toBe(true));
    await act(async () => releases.get(id)?.(new Blob([`картинка ${id}`])));
  }

  await waitFor(() => expect(screen.getAllByText(/^blob:/)).toHaveLength(8));
  expect(maxActive).toBe(3);
});
