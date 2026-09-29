/**
 * Хранение токенов и состояние «вошёл / не вошёл».
 *
 * Токены лежат в localStorage: приложение одностраничное, вкладок может быть
 * несколько, а перелогиниваться при каждом обновлении страницы неудобно.
 */

import { useSyncExternalStore } from "react";

const ACCESS_KEY = "crm-access-token";
const REFRESH_KEY = "crm-refresh-token";

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return read(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return read(REFRESH_KEY);
}

export function saveTokens(access: string, refresh: string): void {
  try {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // приватный режим: токены проживут только до перезагрузки
  }
  listeners.forEach((l) => l());
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => getAccessToken() !== null,
    () => false,
  );
}
