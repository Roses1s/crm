import { cn } from "@/shared/lib/cn";

/**
 * Скелетоны — часть дизайн-системы. В макете состояния загрузки нет
 * (данные статичные), но компоненты перенесены, чтобы на этапе подключения
 * бэкенда их можно было сразу использовать.
 */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[4px] bg-odoo-border", className)} />;
}

export function KanbanCardSkeleton() {
  return (
    <div className="border-b border-odoo-border-light bg-odoo-surface px-2 py-2">
      <div className="animate-pulse space-y-2.5">
        <div className="h-4 w-3/4 rounded-[4px] bg-odoo-border" />
        <div className="h-3 w-1/2 rounded-[4px] bg-odoo-border-light" />
        <div className="h-3 w-1/3 rounded-[4px] bg-odoo-border-light" />
        <div className="mt-2 flex gap-1">
          <div className="h-5 w-12 rounded-[4px] bg-odoo-border-light" />
          <div className="h-5 w-10 rounded-[4px] bg-odoo-border-light" />
        </div>
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr>
      <td className="p-2">
        <div className="h-4 w-4 animate-pulse rounded-[4px] bg-odoo-border" />
      </td>
      <td className="p-2">
        <div className="h-4 w-24 animate-pulse rounded-[4px] bg-odoo-border" />
      </td>
      <td className="p-2">
        <div className="h-4 w-32 animate-pulse rounded-[4px] bg-odoo-border" />
      </td>
      <td className="p-2">
        <div className="h-4 w-16 animate-pulse rounded-[4px] bg-odoo-border" />
      </td>
    </tr>
  );
}

const LIST_SKELETON_WIDTHS = ["70%", "55%", "60%", "45%", "65%", "50%", "40%", "35%"];

export function ListRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <tr className="h-7 border-b border-odoo-border-light">
      {Array.from({ length: cols }).map((_, i) => (
        <td
          key={i}
          className={`px-2 py-1 ${i === 0 ? "pl-4" : ""} ${i === cols - 1 ? "pr-4" : ""}`}
        >
          <div
            className="h-3 animate-pulse rounded-[4px] bg-odoo-border-light"
            style={{ width: LIST_SKELETON_WIDTHS[i % LIST_SKELETON_WIDTHS.length] }}
          />
        </td>
      ))}
    </tr>
  );
}

export function FormSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-5 w-1/3 rounded-[4px] bg-odoo-border" />
      <div className="space-y-2">
        <div className="h-3 w-20 rounded-[4px] bg-odoo-border-light" />
        <div className="h-8 w-full rounded-[4px] bg-odoo-border" />
      </div>
    </div>
  );
}
