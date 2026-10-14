import { useState } from "react";

import { ApiError } from "@/shared/api/client";
import {
  useAdminAccountants,
  useCreateAccountant,
  useDeleteAccountant,
  useRestoreAccountant,
  useUpdateAccountant,
} from "@/shared/api/hooks";
import type { Accountant } from "@/shared/types";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";

const inputClass =
  "w-full rounded-[4px] border border-odoo-border bg-odoo-surface px-2 py-1.5 text-[13px] text-odoo-text placeholder:text-odoo-text-light outline-none focus:border-odoo-focus";
const labelClass = "mb-1 block text-[12px] font-medium text-odoo-text";

type AccountantDialog = "create" | Accountant | null;

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

/** Управление справочником бухгалтеров; удаление архивирует запись,
 *  чтобы сохранить исторические назначения в карточках лидов. */
export function AccountantsPage() {
  const { data: accountants = [], isLoading, isError } = useAdminAccountants();
  const create = useCreateAccountant();
  const update = useUpdateAccountant();
  const remove = useDeleteAccountant();
  const restore = useRestoreAccountant();

  const [dialog, setDialog] = useState<AccountantDialog>(null);
  const [pendingDelete, setPendingDelete] = useState<Accountant | null>(null);
  const [actionError, setActionError] = useState("");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2>Бухгалтеры</h2>
        <Button onClick={() => setDialog("create")}>Добавить бухгалтера</Button>
      </div>

      <p className="mb-3 text-[13px] text-odoo-text-muted">
        Неактивные ФИО нельзя назначать в новых карточках. Удаление не меняет уже сохранённые лиды.
      </p>

      {actionError && (
        <p role="alert" className="mb-3 text-sm text-odoo-danger">
          {actionError}
        </p>
      )}
      {isError && (
        <p role="alert" className="mb-3 text-sm text-odoo-danger">
          Не удалось загрузить справочник бухгалтеров.
        </p>
      )}

      <table className="w-full text-sm">
        <thead className="bg-odoo-bg text-xs uppercase text-odoo-text-muted">
          <tr>
            <th className="w-12 p-2 text-left">№</th>
            <th className="p-2 text-left">ФИО</th>
            <th className="w-28 p-2 text-left">Статус</th>
            <th className="w-48 p-2 text-left">Действия</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={4} className="p-4 text-center text-odoo-text-muted">
                Загрузка бухгалтеров…
              </td>
            </tr>
          )}
          {!isLoading && accountants.length === 0 && (
            <tr>
              <td colSpan={4} className="p-4 text-center text-odoo-text-muted">
                Справочник пуст
              </td>
            </tr>
          )}
          {accountants.map((accountant, index) => (
            <tr
              key={accountant.id}
              className={`h-10 border-b border-odoo-border-light bg-odoo-surface hover:bg-odoo-bg ${accountant.is_active ? "" : "text-odoo-text-muted"}`}
            >
              <td className="p-2">{index + 1}</td>
              <td className="p-2">{accountant.name}</td>
              <td className="p-2">{accountant.is_active ? "Активен" : "Неактивен"}</td>
              <td className="p-2">
                <button
                  type="button"
                  className="mr-3 text-odoo-action hover:underline"
                  onClick={() => {
                    setActionError("");
                    setDialog(accountant);
                  }}
                >
                  Изменить
                </button>
                {accountant.is_active ? (
                  <button
                    type="button"
                    className="text-odoo-danger hover:underline"
                    onClick={() => {
                      setActionError("");
                      setPendingDelete(accountant);
                    }}
                  >
                    Удалить
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={restore.isPending}
                    className="text-odoo-action hover:underline disabled:opacity-50"
                    onClick={() => {
                      setActionError("");
                      restore.mutate(accountant.id, {
                        onError: (error) =>
                          setActionError(errorMessage(error, "Не удалось восстановить бухгалтера")),
                      });
                    }}
                  >
                    Восстановить
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dialog && (
        <AccountantFormDialog
          accountant={dialog === "create" ? undefined : dialog}
          onClose={() => setDialog(null)}
          onSave={(name, onError) => {
            setActionError("");
            if (dialog === "create") {
              create.mutate(
                { name },
                {
                  onSuccess: () => setDialog(null),
                  onError,
                },
              );
            } else {
              update.mutate(
                { id: dialog.id, name },
                {
                  onSuccess: () => setDialog(null),
                  onError,
                },
              );
            }
          }}
          pending={create.isPending || update.isPending}
        />
      )}

      {pendingDelete && (
        <Modal label="Удаление бухгалтера" onClose={() => setPendingDelete(null)}>
          <h3 className="text-[15px] font-semibold text-odoo-text">Удалить бухгалтера?</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-odoo-text-muted">
            «{pendingDelete.name}» исчезнет из новых назначений, но останется в карточках, где уже
            выбран. Запись можно будет восстановить.
          </p>
          {remove.isError && (
            <p role="alert" className="mt-3 text-[13px] text-odoo-danger">
              {errorMessage(remove.error, "Не удалось удалить бухгалтера")}
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPendingDelete(null)}>
              Отмена
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(pendingDelete.id, {
                  onSuccess: () => setPendingDelete(null),
                })
              }
            >
              {remove.isPending ? "Удаляем…" : "Удалить"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AccountantFormDialog({
  accountant,
  onClose,
  onSave,
  pending,
}: {
  accountant?: Accountant;
  onClose: () => void;
  onSave: (name: string, onError: (error: unknown) => void) => void;
  pending: boolean;
}) {
  const [name, setName] = useState(accountant?.name ?? "");
  const [error, setError] = useState("");

  function submit() {
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (!normalizedName) {
      setError("Укажите ФИО бухгалтера");
      return;
    }
    setError("");
    onSave(normalizedName, (err) => setError(errorMessage(err, "Не удалось сохранить ФИО")));
  }

  return (
    <Modal
      label={accountant ? "Изменение ФИО бухгалтера" : "Добавление бухгалтера"}
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <h3 className="text-[15px] font-semibold text-odoo-text">
          {accountant ? "Изменить ФИО" : "Новый бухгалтер"}
        </h3>
        <label className="mt-3 block">
          <span className={labelClass}>ФИО</span>
          <input
            autoFocus
            required
            maxLength={255}
            className={inputClass}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Иванова Мария Петровна"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-odoo-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Сохранение…" : accountant ? "Сохранить" : "Добавить"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
