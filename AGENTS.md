<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Aturan proyek (untuk semua agen: Antigravity, Claude Code, dll.)

Sebelum menulis kode, baca [CLAUDE.md](CLAUDE.md): konteks, aturan domain wajib, struktur folder, dan alur kerja. Dokumen kebutuhan ada di [docs/](docs/) (PRD, Task, StyleGuide, Security). Bila dokumen dan permintaan bertentangan, tanyakan dulu.

Catatan versi: Next.js 16 memakai `proxy.ts` (bukan `middleware.ts`); variabel `NEXT_PUBLIC_*` harus dibaca langsung sebagai `process.env.NAMA`.
