import { useState } from "react";

import { TagsField } from "@/features/crm/lead-form/TagsField";
import { ApiError } from "@/shared/api/client";
import { useCarriers, useCreateCarrier, useSetCarrierTags, useTags } from "@/shared/api/hooks";
import { Button } from "@/shared/ui/button";

export function CarriersPage() {
  const { data: carriers = [] } = useCarriers();
  const { data: allTags = [] } = useTags();
  const create = useCreateCarrier();
  const setTags = useSetCarrierTags();
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [error, setError] = useState("");

  function submit() {
    setError("");
    if (!name.trim() || !inn.trim()) {
      setError("Заполните название и ИНН");
      return;
    }
    create.mutate(
      { name: name.trim(), inn: inn.trim() },
      {
        onSuccess: () => {
          setName("");
          setInn("");
        },
        onError: (err) =>
          setError(
            err instanceof ApiError && err.status === 422
              ? "ИНН должен содержать 10 или 12 цифр"
              : "Не удалось добавить перевозчика",
          ),
      },
    );
  }

  return (
    <div>
      <h2 className="mb-4">Перевозчики</h2>
      <div className="mb-4 flex gap-2">
        <input
          className="rounded-[4px] border border-odoo-border bg-odoo-surface px-2 py-1.5 text-sm text-odoo-text placeholder:text-odoo-text-light transition-colors hover:border-odoo-border focus:border-odoo-focus focus:outline-none"
          placeholder="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded-[4px] border border-odoo-border bg-odoo-surface px-2 py-1.5 text-sm text-odoo-text placeholder:text-odoo-text-light transition-colors hover:border-odoo-border focus:border-odoo-focus focus:outline-none"
          placeholder="ИНН"
          inputMode="numeric"
          value={inn}
          onChange={(e) => setInn(e.target.value)}
        />
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending ? "Добавление…" : "Добавить"}
        </Button>
      </div>
      {error && <p className="mb-3 text-sm text-odoo-danger">{error}</p>}
      <table className="w-full text-sm">
        <thead className="bg-odoo-bg text-xs uppercase text-odoo-text-muted">
          <tr>
            <th className="p-2 text-left">Название</th>
            <th className="p-2 text-left">ИНН</th>
            <th className="p-2 text-left">Активен</th>
            <th className="p-2 text-left">Теги</th>
          </tr>
        </thead>
        <tbody>
          {carriers.map((c) => (
            <tr key={c.id} className="border-b border-odoo-border-light bg-odoo-surface">
              <td className="p-2">{c.name}</td>
              <td className="p-2">{c.inn}</td>
              <td className="p-2">{c.is_active ? "да" : "нет"}</td>
              <td className="p-2">
                <TagsField
                  all={allTags}
                  value={c.tags?.map((t) => t.id) ?? []}
                  onChange={(ids) => setTags.mutate({ id: c.id, tagIds: ids })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
