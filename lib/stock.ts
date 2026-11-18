// Label & nada badge pengajuan koreksi stok (StyleGuide §2.3). Dipakai server & klien.
import type { CorrectionStatus } from "@/lib/supabase/types";

export const CORRECTION_LABEL: Record<CorrectionStatus, string> = { pending: "Menunggu ketua", approved: "Disetujui", rejected: "Ditolak" };
export const CORRECTION_TONE: Record<CorrectionStatus, "neutral" | "ok" | "warn" | "err"> = { pending: "warn", approved: "ok", rejected: "err" };
