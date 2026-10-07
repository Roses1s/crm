import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Tailwind v4 подключается плагином Vite — postcss.config и tailwind.config
  // больше не нужны, вся тема живёт в src/index.css.
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Тяжёлые библиотеки выносим в отдельные файлы: браузер скачает их
        // один раз и закеширует, а при правках приложения будет обновляться
        // только небольшой основной файл.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
          query: ["@tanstack/react-query"],
        },
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Приложение открывается через проброшенный домен предпросмотра.
    allowedHosts: true,
    // В разработке запросы /api/* уходят на локальный бэкенд.
    // В продакшене то же самое делает nginx (см. deploy/nginx/conf.d).
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  // Тесты интерфейса: jsdom вместо браузера, общая подготовка в src/test/setup.ts.
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    coverage: {
      provider: "v8",
      // Явно включаем весь рабочий исходный код, а не только файлы,
      // которые уже импортируются тестами: иначе отчёт завышает покрытие.
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx",
        "src/test/**",
        "src/**/*.d.ts",
        "src/shared/types/**",
      ],
      reporter: ["text"],
      thresholds: {
        lines: 60,
        branches: 58,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
});
