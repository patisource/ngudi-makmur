import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui/card";
import { EmptyState, Pagination, Sub, Table, Td, Th } from "@/components/ui/table";
import { actionLabel, AUDIT_GROUPS } from "@/lib/audit-labels";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { cleanQuery } from "@/features/master/queries";

export const metadata: Metadata = { title: "Log audit · SIM Ngudi Makmur" };

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 50;
const inputCls = "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm";

/** Ringkas satu baris audit: nomor dokumen / nama / jumlah dari nilai sesudah. */
function detail(after: unknown): string | null {
  if (!after || typeof after !== "object") return null;
  const a = after as Record<string, unknown>;
  const parts = [a.doc_number, a.name, a.full_name, a.order, a.order_doc].filter((v): v is string => typeof v === "string");
  const amount = typeof a.amount_rp === "number" ? `Rp${new Intl.NumberFormat("id-ID").format(a.amount_rp)}` : null;
  return [...parts, amount].filter(Boolean).join(" · ") || null;
}

// Log audit (T9.3, Security.md §10): ketua & admin teknis; append-only (trigger), RLS menegakkan hak baca.
// Filter jenis aksi, rentang tanggal (WIB), dan nama pelaku; paginasi di server.
export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requireRole(["ketua", "admin_teknis"]);
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const group = AUDIT_GROUPS.some(([g]) => g === s("jenis")) ? s("jenis") : undefined;
  const from = DATE.test(s("dari") ?? "") ? s("dari") : undefined;
  const to = DATE.test(s("sampai") ?? "") ? s("sampai") : undefined;
  const q = cleanQuery(s("q"));
  const page = Math.max(1, Math.min(10_000, Number.parseInt(s("page") ?? "1", 10) || 1));

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, at, actor_name, action, entity, entity_id, reason, after", { count: "exact" })
    .order("at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (group) query = query.like("action", `${group}.%`);
  if (from) query = query.gte("at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("at", `${to}T23:59:59.999+07:00`);
  if (q) query = query.ilike("actor_name", `%${q}%`);
  const { data, count, error } = await query;
  const filtered = Boolean(group || from || to || q);
  const href = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ jenis: group, dari: from, sampai: to, q })) if (v) p.set(k, v);
    p.set("page", String(n));
    return `/audit?${p}`;
  };

  return (
    <>
      <PageHeader title="Log audit" description="Setiap perubahan data, transaksi, akun, dan aktivitas masuk tercatat di sini dan tidak bisa diubah atau dihapus." />
      <Card className="p-4">
        <form method="get" className="grid grid-cols-2 items-end gap-2 md:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <label className="col-span-2 flex flex-col gap-1 text-label md:col-span-1">
            Jenis
            <select name="jenis" defaultValue={group ?? ""} className={inputCls}>
              <option value="">Semua</option>
              {AUDIT_GROUPS.map(([g, l]) => (
                <option key={g} value={g}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-label">
            Dari
            <input type="date" name="dari" defaultValue={from ?? ""} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-label">
            Sampai
            <input type="date" name="sampai" defaultValue={to ?? ""} className={inputCls} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-label md:col-span-1">
            Pelaku
            <input type="search" name="q" defaultValue={q} placeholder="Nama pengurus" className={inputCls} />
          </label>
          <div className="col-span-2 flex gap-2 md:col-span-1">
            <button type="submit" className="h-10 flex-1 rounded-md border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
              Terapkan
            </button>
            {filtered && (
              <Link href="/audit" className="inline-flex h-10 items-center rounded-md px-3 text-sm text-text-muted hover:bg-surface-muted">
                Reset
              </Link>
            )}
          </div>
        </form>
      </Card>
      {error ? (
        <EmptyState title="Log audit tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title={filtered ? "Tidak ada catatan yang cocok" : "Belum ada catatan"}>{filtered ? "Ubah jenis, tanggal, atau nama pelaku." : undefined}</EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Waktu</Th>
                <Th>Pelaku</Th>
                <Th>Aksi</Th>
                <Th>Keterangan</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id}>
                  <Td className="whitespace-nowrap text-text-muted">{fmt.format(new Date(row.at))}</Td>
                  <Td>{row.actor_name ?? "Sistem"}</Td>
                  <Td>
                    {actionLabel(row.action)}
                    <Sub>{row.action}</Sub>
                  </Td>
                  <Td className="text-text-muted">
                    {detail(row.after) ?? "—"}
                    {row.reason && <Sub>Alasan: {row.reason}</Sub>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE} total={count ?? 0} href={href} />
        </>
      )}
    </>
  );
}
