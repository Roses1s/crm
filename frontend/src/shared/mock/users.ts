import type { User } from "@/shared/types";

/**
 * Моковые пользователи. Никакой авторизации в макете нет — `currentUser`
 * нужен только для аватара в Navbar и подписи автора в чаттере.
 */
export const users: User[] = [
  {
    id: 1,
    email: "a.sokolov@detroid.ru",
    first_name: "Артём",
    last_name: "Соколов",
    role: "admin",
    is_active: true,
  },
  {
    id: 2,
    email: "m.orlova@detroid.ru",
    first_name: "Мария",
    last_name: "Орлова",
    role: "manager",
    is_active: true,
  },
  {
    id: 3,
    email: "d.kuznetsov@detroid.ru",
    first_name: "Денис",
    last_name: "Кузнецов",
    role: "operator",
    is_active: true,
  },
  {
    id: 4,
    email: "e.pavlova@detroid.ru",
    first_name: "Елена",
    last_name: "Павлова",
    role: "operator",
    is_active: true,
  },
  {
    id: 5,
    email: "i.gorbunov@detroid.ru",
    first_name: "Игорь",
    last_name: "Горбунов",
    role: "operator",
    is_active: false,
  },
];

export const currentUser: User = users[0];
