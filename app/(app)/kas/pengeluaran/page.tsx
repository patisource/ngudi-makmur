import type { Metadata } from "next";
import { CashEntryList } from "@/features/cash/components/cash-entry-list";
import { CashEntryForm } from "@/features/cash/components/cash-forms";
import { listAccounts, listCategories, listExpenses, parseCashFilter } from "@/features/cash/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Pengeluaran · Sistem Pengelolaan Jagung Desa Baturejo" };

// Pengeluaran (FR-CSH-05): satu kas keluar per dokumen EXP; tidak boleh membuat saldo negatif (FR-CSH-08).
export default async function ExpensesPage({ searchParams }: PageProps<"/kas/pengeluaran">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const f = parseCashFilter(await searchParams);
  const [{ data, count, error }, categories, accounts] = await Promise.all([listExpenses(f), listCategories(), listAccounts()]);
  const active = accounts.filter((a) => !a.archived_at).map((a) => ({ id: a.account_id, name: a.name, balanceRp: a.balance_rp }));
  return (
    <>
      {canDo(user.roles, "kas.kelola") && <CashEntryForm kind="expense" categories={categories.expense} accounts={active} />}
      <CashEntryList
        kind="expense"
        basePath="/kas/pengeluaran"
        filter={f}
        total={count ?? 0}
        error={Boolean(error)}
        rows={(data ?? []).map((e) => ({
          id: e.id,
          docNumber: e.doc_number,
          businessDate: e.business_date,
          category: e.expense_categories?.name ?? e.category,
          account: e.cash_accounts?.name ?? "—",
          amountRp: e.amount_rp,
          description: e.description,
          reference: e.reference,
        }))}
      />
    </>
  );
}
