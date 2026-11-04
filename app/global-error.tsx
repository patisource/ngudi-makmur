"use client";

import "./globals.css";

// Galat di root layout (jarang). Menggantikan seluruh dokumen, jadi html/body & gaya dimuat sendiri.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="id">
      <body className="bg-bg text-text">
        <title>Galat · SIM Ngudi Makmur</title>
        <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-4 px-6">
          <h1 className="text-2xl font-semibold tracking-tight">Aplikasi gagal dimuat</h1>
          <p className="text-text-muted">Terjadi galat tak terduga. Data Anda tidak berubah. Muat ulang halaman; bila terus terjadi, hubungi admin teknis.</p>
          <button type="button" onClick={() => retry()} className="h-10 w-fit rounded-md bg-primary px-4 text-sm font-medium text-primary-fg">
            Muat ulang
          </button>
        </main>
      </body>
    </html>
  );
}
