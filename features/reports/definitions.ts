import "server-only";
import type { Cell, Column } from "@/lib/csv";
import { formatRupiah } from "@/lib/money";
import type { Period } from "@/lib/period";
import { dbKgToGrams, formatKg } from "@/lib/qty";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/supabase/types";

// Registri laporan (FR-RPT-04/05/06): satu sumber untuk halaman /laporan dan ekspor CSV, jadi angka di layar = di CSV.
// Hak akses mengikuti PRD §3.1 (operator produksi: produksi & stok saja) dan diulang RLS di database.
// Ringkasan dihitung dari baris yang sama (rekap = detail, FR-RPT-08); berat dijumlah dalam gram bulat.

export type ReportData = { columns: Column[]; rows: Array<Record<string, Cell>>; summary: Array<[string, string]>; note?: string };
type Def = { label: string; roles: readonly AppRole[]; usesPeriod: boolean; load: (p: Period) => Promise<ReportData> };

const ALL: readonly AppRole[] = ["admin_kelompok", "operator_produksi", "ketua"];
const FINANCE: readonly AppRole[] = ["admin_kelompok", "ketua"];
const PAGE = 1000;

/** Ambil semua baris (PostgREST membatasi 1000 per permintaan). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < 100; i++) {
    const { data, error } = await page(i * PAGE, (i + 1) * PAGE - 1);
    if (error) throw new Error("Laporan tidak dapat dimuat");
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const g = (v: number | null | undefined) => dbKgToGrams(v ?? 0);
const sumBy = <T>(rows: T[], key: (r: T) => string, val: (r: T) => number) => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + val(r));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const pct = (part: number, whole: number) => (whole > 0 ? `${String(Math.round((part / whole) * 1000) / 10).replace(".", ",")}%` : "—");

export const REPORTS = {
  penjualan: {
    label: "Penjualan & omzet",
    roles: FINANCE,
    usesPeriod: true,
    async load(p) {
      const supabase = await createClient();
      const rows = await fetchAll((a, b) => supabase.rpc("rpt_sales", { p_from: p.from, p_to: p.to }).order("business_date").order("doc_number").range(a, b));
      const omzet = rows.reduce((s, r) => s + r.value_rp, 0);
      const goods = rows.filter((r) => r.kind !== "ongkir");
      const soldG = goods.reduce((s, r) => s + g(r.qty_kg), 0);
      const rawG = goods.filter((r) => r.category === "mentah").reduce((s, r) => s + g(r.qty_kg), 0);
      const digital = rows.filter((r) => r.is_digital).reduce((s, r) => s + r.value_rp, 0);
      const returns = -rows.filter((r) => r.kind === "retur").reduce((s, r) => s + r.value_rp, 0);
      return {
        columns: [
          { key: "date", label: "Tanggal", type: "date" },
          { key: "kind", label: "Jenis", type: "text" },
          { key: "doc", label: "Nomor", type: "text" },
          { key: "customer", label: "Pelanggan", type: "text" },
          { key: "channel", label: "Saluran", type: "text" },
          { key: "product", label: "Produk", type: "text" },
          { key: "kg", label: "Berat (kg)", type: "kg" },
          { key: "value", label: "Nilai (Rp)", type: "rp" },
        ],
        rows: rows.map((r) => ({ date: r.business_date, kind: r.kind, doc: r.doc_number, customer: r.customer_name, channel: r.channel_name, product: r.product_name, kg: r.kind === "ongkir" ? null : r.qty_kg, value: r.value_rp })),
        summary: [
          ["Omzet (diserahkan − retur, termasuk ongkir)", formatRupiah(omzet)],
          ["Retur sah", formatRupiah(returns)],
          ["Terjual bersih", formatKg(soldG)],
          ["Porsi jagung mentah (kg)", pct(rawG, soldG)],
          ["Penjualan digital (nilai)", pct(digital, omzet)],
          ...sumBy(goods, (r) => `Produk: ${r.product_name}`, (r) => r.value_rp).map(([k, v]) => [k, formatRupiah(v)] as [string, string]),
          ...sumBy(rows, (r) => `Saluran: ${r.channel_name}`, (r) => r.value_rp).map(([k, v]) => [k, formatRupiah(v)] as [string, string]),
        ],
        note: "Tanggal penjualan = tanggal serah barang; retur memakai tanggal retur dan bernilai negatif.",
      };
    },
  },
  "jagung-masuk": {
    label: "Jagung masuk",
    roles: FINANCE,
    usesPeriod: true,
    async load(p) {
      const supabase = await createClient();
      const rows = await fetchAll((a, b) =>
        supabase
          .from("receipts")
          .select("doc_number, business_date, source_type, supplier_name, weight_kg, acquisition_cost, members(name, code), products(name, code)")
          .eq("status", "confirmed")
          .gte("business_date", p.from)
          .lte("business_date", p.to)
          .order("business_date")
          .order("doc_number")
          .range(a, b),
      );
      const totalG = rows.reduce((s, r) => s + g(r.weight_kg), 0);
      const totalRp = rows.reduce((s, r) => s + r.acquisition_cost, 0);
      return {
        columns: [
          { key: "date", label: "Tanggal", type: "date" },
          { key: "doc", label: "Nomor", type: "text" },
          { key: "source", label: "Sumber", type: "text" },
          { key: "from", label: "Anggota/pemasok", type: "text" },
          { key: "product", label: "Jenis", type: "text" },
          { key: "kg", label: "Berat (kg)", type: "kg" },
          { key: "cost", label: "Biaya perolehan (Rp)", type: "rp" },
        ],
        rows: rows.map((r) => ({
          date: r.business_date,
          doc: r.doc_number,
          source: r.source_type === "anggota" ? "Anggota" : "Luar",
          from: r.source_type === "anggota" ? (r.members?.name ?? "") : (r.supplier_name ?? ""),
          product: r.products?.name ?? "",
          kg: r.weight_kg,
          cost: r.acquisition_cost,
        })),
        summary: [
          ["Total berat", formatKg(totalG)],
          ["Total biaya perolehan", formatRupiah(totalRp)],
          ["Rata-rata biaya per kg", totalG > 0 ? formatRupiah(Math.round((totalRp * 1000) / totalG)) : "—"],
          ...sumBy(rows, (r) => `Sumber: ${r.source_type === "anggota" ? "anggota" : "luar"}`, (r) => g(r.weight_kg)).map(([k, v]) => [k, formatKg(v)] as [string, string]),
          ...sumBy(rows, (r) => `Jenis: ${r.products?.name ?? "-"}`, (r) => g(r.weight_kg)).map(([k, v]) => [k, formatKg(v)] as [string, string]),
        ],
        note: "Hanya penerimaan terkonfirmasi; yang dibatalkan tidak dihitung. Biaya perolehan menjadi nilai bahan HPP.",
      };
    },
  },
  produksi: {
    label: "Produksi & HPP",
    roles: ALL,
    usesPeriod: true,
    async load(p) {
      const supabase = await createClient();
      const rows = await fetchAll((a, b) =>
        supabase
          .from("production_batches")
          .select("doc_number, business_date, batch_type, input_kg, output_kg, loss_kg, total_cost, hpp_per_kg, operator_name, batch_type_rules(name)")
          .in("status", ["confirmed", "pending_void"])
          .gte("business_date", p.from)
          .lte("business_date", p.to)
          .order("business_date")
          .order("doc_number")
          .range(a, b),
      );
      const inG = rows.reduce((s, r) => s + g(r.input_kg), 0);
      const outG = rows.reduce((s, r) => s + g(r.output_kg), 0);
      const lossG = rows.reduce((s, r) => s + g(r.loss_kg), 0);
      const cost = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0);
      return {
        columns: [
          { key: "date", label: "Tanggal", type: "date" },
          { key: "doc", label: "Nomor", type: "text" },
          { key: "type", label: "Jenis", type: "text" },
          { key: "input", label: "Input (kg)", type: "kg" },
          { key: "output", label: "Output (kg)", type: "kg" },
          { key: "loss", label: "Sisa/susut (kg)", type: "kg" },
          { key: "cost", label: "Total biaya (Rp)", type: "rp" },
          { key: "hpp", label: "HPP/kg (Rp)", type: "rp" },
          { key: "operator", label: "Operator", type: "text" },
        ],
        rows: rows.map((r) => ({ date: r.business_date, doc: r.doc_number, type: r.batch_type_rules?.name ?? r.batch_type, input: r.input_kg, output: r.output_kg, loss: r.loss_kg, cost: r.total_cost, hpp: r.hpp_per_kg, operator: r.operator_name })),
        summary: [
          ["Jumlah batch", String(rows.length)],
          ["Total input", formatKg(inG)],
          ["Total output", formatKg(outG)],
          ["Sisa/susut", `${formatKg(lossG)} · ${pct(lossG, inG)}`],
          ["Total biaya", formatRupiah(cost)],
          ...sumBy(rows, (r) => `Output ${r.batch_type_rules?.name ?? r.batch_type}`, (r) => g(r.output_kg)).map(([k, v]) => [k, formatKg(v)] as [string, string]),
        ],
        note: "HPP = (bahan + BBM + tenaga + kemasan & lain + biaya tetap bulanan) ÷ output layak jual; batch yang dibatalkan tidak dihitung. Rincian per komponen: laporan Rincian HPP.",
      };
    },
  },
  stok: {
    label: "Stok & mutasi",
    roles: ALL,
    usesPeriod: true,
    async load(p) {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("rpt_stock", { p_from: p.from, p_to: p.to });
      if (error) throw new Error("Laporan tidak dapat dimuat");
      const rows = data ?? [];
      return {
        columns: [
          { key: "code", label: "Kode", type: "text" },
          { key: "name", label: "Produk", type: "text" },
          { key: "opening", label: "Awal (kg)", type: "kg" },
          { key: "in", label: "Masuk (kg)", type: "kg" },
          { key: "out", label: "Keluar (kg)", type: "kg" },
          { key: "closing", label: "Akhir (kg)", type: "kg" },
          { key: "reserved", label: "Reservasi kini (kg)", type: "kg" },
          { key: "available", label: "Tersedia kini (kg)", type: "kg" },
          { key: "value", label: "Nilai persediaan kini (Rp)", type: "rp" },
        ],
        rows: rows.map((r) => ({ code: r.code, name: r.name, opening: r.opening_kg, in: r.in_kg, out: r.out_kg, closing: r.closing_kg, reserved: r.reserved_kg, available: r.available_kg, value: r.value_rp })),
        summary: [
          ["Nilai persediaan kini", formatRupiah(rows.reduce((s, r) => s + r.value_rp, 0))],
          ["Produk di bawah stok minimum", String(rows.filter((r) => r.below_min).length)],
        ],
        note: "Awal/masuk/keluar/akhir dari buku mutasi pada periode; reservasi, tersedia, dan nilai adalah posisi saat ini.",
      };
    },
  },
  hpp: {
    label: "Rincian HPP",
    roles: ALL,
    usesPeriod: true,
    async load(p) {
      const supabase = await createClient();
      const rows = await fetchAll((a, b) =>
        supabase
          .from("production_batches")
          .select("doc_number, business_date, batch_type, input_kg, output_kg, material_cost, other_cost, fixed_cost_rp, total_cost, hpp_per_kg, batch_type_rules(name), batch_costs(category, amount_rp)")
          .in("status", ["confirmed", "pending_void"])
          .gte("business_date", p.from)
          .lte("business_date", p.to)
          .order("business_date")
          .order("doc_number")
          .range(a, b),
      );
      const cost = (r: (typeof rows)[number], cats: string[]) => (r.batch_costs ?? []).filter((c) => cats.includes(c.category)).reduce((s, c) => s + c.amount_rp, 0);
      const byType = new Map<string, { name: string; outG: number; inG: number; total: number }>();
      for (const r of rows) {
        const cur = byType.get(r.batch_type) ?? { name: r.batch_type_rules?.name ?? r.batch_type, outG: 0, inG: 0, total: 0 };
        cur.outG += g(r.output_kg);
        cur.inG += g(r.input_kg);
        cur.total += r.total_cost ?? 0;
        byType.set(r.batch_type, cur);
      }
      const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
      return {
        columns: [
          { key: "date", label: "Tanggal", type: "date" },
          { key: "doc", label: "Nomor", type: "text" },
          { key: "type", label: "Jenis", type: "text" },
          { key: "input", label: "Input (kg)", type: "kg" },
          { key: "output", label: "Output (kg)", type: "kg" },
          { key: "yield", label: "Rendemen", type: "text" },
          { key: "material", label: "Bahan (Rp)", type: "rp" },
          { key: "bbm", label: "BBM (Rp)", type: "rp" },
          { key: "labor", label: "Tenaga (Rp)", type: "rp" },
          { key: "other", label: "Kemasan & lain (Rp)", type: "rp" },
          { key: "fixed", label: "Biaya tetap (Rp)", type: "rp" },
          { key: "total", label: "Total (Rp)", type: "rp" },
          { key: "hpp", label: "HPP/kg (Rp)", type: "rp" },
        ],
        rows: rows.map((r) => ({
          date: r.business_date,
          doc: r.doc_number,
          type: r.batch_type_rules?.name ?? r.batch_type,
          input: r.input_kg,
          output: r.output_kg,
          yield: pct(g(r.output_kg), g(r.input_kg)),
          material: r.material_cost,
          bbm: cost(r, ["listrik_bbm"]),
          labor: cost(r, ["tenaga_kerja"]),
          other: cost(r, ["kemasan", "lain"]),
          fixed: r.fixed_cost_rp,
          total: r.total_cost,
          hpp: r.hpp_per_kg,
        })),
        summary: [
          ...[...byType.values()].map((t) => [`HPP rata-rata ${t.name}`, `${t.outG > 0 ? formatRupiah(Math.round((t.total * 1000) / t.outG)) : "—"}/kg · rendemen ${pct(t.outG, t.inG)}`] as [string, string]),
          ["Bahan", formatRupiah(sum((r) => r.material_cost ?? 0))],
          ["BBM", formatRupiah(sum((r) => cost(r, ["listrik_bbm"])))],
          ["Tenaga", formatRupiah(sum((r) => cost(r, ["tenaga_kerja"])))],
          ["Kemasan & lain", formatRupiah(sum((r) => cost(r, ["kemasan", "lain"])))],
          ["Biaya tetap bulanan", formatRupiah(sum((r) => r.fixed_cost_rp))],
          ["Total biaya", formatRupiah(sum((r) => r.total_cost ?? 0))],
        ],
        note: "HPP/kg = (bahan + BBM + tenaga + kemasan & lain + biaya tetap bulanan) ÷ output. Biaya tetap dibagi ke semua batch di bulan yang sama sebanding kg hasil, jadi HPP bulan berjalan bisa berubah saat ada batch baru.",
      };
    },
  },
} satisfies Record<string, Def>;

export type ReportType = keyof typeof REPORTS;
export const isReportType = (v: string): v is ReportType => v in REPORTS;
export const reportsFor = (roles: readonly AppRole[]) =>
  (Object.entries(REPORTS) as Array<[ReportType, Def]>).filter(([, d]) => d.roles.some((r) => roles.includes(r))).map(([type, d]) => ({ type, label: d.label }));

