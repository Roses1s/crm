/**
 * Блок «Информация о клиенте» карточки лида: контакт логиста, телефон
 * и электронная почта.
 *
 * Собственного состояния у компонента нет: значения приходят готовыми
 * через props, правки уходят наверх обработчиками — по одному на поле.
 * Перенесён из `LeadFormPage.tsx` без изменений вёрстки, подписей, id,
 * подсказок, типов полей и порядка; состояние формы, преобразования
 * значений, сборка payload, автосохранение и права доступа остались в
 * странице.
 *
 * `readOnly` — единственное правило, которое знает блок: у проигранной
 * карточки и при конфликте версий поля недоступны. Второго «замка» у
 * блока нет и не было: правку отсекает `set()` в странице.
 */
import { Field, InnerGroup, OdooInput } from "@/shared/ui/odoo-form";

type ClientGroupProps = {
  logistContact: string;
  logistPhone: string;
  logistEmail: string;
  readOnly: boolean;
  onLogistContactChange: (value: string) => void;
  onLogistPhoneChange: (value: string) => void;
  onLogistEmailChange: (value: string) => void;
};

export function ClientGroup({
  logistContact,
  logistPhone,
  logistEmail,
  readOnly,
  onLogistContactChange,
  onLogistPhoneChange,
  onLogistEmailChange,
}: ClientGroupProps) {
  return (
    <div>
      <InnerGroup title="Информация о клиенте">
        <Field label="Контакт логиста/ЛПР" htmlFor="lead-contact">
          <OdooInput
            id="lead-contact"
            placeholder="Фамилия Имя"
            value={logistContact}
            disabled={readOnly}
            onChange={(e) => onLogistContactChange(e.target.value)}
          />
        </Field>
        <Field label="Телефон логиста" htmlFor="lead-logist-phone">
          <OdooInput
            id="lead-logist-phone"
            placeholder="+7 900 000-00-00"
            value={logistPhone}
            disabled={readOnly}
            onChange={(e) => onLogistPhoneChange(e.target.value)}
          />
        </Field>
        <Field label="Email логиста" htmlFor="lead-email">
          <OdooInput
            id="lead-email"
            type="email"
            placeholder="name@example.ru"
            value={logistEmail}
            disabled={readOnly}
            onChange={(e) => onLogistEmailChange(e.target.value)}
          />
        </Field>
      </InnerGroup>
    </div>
  );
}
