import { useState } from "react";

import { ApiError } from "@/shared/api/client";
import { useCreateUser, useDeleteUser, useUpdateUser, useUsers } from "@/shared/api/hooks";
import type { Role, User } from "@/shared/types";
import { Button } from "@/shared/ui/button";

const ROLE_ORDER: Record<string, number> = { admin: 0, manager: 1, operator: 2 };
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
};

interface FormState {
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  password: string;
}

const emptyForm: FormState = {
  email: "",
  first_name: "",
  last_name: "",
  role: "operator",
  password: "",
};

function fullName(user: { first_name?: string; last_name?: string }): string {
  return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
}

const inputCls = "rounded-[4px] border border-odoo-border px-2 py-1.5 text-sm";
const capCls = "mb-1 block text-[11px] uppercase text-odoo-text-muted";

export function UsersPage() {
  const { data: users = [] } = useUsers();
  const create = useCreateUser();
  const update = useUpdateUser();
  const remove = useDeleteUser();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<User | null>(null);
  const [error, setError] = useState("");

  const rows = [...users].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.id - b.id,
  );

  // Частая ошибка: в поле имени вставляют адрес почты.
  const firstNameIsEmail = form.first_name.includes("@");
  const lastNameIsEmail = form.last_name.includes("@");
  const nameIsEmail = firstNameIsEmail || lastNameIsEmail;

  function describe(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
      if (err.status === 409) return "Пользователь с таким email уже существует";
      if (err.status === 422) return "Проверьте поля: email и пароль от 8 символов";
      return err.message;
    }
    return fallback;
  }

  function startEdit(user: User) {
    setEditing(user);
    setForm({
      email: user.email,
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      role: user.role,
      password: "",
    });
    setError("");
  }

  function cancelEdit() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
  }

  function submit() {
    setError("");
    if (editing) {
      update.mutate(
        {
          id: editing.id,
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          ...(form.password.trim() ? { password: form.password } : {}),
        },
        {
          onSuccess: cancelEdit,
          onError: (err) => setError(describe(err, "Не удалось сохранить")),
        },
      );
      return;
    }
    create.mutate(form, {
      onSuccess: () => setForm(emptyForm),
      onError: (err) => setError(describe(err, "Не удалось создать пользователя")),
    });
  }

  return (
    <div>
      <h2 className="mb-4">Пользователи</h2>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label>
          <span className={capCls}>Email</span>
          <input
            className={inputCls}
            placeholder="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </label>
        <label>
          <span className={capCls}>Имя</span>
          <input
            aria-label="Имя"
            aria-invalid={firstNameIsEmail}
            className={`${inputCls} ${firstNameIsEmail ? "border-odoo-danger" : ""}`}
            placeholder="Иван"
            value={form.first_name}
            onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
          />
        </label>
        <label>
          <span className={capCls}>Фамилия</span>
          <input
            aria-label="Фамилия"
            aria-invalid={lastNameIsEmail}
            className={`${inputCls} ${lastNameIsEmail ? "border-odoo-danger" : ""}`}
            placeholder="Петров"
            value={form.last_name}
            onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
          />
        </label>
        <label>
          <span className={capCls}>
            {editing ? "Новый пароль (пусто = не менять)" : "Пароль"}
          </span>
          <input
            className={inputCls}
            placeholder="минимум 8 символов"
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </label>
        <label>
          <span className={capCls}>Роль</span>
          <select
            className={inputCls}
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
          >
            <option value="operator">operator</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
          </select>
        </label>

        {editing ? (
          <>
            <Button onClick={submit} disabled={update.isPending || nameIsEmail}>
              Сохранить
            </Button>
            <Button variant="secondary" onClick={cancelEdit}>
              Отмена
            </Button>
          </>
        ) : (
          <Button
            onClick={submit}
            disabled={create.isPending || !form.email || !form.password || nameIsEmail}
          >
            Создать
          </Button>
        )}
      </div>

      {nameIsEmail && (
        <p className="mb-3 text-sm text-odoo-danger">
          Похоже, это email — впишите имя, адрес указывается в поле Email
        </p>
      )}
      {error && <p className="mb-3 text-sm text-odoo-danger">{error}</p>}
      {editing && (
        <p className="mb-2 text-xs text-odoo-text-muted">
          Редактирование: {editing.email} (id {editing.id})
        </p>
      )}

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
            <tr
              key={user.id}
              className={`h-10 border-b border-odoo-border-light hover:bg-odoo-bg ${
                editing?.id === user.id ? "bg-odoo-bg" : "bg-odoo-surface"
              }`}
            >
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
                  onClick={() => startEdit(user)}
                >
                  Изменить
                </button>
                <button
                  type="button"
                  className="text-odoo-danger hover:underline"
                  onClick={() => {
                    if (!window.confirm(`Удалить ${user.email}?`)) return;
                    remove.mutate(user.id, {
                      onError: (err) => setError(describe(err, "Нельзя удалить этого пользователя")),
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
    </div>
  );
}
