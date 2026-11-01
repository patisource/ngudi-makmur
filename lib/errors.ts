// Ubah galat database menjadi pesan untuk pengguna tanpa membocorkan detail SQL (CLAUDE.md §Keamanan).
// Fungsi database kita melempar pesan berbahasa Indonesia dengan kode berikut; itu aman ditampilkan apa adanya.
const OWN_CODES = new Set(["P0001", "P0002", "22023", "42501"]);

export type ActionError = { code: string; message: string };

export function mapDbError(e: { code?: string; message?: string } | null | undefined): ActionError {
  if (e?.code && OWN_CODES.has(e.code) && e.message) return { code: e.code, message: e.message };
  return { code: "UNKNOWN", message: "Terjadi kesalahan. Coba lagi; bila berulang, hubungi admin teknis." };
}
