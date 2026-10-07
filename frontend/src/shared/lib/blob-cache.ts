/**
 * Память вкладки для уже скачанных вложений.
 *
 * Картинки в ленте закрыты токеном, поэтому браузер не умеет кешировать их сам:
 * каждый показ миниатюры заново тянул файл целиком (до 5 МБ). Здесь временная
 * ссылка на скачанный файл живёт до выхода из системы, и повторное открытие
 * карточки показывает картинки мгновенно и без сети.
 *
 * Модуль намеренно ни от чего не зависит: его подключает и граница сессии
 * (`query-client.ts`), и слой показа файлов — так не возникает кольца импортов.
 * Ограничения ниже относятся к уже сохранённым Blob: они не уменьшают размер
 * исходной картинки и не считают ещё загружаемые файлы. Поэтому серверные
 * миниатюры остаются незакрытой частью Ф-05.
 */

/** Сколько файлов держим одновременно: дальше самый старый освобождается. */
const MAX_FILES = 12;
/** И сколько всего памяти им отдаём: 5 МБ × 12 заняло бы слишком много. */
const MAX_BYTES = 48 * 1024 * 1024;

type Entry = { url: string; size: number };

/** Map хранит порядок добавления — им и пользуемся для вытеснения старых. */
const files = new Map<number, Entry>();
let total = 0;

/** Готовая ссылка на уже скачанный файл или пустая строка. */
export function peekBlobUrl(id: number): string {
  const entry = files.get(id);
  if (!entry) return "";
  // Обращение освежает запись: вытесняться будут те, которыми давно не пользовались.
  files.delete(id);
  files.set(id, entry);
  return entry.url;
}

/** Запоминает скачанный файл и отдаёт ссылку на него. */
export function rememberBlob(id: number, blob: Blob): string {
  const existing = files.get(id);
  if (existing) return existing.url;

  const url = URL.createObjectURL(blob);
  files.set(id, { url, size: blob.size });
  total += blob.size;

  while (files.size > MAX_FILES || total > MAX_BYTES) {
    const oldest = files.keys().next();
    // Единственная запись больше предела — освобождать нечего, иначе зациклимся.
    if (oldest.done || oldest.value === id) break;
    forget(oldest.value);
  }
  return url;
}

function forget(id: number): void {
  const entry = files.get(id);
  if (!entry) return;
  URL.revokeObjectURL(entry.url);
  files.delete(id);
  total -= entry.size;
}

/** Граница сессии: файлы прежнего сотрудника не должны остаться во вкладке. */
export function clearBlobCache(): void {
  for (const id of [...files.keys()]) forget(id);
  total = 0;
}
