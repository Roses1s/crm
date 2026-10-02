import { useState } from "react";

import { ApiError } from "@/shared/api/client";
import { useDeleteUser, useUsers } from "@/shared/api/hooks";
import type { User } from "@/shared/types";
import { Button } from "@/shared/ui/button";
import { UserFormDialog } from "@/features/admin/UserFormDialog";

const ROLE_ORDER: Record<string, number> = { admin: 0, manager: 1 };
const ROLE_LABEL: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
};

function fullName(user: { first_name?: string; last_name?: string }): string {
  return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
}

/**
 * Список пользователей + кнопка «Создать». Форма — не инлайн, а модальное
 * окно (`UserFormDialog`): отдельное для создания и для редактирования
 * (оба раза один и тот же компонент, просто с/без переданного `user`).
 */
export function UsersPage() {
  const { data: users = [] } = useUsers();
  const remove = useDeleteUser();

  const [dialog, setDialog] = useState<"create" | User | null>(null);
  const [error, setError] = useState("");

  const rows = [...users].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.id - b.id,
  );

  function describeDeleteError(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    return "Нельзя удалить этого пользователя";
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2>Пользователи</h2>
        <Button onClick={() => setDialog("create")}>Создать</Button>
      </div>

      {error && <p className="mb-3 text-sm text-odoo-danger">{error}</p>}

      <table className="w-full text-sm">
        <thead className="bg-odoo-bg text-xs uppercase text-odoo-text-muted">
          <tr>
            <th className="w-12 p-2 text-left">№</th>
            <th className="p-2 text-left">Email</th>
            <th className="p-2 text-left">ФИО</th>
            <th className="p-2 text-left">Роль</th>
            <th className="p-2 text-left">Активен</th>
            <th className="p-2 text-left">Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((user, index) => (
            <tr key={user.id} className="h-10 border-b border-odoo-border-light bg-odoo-surface hover:bg-odoo-bg">
              <td className="p-2 text-odoo-text-muted">{index + 1}</td>
              <td className="p-2">{user.email}</td>
              <td className="p-2">
                {fullName(user) || <span className="text-odoo-text-light">— не указано —</span>}
              </td>
              <td className="p-2">{ROLE_LABEL[user.role] ?? user.role}</td>
              <td className="p-2">{user.is_active ? "да" : "нет"}</td>
              <td className="p-2">
                <button
                  type="button"
                  className="mr-2 text-odoo-action hover:underline"
                  onClick={() => setDialog(user)}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="text-odoo-danger hover:underline"
                  onClick={() => {
                    if (!window.confirm(`Удалить ${user.email}?`)) return;
                    setError("");
                    remove.mutate(user.id, {
                      onError: (err) => setError(describeDeleteError(err)),
                    });
                  }}
                >
                  Удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {dialog && (
        <UserFormDialog
          user={dialog === "create" ? undefined : dialog}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
