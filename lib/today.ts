// Tanggal bisnis hari ini di Asia/Jakarta (YYYY-MM-DD). Modul tanpa dependensi agar komponen klien tidak ikut
// membawa Zod ke bundel peramban (audit Lighthouse T9.5); lib/validation/common mengekspor ulang untuk server.
export const todayWib = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
