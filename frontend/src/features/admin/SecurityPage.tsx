import { backups, loginAttempts } from "@/shared/mock/security";
import { Button } from "@/shared/ui/button";

export function SecurityPage() {
  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2>Бэкапы</h2>
          <Button>Запустить бэкап</Button>
        </div>
        <ul className="text-sm">
          {backups.map((b) => (
            <li key={b.name} className="border-b border-odoo-border-light py-1.5">
              {b.name} <span className="text-odoo-text-muted">({Math.round(b.size / 1024)} КБ)</span>
            </li>
          ))}
          {backups.length === 0 && <li className="text-odoo-text-muted">Файлов нет</li>}
        </ul>
      </div>
      <div>
        <h2 className="mb-3">Попытки входа (axes)</h2>
        <table className="w-full text-sm">
          <thead className="bg-odoo-bg text-xs uppercase text-odoo-text-muted">
            <tr>
              <th className="p-2 text-left">Пользователь</th>
              <th className="p-2 text-left">IP</th>
              <th className="p-2 text-left">Время</th>
              <th className="p-2 text-left">Неудач</th>
            </tr>
          </thead>
          <tbody>
            {loginAttempts.map((a) => (
              <tr key={a.id} className="border-b border-odoo-border-light">
                <td className="p-2">{a.username}</td>
                <td className="p-2">{a.ip_address}</td>
                <td className="p-2">{a.attempt_time}</td>
                <td className="p-2">{a.failures}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
