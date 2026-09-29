import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Tailwind v4 подключается плагином Vite — postcss.config и tailwind.config
  // больше не нужны, вся тема живёт в src/index.css.
  plugins: [react(), tailwindcss()],
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
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
});
