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
  ["cash_correction", "Koreksi kas"],
  ["stock_adjustment", "Koreksi stok"],
  ["opname", "Stok opname"],
];
