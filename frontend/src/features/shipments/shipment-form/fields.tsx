/**
 * Поля ввода формы заявки. `SInput` и `STextarea` — тонкие обёртки над
 * `<input>` и `<textarea>`: сами выставляют вид по состоянию «заполнено / пусто»
 * и добавляют переданные классы. Код обёрток перенесён из `ShipmentFormPage.tsx`
 * без изменений.
 *
 * `SInput` нужен и самой форме, и вкладке «Позиции заказа», а
 * импортировать его из страницы нельзя — получился бы замкнутый круг
 * импортов. `STextarea` переехала сюда же, чтобы все обёртки полей жили
 * в одном месте.
 */
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

import { fieldStateCls } from "./helpers";

export function SInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const filled = Boolean(props.value);
  return <input {...props} className={`${fieldStateCls(filled)} ${className}`} />;
}

export function STextarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const filled = Boolean(props.value);
  return <textarea {...props} className={`${fieldStateCls(filled)} resize-y ${className}`} />;
}
