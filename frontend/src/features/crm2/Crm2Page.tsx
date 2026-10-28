import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  ChevronsLeft,
  LayoutGrid,
  Moon,
  Settings,
  UsersRound,
  Zap,
} from "lucide-react";

// Это только образец: пункты и показатели не связаны с настоящими данными CRM.
const menuItems = [
  { label: "Доска лидов", icon: LayoutGrid, badge: "17", active: true },
  { label: "Клиенты", icon: UsersRound, badge: "17" },
  { label: "Аналитика", icon: BarChart3, badge: "СКОРО" },
  { label: "Сделки", icon: BriefcaseBusiness, badge: "СКОРО" },
  { label: "Календарь", icon: CalendarDays, badge: "СКОРО" },
  { label: "Настройки", icon: Settings, badge: "СКОРО" },
];

export function Crm2Page() {
  return (
    <div className="flex h-dvh overflow-hidden bg-white">
      <aside
        aria-label="Боковая панель — пример"
        className="flex h-full min-h-0 w-[290px] max-w-full shrink-0 flex-col overflow-y-auto bg-[#101114] px-5 pb-4 text-white"
      >
        <div className="flex items-center gap-[15px] pl-[5px] pt-[21px]">
          <div className="flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-[15px] bg-[#7164f5] shadow-[0_8px_28px_rgba(102,89,255,0.28)]">
            <Zap aria-hidden="true" size={22} fill="white" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <div className="whitespace-nowrap text-[19px] leading-[21px] font-extrabold tracking-[-0.03em]">
              CRM Детроид
            </div>
            <div className="mt-0.5 text-[12px] leading-[14px] font-bold tracking-[0.16em] text-[#777880]">
              CRM · ПРОДАЖИ
            </div>
          </div>
        </div>

        <nav aria-label="Меню — пример" className="mt-[30px]">
          <div className="mb-3 pl-[15px] text-[11px] font-bold tracking-[0.18em] text-[#66676f]">
            МЕНЮ
          </div>
          <ul className="space-y-2">
            {menuItems.map(({ label, icon: Icon, badge, active }, index) => (
              <li
                key={label}
                className={`relative flex h-[55px] items-center gap-[15px] rounded-[15px] px-[15px] ${
                  active ? "bg-[#222327] font-bold text-white" : "font-semibold text-[#888991]"
                }`}
              >
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[15px] bottom-[15px] left-0 w-1 rounded-full bg-[#c1f25c]"
                  />
                )}
                <Icon aria-hidden="true" size={22} strokeWidth={active ? 2.4 : 1.9} />
                <span className="min-w-0 flex-1 whitespace-nowrap text-[16px]">{label}</span>
                <span
                  className={
                    index === 0
                      ? "rounded-full bg-[#c4f45d] px-[9px] py-[3px] text-[12px] font-bold text-[#151613]"
                      : index === 1
                        ? "rounded-full bg-[#675af2] px-[9px] py-[3px] text-[12px] font-bold text-white"
                        : "rounded-full border border-[#34353a] px-[8px] py-[3px] text-[10px] leading-[14px] font-bold text-[#696a73]"
                  }
                >
                  {badge}
                </span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1" />

        <div className="mt-6 rounded-[20px] border border-[#292a30] bg-[#17181c] px-5 pt-[19px] pb-[21px]">
          <div className="flex items-center justify-between gap-2 text-[13px] font-bold">
            <span className="text-[#777880]">ЗДОРОВЬЕ ВОРОНКИ</span>
            <span className="text-[#c4f45d]">86%</span>
          </div>
          <div
            aria-hidden="true"
            className="mt-[13px] h-2 overflow-hidden rounded-full bg-[#303136]"
          >
            <div className="h-full w-[86%] rounded-full bg-linear-to-r from-[#776bff] via-[#a7b9b4] to-[#bdf05a]" />
          </div>
          <p className="mt-[12px] text-[13px] leading-[20px] text-[#7c7d84]">
            Все этапы в норме, перегруза нет
          </p>
        </div>

        <div className="mt-4 flex h-[55px] items-center gap-[15px] rounded-[15px] border border-[#292a30] px-[15px] text-[16px] font-semibold text-[#96979e]">
          <Moon aria-hidden="true" size={21} />
          <span>Тёмная тема</span>
        </div>

        <div className="mt-[14px] flex items-center gap-[14px] px-[13px]">
          <div className="relative flex h-[45px] w-[45px] shrink-0 items-center justify-center rounded-full bg-[#bd22f3] text-[12px] font-bold">
            АК
            <span className="absolute right-[-2px] bottom-[-2px] h-3 w-3 rounded-full border-2 border-[#101114] bg-[#a7e74d]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] leading-[20px] font-bold">Анна Ким</div>
            <div className="text-[13px] leading-[18px] text-[#82838b]">Руководитель ОП</div>
          </div>
          <ChevronsLeft aria-hidden="true" size={18} className="text-[#67686f]" />
        </div>
      </aside>
      <main aria-label="Новая CRM" className="min-w-0 flex-1" />
    </div>
  );
}
