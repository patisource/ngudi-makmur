import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, Pagination } from "@/components/ui/table";
import { cleanQuery } from "@/features/master/queries";
import { actionLabel, actionsMatching, AUDIT_GROUPS, describeAudit } from "@/lib/audit-labels";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log audit · Sistem Pengelolaan Jagung Desa Baturejo" };

const fmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE = 50;
const inputCls = "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-base outline-none placeholder:text-text-subtle focus:border-border-strong focus:ring-4 focus:ring-info-soft sm:h-10 sm:text-sm";

// Log audit (desain 08, T9.3, Security.md §10): ketua & admin teknis; append-only (trigger), RLS menegakkan hak baca.
// Cari aksi/nomor dokumen/alasan + nama pelaku; filter jenis & tanggal (WIB) di "Filter lain"; paginasi di server.
export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  await requireRole(["ketua", "admin_teknis"]);
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const group = AUDIT_GROUPS.some(([g]) => g === s("jenis")) ? s("jenis") : undefined;
  const from = DATE.test(s("dari") ?? "") ? s("dari") : undefined;
  const to = DATE.test(s("sampai") ?? "") ? s("sampai") : undefined;
  const q = cleanQuery(s("q"));
  const actor = cleanQuery(s("pelaku"));
  const page = Math.max(1, Math.min(10_000, Number.parseInt(s("page") ?? "1", 10) || 1));

  const supabase = await createClient();
  let query = supabase
    .from("audit_logs")
    .select("id, at, actor_name, action, entity, entity_id, reason, before, after", { count: "exact" })
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (group) query = query.like("action", `${group}.%`);
  if (from) query = query.gte("at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("at", `${to}T23:59:59.999+07:00`);
  if (actor) query = query.ilike("actor_name", `%${actor}%`);
  if (q) {
    const actions = actionsMatching(q).slice(0, 60);
    const ors = [`reason.ilike.%${q}%`, `after->>doc_number.ilike.%${q}%`, `before->>doc_number.ilike.%${q}%`, `after->>name.ilike.%${q}%`];
    if (actions.length) ors.push(`action.in.(${actions.join(",")})`);
    query = query.or(ors.join(","));
  }
  const { data, count, error } = await query;
  const advanced = Boolean(group || from || to);
  const filtered = Boolean(advanced || q || actor);
  const href = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q, pelaku: actor, jenis: group, dari: from, sampai: to })) if (v) p.set(k, v);
    p.set("page", String(n));
    return `/audit?${p}`;
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">Log audit</h1>
        <p className="text-sm text-text-muted">Setiap aksi tulis tercatat: pelaku, waktu, objek, serta alasan atau perubahan (sebelum → sesudah). Log tidak bisa diubah atau dihapus.</p>
      </div>

      <form method="get" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <input type="search" name="q" defaultValue={q} placeholder="Cari aksi, nomor dokumen, alasan" aria-label="Cari aksi, nomor dokumen, alasan" className={`${inputCls} sm:w-80`} />
          <input type="search" name="pelaku" defaultValue={actor} placeholder="Semua pelaku" aria-label="Nama pelaku" className={`${inputCls} sm:w-60`} />
          <button type="submit" className="h-10 rounded-lg border border-border bg-surface px-4 text-sm font-medium hover:bg-surface-muted">
            Cari
          </button>
          {filtered && (
            <Link href="/audit" className="inline-flex h-10 items-center rounded-lg px-3 text-sm text-text-muted hover:bg-surface-muted">
              Reset
            </Link>
          )}
          <span className="text-xs text-text-subtle tabular-nums">{new Intl.NumberFormat("id-ID").format(count ?? 0)} catatan</span>
        </div>
        <details open={advanced} className="text-sm">
          <summary className="w-fit cursor-pointer select-none text-text-muted">Filter lain</summary>
          <div className="mt-2 flex flex-wrap items-end gap-2.5">
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Jenis
              <select name="jenis" defaultValue={group ?? ""} className={`${inputCls} sm:w-52`}>
                <option value="">Semua</option>
                {AUDIT_GROUPS.map(([g, l]) => (
                  <option key={g} value={g}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Dari
              <input type="date" name="dari" defaultValue={from ?? ""} className={inputCls} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">
              Sampai
              <input type="date" name="sampai" defaultValue={to ?? ""} className={inputCls} />
            </label>
          </div>
        </details>
      </form>

      {error ? (
        <EmptyState title="Log audit tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title={filtered ? "Tidak ada catatan yang cocok" : "Belum ada catatan"}>{filtered ? "Ubah kata kunci, nama pelaku, jenis, atau tanggal." : undefined}</EmptyState>
      ) : (
        <>
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-surface-muted text-xs text-text-muted">
                    <th className="py-2.5 pl-5 pr-3 text-left font-medium">Waktu</th>
                    <th className="px-3 py-2.5 text-left font-medium">Pelaku</th>
                    <th className="px-3 py-2.5 text-left font-medium">Aksi</th>
                    <th className="px-3 py-2.5 text-left font-medium">Objek</th>
                    <th className="py-2.5 pl-3 pr-5 text-left font-medium">Alasan / perubahan</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => {
                    const d = describeAudit(row);
                    const change = [d.change, d.amount && !d.change?.includes(d.amount) ? d.amount : null].filter(Boolean).join(" · ");
                    return (
                      <tr key={row.id} className="border-t border-border align-top">
                        <td className="py-3 pl-5 pr-3 whitespace-nowrap tabular-nums">{fmt.format(new Date(row.at))}</td>
                        <td className="px-3 py-3 whitespace-nowrap">{row.actor_name ?? "Sistem"}</td>
                        <td className="px-3 py-3" title={row.action}>
                          {actionLabel(row.action)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{d.object ?? "—"}</td>
                        <td className="py-3 pl-3 pr-5 text-text-muted">{change || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <Pagination page={page} pageSize={PAGE} total={count ?? 0} href={href} />
        </>
      )}
    </>
  );
}
