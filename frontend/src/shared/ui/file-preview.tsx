import { Download, Minus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { downloadAttachment } from "@/shared/api/hooks";
import type { Attachment } from "@/shared/types";
import { formatSize, previewKind, useObjectUrl } from "@/shared/ui/file-preview-utils";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

/** Модальное окно просмотра: картинки и PDF показываем, остальное — скачиваем. */
export function FilePreview({ file, onClose }: { file: Attachment; onClose: () => void }) {
  const { url, failed } = useObjectUrl(file);
  const kind = previewKind(file);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [file.id]);

  function changeZoom(next: number) {
    const bounded = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    setZoom(bounded);
    if (bounded <= 1) setOffset({ x: 0, y: 0 });
  }

  function startPan(event: ReactPointerEvent<HTMLImageElement>) {
    if (zoom <= 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    setPanning(true);
  }

  function movePan(event: ReactPointerEvent<HTMLImageElement>) {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;

    const viewport = viewportRef.current;
    const maxX = viewport
      ? Math.max(0, (event.currentTarget.clientWidth * zoom - viewport.clientWidth) / 2)
      : Number.POSITIVE_INFINITY;
    const maxY = viewport
      ? Math.max(0, (event.currentTarget.clientHeight * zoom - viewport.clientHeight) / 2)
      : Number.POSITIVE_INFINITY;
    const x = start.offsetX + event.clientX - start.x;
    const y = start.offsetY + event.clientY - start.y;
    setOffset({
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    });
  }

  function stopPan(event: ReactPointerEvent<HTMLImageElement>) {
    if (dragStartRef.current?.pointerId !== event.pointerId) return;
    dragStartRef.current = null;
    setPanning(false);
  }

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
          {kind === "image" && (
            <div
              role="group"
              aria-label="Масштаб фотографии"
              className="flex shrink-0 items-center gap-0.5"
            >
              <button
                type="button"
                aria-label="Уменьшить фото"
                title="Уменьшить фото"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => changeZoom(zoom - ZOOM_STEP)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span
                aria-live="polite"
                className="w-10 text-center text-[11px] tabular-nums text-odoo-text-muted"
              >
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                aria-label="Увеличить фото"
                title="Увеличить фото"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => changeZoom(zoom + ZOOM_STEP)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Сбросить масштаб"
                title="Сбросить масштаб"
                disabled={zoom === 1 && offset.x === 0 && offset.y === 0}
                onClick={() => changeZoom(1)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text disabled:opacity-40"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            type="button"
            aria-label="Скачать"
            title="Скачать"
            onClick={() => void downloadAttachment(file)}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={viewportRef}
          className="flex min-h-[200px] items-center justify-center overflow-auto bg-odoo-bg p-3"
        >
          {failed && <p className="text-[13px] text-odoo-danger">Не удалось загрузить файл</p>}
          {!failed && !url && <p className="text-[13px] text-odoo-text-muted">Загрузка…</p>}
          {!failed && url && kind === "image" && (
            <img
              src={url}
              alt={file.name}
              draggable={false}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={stopPan}
              onPointerCancel={stopPan}
              className={`max-h-[70vh] max-w-full select-none object-contain ${zoom > 1 ? (panning ? "cursor-grabbing" : "cursor-grab") : ""}`}
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: "center",
                touchAction: zoom > 1 ? "none" : "auto",
              }}
            />
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
