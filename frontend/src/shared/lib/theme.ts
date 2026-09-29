import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

export const THEME_KEY = "crm-theme";

/**
 * Переключатель темы: явный тумблер в меню пользователя, запоминается между
 * сессиями, по умолчанию светлая. Меняются только CSS-переменные, поэтому
 * перекраска мгновенная и без перезагрузки.
 */
function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "dark" || value === "light" ? value : null;
  } catch {
    return null;
  }
}

function currentFromDom(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

let theme: Theme = typeof document === "undefined" ? "light" : (readStored() ?? currentFromDom());
const listeners = new Set<() => void>();

/** Применяет тему к документу. Тот же код выполняется в public/theme.js
 *  до первой отрисовки, иначе тёмный пользователь увидит белую вспышку. */
export function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", next === "dark");
  root.style.colorScheme = next;
}

export function getTheme(): Theme {
  return theme;
}

export function setTheme(next: Theme) {
  theme = next;
  applyTheme(next);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Приватный режим: тема всё равно применится в рамках сессии.
  }
  listeners.forEach((listener) => listener());
}

export function toggleTheme() {
  setTheme(theme === "dark" ? "light" : "dark");
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);
}
