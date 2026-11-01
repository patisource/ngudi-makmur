// Halaman sementara: memeriksa penyiapan lingkungan sebelum modul aplikasi (M1 dst.) dibangun.
// Hanya menampilkan apakah variabel terisi — nilainya tidak pernah ditampilkan.
const CHECKS = [
  { key: "NEXT_PUBLIC_SITE_URL", label: "Alamat aplikasi", set: Boolean(process.env.NEXT_PUBLIC_SITE_URL) },
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "URL proyek Supabase", set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) },
  { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", label: "Kunci publik Supabase", set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) },
  { key: "SUPABASE_SECRET_KEY", label: "Kunci rahasia Supabase (server)", set: Boolean(process.env.SUPABASE_SECRET_KEY) },
];

export default function Home() {
  const done = CHECKS.filter((c) => c.set).length;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-text-muted">SIM Kelompok Tani Ngudi Makmur</p>
        <h1 className="text-2xl font-semibold tracking-tight">Penyiapan proyek</h1>
        <p className="text-sm text-text-muted">
          {done === CHECKS.length
            ? "Semua variabel lingkungan sudah terisi. Lanjut ke Task M1 (autentikasi & peran)."
            : "Isi .env.local (salinan dari .env.example), lalu jalankan ulang pnpm dev."}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {CHECKS.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">{c.label}</div>
              <code className="font-mono text-xs text-text-muted">{c.key}</code>
            </div>
            <span className={`shrink-0 text-sm font-medium ${c.set ? "text-accent" : "text-warning"}`}>
              {c.set ? "Terisi" : "Belum diisi"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
