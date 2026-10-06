import { useBackups, useLoginAttempts, useRunBackup } from "@/shared/api/hooks";
import { Button } from "@/shared/ui/button";
import { formatSize } from "@/shared/ui/file-preview-utils";

function staleMessage(ageHours: number | null): string {
  if (ageHours === null) return "Резервных копий нет. Проверьте, работает ли celery.";
  const days = Math.floor(ageHours / 24);
  const age = days >= 1 ? `${days} дн.` : `${Math.round(ageHours)} ч.`;
  return `Последней копии уже ${age}. Похоже, ночная задача не отрабатывает — проверьте celery.`;
}

export function SecurityPage() {
  const { data: backups } = useBackups();
  const { data: attempts = [] } = useLoginAttempts();
  const run = useRunBackup();

  const files = backups?.results ?? [];

  // Порядок блоков — по просьбе владельца: сначала то, что смотрят чаще
  // (вложения и попытки входа), бэкапы — внизу.
  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-3">Вложения</h2>
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <div className="rounded-md border border-odoo-border-light bg-odoo-surface p-3">
            <div className="text-xs uppercase text-odoo-text-muted">Файлов</div>
            <div className="mt-1 text-lg font-semibold">{backups?.storage.files ?? "—"}</div>
          </div>
          <div className="rounded-md border border-odoo-border-light bg-odoo-surface p-3">
            <div className="text-xs uppercase text-odoo-text-muted">Занято</div>
            <div className="mt-1 text-lg font-semibold">
              {backups ? formatSize(backups.storage.bytes) : "—"}
            </div>
          </div>
          <div className="rounded-md border border-odoo-border-light bg-odoo-surface p-3">
            <div className="text-xs uppercase text-odoo-text-muted">Свободно на диске</div>
            <div className="mt-1 text-lg font-semibold">
              {backups ? formatSize(backups.storage.free_bytes) : "—"}
            </div>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-odoo-text-muted">
          Файлы хранятся в томе на сервере и архивируются отдельной задачей по воскресеньям — дамп
          базы их не содержит.
        </p>
      </div>

      <div>
        <h2 className="mb-3">Неудачные попытки входа</h2>
        <table className="w-full text-sm">
          <thead className="bg-odoo-bg text-xs uppercase text-odoo-text-muted">
            <tr>
              <th className="p-2 text-left">Пользователь</th>
              <th className="p-2 text-left">IP</th>
              <th className="p-2 text-left">Последняя попытка</th>
              <th className="p-2 text-left">Неудач</th>
            </tr>
          </thead>
          <tbody>
            {attempts.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-center text-odoo-text-muted">
                  Неудачных попыток не было
                </td>
              </tr>
            )}
            {attempts.map((attempt) => (
              <tr key={attempt.id} className="border-b border-odoo-border-light">
                <td className="p-2">{attempt.username}</td>
                <td className="p-2">{attempt.ip_address}</td>
                <td className="p-2">{attempt.attempt_time.slice(0, 19).replace("T", " ")}</td>
                <td className="p-2">{attempt.failures}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2>Бэкапы</h2>
          <Button onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending ? "Запуск…" : "Запустить бэкап"}
          </Button>
        </div>

        {run.isSuccess && (
          <p className="mb-3 text-sm text-odoo-text-muted">
            Задача поставлена в очередь — файл появится через несколько секунд.
          </p>
        )}
        {backups?.is_stale && (
          <p
            role="alert"
            className="mb-3 rounded-[4px] border border-odoo-danger/40 bg-odoo-danger/10 px-3 py-2 text-sm text-odoo-danger"
          >
            {staleMessage(backups.age_hours)}
          </p>
        )}

        <ul className="text-sm">
          {files.map((file) => (
            <li key={file.name} className="border-b border-odoo-border-light py-1.5">
              {file.name}{" "}
              <span className="text-odoo-text-muted">({Math.round(file.size / 1024)} КБ)</span>
            </li>
          ))}
          {files.length === 0 && <li className="text-odoo-text-muted">Файлов нет</li>}
        </ul>
      </div>
    </div>
  );
}
