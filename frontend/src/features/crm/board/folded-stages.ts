import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

const STORAGE_PREFIX = "crm-folded-stages:v2";

type StoredStages = { key: string; ids: number[] };

/** Одни и те же колонки можно сворачивать отдельно для пользователя и доски. */
export function foldedStagesStorageKey(
  viewerId: number | null,
  boardOwnerId: number | null,
): string | null {
  if (
    viewerId === null ||
    boardOwnerId === null ||
    !Number.isSafeInteger(viewerId) ||
    viewerId <= 0 ||
    !Number.isSafeInteger(boardOwnerId) ||
    boardOwnerId <= 0
  ) {
    return null;
  }
  return `${STORAGE_PREFIX}:user:${viewerId}:board:${boardOwnerId}`;
}

function readFoldedStages(key: string): number[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is number => Number.isSafeInteger(id) && id > 0))];
  } catch {
    return [];
  }
}

function writeFoldedStages(key: string, ids: number[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Если хранилище браузера запрещено или заполнено, доска всё равно работает.
  }
}

/**
 * Состояние колонок хранится отдельно для вошедшего пользователя и выбранной
 * доски. При переключении доски старые настройки не показываются даже до того,
 * как React успеет прочитать новый ключ из localStorage.
 */
export function useFoldedStages(
  viewerId: number | null,
  boardOwnerId: number | null,
): [number[], Dispatch<SetStateAction<number[]>>] {
  const storageKey = foldedStagesStorageKey(viewerId, boardOwnerId);
  const [stored, setStored] = useState<StoredStages | null>(null);
  const folded = stored?.key === storageKey ? stored.ids : [];

  useEffect(() => {
    if (storageKey === null) {
      setStored(null);
      return;
    }
    setStored({ key: storageKey, ids: readFoldedStages(storageKey) });
  }, [storageKey]);

  useEffect(() => {
    if (storageKey !== null && stored?.key === storageKey) {
      writeFoldedStages(storageKey, stored.ids);
    }
  }, [storageKey, stored]);

  const setFolded = useCallback<Dispatch<SetStateAction<number[]>>>(
    (update) => {
      if (storageKey === null) return;
      setStored((previous) => {
        const current = previous?.key === storageKey ? previous.ids : readFoldedStages(storageKey);
        const ids = typeof update === "function" ? update(current) : update;
        return { key: storageKey, ids };
      });
    },
    [storageKey],
  );

  return [folded, setFolded];
}
