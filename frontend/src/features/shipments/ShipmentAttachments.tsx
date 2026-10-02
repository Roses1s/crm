import { Download, Paperclip, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import {
  downloadAttachment,
  useDeleteShipmentAttachment,
  useShipmentAttachments,
  useUploadShipmentAttachment,
} from "@/shared/api/hooks";
import type { Attachment } from "@/shared/types";
import { FilePreview } from "@/shared/ui/file-preview";
import { formatSize, previewKind } from "@/shared/ui/file-preview-utils";

/**
 * Документы заявки: накладные, договоры, фотографии груза.
 * Панель видна сразу, без раскрытия, — для заявки это основное содержимое
 * правой колонки, ленты изменений у неё пока нет.
 */
export function ShipmentAttachments({ shipmentId }: { shipmentId: number }) {
  const { data: files = [], isLoading } = useShipmentAttachments(shipmentId);
  const upload = useUploadShipmentAttachment(shipmentId);
  const remove = useDeleteShipmentAttachment(shipmentId);
  const input = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [error, setError] = useState("");

  function send(file: File | undefined) {
    if (!file) return;
    setError("");
    upload.mutate(
      { file },
      {
        // Причину отказа (тип файла, размер) показываем прямо в панели:
        // иначе пользователь видит только то, что файл не появился в списке.
        onError: (err: Error) => setError(err.message || "Не удалось загрузить файл"),
      },
    );
  }

  function open(file: Attachment) {
    if (previewKind(file) === "other") void downloadAttachment(file);
    else setPreview(file);
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col border-t border-odoo-border bg-odoo-surface lg:border-l lg:border-t-0">
      <div className="flex items-center gap-2 px-3 py-2">
        <Paperclip className="h-4 w-4 text-odoo-text-muted" />
        <span className="text-sm font-medium text-odoo-text">Документы заявки</span>
        {files.length > 0 && (
          <span className="text-[11px] text-odoo-text-muted">{files.length}</span>
        )}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          send(e.dataTransfer.files[0]);
        }}
        className={`mx-3 mb-2 rounded-[4px] border border-dashed px-3 py-4 text-center text-[13px] transition-colors ${
          dragOver
            ? "border-odoo-action bg-odoo-bg text-odoo-action"
            : "border-odoo-border text-odoo-text-muted"
        }`}
      >
        <input
          ref={input}
          type="file"
          className="hidden"
          onChange={(e) => {
            send(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <p className="mb-2">Перетащите файл сюда</p>
        <button
          type="button"
          disabled={upload.isPending}
          onClick={() => input.current?.click()}
          className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-odoo-border bg-odoo-surface px-2 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg disabled:opacity-60"
        >
          <Paperclip className="h-3.5 w-3.5" />
          {upload.isPending ? "Загрузка…" : "Выбрать файл"}
        </button>
      </div>

      {error && <p className="px-3 pb-2 text-[12px] text-odoo-danger">{error}</p>}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {isLoading ? (
          <p className="text-[12px] text-odoo-text-light">Загрузка…</p>
        ) : files.length === 0 ? (
          <p className="text-[12px] text-odoo-text-light">Документов пока нет</p>
        ) : (
          <ul>
            {files.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2 border-t border-odoo-border-light py-1 text-[13px] first:border-t-0"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-odoo-text-light" />
                <button
                  type="button"
                  onClick={() => open(file)}
                  title={`${file.name} · ${formatSize(file.size)}`}
                  className="min-w-0 flex-1 truncate text-left text-odoo-action hover:underline"
                >
                  {file.name}
                </button>
                <span className="shrink-0 text-[11px] text-odoo-text-muted">
                  {formatSize(file.size)}
                </span>
                <button
                  type="button"
                  aria-label={`Скачать ${file.name}`}
                  onClick={() => void downloadAttachment(file)}
                  className="shrink-0 text-odoo-text-muted hover:text-odoo-text"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={`Удалить ${file.name}`}
                  onClick={() => {
                    if (window.confirm(`Удалить документ «${file.name}»?`)) remove.mutate(file.id);
                  }}
                  className="shrink-0 text-odoo-text-muted hover:text-odoo-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
