import type { Stage } from "@/shared/types";

export const stages: Stage[] = [
  { id: 1, name: "Новый", sequence: 1, is_closed: false, color: "slate" },
  { id: 2, name: "Квалификация", sequence: 2, is_closed: false, color: "purple" },
  { id: 3, name: "Переговоры", sequence: 3, is_closed: false, color: "blue" },
  { id: 4, name: "Договор", sequence: 4, is_closed: false, color: "orange" },
  { id: 5, name: "Выиграно", sequence: 5, is_closed: true, color: "green" },
];
