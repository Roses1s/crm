import { useState } from "react";

import { describe } from "@/features/crm/lead-form/describe-error";
import { LoseLeadDialog } from "@/features/crm/lead-form/LoseLeadDialog";
import { useLoseLead } from "@/shared/api/hooks";

/**
 * «Отметить проигрышем»: окно выбора причины и сам запрос к серверу.
 *
 * Страница владеет только тем, открыто ли окно: открыть его можно и из меню
 * «Действия», и кнопкой в полосе этапов, а состояние должно быть одно. Запрос,
 * текст ошибки и блокировка кнопки на время отправки живут здесь: когда окно
 * закрывается, страница размонтирует компонент — и прошлая ошибка уходит
 * вместе с ним, то есть чистое окно при следующем открытии получается само.
 */
export function LoseLeadAction({
  leadId,
  leadName,
  onCancel,
  onLosed,
}: {
  leadId: number;
  leadName: string;
  /** «Отмена» или Escape: просто закрыть окно. */
  onCancel: () => void;
  /** Лид отмечен проигранным: страница закрывает окно и уводит на
   *  доску. */
  onLosed: () => void;
}) {
  const loseLead = useLoseLead();
  const [error, setError] = useState("");

  function confirm(reasonId: number) {
    // Прошлый текст ошибки стираем сразу при новой попытке: иначе он
    // висел бы, пока идёт запрос, и путался с ответом на него.
    setError("");
    loseLead.mutate(
      { id: leadId, reasonId },
      {
        onSuccess: () => onLosed(),
        onError: (err) => setError(describe(err, "Не удалось отметить лид проигранным")),
      },
    );
  }

  return (
    <LoseLeadDialog
      leadName={leadName}
      pending={loseLead.isPending}
      error={error}
      onCancel={onCancel}
      onConfirm={confirm}
    />
  );
}
