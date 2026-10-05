import { useEffect, useState } from "react";

import { attachmentBlob } from "@/shared/api/hooks";
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
export function useObjectUrl(file: Attachment | null): { url: string; failed: boolean } {
  const [url, setUrl] = useState(() => (file ? peekBlobUrl(file.id) : ""));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    let active = true;
    setFailed(false);

    const ready = peekBlobUrl(file.id);
    setUrl(ready);
    if (ready) return;

    attachmentBlob(file.id)
      .then((blob) => {
        if (!active) return;
        setUrl(rememberBlob(file.id, blob));
      })
      .catch(() => active && setFailed(true));

    return () => {
      // Ссылку не освобождаем: ею владеет кеш и чистит граница сессии.
      active = false;
    };
  }, [file]);

  return { url, failed };
}
