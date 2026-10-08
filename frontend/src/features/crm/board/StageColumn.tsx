import { useEffect, useMemo } from "react";

import { useStageLeads } from "@/shared/api/hooks";
import type { Lead, Stage } from "@/shared/types";
import { Column } from "./Column";

/** Загружает страницы одного этапа и оставляет Column простым компонентом. */
export function StageColumn({
  stage,
  search,
  assigned,
  folded,
  onFold,
  allStages,
  onLeadsChange,
}: {
  stage: Stage;
  search: string;
  assigned: number | null;
  folded: boolean;
  onFold: () => void;
  allStages: Stage[];
  onLeadsChange: (stageId: number, leads: Lead[]) => void;
}) {
  const query = useStageLeads(stage.id, { search, assigned });
  const leads = useMemo(
    () => (query.data?.pages.flatMap((page) => page.results) ?? []).sort((a, b) => a.id - b.id),
    [query.data?.pages],
  );
  const total = query.data?.pages[0]?.count ?? 0;

  useEffect(() => {
    onLeadsChange(stage.id, leads);
  }, [leads, onLeadsChange, stage.id]);

  return (
    <Column
      stage={stage}
      leads={leads}
      total={total}
      hasNextPage={query.hasNextPage}
      isFetchingNextPage={query.isFetchingNextPage}
      isLoading={query.isLoading}
      isError={query.isError}
      onLoadMore={() => void query.fetchNextPage()}
      onRetry={() => void query.refetch()}
      folded={folded}
      onFold={onFold}
      allStages={allStages}
    />
  );
}
