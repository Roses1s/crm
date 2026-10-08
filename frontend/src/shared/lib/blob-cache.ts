/**
 * Память вкладки для уже скачанных вложений.
 *
 * Закрытые ручки нельзя напрямую указать в `<img src>`: файлы сначала
 * скачиваются с токеном, затем показываются из временной ссылки Blob. Для
 * чаттера сервер отдаёт уменьшенную WebP-миниатюру, а полный оригинал — только
 * по запросу на просмотр или скачивание. Кеш различает эти варианты, чтобы
 * миниатюра никогда не подменила полноразмерный файл и наоборот.
 *
 * Модуль намеренно ни от чего не зависит: его подключает и граница сессии
 * (`query-client.ts`), и слой показа файлов — так не возникает кольца импортов.
 */

/** Сколько Blob держим одновременно: дальше самый старый освобождается. */
const MAX_FILES = 12;
/** Верхний общий предел памяти для оригиналов и миниатюр. */
const MAX_BYTES = 48 * 1024 * 1024;

export type BlobVariant = "original" | "thumbnail";

type Entry = { url: string; size: number };
type CacheKey = `${BlobVariant}:${number}`;

/** Map хранит порядок добавления — им и пользуемся для вытеснения старых. */
const files = new Map<CacheKey, Entry>();
let total = 0;

function cacheKey(id: number, variant: BlobVariant): CacheKey {
  return `${variant}:${id}`;
}

/** Готовая ссылка на уже скачанный вариант или пустая строка. */
export function peekBlobUrl(id: number, variant: BlobVariant = "original"): string {
  const key = cacheKey(id, variant);
  const entry = files.get(key);
  if (!entry) return "";
  // Обращение освежает запись: вытесняться будут те, которыми давно не пользовались.
  files.delete(key);
  files.set(key, entry);
  return entry.url;
}

/** Запоминает один вариант вложения и отдаёт ссылку на него. */
export function rememberBlob(id: number, blob: Blob, variant: BlobVariant = "original"): string {
  const key = cacheKey(id, variant);
  const existing = files.get(key);
  if (existing) return existing.url;

  const url = URL.createObjectURL(blob);
  files.set(key, { url, size: blob.size });
  total += blob.size;

  while (files.size > MAX_FILES || total > MAX_BYTES) {
    const oldest = files.keys().next();
    // Единственная запись больше предела — освобождать нечего, иначе зациклимся.
    if (oldest.done || oldest.value === key) break;
    forget(oldest.value);
  }
  return url;
}

function forget(key: CacheKey): void {
  const entry = files.get(key);
  if (!entry) return;
  URL.revokeObjectURL(entry.url);
  files.delete(key);
  total -= entry.size;
}

/** Граница сессии: файлы прежнего сотрудника не должны остаться во вкладке. */
export function clearBlobCache(): void {
  for (const id of [...files.keys()]) forget(id);
  total = 0;
}
