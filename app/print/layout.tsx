import { Suspense } from "react";

// Layout cetak tanpa app shell (CLAUDE.md: app/print). Sesi dibaca di halaman, jadi dibungkus <Suspense> (Cache Components).
export default function PrintLayout({ children }: LayoutProps<"/print">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-text-muted">Menyiapkan cetakan…</p>}>
      <div className="flex min-h-dvh flex-col items-center gap-4 bg-bg px-4 py-6 print:block print:bg-transparent print:p-0">{children}</div>
    </Suspense>
  );
}
