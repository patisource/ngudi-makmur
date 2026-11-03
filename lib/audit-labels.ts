// Label aksi log audit (Security.md §10) dalam bahasa petugas. Dipakai halaman Log audit & aktivitas terbaru dashboard.
const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Masuk",
  "auth.logout": "Keluar",
  "auth.password_changed": "Ganti kata sandi",
  "user.created": "Buat akun",
  "user.roles_changed": "Ubah peran",
  "user.permission_changed": "Ubah izin",
  "user.activated": "Aktifkan akun",
  "user.deactivated": "Nonaktifkan akun",
  "user.password_reset": "Atur ulang kata sandi",
  "receipt.draft_created": "Draft jagung masuk",
  "receipt.draft_updated": "Ubah draft jagung masuk",
  "receipt.draft_deleted": "Hapus draft jagung masuk",
  "receipt.confirmed": "Konfirmasi jagung masuk",
  "receipt.voided": "Batalkan jagung masuk",
  "attachment.added": "Unggah bukti",
  "attachment.removed": "Hapus bukti",
  "production.draft_created": "Draft batch produksi",
  "production.draft_updated": "Ubah draft batch",
  "production.draft_deleted": "Hapus draft batch",
  "production.confirmed": "Konfirmasi batch",
  "production.void_requested": "Ajukan pembatalan batch",
  "production.void_approved": "Setujui pembatalan batch",
  "production.void_rejected": "Tolak pembatalan batch",
  "order.draft_created": "Draft pesanan",
  "order.draft_updated": "Ubah draft pesanan",
  "order.draft_deleted": "Hapus draft pesanan",
  "order.confirmed": "Konfirmasi pesanan",
  "order.cancelled": "Batalkan pesanan",
  "order.delivered": "Serah barang",
  "return.draft_created": "Catat retur",
  "return.draft_deleted": "Hapus draft retur",
  "return.verified": "Verifikasi retur",
  "payment.recorded": "Catat pembayaran",
  "payment.verified": "Verifikasi pembayaran",
  "payment.rejected": "Tolak pembayaran",
  "refund.created": "Refund",
  "expense.created": "Pengeluaran",
  "other_income.created": "Pemasukan lain",
  "cash.opening_set": "Saldo awal kas",
  "cash_transfer.created": "Transfer antar akun",
  "cash_correction.requested": "Ajukan koreksi kas",
  "cash_correction.approved": "Setujui koreksi kas",
  "cash_correction.rejected": "Tolak koreksi kas",
  "stock_adjustment.requested": "Ajukan koreksi stok",
  "stock_adjustment.approved": "Setujui koreksi stok",
  "stock_adjustment.rejected": "Tolak koreksi stok",
  "opname.created": "Buat stok opname",
  "opname.posted": "Posting stok opname",
};

// Aksi master data: "<tabel>.<kata kerja>" dari trigger audit_master_row.
const ENTITY_LABEL: Record<string, string> = {
  members: "anggota",
  products: "produk",
  packagings: "jenis kemasan",
  product_packagings: "konversi kemasan",
  customers: "pelanggan",
  sales_channels: "saluran",
};
const VERB_LABEL: Record<string, string> = { created: "Tambah", updated: "Ubah", archived: "Arsipkan", restored: "Pulihkan" };

export function actionLabel(a: string): string {
  if (ACTION_LABEL[a]) return ACTION_LABEL[a];
  const [entity, verb] = a.split(".");
  return ENTITY_LABEL[entity] && VERB_LABEL[verb] ? `${VERB_LABEL[verb]} ${ENTITY_LABEL[entity]}` : a;
}

/** Kelompok untuk filter penampil audit. */
export const AUDIT_GROUPS: Array<[string, string]> = [
  ["auth", "Masuk/keluar"],
  ["user", "Akun & izin"],
  ["receipt", "Jagung masuk"],
  ["production", "Produksi"],
  ["order", "Pesanan"],
  ["return", "Retur"],
  ["payment", "Pembayaran"],
  ["refund", "Refund"],
  ["expense", "Pengeluaran"],
  ["other_income", "Pemasukan lain"],
  ["cash", "Kas"],
  ["cash_transfer", "Transfer antar akun"],
  ["cash_correction", "Koreksi kas"],
  ["stock_adjustment", "Koreksi stok"],
  ["opname", "Stok opname"],
];

// ---------------------------------------------------------------- ringkasan baris audit (desain 01/07/08)
type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);
const rp = (v: number) => `${v < 0 ? "−" : ""}Rp${new Intl.NumberFormat("id-ID").format(Math.abs(v))}`;
const kg = (v: number) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(v)} kg`;

export type AuditIcon = "cart" | "wallet" | "inbox" | "factory" | "box" | "user" | "cash" | "history";
const ICON_BY_PREFIX: Record<string, AuditIcon> = {
  order: "cart",
  return: "cart",
  payment: "wallet",
  refund: "wallet",
  receipt: "inbox",
  attachment: "inbox",
  production: "factory",
  stock_adjustment: "box",
  opname: "box",
  expense: "cash",
  other_income: "cash",
  cash: "cash",
  cash_correction: "cash",
  cash_transfer: "cash",
  user: "user",
  auth: "user",
};

const OUT_ACTIONS = new Set(["expense.created", "refund.created"]);

/**
 * Ringkas satu baris audit untuk ditampilkan: objek (nomor dokumen / nama), perubahan atau alasan, dan nominal.
 * Hanya membaca field umum dari nilai sebelum/sesudah; tidak menampilkan data sensitif (NIK/HP tidak pernah ada di sini).
 */
export function describeAudit(row: { action: string; before?: unknown; after?: unknown; reason?: string | null }) {
  const a = asObj(row.after) ?? {};
  const b = asObj(row.before) ?? {};
  const object = str(a.doc_number) ?? str(b.doc_number) ?? str(a.name) ?? str(b.name) ?? str(a.full_name) ?? str(a.order_doc) ?? str(a.order) ?? null;
  const parts: string[] = [];
  const weight = num(a.weight_kg) ?? num(a.qty_kg);
  if (weight != null && weight > 0) parts.push(kg(weight));
  const hpp = num(a.hpp_per_kg);
  if (hpp != null && row.action === "production.confirmed") parts.push(`HPP ${rp(hpp)}/kg`);
  const loss = num(a.loss_kg);
  if (loss != null && row.action === "production.confirmed") parts.push(`susut ${kg(loss)}`);
  // Perubahan nilai sederhana (mis. harga katalog): field angka yang berbeda antara sebelum & sesudah.
  if (!parts.length && asObj(row.before) && asObj(row.after)) {
    for (const k of ["default_price_per_kg", "default_price", "content_kg", "min_stock_kg"]) {
      const x = num(b[k]);
      const y = num(a[k]);
      if (x != null && y != null && x !== y) parts.push(k.includes("price") ? `${rp(x)} → ${rp(y)}` : `${x} → ${y}`);
    }
  }
  const rawAmount = num(a.total_rp) ?? num(a.amount_rp);
  const amount = rawAmount == null ? null : OUT_ACTIONS.has(row.action) ? -rawAmount : rawAmount;
  return {
    object,
    change: [row.reason ?? null, ...parts].filter(Boolean).join(" · ") || null,
    amount: amount == null ? (hpp != null && row.action === "production.confirmed" ? `HPP ${rp(hpp)}/kg` : null) : rp(amount),
    icon: ICON_BY_PREFIX[row.action.split(".")[0]] ?? ("history" as AuditIcon),
  };
}

/** Kode aksi yang labelnya memuat kata kunci (pencarian log audit, desain 08). */
export function actionsMatching(q: string): string[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const direct = Object.entries(ACTION_LABEL)
    .filter(([code, label]) => label.toLowerCase().includes(s) || code.includes(s))
    .map(([code]) => code);
  const master = Object.keys(ENTITY_LABEL).flatMap((e) => Object.keys(VERB_LABEL).map((v) => `${e}.${v}`)).filter((code) => actionLabel(code).toLowerCase().includes(s));
  return [...direct, ...master];
}
