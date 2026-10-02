import { useState } from "react";

import { useCreateUser, useUpdateUser } from "@/shared/api/hooks";
import { ApiError } from "@/shared/api/client";
import type { Role, User } from "@/shared/types";
import { Button } from "@/shared/ui/button";

const inputCls =
  "w-full rounded-[4px] border border-odoo-border bg-odoo-surface px-2 py-1.5 text-[13px] text-odoo-text placeholder:text-odoo-text-light outline-none transition-colors hover:border-odoo-border focus:border-odoo-focus";
const labelCls = "mb-1 block text-[12px] font-medium text-odoo-text";

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
  role: "manager",
  password: "",
};

/**
 * Модальное окно создания/редактирования пользователя — вызывается из
 * `UsersPage`. Без `user` — создание (пароль обязателен), с `user` —
 * редактирование (пароль меняется, только если его вписали заново).
 */
export function UserFormDialog({ user, onClose }: { user?: User; onClose: () => void }) {
  const isEditing = !!user;
  const create = useCreateUser();
  const update = useUpdateUser();
  const pending = isEditing ? update.isPending : create.isPending;

  const [form, setForm] = useState<FormState>(
    user
      ? {
          email: user.email,
          first_name: user.first_name ?? "",
          last_name: user.last_name ?? "",
          role: user.role,
          password: "",
        }
      : emptyForm,
  );
  const [error, setError] = useState("");

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

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

  function submit() {
    setError("");
    if (isEditing && user) {
      update.mutate(
        {
          id: user.id,
          email: form.email,
          first_name: form.first_name,
          last_name: form.last_name,
          role: form.role,
          ...(form.password.trim() ? { password: form.password } : {}),
        },
        {
          onSuccess: onClose,
          onError: (err) => setError(describe(err, "Не удалось сохранить")),
        },
      );
      return;
    }
    create.mutate(form, {
      onSuccess: onClose,
      onError: (err) => setError(describe(err, "Не удалось создать пользователя")),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-odoo-overlay/30 p-4">
      <form
        className="w-full max-w-md rounded-lg bg-odoo-surface p-4 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h3 className="text-[15px] font-semibold text-odoo-text">
          {isEditing ? `Изменить пользователя` : "Новый пользователь"}
        </h3>
        {isEditing && (
          <p className="mt-1 text-[12px] text-odoo-text-muted">
            {user!.email} (id {user!.id})
          </p>
        )}

        <div className="mt-3 flex flex-col gap-3">
          <label>
            <span className={labelCls}>Email</span>
            <input
              autoFocus
              required
              type="email"
              className={inputCls}
              placeholder="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </label>
          <label>
            <span className={labelCls}>Имя</span>
            <input
              aria-label="Имя"
              aria-invalid={firstNameIsEmail}
              className={`${inputCls} ${firstNameIsEmail ? "border-odoo-danger" : ""}`}
              placeholder="Иван"
              value={form.first_name}
              onChange={(e) => set("first_name", e.target.value)}
            />
          </label>
          <label>
            <span className={labelCls}>Фамилия</span>
            <input
              aria-label="Фамилия"
              aria-invalid={lastNameIsEmail}
              className={`${inputCls} ${lastNameIsEmail ? "border-odoo-danger" : ""}`}
              placeholder="Петров"
              value={form.last_name}
              onChange={(e) => set("last_name", e.target.value)}
            />
          </label>
          <label>
            <span className={labelCls}>
              {isEditing ? "Новый пароль (пусто = не менять)" : "Пароль"}
            </span>
            <input
              className={inputCls}
              placeholder="минимум 8 символов"
              type="password"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </label>
          <label>
            <span className={labelCls}>Роль</span>
            <select
              className={inputCls}
              value={form.role}
              onChange={(e) => set("role", e.target.value as Role)}
            >
              <option value="manager">Менеджер</option>
              <option value="admin">Администратор</option>
            </select>
          </label>
        </div>

        {nameIsEmail && (
          <p className="mt-3 text-[12px] text-odoo-danger">
            Похоже, это email — впишите имя, адрес указывается в поле Email
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-odoo-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="submit"
            disabled={pending || nameIsEmail || !form.email || (!isEditing && !form.password)}
          >
            {pending ? "Сохранение…" : isEditing ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </form>
    </div>
  );
}
