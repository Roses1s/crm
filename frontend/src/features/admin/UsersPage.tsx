import { users } from "@/shared/mock/users";
import { Button } from "@/shared/ui/button";

const ROLE_ORDER: Record<string, number> = { admin: 0, manager: 1, operator: 2 };
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  operator: "Operator",
};

function fullName(user: { first_name?: string; last_name?: string }): string {
  return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
}

const inputCls = "rounded-[4px] border border-odoo-border px-2 py-1.5 text-sm";
const capCls = "mb-1 block text-[11px] uppercase text-odoo-text-muted";

/** Пользователи. Форма и таблица — только вёрстка, CRUD не подключён. */
export function UsersPage() {
  const rows = [...users].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.id - b.id,
  );

  return (
    <div>
      <h2 className="mb-4">Пользователи</h2>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <label>
          <span className={capCls}>Email</span>
          <input className={inputCls} placeholder="email" />
        </label>
        <label>
          <span className={capCls}>Имя</span>
          <input className={inputCls} placeholder="Иван" aria-label="Имя" />
        </label>
        <label>
          <span className={capCls}>Фамилия</span>
          <input className={inputCls} placeholder="Петров" aria-label="Фамилия" />
        </label>
        <label>
          <span className={capCls}>Пароль</span>
          <input className={inputCls} placeholder="пароль" type="password" />
        </label>
        <label>
          <span className={capCls}>Роль</span>
          <select className={inputCls} defaultValue="operator">
            <option value="operator">operator</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <Button>Создать</Button>
      </div>
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
          {rows.map((u, index) => (
            <tr
              key={u.id}
              className="h-10 border-b border-odoo-border-light bg-odoo-surface hover:bg-odoo-bg"
            >
              <td className="p-2 text-odoo-text-muted">{index + 1}</td>
              <td className="p-2">{u.email}</td>
              <td className="p-2">
                {fullName(u) || <span className="text-odoo-text-light">— не указано —</span>}
              </td>
              <td className="p-2">{ROLE_LABEL[u.role] ?? u.role}</td>
              <td className="p-2">{u.is_active ? "да" : "нет"}</td>
              <td className="p-2">
                <button type="button" className="mr-2 text-odoo-action hover:underline">
                  Изменить
                </button>
                <button type="button" className="text-odoo-danger hover:underline">
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
