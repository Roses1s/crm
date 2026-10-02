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

import { clearSessionCache } from "./query-client";

let accessToken: string | null = null;
// Номер поколения не даёт позднему refresh, начатому до logout, воскресить
// уже завершённую сессию после очистки токена и пользовательского кеша.
let sessionGeneration = 0;
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

/** Начинает новую учётную сессию, не переиспользуя данные предыдущей. */
export function startSession(token: string): void {
  sessionGeneration += 1;
  clearSessionCache();
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
  sessionGeneration += 1;
  accessToken = null;
  clearSessionCache();
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
  const generationAtStart = sessionGeneration;
  try {
    const response = await fetch("/api/v1/auth/refresh", { method: "POST" });
    if (!response.ok || generationAtStart !== sessionGeneration) return false;
    const data = (await response.json()) as { access_token: string };
    // Это продление той же сессии, поэтому кеш сбрасывать не нужно. Если пока
    // ждали ответ случился logout/login, проверка поколения выше его отбросит.
    setAccessToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}
