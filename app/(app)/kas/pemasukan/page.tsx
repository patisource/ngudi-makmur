import type { Metadata } from "next";
import { CashEntryList } from "@/features/cash/components/cash-entry-list";
import { CashEntryForm } from "@/features/cash/components/cash-forms";
import { listAccounts, listCategories, listIncomes, parseCashFilter } from "@/features/cash/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Pemasukan lain · Sistem Pengelolaan Jagung Desa Baturejo" };

// Pemasukan lain (FR-CSH-05a): kas masuk di luar pembayaran pesanan, mis. iuran anggota atau bantuan.
export default async function IncomesPage({ searchParams }: PageProps<"/kas/pemasukan">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const f = parseCashFilter(await searchParams);
  const [{ data, count, error }, categories, accounts] = await Promise.all([listIncomes(f), listCategories(), listAccounts()]);
  const active = accounts.filter((a) => !a.archived_at).map((a) => ({ id: a.account_id, name: a.name, balanceRp: a.balance_rp }));
  return (
    <>
      {canDo(user.roles, "kas.kelola") && <CashEntryForm kind="income" categories={categories.income} accounts={active} />}
      <CashEntryList
        kind="income"
        basePath="/kas/pemasukan"
        filter={f}
        total={count ?? 0}
        error={Boolean(error)}
        rows={(data ?? []).map((e) => ({
          id: e.id,
          docNumber: e.doc_number,
          businessDate: e.business_date,
          category: e.income_categories?.name ?? e.category,
          account: e.cash_accounts?.name ?? "—",
          amountRp: e.amount_rp,
          description: e.description,
          reference: null,
        }))}
      />
    </>
  );
}
