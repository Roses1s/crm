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

import { accessTokenResponseSchema } from "./schemas";
import { clearSessionCache } from "./query-client";

let accessToken: string | null = null;
// Номер поколения не даёт позднему refresh, начатому до logout, воскресить
// уже завершённую сессию после очистки токена и пользовательского кеша.
let sessionGeneration = 0;
// Пока не спросили сервер, мы не знаем, есть ли сессия: пускать на страницу
// входа рано, иначе при каждом обновлении F5 мелькал бы логин.
let restored = false;
// Текущее продление сессии: пока оно не завершилось, все желающие ждут его,
// а не запускают своё (см. refreshSession).
let refreshInFlight: Promise<boolean> | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Версия учётной сессии для защиты запросов, начатых до смены пользователя. */
export function getSessionGeneration(): number {
  return sessionGeneration;
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
  // Один общий «полёт» на всю вкладку. Когда токен истёк, 401 прилетает сразу
  // нескольким запросам, и раньше каждый из них слал своё продление. Сервер
  // теперь отзывает прежний токен при выдаче нового (ротация), поэтому пачка
  // одновременных продлений привела бы к тому, что часть запросов получает
  // «Сессия завершена» и человека выбрасывает на страницу входа.
  if (refreshInFlight) return refreshInFlight;

  const generationAtStart = sessionGeneration;
  refreshInFlight = (async () => {
    try {
      const response = await fetch("/api/v1/auth/refresh", { method: "POST" });
      if (!response.ok || generationAtStart !== sessionGeneration) return false;
      const parsed = accessTokenResponseSchema.safeParse(await response.json());
      if (!parsed.success) return false;
      // Это продление той же сессии, поэтому кеш сбрасывать не нужно. Если пока
      // ждали ответ случился logout/login, проверка поколения выше его отбросит.
      setAccessToken(parsed.data.access_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
