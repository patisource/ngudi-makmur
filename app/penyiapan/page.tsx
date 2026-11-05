import { siteUrl } from "@/lib/env";
import { ORG } from "@/lib/org";

// Halaman sementara: memeriksa penyiapan lingkungan sebelum modul aplikasi (M1 dst.) dibangun.
// Hanya menampilkan status tiap variabel (terisi / format salah) — nilainya tidak pernah ditampilkan.
type Status = "ok" | "empty" | "invalid";

const isHttpsUrl = (v: string, allowLocal = false) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || (allowLocal && u.protocol === "http:" && u.hostname === "localhost");
  } catch {
    return false;
  }
};

const check = (value: string | undefined, valid: (v: string) => boolean): Status =>
  !value ? "empty" : value !== value.trim() || !valid(value) ? "invalid" : "ok";

const CHECKS = [
  { key: "NEXT_PUBLIC_SITE_URL", label: "Alamat aplikasi", hint: "https://… (lokal boleh http://localhost:3000)", status: check(siteUrl(), (v) => isHttpsUrl(v, true)) },
  { key: "NEXT_PUBLIC_SUPABASE_URL", label: "URL proyek Supabase", hint: "https://<ref>.supabase.co", status: check(process.env.NEXT_PUBLIC_SUPABASE_URL, (v) => isHttpsUrl(v) && v.includes(".supabase.co")) },
  { key: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", label: "Kunci publik Supabase", hint: "diawali sb_publishable_ (atau kunci anon eyJ…)", status: check(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, (v) => /^(sb_publishable_|eyJ)/.test(v)) },
  { key: "SUPABASE_SECRET_KEY", label: "Kunci rahasia Supabase (server)", hint: "diawali sb_secret_ (atau service_role eyJ…)", status: check(process.env.SUPABASE_SECRET_KEY, (v) => /^(sb_secret_|eyJ)/.test(v)) },
];

const LABEL: Record<Status, string> = { ok: "Terisi", empty: "Belum diisi", invalid: "Format salah" };
const TONE: Record<Status, string> = { ok: "text-accent", empty: "text-warning", invalid: "text-warning" };

export default function Home() {
  const done = CHECKS.filter((c) => c.status === "ok").length;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-text-muted">{ORG.appName}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Penyiapan proyek</h1>
        <p className="text-sm text-text-muted">
          {done === CHECKS.length
            ? "Semua variabel lingkungan sudah benar. Lanjut ke Task M1 (autentikasi & peran)."
            : "Perbaiki variabel yang belum diisi atau formatnya salah (.env.local di laptop, Environment Variables di Vercel), lalu jalankan ulang."}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
        {CHECKS.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-4 px-5 py-3.5">
            <div className="min-w-0">
              <div className="text-sm font-medium">{c.label}</div>
              <code className="font-mono text-xs text-text-muted">{c.key}</code>
              {c.status === "invalid" && <div className="text-xs text-warning">Harus {c.hint}; tanpa spasi atau tanda kutip.</div>}
            </div>
            <span className={`shrink-0 text-sm font-medium ${TONE[c.status]}`}>{LABEL[c.status]}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
