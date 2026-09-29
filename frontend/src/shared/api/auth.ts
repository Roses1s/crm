/**
 * Состояние сессии на стороне браузера.
 *
 * Токен доступа живёт только в памяти вкладки: в localStorage его прочитал бы
 * любой скрипт, попавший на страницу. Долгоживущий токен обновления хранится
 * в куке HttpOnly — она недоступна скриптам и уходит только на /api/v1/auth.
 * Поэтому после перезагрузки страницы сессия восстанавливается тихим запросом
 * к /auth/refresh, а не чтением хранилища.
 */

import { useSyncExternalStore } from "react";

let accessToken: string | null = null;
// Пока не спросили сервер, мы не знаем, есть ли сессия: пускать на страницу
// входа рано, иначе при каждом обновлении F5 мелькал бы логин.
let restored = false;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
  notify();
}

export function markRestored(): void {
  restored = true;
  notify();
}

export function isRestored(): boolean {
  return restored;
}

export function clearTokens(): void {
  accessToken = null;
  notify();
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
    () => accessToken !== null,
    () => false,
  );
}

/** Закончилась ли попытка восстановить сессию по куке. */
export function useSessionRestored(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => restored,
    () => false,
  );
}

/**
 * Тихое восстановление сессии при запуске приложения и после истечения
 * короткого токена. Кука уходит автоматически, тело запроса не нужно.
 */
export async function refreshSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/v1/auth/refresh", { method: "POST" });
    if (!response.ok) return false;
    const data = (await response.json()) as { access_token: string };
    setAccessToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}
