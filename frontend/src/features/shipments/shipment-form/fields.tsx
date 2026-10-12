/**
 * Поля ввода формы заявки. `SInput` — тонкая обёртка над `<input>`: сам
 * выставляет вид по состоянию «заполнено / пусто» и добавляет переданные
 * классы. Вынесен из `ShipmentFormPage.tsx` без изменений: теперь он нужен
 * и самой форме, и вкладке «Позиции заказа», а импортировать его из страницы
 * нельзя — получился бы замкнутый круг импортов.
 */
import type { InputHTMLAttributes } from "react";

import { fieldStateCls } from "./helpers";

export function SInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const filled = Boolean(props.value);
  return <input {...props} className={`${fieldStateCls(filled)} ${className}`} />;
}
