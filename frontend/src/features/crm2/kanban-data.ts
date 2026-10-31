// Вымышленные данные макета канбан-доски /crm2. Ни одно поле не связано с
// настоящей CRM: имена, компании, суммы и время выдуманы для примера вида.
// Реальные данные подключаются только по отдельному согласованию владельца.

export type StageId = "new" | "callback" | "lp" | "potential" | "left" | "waiting";

export interface Stage {
  id: StageId;
  name: string;
  /** Яркий основной цвет этапа: точка, заголовок, сумма, полоска карточки. */
  dot: string;
  /** Мягкая заливка колонки в светлой теме. */
  tint: string;
  /** Заставка колонки в тёмной теме — тот же цвет полупрозрачностью. */
  dark: string;
}

// Порядок и названия колонок — ровно как задал владелец.
// Палитра — красочная: у каждого этапа свой яркий цвет.
export const STAGES: Stage[] = [
  { id: "new", name: "Новый", dot: "#7c5cff", tint: "#ede9ff", dark: "rgba(124,92,255,0.13)" },
  {
    id: "callback",
    name: "Перезвонить",
    dot: "#f59e0b",
    tint: "#fff2dc",
    dark: "rgba(245,158,11,0.13)",
  },
  {
    id: "lp",
    name: "Вышел на ЛПР",
    dot: "#0ea5e9",
    tint: "#e0f3fe",
    dark: "rgba(14,165,233,0.13)",
  },
  {
    id: "potential",
    name: "Потенциальный",
    dot: "#14b8a6",
    tint: "#dcf7f3",
    dark: "rgba(20,184,166,0.13)",
  },
  { id: "left", name: "Уехали", dot: "#f43f5e", tint: "#ffe4e8", dark: "rgba(244,63,94,0.13)" },
  {
    id: "waiting",
    name: "Ждем заявку",
    dot: "#84cc16",
    tint: "#edfbd6",
    dark: "rgba(132,204,22,0.13)",
  },
];

/** У источника тоже свой цвет — метка на карточке окрашивается по нему. */
export interface SourceStyle {
  color: string;
  tint: string;
}

export const SOURCE_STYLES: Record<string, SourceStyle> = {
  Сайт: { color: "#2563eb", tint: "#eaf1ff" },
  Звонок: { color: "#ea580c", tint: "#ffeee2" },
  Рекомендация: { color: "#059669", tint: "#e5f8f0" },
  Мессенджер: { color: "#db2777", tint: "#fdeaf3" },
};

export interface BoardLead {
  id: string;
  name: string;
  company: string;
  amount: string;
  source: string;
  time: string;
  stage: StageId;
}

export const INITIAL_LEADS: BoardLead[] = [
  {
    id: "lead-1",
    name: "Анна Смирнова",
    company: "Севертрейд",
    amount: "480 000 ₽",
    source: "Сайт",
    time: "20 мин назад",
    stage: "new",
  },
  {
    id: "lead-2",
    name: "Игорь Мальцев",
    company: "Волга-Строй",
    amount: "1 250 000 ₽",
    source: "Звонок",
    time: "1 ч назад",
    stage: "new",
  },
  {
    id: "lead-3",
    name: "Мария Орлова",
    company: "Клиника Здоровье",
    amount: "320 000 ₽",
    source: "Рекомендация",
    time: "2 ч назад",
    stage: "new",
  },
  {
    id: "lead-4",
    name: "Дмитрий Савельев",
    company: "Аквилон",
    amount: "760 000 ₽",
    source: "Звонок",
    time: "3 ч назад",
    stage: "callback",
  },
  {
    id: "lead-5",
    name: "Ольга Титова",
    company: "Ясная Поляна",
    amount: "190 000 ₽",
    source: "Мессенджер",
    time: "5 ч назад",
    stage: "callback",
  },
  {
    id: "lead-6",
    name: "Павел Гринёв",
    company: "ТехноПарк",
    amount: "2 100 000 ₽",
    source: "Сайт",
    time: "вчера",
    stage: "callback",
  },
  {
    id: "lead-7",
    name: "Сергей Кузнецов",
    company: "Меридиан Логистика",
    amount: "3 400 000 ₽",
    source: "Звонок",
    time: "40 мин назад",
    stage: "lp",
  },
  {
    id: "lead-8",
    name: "Елена Волкова",
    company: "Фарватер Трейд",
    amount: "980 000 ₽",
    source: "Рекомендация",
    time: "4 ч назад",
    stage: "lp",
  },
  {
    id: "lead-9",
    name: "Артём Белов",
    company: "Гранит-Авто",
    amount: "1 540 000 ₽",
    source: "Сайт",
    time: "вчера",
    stage: "lp",
  },
  {
    id: "lead-10",
    name: "Наталья Гордеева",
    company: "Ритм-Сервис",
    amount: "650 000 ₽",
    source: "Мессенджер",
    time: "6 ч назад",
    stage: "potential",
  },
  {
    id: "lead-11",
    name: "Виктор Лапин",
    company: "Центр-Профи",
    amount: "870 000 ₽",
    source: "Звонок",
    time: "вчера",
    stage: "potential",
  },
  {
    id: "lead-12",
    name: "Ксения Дорошова",
    company: "Балтик Фиш",
    amount: "410 000 ₽",
    source: "Сайт",
    time: "2 дн назад",
    stage: "potential",
  },
  {
    id: "lead-13",
    name: "Роман Ефремов",
    company: "СтальИнвест",
    amount: "1 800 000 ₽",
    source: "Звонок",
    time: "вчера",
    stage: "left",
  },
  {
    id: "lead-14",
    name: "Юлия Панова",
    company: "Дом Тканей",
    amount: "260 000 ₽",
    source: "Сайт",
    time: "2 дн назад",
    stage: "left",
  },
  {
    id: "lead-15",
    name: "Алексей Тарасов",
    company: "Горный Ключ",
    amount: "2 750 000 ₽",
    source: "Рекомендация",
    time: "3 ч назад",
    stage: "waiting",
  },
  {
    id: "lead-16",
    name: "Ирина Соколова",
    company: "Медиалайн",
    amount: "540 000 ₽",
    source: "Мессенджер",
    time: "5 ч назад",
    stage: "waiting",
  },
];
