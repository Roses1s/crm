import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { useCustomers } from "@/shared/api/hooks";
import { CustomerTile } from "@/features/customers/CustomerTile";

/**
 * «Клиенты» — аналог Odoo Contacts: абсолютно все лиды компании плиткой.
 *
 * Шапка повторяет страницу «Лиды» (тот же ControlPanel с поиском), но без
 * кнопки «Новый» и переключателя вид/канбан — здесь только просмотр, лиды
 * создаются в модуле CRM. Свой лид и любой проигранный открываются полностью,
 * чужой активный показан усечённо и не кликается — см. CustomerTile.
 */
/** Что показывать на странице: всё вперемешку, только активных или только
 * проигранных. Значение живёт в адресе (?view=…), чтобы ссылкой можно было
 * поделиться; посторонние значения считаем «все». */
type CustomersView = "all" | "active" | "lost";

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(search);

  const rawView = params.get("view");
  const view: CustomersView = rawView === "active" || rawView === "lost" ? rawView : "all";
  // «все» намеренно не посылаем: без параметра бэкенд отдаёт всё вперемешку.
  const archived = view === "all" ? null : view === "lost";

  function setView(next: CustomersView) {
    setParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === "all") nextParams.delete("view");
        else nextParams.set("view", next);
        return nextParams;
      },
      { replace: true },
    );
  }

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
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setParams]);

  const {
    data: customersPage,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useCustomers(search, archived);
  const customers = customersPage?.items ?? [];

  // Переключатель состояния — тот же слот и стиль, что фильтр статусов на
  // «Заявках», чтобы не заводить новый способ делать фильтр.
  const viewFilter = (
    <select
      className="h-8 rounded-[3px] border border-odoo-border bg-odoo-surface-sunken px-2 text-[13px] text-odoo-text-muted outline-none transition-colors hover:border-odoo-border focus:border-odoo-focus/40"
      value={view}
      onChange={(e) => setView(e.target.value as CustomersView)}
      aria-label="Показывать клиентов"
    >
      <option value="all">Все клиенты</option>
      <option value="active">Активные</option>
      <option value="lost">Проигранные</option>
    </select>
  );

  return (
    <AppShell>
      <ControlPanel
        title="Клиенты"
        status={viewFilter}
        search={searchInput}
        onSearch={setSearchInput}
        count={customersPage?.total || undefined}
        loadedCount={customers.length}
      />

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
              {customers.map((customer) => (
                <CustomerTile key={customer.id} customer={customer} />
              ))}
            </div>
            {hasNextPage && customersPage && (
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  disabled={isFetchingNextPage}
                  onClick={() => void fetchNextPage()}
                  className="rounded-[3px] border border-odoo-border bg-odoo-surface px-3 py-1.5 text-[13px] text-odoo-action hover:bg-odoo-bg disabled:cursor-wait disabled:opacity-60"
                >
                  {isFetchingNextPage
                    ? "Загрузка…"
                    : `Показать ещё ${Math.min(customersPage.limit, customersPage.total - customers.length)} из ${customersPage.total}`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
