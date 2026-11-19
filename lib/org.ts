// Profil kelompok untuk halaman login & splash (StyleGuide §8.1: ringkasan nyata yang tidak sensitif).
// Satu tempat agar mudah diganti tanpa menyentuh komponen. Isi mengikuti desain Figma (layar 00 & 04);
// (chip komoditas & jam gudang di login dihapus atas permintaan pengguna 19 Nov 2026).
export const ORG = {
  /** Nama sistem (judul aplikasi, tab browser, sidebar, login). Permintaan pengguna 5 Nov 2026. */
  appName: "Sistem Pengelolaan Jagung Desa Baturejo",
  shortName: "Ngudi Makmur",
  /** Judul besar welcome splash (permintaan pengguna 19 Nov 2026). */
  splashTitle: "Sistem Pengelolaan Jagung",
  fullName: "Kelompok Tani Ngudi Makmur",
  address: "Desa Baturejo, Kec. Sukolilo, Kab. Pati, Jawa Tengah",
  /** Subjudul splash — tanpa "Kelompok Tani" (permintaan pengguna 19 Nov 2026). */
  splashSubtitle: "Desa Baturejo, Sukolilo, Pati",
  appVersion: "v1.0",
  /** Kredit pembuat di kaki halaman login (permintaan pengguna 19 Nov 2026). */
  credit: "Tim KKN Aksara 2026 Unisvet Kelompok Pengelolaan Sistem Dashboard Kelompok Tani & IRT Baturejo Sukolilo Pati",
} as const;
