import type { Tag } from "@/shared/types";

export const tags: Tag[] = [
  { id: 1, name: "Крупный клиент", color: "green" },
  { id: 2, name: "Рефрижератор", color: "blue" },
  { id: 3, name: "Тендер", color: "purple" },
  { id: 4, name: "Постоянный", color: "yellow" },
  { id: 5, name: "Негабарит", color: "orange" },
  { id: 6, name: "Просрочка оплаты", color: "red" },
];

export const tagById = (id: number) => tags.find((t) => t.id === id)!;
