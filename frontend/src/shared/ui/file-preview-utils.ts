import { useEffect, useState } from "react";

import { attachmentBlob } from "@/shared/api/hooks";
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
 * Ссылка освобождается при размонтировании — иначе память течёт.
 */
export function useObjectUrl(file: Attachment | null): { url: string; failed: boolean } {
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!file) return;
    let active = true;
    let objectUrl = "";
    setFailed(false);

    attachmentBlob(file.id)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => active && setFailed(true));

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl("");
    };
  }, [file]);

  return { url, failed };
}
