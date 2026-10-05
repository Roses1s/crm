import { DndContext } from "@dnd-kit/core";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Column } from "@/features/crm/board/Column";
import type { Lead, Stage } from "@/shared/types";
import { renderWithProviders } from "@/test/utils";

const STAGE = {
  id: 1,
  name: "Новый",
  sequence: 1,
  color: "purple",
} as Stage;

const LEADS = [1, 2, 3].map(
  (id) =>
    ({
      id,
      name: `Лид ${id}`,
      inn: `74512345${id}5`,
      logist_contact: "Иван Петров",
      priority: 1,
      stage_id: 1,
      tags: [],
    }) as unknown as Lead,
);

describe("шапка этапа канбана", () => {
  it("выравнивает счётчик с полосой прогресса и подписывает его", () => {
    renderWithProviders(
      <DndContext>
        <Column
          stage={STAGE}
          leads={LEADS}
          folded={false}
          onFold={() => undefined}
          allStages={[STAGE]}
        />
      </DndContext>,
    );

    const count = screen.getByLabelText("Лидов в этапе: 3");
    expect(count).toHaveClass("h-3", "justify-end", "leading-none");
    expect(count).toHaveTextContent("3");
  });
});
