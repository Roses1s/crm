import { useState } from "react";

import { TransferDialog } from "@/features/crm/lead-form/TransferDialog";
import { useTransferLead } from "@/shared/api/hooks";

/**
 * «Передать лид»: окно выбора коллеги и сам запрос к серверу.
 *
 * Страница владеет только тем, открыто ли окно: кнопку передачи держит блок
 * «Информация о компании», а закрывать окно и уходить на доску после успеха
 * должна карточка. Запрос, текст ошибки и блокировка кнопки на время отправки
 * живут здесь: когда окно закрывается, страница размонтирует компонент — и
 * прошлая ошибка, поиск и выбранный коллега уходят вместе с ним, то есть
 * чистое окно при следующем открытии получается само.
 *
 * Ошибка показывается как есть: текст сервера, а при пустом тексте —
 * общая фраза. Общий разбор (`describe`) здесь намеренно не применяется:
 * так было до переноса, поведение этого шага не менялось.
 */
export function TransferLeadAction({
  leadId,
  leadName,
  leadIsLost,
  onCancel,
  onTransferred,
}: {
  leadId: number;
  leadName: string;
  /** Лид сейчас в проигрыше: передача заодно вернёт его на доску
   *  получателя. */
  leadIsLost: boolean;
  /** «Отмена» или Escape: просто закрыть окно. */
  onCancel: () => void;
  /** Лид передан: страница закрывает окно и уводит на доску. */
  onTransferred: () => void;
}) {
  const transferLead = useTransferLead(leadId);
  const [error, setError] = useState("");

  function confirm(userId: number) {
    transferLead.mutate(userId, {
      onSuccess: () => onTransferred(),
      onError: (err: Error) => setError(err.message || "Не удалось передать лид"),
    });
  }

  return (
    <TransferDialog
      leadName={leadName}
      leadIsLost={leadIsLost}
      pending={transferLead.isPending}
      error={error}
      onCancel={onCancel}
      onConfirm={confirm}
    />
  );
}
