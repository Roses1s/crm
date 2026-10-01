// Виджет many2many_tags: выбранные теги — пилюли с крестиком, выпадающий
// список — выбор/создание/правка/удаление. Теги свободны для всех —
// создавать, красить (любой HEX), переименовывать и удалять может любой
// пользователь, не только админ (см. backend app/api/v1/tags.py).
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { useCreateTag, useDeleteTag, useUpdateTag } from "@/shared/api/hooks";
import type { Tag } from "@/shared/types";
import { ColorPicker } from "@/shared/ui/color-picker";
import { isValidHexColor } from "@/shared/ui/tag-styles";
import { TagChip } from "@/shared/ui/tag-chip";

const NEW_TAG_COLOR = "#3b82f6";

export function TagsField({
  all,
  value,
  onChange,
}: {
  all: Tag[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(NEW_TAG_COLOR);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState(NEW_TAG_COLOR);

  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const selected = all.filter((t) => value.includes(t.id));

  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  function startEdit(tag: Tag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(isValidHexColor(tag.color) ? tag.color : NEW_TAG_COLOR);
    setCreating(false);
  }

  function saveEdit() {
    if (editingId === null || !editName.trim()) return;
    updateTag.mutate(
      { id: editingId, name: editName.trim(), color: editColor },
      { onSuccess: () => setEditingId(null) },
    );
  }

  function removeTag(tag: Tag) {
    if (!window.confirm(`Удалить тег «${tag.name}»? Он пропадёт везде, где проставлен.`)) return;
    deleteTag.mutate(tag.id, {
      onSuccess: () => onChange(value.filter((x) => x !== tag.id)),
    });
  }

  function submitCreate() {
    if (!draftName.trim()) return;
    createTag.mutate(
      { name: draftName.trim(), color: draftColor },
      {
        onSuccess: (tag) => {
          setDraftName("");
          setDraftColor(NEW_TAG_COLOR);
          setCreating(false);
          if (!value.includes(tag.id)) onChange([...value, tag.id]);
        },
      },
    );
  }

  return (
    <div className="relative flex flex-wrap items-center gap-1">
      {selected.map((tag) => (
        <TagChip key={tag.id} name={tag.name} color={tag.color} maxWidthClassName="max-w-[220px]">
          <button
            type="button"
            aria-label={`Убрать тег ${tag.name}`}
            className="opacity-60 transition-opacity hover:opacity-100"
            onClick={() => onChange(value.filter((x) => x !== tag.id))}
          >
            <X className="h-3 w-3" />
          </button>
        </TagChip>
      ))}

      <button
        type="button"
        aria-label="Теги"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-odoo-text-light transition-colors hover:bg-odoo-bg hover:text-odoo-text"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="Закрыть"
            onClick={() => {
              setOpen(false);
              setEditingId(null);
              setCreating(false);
            }}
          />
          <div className="absolute left-0 top-7 z-50 max-h-[320px] w-[260px] overflow-auto rounded-[3px] border border-odoo-border bg-odoo-surface py-1 shadow-lg">
            {all.length === 0 && (
              <p className="px-3 py-1.5 text-[12px] text-odoo-text-light">Тегов пока нет</p>
            )}
            {all.map((tag) =>
              editingId === tag.id ? (
                <div
                  key={tag.id}
                  className="flex flex-col gap-1.5 border-b border-odoo-border-light px-3 py-2"
                >
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="rounded-[3px] border border-odoo-border bg-odoo-surface px-1.5 py-1 text-[12px] text-odoo-text outline-none focus:border-odoo-focus"
                    placeholder="Название тега"
                  />
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      className="rounded-[3px] px-2 py-0.5 text-[12px] text-odoo-text-muted hover:bg-odoo-bg"
                      onClick={() => setEditingId(null)}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-[3px] bg-odoo-primary px-2 py-0.5 text-[12px] text-white hover:bg-odoo-primary-hover"
                      disabled={!editName.trim() || updateTag.isPending}
                      onClick={saveEdit}
                    >
                      <Check className="h-3 w-3" />
                      Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  key={tag.id}
                  className="group flex items-center gap-1.5 px-2 py-1 hover:bg-odoo-bg"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => toggle(tag.id)}
                  >
                    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                      {value.includes(tag.id) && (
                        <Check className="h-3.5 w-3.5 text-odoo-primary" />
                      )}
                    </span>
                    <TagChip
                      name={tag.name}
                      color={tag.color}
                      size="md"
                      maxWidthClassName="max-w-[140px]"
                    />
                  </button>
                  <button
                    type="button"
                    aria-label={`Изменить тег ${tag.name}`}
                    className="shrink-0 rounded-sm p-0.5 text-odoo-text-light opacity-0 transition-opacity hover:text-odoo-text group-hover:opacity-100"
                    onClick={() => startEdit(tag)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Удалить тег ${tag.name}`}
                    className="shrink-0 rounded-sm p-0.5 text-odoo-text-light opacity-0 transition-opacity hover:text-odoo-danger group-hover:opacity-100"
                    onClick={() => removeTag(tag)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ),
            )}

            <div className="border-t border-odoo-border-light px-2 pt-1.5">
              {creating ? (
                <div className="flex flex-col gap-1.5 px-1 pb-1.5">
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitCreate()}
                    className="rounded-[3px] border border-odoo-border bg-odoo-surface px-1.5 py-1 text-[12px] text-odoo-text outline-none focus:border-odoo-focus"
                    placeholder="Название нового тега"
                  />
                  <ColorPicker value={draftColor} onChange={setDraftColor} />
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      className="rounded-[3px] px-2 py-0.5 text-[12px] text-odoo-text-muted hover:bg-odoo-bg"
                      onClick={() => setCreating(false)}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-[3px] bg-odoo-primary px-2 py-0.5 text-[12px] text-white hover:bg-odoo-primary-hover"
                      disabled={!draftName.trim() || createTag.isPending}
                      onClick={submitCreate}
                    >
                      <Check className="h-3 w-3" />
                      Создать
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="mb-1 flex w-full items-center gap-1.5 rounded-[3px] px-1.5 py-1 text-left text-[12px] text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text"
                  onClick={() => {
                    setCreating(true);
                    setEditingId(null);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Создать тег
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
