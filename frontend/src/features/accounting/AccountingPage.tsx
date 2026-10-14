import { Banknote, FileText, Landmark, Receipt, Wallet } from "lucide-react";
import { Navbar } from "@/app/layout/Navbar";

/**
 * Заглушка раздела «Бухгалтерия» для лаунчера.
 *
 * Рабочего модуля здесь пока нет: ни счетов, ни банка, ни кассы в базе не
 * существует. Карточки ниже декоративные и некликабельные; внешний вид
 * использует семантические токены CRM, чтобы корректно переключаться между
 * светлой и тёмной темами.
 */

const TEASER_CARDS: { title: string; icon: typeof Landmark; bars: number[] }[] = [
  { title: "Счета-фактуры для клиентов", icon: FileText, bars: [40, 70, 30, 85, 55, 20] },
  { title: "Счета поставщиков", icon: Receipt, bars: [60, 25, 75, 45, 30, 65] },
  { title: "Банк", icon: Landmark, bars: [20, 35, 50, 40, 60, 45] },
  { title: "Наличные", icon: Wallet, bars: [15, 20, 18, 25, 22, 19] },
  { title: "Разные операции", icon: Banknote, bars: [30, 30, 45, 35, 50, 40] },
];

export function AccountingPage() {
  return (
    <div className="min-h-screen bg-odoo-bg text-odoo-text">
      <Navbar />
      <div className="px-4 pb-16 pt-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-odoo-primary text-white">
              <Landmark className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-odoo-text">Бухгалтерия</h1>
              <p className="text-[12px] text-odoo-text-muted">
                Раздел в разработке — скоро здесь появятся счета, банк и кассовые операции
              </p>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none grid select-none grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            style={{
              maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 46%)",
              WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0) 46%)",
            }}
          >
            {TEASER_CARDS.map(({ title, icon: Icon, bars }) => (
              <div
                key={title}
                className="rounded-[6px] border border-odoo-border-light bg-odoo-surface p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-odoo-text-soft">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  <span className="text-[13px] font-medium">{title}</span>
                </div>
                <div className="h-2 w-2/3 rounded-full bg-odoo-skeleton" />
                <div className="mt-2 h-2 w-1/2 rounded-full bg-odoo-skeleton" />
                <div className="mt-4 flex h-10 items-end gap-1">
                  {bars.map((h, i) => (
                    <span
                      key={i}
                      className="w-full rounded-sm bg-odoo-primary/20"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
