import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { useCustomers } from "@/shared/api/hooks";
import { CustomerTile } from "@/features/customers/CustomerTile";
import { ListLimitNotice } from "@/shared/ui/list-limit-notice";

const TILES_PER_PAGE = 60;

/**
 * «Клиенты» — аналог Odoo Contacts: абсолютно все лиды компании плиткой.
 *
 * Шапка повторяет страницу «Лиды» (тот же ControlPanel с поиском), но без
 * кнопки «Новый» и переключателя вид/канбан — здесь только просмотр, лиды
 * создаются в модуле CRM. Свой лид и любой проигранный открываются полностью,
 * чужой активный показан усечённо и не кликается — см. CustomerTile.
 */
export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(search);
  const [visible, setVisible] = useState(TILES_PER_PAGE);

  useEffect(() => {
    const timer = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) next.set("search", searchInput);
          else next.delete("search");
          return next;
        },
        { replace: true },
      );
      setVisible(TILES_PER_PAGE);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setParams]);

  const { data: customersPage, isLoading } = useCustomers(search);
  const customers = customersPage?.items ?? [];
  const shown = customers.slice(0, visible);
  const hidden = customers.length - shown.length;

  return (
    <AppShell>
      <ControlPanel
        title="Клиенты"
        search={searchInput}
        onSearch={setSearchInput}
        count={customersPage?.total || undefined}
      />

      <ListLimitNotice data={customersPage} noun="клиентов" />

      <div className="min-h-[calc(100dvh-var(--odoo-record-control-panel-height))] bg-odoo-bg p-4">
        {isLoading ? (
          <p className="px-2 py-8 text-center text-[13px] text-odoo-text-muted">Загрузка…</p>
        ) : customers.length === 0 ? (
          <p className="rounded-md border border-dashed border-odoo-border bg-odoo-surface px-4 py-12 text-center text-[13px] text-odoo-text-muted">
            Клиенты не найдены.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {shown.map((customer) => (
                <CustomerTile key={customer.id} customer={customer} />
              ))}
            </div>
            {hidden > 0 && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisible((n) => n + TILES_PER_PAGE)}
                  className="rounded-[3px] border border-odoo-border bg-odoo-surface px-3 py-1.5 text-[13px] text-odoo-action hover:bg-odoo-bg"
                >
                  Показать ещё {Math.min(TILES_PER_PAGE, hidden)} из {customers.length}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
