import type { ReactNode } from "react";

interface FormSectionProps {
  title: string;
  children: ReactNode;
}

export function FormSection({ title, children }: FormSectionProps) {
  return (
    <div className="mb-5">
      <h4 className="mb-3 border-b border-odoo-border-light pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-odoo-text-muted">
        {title}
      </h4>
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">{children}</div>
    </div>
  );
}
