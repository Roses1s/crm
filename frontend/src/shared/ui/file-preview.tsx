import { Download, X } from "lucide-react";
import { useEffect } from "react";

import { downloadAttachment } from "@/shared/api/hooks";
import type { Attachment } from "@/shared/types";
import { formatSize, previewKind, useObjectUrl } from "@/shared/ui/file-preview-utils";

/** Модальное окно просмотра: картинки и PDF показываем, остальное — скачиваем. */
export function FilePreview({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const { url, failed } = useObjectUrl(file);
  const kind = previewKind(file);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Просмотр файла ${file.name}`}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-odoo-overlay/60 p-4"
    >
      <button
        type="button"
        aria-label="Закрыть просмотр файла"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div className="relative flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-[4px] border border-odoo-border bg-odoo-surface shadow-lg">
        <div className="flex items-center gap-2 border-b border-odoo-border-light px-3 py-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-odoo-text">
            {file.name}
          </span>
          <span className="shrink-0 text-[12px] text-odoo-text-muted">{formatSize(file.size)}</span>
          <button
            type="button"
            aria-label="Скачать"
            title="Скачать"
            onClick={() => void downloadAttachment(file)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-[200px] items-center justify-center overflow-auto bg-odoo-bg p-3">
          {failed && <p className="text-[13px] text-odoo-danger">Не удалось загрузить файл</p>}
          {!failed && !url && <p className="text-[13px] text-odoo-text-muted">Загрузка…</p>}
          {!failed && url && kind === "image" && (
            <img src={url} alt={file.name} className="max-h-[70vh] max-w-full object-contain" />
          )}
          {!failed && url && kind === "pdf" && (
            <iframe src={url} title={file.name} className="h-[70vh] w-full border-0" />
          )}
          {!failed && url && kind === "other" && (
            <p className="text-[13px] text-odoo-text-muted">
              Предпросмотр для этого типа файлов недоступен — нажмите «Скачать».
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
