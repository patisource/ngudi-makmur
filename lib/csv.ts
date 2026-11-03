// Ekspor CSV (FR-RPT-05): UTF-8 dengan BOM, pemisah ";" agar terbaca Excel berlokal Indonesia, desimal koma.
// Nilai dikirim mentah (rupiah bulat tanpa "Rp", kg tanpa satuan) supaya bisa dijumlah di Excel.

export type ColumnType = "text" | "date" | "kg" | "rp" | "pct" | "int";
export type Column = { key: string; label: string; type: ColumnType };
export type Cell = string | number | null | undefined;

const kgCsv = (v: number) => String(Math.round(v * 1000) / 1000).replace(".", ",");

export function csvCell(type: ColumnType, v: Cell): string {
  if (v === null || v === undefined || v === "") return "";
  let s: string;
  if (typeof v === "number") s = type === "kg" || type === "pct" ? kgCsv(v) : String(Math.round(v));
  else s = String(v);
  // Cegah injeksi formula Excel (=, +, -, @ di awal teks) — Security.md §9; angka dibiarkan.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: Column[], rows: Array<Record<string, Cell>>): string {
  const head = columns.map((c) => csvCell("text", c.label)).join(";");
  const body = rows.map((r) => columns.map((c) => csvCell(c.type, r[c.key])).join(";"));
  return "﻿" + [head, ...body].join("\r\n") + "\r\n";
}
