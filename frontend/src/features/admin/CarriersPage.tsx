import { carriers } from "@/shared/mock/carriers";
import { Button } from "@/shared/ui/button";

export function CarriersPage() {
  return (
    <div>
      <h2 className="mb-4">Перевозчики</h2>
      <div className="mb-4 flex gap-2">
        <input
          className="rounded-[4px] border border-odoo-border px-2 py-1.5 text-sm"
          placeholder="Название"
        />
        <input
          className="rounded-[4px] border border-odoo-border px-2 py-1.5 text-sm"
          placeholder="ИНН"
        />
        <Button>Добавить</Button>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-odoo-bg text-xs uppercase text-odoo-text-muted">
          <tr>
            <th className="p-2 text-left">Название</th>
            <th className="p-2 text-left">ИНН</th>
            <th className="p-2 text-left">Активен</th>
          </tr>
        </thead>
        <tbody>
          {carriers.map((c) => (
            <tr key={c.id} className="border-b border-odoo-border-light bg-odoo-surface">
              <td className="p-2">{c.name}</td>
              <td className="p-2">{c.inn}</td>
              <td className="p-2">{c.is_active ? "да" : "нет"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
