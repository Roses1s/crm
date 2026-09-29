// Тема применяется до первой отрисовки, иначе тёмный пользователь увидит
// белую вспышку. Держать синхронно с src/shared/lib/theme.ts.
(function () {
  try {
    var theme = localStorage.getItem("crm-theme") === "dark" ? "dark" : "light";
    if (theme === "dark") document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.style.colorScheme = "light";
  }
})();
