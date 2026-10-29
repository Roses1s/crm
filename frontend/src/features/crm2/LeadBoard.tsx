import { useState, type DragEvent } from "react";

import { INITIAL_LEADS, STAGES, type BoardLead, type StageId } from "./kanban-data";

// Макет канбан-доски /crm2: 6 колонок этапов владельца и вымышленные лиды.
// Перетаскивание работает только в памяти страницы (после перезагрузки
// карточки возвращаются на места); сервер и данные не затрагиваются.
export function LeadBoard() {
  const [leads, setLeads] = useState<BoardLead[]>(INITIAL_LEADS);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<StageId | null>(null);

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
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto p-4">
      {STAGES.map((stage) => {
        const items = leads.filter((lead) => lead.stage === stage.id);
        const isOver = overStage === stage.id;
        return (
          <section
            key={stage.id}
            aria-label={`Колонка ${stage.name}`}
            className={`flex w-[286px] shrink-0 flex-col rounded-2xl border transition-colors ${
              isOver ? "border-white/[0.14] bg-white/[0.05]" : "border-white/[0.06] bg-white/[0.03]"
            }`}
          >
            <header className="flex items-center gap-2 px-3.5 pt-3.5 pb-2.5">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: stage.dot }}
              />
              <h2 className="text-[13px] font-semibold text-white/75">{stage.name}</h2>
              <span className="ml-auto rounded-full bg-white/[0.07] px-2 py-0.5 text-[11px] font-semibold text-white/45">
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
                <p className="px-1 py-3 text-center text-[11px] text-white/30">
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
                  className={`cursor-grab rounded-xl border border-white/[0.07] bg-white/[0.05] p-3 transition-colors hover:bg-white/[0.08] active:cursor-grabbing ${
                    draggingId === lead.id ? "opacity-40" : ""
                  }`}
                >
                  <p className="text-[13px] font-semibold text-white/90">{lead.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-white/45">{lead.company}</p>
                  <p className="mt-2 text-[13px] font-semibold text-white/85">{lead.amount}</p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                      {lead.source}
                    </span>
                    <span className="text-[10px] text-white/35">{lead.time}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
