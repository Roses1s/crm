import { useState, type DragEvent } from "react";
import { Moon, Sun } from "lucide-react";

import { INITIAL_LEADS, SOURCE_STYLES, STAGES, type BoardLead, type StageId } from "./kanban-data";

// Красочная канбан-доска /crm2: у каждого этапа свой яркий цвет —
// заливка колонки, заголовок, сумма и полоска на карточке; у источников
// свои цветные метки. Светлая тема — по умолчанию, тёмная — по
// переключателю (выбор запоминается в браузере). Левая панель не
// затрагивается. Перетаскивание — только в памяти страницы; сервер и
// данные не затрагиваются.
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
      className={`flex h-full min-h-0 flex-col ${
        light ? "bg-[linear-gradient(160deg,#f7f6ff,#f3f7ff_45%,#f2fbf6)]" : "bg-[#15161b]"
      }`}
    >
      <header className="flex items-center justify-between gap-4 px-5 pt-5 pb-4">
        <div>
          <h1 className="bg-gradient-to-r from-[#7c5cff] via-[#0ea5e9] to-[#84cc16] bg-clip-text text-[17px] font-extrabold text-transparent">
            Мои лиды
          </h1>
          <p
            className={`mt-1 text-[12px] font-medium ${light ? "text-[#6b7280]" : "text-white/45"}`}
          >
            По состоянию на сегодня · данные вымышленные
          </p>
        </div>
        <div
          role="group"
          aria-label="Тема оформления"
          className={`flex items-center gap-1 rounded-xl border p-1 ${
            light ? "border-[#e5e7eb] bg-white shadow-sm" : "border-white/[0.08] bg-white/[0.06]"
          }`}
        >
          <button
            type="button"
            aria-pressed={light}
            onClick={() => applyTheme("light")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#7c5cff] focus-visible:outline-none ${
              light ? "bg-[#7c5cff] text-white" : "text-white/50 hover:text-white/80"
            }`}
          >
            <Sun aria-hidden="true" size={14} strokeWidth={2.2} />
            Светлая
          </button>
          <button
            type="button"
            aria-pressed={!light}
            onClick={() => applyTheme("dark")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#7c5cff] focus-visible:outline-none ${
              light ? "text-[#6b7280] hover:text-[#111827]" : "bg-white/10 text-white"
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
              className={`flex w-[280px] shrink-0 flex-col rounded-2xl transition-all ${
                light ? "shadow-sm" : ""
              }`}
              style={{
                backgroundColor: light ? stage.tint : stage.dark,
                boxShadow: isOver ? `inset 0 0 0 2px ${stage.dot}` : undefined,
              }}
            >
              <header className="flex items-center gap-2 px-3.5 pt-3 pb-2">
                <span
                  aria-hidden="true"
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.dot }}
                />
                <h2
                  className={`text-[13px] font-bold ${light ? "" : "text-white/85"}`}
                  style={light ? { color: stage.dot } : undefined}
                >
                  {stage.name}
                </h2>
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    light ? "bg-white shadow-sm" : "bg-white/[0.09]"
                  }`}
                  style={{ color: stage.dot }}
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
                    className="rounded-xl border border-dashed px-1 py-4 text-center text-[11px] font-medium"
                    style={{ borderColor: `${stage.dot}66`, color: stage.dot }}
                  >
                    {isOver ? "Перетащите сюда" : "Пусто"}
                  </p>
                )}
                {items.map((lead) => {
                  const source = SOURCE_STYLES[lead.source];
                  const sourceStyle = source
                    ? light
                      ? { backgroundColor: source.tint, color: source.color }
                      : { backgroundColor: `${source.color}26`, color: source.color }
                    : light
                      ? { backgroundColor: "#f3f4f6", color: "#6b7280" }
                      : {
                          backgroundColor: "rgba(255,255,255,0.08)",
                          color: "rgba(255,255,255,0.5)",
                        };
                  return (
                    <article
                      key={lead.id}
                      role="listitem"
                      draggable
                      onDragStart={(event) => handleDragStart(event, lead.id)}
                      onDragEnd={handleDragEnd}
                      className={`cursor-grab rounded-xl border p-3 transition-all active:cursor-grabbing ${
                        light
                          ? "border-[#eceef2] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:shadow-[0_6px_16px_rgba(15,23,42,0.10)]"
                          : "border-white/[0.07] bg-white/[0.06] hover:bg-white/[0.09]"
                      } ${draggingId === lead.id ? "opacity-40" : ""}`}
                      style={{ borderLeft: `4px solid ${stage.dot}` }}
                    >
                      <div className="flex items-start justify-between gap-2 pl-1">
                        <p
                          className={`text-[13px] font-semibold ${
                            light ? "text-[#111827]" : "text-white/90"
                          }`}
                        >
                          {lead.name}
                        </p>
                        <p
                          className="shrink-0 text-[12px] font-extrabold"
                          style={{ color: stage.dot }}
                        >
                          {lead.amount}
                        </p>
                      </div>
                      <p
                        className={`mt-1 pl-1 text-[11.5px] font-medium ${
                          light ? "text-[#6b7280]" : "text-white/45"
                        }`}
                      >
                        {lead.company}
                      </p>
                      <div className="mt-2.5 flex items-center gap-2 pl-1">
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                          style={sourceStyle}
                        >
                          {lead.source}
                        </span>
                        <span
                          className={`text-[10px] font-medium ${
                            light ? "text-[#9ca3af]" : "text-white/35"
                          }`}
                        >
                          {lead.time}
                        </span>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
