// Вымышленные данные макета канбан-доски /crm2. Ни одно поле не связано с
// настоящей CRM: имена, компании, суммы и время выдуманы для примера вида.
// Реальные данные подключаются только по отдельному согласованию владельца.

export type StageId = "new" | "callback" | "lp" | "potential" | "left" | "waiting";

export interface Stage {
  id: StageId;
  name: string;
  /** Цветная точка в шапке колонки (приглушённая палитра панели). */
  dot: string;
}

// Порядок и названия колонок — ровно как задал владелец.
export const STAGES: Stage[] = [
  { id: "new", name: "Новый", dot: "#5a54e8" },
  { id: "callback", name: "Перезвонить", dot: "#f5a524" },
  { id: "lp", name: "Вышел на ЛПР", dot: "#38bdf8" },
  { id: "potential", name: "Потенциальный", dot: "#2dd4bf" },
  { id: "left", name: "Уехали", dot: "#f87171" },
  { id: "waiting", name: "Ждем заявку", dot: "#c4f45d" },
];

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
