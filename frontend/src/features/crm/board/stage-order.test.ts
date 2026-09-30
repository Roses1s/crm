import { describe, expect, it } from "vitest";

import { reorderedStageIds, stageDragId } from "@/features/crm/board/stage-order";
import type { Stage } from "@/shared/types";

const STAGES = [
  { id: 1, name: "Новый", sequence: 1 },
  { id: 2, name: "Перезвонить", sequence: 2 },
  { id: 3, name: "ЛПР", sequence: 3 },
] as Stage[];

describe("порядок этапов канбана", () => {
  it("перемещает этап на позицию этапа под курсором", () => {
    expect(reorderedStageIds(STAGES, stageDragId(1), stageDragId(3))).toEqual([
      2, 3, 1,
    ]);
  });

  it("не создаёт запрос, если этап остался на своей позиции", () => {
    expect(reorderedStageIds(STAGES, stageDragId(2), stageDragId(2))).toBeNull();
  });

  it("отделяет DnD этапов от идентификаторов карточек", () => {
    expect(reorderedStageIds(STAGES, "lead-1", stageDragId(2))).toBeNull();
  });
});
