// Unggah bukti transfer dari peramban (Security.md §8): foto di-encode ulang → JPEG tanpa EXIF; PDF apa adanya.
// File diunggah ke payments/yyyy/mm/uuid.ext, lalu server memeriksa isi sebelum mencatatnya.
import { registerPaymentProof } from "@/features/cash/actions";
import { prepareProof } from "@/features/receipts/proof-client";
import { proofPath } from "@/lib/files";
import { todayWib } from "@/lib/today";

// supabase-js (±250 KB) hanya dimuat saat benar-benar mengunggah, bukan saat halaman dibuka (T9.5).
const browserClient = async () => (await import("@/lib/supabase/client")).createClient();

export async function uploadPaymentProof(orderId: string, paymentId: string, file: File): Promise<string | null> {
  const prepared = await prepareProof(file);
  if ("error" in prepared) return prepared.error;
  const path = proofPath("payments", todayWib(), crypto.randomUUID(), prepared.mime);
  const { error } = await (await browserClient()).storage.from("proofs").upload(path, prepared.blob, { contentType: prepared.mime, upsert: false });
  if (error) return "Bukti gagal diunggah. Periksa koneksi lalu coba lagi.";
  const res = await registerPaymentProof(orderId, paymentId, path);
  return res.error ?? null;
}
