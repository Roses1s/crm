import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearBlobCache, peekBlobUrl, rememberBlob } from "@/shared/lib/blob-cache";

/** jsdom не умеет createObjectURL — подменяем его счётчиком ссылок. */
let created = 0;
const revoked: string[] = [];

beforeEach(() => {
  created = 0;
  revoked.length = 0;
  URL.createObjectURL = vi.fn(() => `blob:файл-${++created}`);
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => clearBlobCache());

/** Пустышка нужного размера: содержимое кеш не читает, только `size`. */
function blobOf(megabytes: number): Blob {
  return { size: megabytes * 1024 * 1024 } as Blob;
}

describe("Память вкладки для вложений", () => {
  it("отдаёт уже скачанный файл без повторной загрузки", () => {
    const url = rememberBlob(7, blobOf(1));

    expect(peekBlobUrl(7)).toBe(url);
    expect(created).toBe(1);
  });

  it("не знает файл, которого ещё не скачивали", () => {
    expect(peekBlobUrl(42)).toBe("");
  });

  it("освобождает самые давние файлы, когда их становится много", () => {
    for (let id = 1; id <= 13; id += 1) rememberBlob(id, blobOf(1));

    // Первый файл вытеснен тринадцатым, последние остаются в памяти.
    expect(peekBlobUrl(1)).toBe("");
    expect(peekBlobUrl(13)).not.toBe("");
    expect(revoked).toEqual(["blob:файл-1"]);
  });

  it("не позволяет тяжёлым файлам занять всю память", () => {
    rememberBlob(1, blobOf(30));
    rememberBlob(2, blobOf(30));

    expect(peekBlobUrl(1)).toBe("");
    expect(peekBlobUrl(2)).not.toBe("");
  });

  it("забывает всё на границе сессии", () => {
    rememberBlob(1, blobOf(1));
    rememberBlob(2, blobOf(1));

    clearBlobCache();

    expect(peekBlobUrl(1)).toBe("");
    expect(peekBlobUrl(2)).toBe("");
    expect(revoked).toHaveLength(2);
  });
});
