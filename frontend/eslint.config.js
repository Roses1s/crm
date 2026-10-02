import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";

// Плоская конфигурация ESLint 9 для React 19 + TypeScript + Vite.
// Ловит ошибки в коде, нарушения правил хуков React и проблемы доступности
// (jsx-a11y). Правила форматирования отключены (eslint-config-prettier) —
// за отступы и кавычки отвечает Prettier.
export default tseslint.config(
  // public/ — статические файлы, отдаются как есть и не проходят сборку.
  { ignores: ["dist", "coverage", "node_modules", "public"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Автофокус в модальных окнах и полях ввода здесь намеренный и улучшает UX.
      "jsx-a11y/no-autofocus": "off",
      // Интерактивные элементы обязаны работать с клавиатуры: ошибка линтера
      // не даст незаметно вернуть кликабельный div без кнопки или ссылки.
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
    },
  },
  // Тестовые файлы: доступны глобали vitest/jsdom.
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
