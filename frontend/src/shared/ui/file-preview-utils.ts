import { useEffect, useState, type RefObject } from "react";

import { attachmentBlob } from "@/shared/api/hooks";
import { enqueueAttachmentLoad } from "@/shared/lib/attachment-load-queue";
import { peekBlobUrl, rememberBlob } from "@/shared/lib/blob-cache";
import type { Attachment } from "@/shared/types";

/** Что умеем показать прямо в окне, а что только скачать. */
export function previewKind(file: Attachment): "image" | "pdf" | "other" {
  if (file.content_type?.startsWith("image/")) return "image";
  if (file.content_type === "application/pdf") return "pdf";
  return "other";
}

export function formatSize(bytes: number): string {
  if (!bytes) return "0 Б";
  const units = ["Б", "КБ", "МБ", "ГБ"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`;
}

/**
 * Загружает файл в память и отдаёт временную ссылку на него.
 * Скачанные файлы запоминаются на время сессии (`blob-cache.ts`), поэтому
 * повторное открытие карточки не тянет те же картинки заново.
 */
export function useObjectUrl(
  file: Attachment | null,
  enabled = true,
): { url: string; failed: boolean } {
  const attachmentId = file?.id;
  const [url, setUrl] = useState(() =>
    attachmentId !== undefined ? peekBlobUrl(attachmentId) : "",
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (attachmentId === undefined) {
      setUrl("");
      setFailed(false);
      return;
    }
    let active = true;
    setFailed(false);

    const ready = peekBlobUrl(attachmentId);
    setUrl(ready);
    if (ready || !enabled) return;

    enqueueAttachmentLoad(attachmentId, (signal) => attachmentBlob(attachmentId, signal))
      .then((blob) => {
        if (!active) return;
        setUrl(rememberBlob(attachmentId, blob));
      })
      .catch(() => active && setFailed(true));

    return () => {
      // Ссылку не освобождаем: ею владеет кеш и чистит граница сессии.
      active = false;
    };
  }, [attachmentId, enabled]);

  return { url, failed };
}

/** Дожидается появления элемента рядом с видимой областью экрана. */
export function useNearViewport<T extends Element>(ref: RefObject<T | null>): boolean {
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    if (nearViewport) return;
    const element = ref.current;
    if (!element) return;

    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px", threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearViewport, ref]);

  return nearViewport;
}
