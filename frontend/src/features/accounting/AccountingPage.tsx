import { Banknote, FileText, Landmark, Receipt, Wallet } from "lucide-react";
import { Navbar } from "@/app/layout/Navbar";

/**
 * Заглушка раздела «Бухгалтерия» для лаунчера.
 *
 * Пока это не рабочий модуль — ни счетов, ни банка, ни кассы у нас в базе
 * нет. Чтобы не притворяться функциональностью, которой ещё не существует,
 * карточки ниже декоративные: некликабельные (pointer-events-none,
 * aria-hidden), без кнопок и без цифр. Сверху — честная подпись вне эффекта
 * растворения, чтобы не выглядело багом.
 *
 * Эффект «тизера» — маска-градиент: у самого верха блока карточки едва
 * проступают, а чуть ниже уже полностью растворяются в тёмном фоне (как в
 * референсе). Фон фиксированно тёмный — не зависит от переключателя
 * «Тёмный режим» в шапке, тот же фирменный тёмный токен, что и у экрана
 * входа (--color-odoo-dark / --color-odoo-dark-light).
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
    <div className="min-h-screen bg-odoo-dark">
      <Navbar />
      <div className="px-4 pb-16 pt-6 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] bg-odoo-dark-light text-white/80">
              <Landmark className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-[15px] font-semibold text-white">Бухгалтерия</h1>
              <p className="text-[12px] text-white/50">
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
                className="rounded-[6px] border border-white/10 bg-odoo-dark-light p-4"
              >
                <div className="mb-3 flex items-center gap-2 text-white/70">
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                  <span className="text-[13px] font-medium">{title}</span>
                </div>
                <div className="h-2 w-2/3 rounded-full bg-white/10" />
                <div className="mt-2 h-2 w-1/2 rounded-full bg-white/10" />
                <div className="mt-4 flex h-10 items-end gap-1">
                  {bars.map((h, i) => (
                    <span
                      key={i}
                      className="w-full rounded-sm bg-white/10"
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
