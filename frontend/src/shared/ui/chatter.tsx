import { format, formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Download, Paperclip, Search, Trash2, X } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { downloadAttachment } from "@/shared/api/hooks";
import type { Attachment, TimelineEntry } from "@/shared/types";
import { formatSize, previewKind, useObjectUrl } from "@/shared/ui/file-preview";

/**
 * Чаттер (правая колонка карточки): лента событий, примечания и вложения.
 * Файлы приходят из закрытой ручки, поэтому картинки сначала скачиваются
 * с токеном и показываются из памяти браузера.
 */

const MODES: { id: string; label: string; placeholder: string; action: string }[] = [
  {
    id: "note",
    label: "Лог примечания",
    placeholder: "Запишите внутреннюю запись…",
    action: "Лог",
  },
];

/** Картинки крупнее этого размера не разворачиваем в ленте — только чипом. */
const INLINE_IMAGE_MAX = 5 * 1024 * 1024;

function relativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true, locale: ru });
}

function absoluteTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "d MMMM yyyy, HH:mm", { locale: ru });
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "d MMMM yyyy 'г.'", { locale: ru });
}

function AttachmentThumb({ file, onOpen }: { file: Attachment; onOpen: () => void }) {
  const { url, failed } = useObjectUrl(file);

  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-[4px] border border-odoo-border bg-odoo-surface px-1.5 py-0.5 text-[11px] text-odoo-text-muted">
        <Paperclip className="h-3 w-3" />
        {file.name}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${file.name} · ${formatSize(file.size)} — открыть полностью`}
      className="block overflow-hidden rounded-[4px] border border-odoo-border bg-odoo-surface transition-colors hover:border-odoo-primary"
    >
      {url ? (
        <img src={url} alt={file.name} className="max-h-[220px] max-w-full object-contain" />
      ) : (
        <span className="flex h-[120px] w-[160px] animate-pulse items-center justify-center bg-odoo-bg text-[11px] text-odoo-text-light">
          Загрузка…
        </span>
      )}
    </button>
  );
}

interface ChatterProps {
  timeline: TimelineEntry[];
  /** Инициалы текущего сотрудника для редактора новой записи. */
  authorInitials?: string;
  attachments?: Attachment[];
  /** Отправка примечания вместе с выбранными файлами. */
  onSubmit?: (body: string, files: File[]) => void;
  posting?: boolean;
  onUpload?: (file: File) => void;
  onDelete?: (attachment: Attachment) => void;
  uploading?: boolean;
  onPreview?: (attachment: Attachment) => void;
}

export function Chatter({
  timeline,
  authorInitials = "Я",
  attachments,
  onSubmit,
  posting = false,
  onUpload,
  onDelete,
  uploading = false,
  onPreview,
}: ChatterProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("note");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filesOpen, setFilesOpen] = useState(false);
  const [pending, setPending] = useState<File[]>([]);
  const panelInput = useRef<HTMLInputElement | null>(null);
  const composerInput = useRef<HTMLInputElement | null>(null);
  const composerText = useRef<HTMLTextAreaElement | null>(null);
  const files = attachments ?? [];

  const current = MODES.find((m) => m.id === mode) ?? MODES[0];

  useLayoutEffect(() => {
    const field = composerText.current;
    if (!field) return;
    // Сначала снимаем прежнюю высоту: иначе scrollHeight не уменьшается после
    // сохранения или удаления части текста и редактор остаётся слишком высоким.
    field.style.height = "auto";
    field.style.height = `${Math.max(field.scrollHeight, 58)}px`;
  }, [text]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? timeline.filter((e) =>
          `${e.author_name ?? ""} ${e.body} ${e.field_label ?? ""} ${e.old_value ?? ""} ${e.new_value ?? ""}`
            .toLowerCase()
            .includes(q),
        )
      : timeline;
    const byDay = new Map<string, TimelineEntry[]>();
    for (const entry of rows) {
      const key = dayLabel(entry.created_at);
      const list = byDay.get(key);
      if (list) list.push(entry);
      else byDay.set(key, [entry]);
    }
    return [...byDay.entries()];
  }, [timeline, query]);

  function openFile(file: Attachment) {
    if (onPreview) onPreview(file);
    else void downloadAttachment(file);
  }

  return (
    <div className="flex h-full min-h-[420px] flex-col border-l border-odoo-border bg-odoo-surface">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-odoo-border-light px-3 py-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`h-7 rounded-[4px] px-3 text-[13px] transition-colors ${
              mode === m.id
                ? "bg-odoo-primary font-medium text-white"
                : "border border-odoo-border bg-odoo-surface text-odoo-text hover:bg-odoo-bg"
            }`}
          >
            {m.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="Поиск по ленте"
            title="Поиск по ленте"
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setQuery("");
            }}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors hover:bg-odoo-bg ${
              searchOpen ? "text-odoo-action" : "text-odoo-text-muted hover:text-odoo-text"
            }`}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Вложения: ${files.length}`}
            title="Вложения"
            onClick={() => setFilesOpen((v) => !v)}
            className={`relative inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors hover:bg-odoo-bg ${
              filesOpen ? "text-odoo-action" : "text-odoo-text-muted hover:text-odoo-text"
            }`}
          >
            <Paperclip className="h-4 w-4" />
            {files.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 text-[10px] font-semibold text-odoo-action">
                {files.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {filesOpen && (
        <div className="border-b border-odoo-border-light px-3 pb-2">
          <input
            ref={panelInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload?.(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading || !onUpload}
            onClick={() => panelInput.current?.click()}
            className="mb-1 inline-flex h-7 items-center gap-1 rounded-[4px] border border-odoo-border bg-odoo-surface px-2 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg disabled:opacity-60"
          >
            <Paperclip className="h-3.5 w-3.5" />
            {uploading ? "Загрузка…" : "Прикрепить файл"}
          </button>

          {files.length === 0 ? (
            <p className="py-1 text-[12px] text-odoo-text-light">Вложений пока нет</p>
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
                    onClick={() => openFile(file)}
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
                  {onDelete && (
                    <button
                      type="button"
                      aria-label={`Удалить ${file.name}`}
                      onClick={() => {
                        if (window.confirm(`Удалить вложение «${file.name}»?`)) onDelete(file);
                      }}
                      className="shrink-0 text-odoo-text-muted hover:text-odoo-danger"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {searchOpen && (
        <div className="flex items-center gap-1 px-3 pb-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Искать в ленте…"
            className="h-7 w-full rounded-[4px] border border-odoo-border px-2 text-[13px] text-odoo-text outline-none placeholder:text-odoo-text-light focus:border-odoo-primary"
          />
          {query && (
            <button
              type="button"
              aria-label="Очистить поиск"
              onClick={() => setQuery("")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <form
        className="shrink-0 border-b border-odoo-border-light px-3 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!onSubmit) return;
          if (!text.trim() && pending.length === 0) return;
          onSubmit(text.trim(), pending);
          setText("");
          setPending([]);
        }}
      >
        <div className="flex items-start gap-2">
          <span
            title="Вы"
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-odoo-primary text-[13px] font-semibold text-white"
          >
            {authorInitials}
          </span>
          <div className="min-w-0 flex-1 overflow-hidden rounded-[4px] border border-odoo-border bg-odoo-surface focus-within:border-odoo-primary">
            <textarea
              ref={composerText}
              rows={2}
              aria-label="Текст внутреннего примечания"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={current.placeholder}
              className="min-h-[58px] w-full resize-none overflow-hidden border-0 bg-transparent px-2 py-2 text-[13px] leading-[19px] text-odoo-text outline-none placeholder:text-odoo-text-light"
            />

            {pending.length > 0 && (
              <ul className="flex flex-wrap gap-1 border-t border-odoo-border-light px-2 py-1">
                {pending.map((file, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="inline-flex items-center gap-1 rounded-[4px] border border-odoo-border bg-odoo-bg px-1.5 py-0.5 text-[11px]"
                  >
                    <Paperclip className="h-3 w-3 shrink-0 text-odoo-text-light" />
                    <span className="max-w-[150px] truncate" title={file.name}>
                      {file.name}
                    </span>
                    <span className="text-odoo-text-muted">{formatSize(file.size)}</span>
                    <button
                      type="button"
                      aria-label={`Убрать ${file.name}`}
                      onClick={() =>
                        setPending((list) => list.filter((_, index) => index !== i))
                      }
                      className="text-odoo-text-muted hover:text-odoo-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex h-8 items-center border-t border-odoo-border-light px-1">
              <input
                ref={composerInput}
                type="file"
                multiple
                className="hidden"
                aria-label="Файлы записи"
                onChange={(e) => {
                  const chosen = Array.from(e.target.files ?? []);
                  if (chosen.length) setPending((list) => [...list, ...chosen]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="Прикрепить файл к записи"
                title="Прикрепить файл к записи"
                onClick={() => composerInput.current?.click()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-odoo-text-muted transition-colors hover:bg-odoo-bg hover:text-odoo-text"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <div className="ml-10 mt-2 flex items-center">
          <button
            type="submit"
            disabled={posting || !onSubmit || (!text.trim() && pending.length === 0)}
            className="h-7 rounded-[4px] bg-odoo-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-odoo-primary-hover disabled:opacity-50"
          >
            {posting ? "Сохранение…" : current.action}
          </button>
        </div>
      </form>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.length === 0 && (
          <p className="py-6 text-center text-[12px] text-odoo-text-light">
            {query ? "Ничего не найдено" : "Пока нет записей"}
          </p>
        )}
        {groups.map(([day, entries]) => (
          <div key={day}>
            <div className="my-5 flex items-center gap-2 first:mt-4">
              <span className="h-px flex-1 bg-odoo-border-light" />
              <span className="shrink-0 text-[11px] font-semibold text-odoo-text-muted">{day}</span>
              <span className="h-px flex-1 bg-odoo-border-light" />
            </div>
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-start gap-2 ${entry.type === "note" ? "py-2.5" : "py-2"}`}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-odoo-avatar text-[11px] font-semibold text-white">
                  {entry.author_initials ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-[13px] font-bold text-odoo-text">
                      {entry.author_name ?? "Система"}
                    </span>
                    <span
                      className="text-[12px] text-odoo-text-muted"
                      title={absoluteTime(entry.created_at)}
                    >
                      · {relativeTime(entry.created_at)}
                    </span>
                  </div>

                  {entry.field_label ? (
                    <div className="flex flex-wrap items-baseline gap-1 text-[13px]">
                      <span className="text-odoo-text-light">•</span>
                      <span className="text-odoo-text">{entry.old_value || "—"}</span>
                      <span className="text-odoo-text-light">→</span>
                      <span className="font-medium text-odoo-link">{entry.new_value || "—"}</span>
                      <span className="italic text-odoo-text-muted">({entry.field_label})</span>
                    </div>
                  ) : (
                    entry.body && (
                      <p
                        className={`whitespace-pre-wrap text-[13px] leading-[19px] ${
                          entry.type === "history" ? "text-odoo-text-muted" : "text-odoo-text"
                        }`}
                      >
                        {entry.body}
                      </p>
                    )
                  )}

                  {entry.attachments && entry.attachments.length > 0 && (
                    <ul className="mt-1 flex flex-wrap items-start gap-1">
                      {entry.attachments.map((file) =>
                        previewKind(file) === "image" && file.size <= INLINE_IMAGE_MAX ? (
                          <li key={file.id}>
                            <AttachmentThumb file={file} onOpen={() => openFile(file)} />
                          </li>
                        ) : (
                          <li key={file.id}>
                            <button
                              type="button"
                              onClick={() => openFile(file)}
                              title={`${file.name} · ${formatSize(file.size)}`}
                              className="inline-flex max-w-[240px] items-center gap-1 rounded-[4px] border border-odoo-border bg-odoo-surface px-1.5 py-0.5 text-[11px] text-odoo-action transition-colors hover:bg-odoo-bg"
                            >
                              <Paperclip className="h-3 w-3 shrink-0" />
                              <span className="truncate">{file.name}</span>
                              <span className="shrink-0 text-odoo-text-muted">
                                {formatSize(file.size)}
                              </span>
                            </button>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
