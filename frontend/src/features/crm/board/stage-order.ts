import { arrayMove } from "@dnd-kit/sortable";

import type { Stage } from "@/shared/types";

const STAGE_DRAG_PREFIX = "column-";

/** Идентификатор этапа в DnD не пересекается с приёмником карточек `stage-*`. */
export function stageDragId(stageId: number): string {
  return `${STAGE_DRAG_PREFIX}${stageId}`;
}

export function isStageDragId(id: string | number): boolean {
  return String(id).startsWith(STAGE_DRAG_PREFIX);
}

/** Возвращает новый полный порядок или null, если перетаскивание не изменило его. */
export function reorderedStageIds(
  stages: Stage[],
  activeId: string | number,
  overId: string | number | null,
): number[] | null {
  if (!overId || !isStageDragId(activeId) || !isStageDragId(overId)) {
    return null;
  }

  const activeIndex = stages.findIndex((stage) => stageDragId(stage.id) === activeId);
  const overIndex = stages.findIndex((stage) => stageDragId(stage.id) === overId);
  if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return null;

  return arrayMove(stages, activeIndex, overIndex).map((stage) => stage.id);
}
