import type { Carrier } from "@/shared/types";

export const carriers: Carrier[] = [
  { id: 1, name: 'ООО «АвтоТрансЛайн»', inn: "7447112233", is_active: true },
  { id: 2, name: 'ИП Сухарев В. П.', inn: "745301234567", is_active: true },
  { id: 3, name: 'ООО «РефСервис»', inn: "5405998877", is_active: true },
  { id: 4, name: 'ООО «ГрузАвто-Юг»', inn: "6163445566", is_active: false },
  { id: 5, name: 'ООО «Магистраль-НН»', inn: "5262778899", is_active: true },
];
