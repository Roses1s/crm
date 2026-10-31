import { useState, type DragEvent } from "react";
import { Moon, Sun } from "lucide-react";

import { INITIAL_LEADS, STAGES, type BoardLead, type StageId } from "./kanban-data";

// Канбан-доска /crm2, переделанная с нуля по новому запросу владельца:
// светлая тема — стандарт (по умолчанию), тёмная — по переключателю.
// Левая панель темой не затрагивается. Выбор темы запоминается в браузере.
// Перетаскивание — только в памяти страницы; сервер и данные не затрагиваются.
type Theme = "light" | "dark";

const THEME_KEY = "crm2.theme";

function loadTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function saveTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Хранилище недоступно — просто работаем без запоминания.
  }
}

export function LeadBoard() {
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [leads, setLeads] = useState<BoardLead[]>(INITIAL_LEADS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<StageId | null>(null);

  const light = theme === "light";

  function applyTheme(next: Theme): void {
    setTheme(next);
    saveTheme(next);
  }

  function handleDragStart(event: DragEvent<HTMLElement>, id: string): void {
    event.dataTransfer.setData("text/plain", id);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  }

  function handleDragEnd(): void {
    setDraggingId(null);
    setOverStage(null);
  }

  function handleDrop(event: DragEvent<HTMLElement>, stage: StageId): void {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggingId;
    if (id) {
      setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, stage } : lead)));
    }
    setDraggingId(null);
    setOverStage(null);
  }

  return (
    <div
      data-theme={theme}
      className={`flex h-full min-h-0 flex-col ${light ? "bg-[#f4f5f7]" : "bg-[#15161b]"}`}
    >
      <header className="flex items-center justify-between gap-4 px-5 pt-5 pb-4">
        <div>
          <h1 className={`text-[15px] font-bold ${light ? "text-[#0f172a]" : "text-white"}`}>
            Мои лиды
          </h1>
          <p
            className={`mt-1 text-[12px] font-medium ${light ? "text-[#64748b]" : "text-white/45"}`}
          >
            По состоянию на сегодня · данные вымышленные
          </p>
        </div>
        <div
          role="group"
          aria-label="Тема оформления"
          className={`flex items-center gap-1 rounded-xl border p-1 ${
            light ? "border-slate-200 bg-white" : "border-white/[0.08] bg-white/[0.06]"
          }`}
        >
          <button
            type="button"
            aria-pressed={light}
            onClick={() => applyTheme("light")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#5a54e8] focus-visible:outline-none ${
              light ? "bg-[#5a54e8] text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            <Sun aria-hidden="true" size={14} strokeWidth={2.2} />
            Светлая
          </button>
          <button
            type="button"
            aria-pressed={!light}
            onClick={() => applyTheme("dark")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#5a54e8] focus-visible:outline-none ${
              light ? "text-slate-500 hover:text-slate-800" : "bg-white/10 text-white"
            }`}
          >
            <Moon aria-hidden="true" size={14} strokeWidth={2.2} />
            Тёмная
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-5 pb-5">
        {STAGES.map((stage) => {
          const items = leads.filter((lead) => lead.stage === stage.id);
          const isOver = overStage === stage.id;
          return (
            <section
              key={stage.id}
              aria-label={`Колонка ${stage.name}`}
              className={`flex w-[280px] shrink-0 flex-col rounded-2xl transition-colors ${
                light
                  ? isOver
                    ? "bg-[#e6e9f8]"
                    : "bg-[#eaecf1]"
                  : isOver
                    ? "border border-white/[0.14] bg-white/[0.05]"
                    : "border border-white/[0.06] bg-white/[0.03]"
              }`}
            >
              <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.dot }}
                />
                <h2
                  className={`text-[13px] font-semibold ${
                    light ? "text-[#334155]" : "text-white/75"
                  }`}
                >
                  {stage.name}
                </h2>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    light ? "bg-white text-[#475569] shadow-sm" : "bg-white/[0.07] text-white/45"
                  }`}
                >
                  {items.length}
                </span>
              </header>
              <div
                role="list"
                className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverStage(stage.id);
                }}
                onDragLeave={() => {
                  setOverStage((prev) => (prev === stage.id ? null : prev));
                }}
                onDrop={(event) => handleDrop(event, stage.id)}
              >
                {items.length === 0 && (
                  <p
                    className={`rounded-xl border border-dashed px-1 py-4 text-center text-[11px] ${
                      light ? "border-[#cbd2da] text-[#94a3b8]" : "border-white/10 text-white/30"
                    }`}
                  >
                    {isOver ? "Перетащите сюда" : "Пусто"}
                  </p>
                )}
                {items.map((lead) => (
                  <article
                    key={lead.id}
                    role="listitem"
                    draggable
                    onDragStart={(event) => handleDragStart(event, lead.id)}
                    onDragEnd={handleDragEnd}
                    className={`cursor-grab rounded-xl border p-3 transition-all active:cursor-grabbing ${
                      light
                        ? "border-[#e2e5ea] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:shadow-[0_6px_16px_rgba(15,23,42,0.09)]"
                        : "border-white/[0.07] bg-white/[0.05] hover:bg-white/[0.08]"
                    } ${draggingId === lead.id ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-[13px] font-semibold ${
                          light ? "text-[#0f172a]" : "text-white/90"
                        }`}
                      >
                        {lead.name}
                      </p>
                      <p
                        className={`shrink-0 text-[12px] font-bold ${
                          light ? "text-[#5a54e8]" : "text-white/85"
                        }`}
                      >
                        {lead.amount}
                      </p>
                    </div>
                    <p
                      className={`mt-1 text-[11.5px] font-medium ${
                        light ? "text-[#64748b]" : "text-white/45"
                      }`}
                    >
                      {lead.company}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2">
                      <span
                        className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${
                          light ? "bg-[#eef1f5] text-[#475569]" : "bg-white/[0.06] text-white/50"
                        }`}
                      >
                        {lead.source}
                      </span>
                      <span
                        className={`text-[10px] font-medium ${
                          light ? "text-[#94a3b8]" : "text-white/35"
                        }`}
                      >
                        {lead.time}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
