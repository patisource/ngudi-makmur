// Unggah bukti dari peramban (Security.md §8). Foto di-encode ulang lewat kanvas → JPEG tanpa EXIF/GPS dan
// lebih kecil; PDF dikirim apa adanya. Setelah unggah, server memverifikasi isi file sebelum mencatatnya.
import { registerProof } from "@/features/receipts/actions";
import { PROOF_MAX_BYTES, proofPath } from "@/lib/files";
import type { ProofMime } from "@/lib/supabase/types";
import { todayWib } from "@/lib/today";

export const PROOF_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
const MAX_SIDE = 2000;

async function reencode(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) throw new Error("Foto tidak dapat diproses");
  return blob;
}

/** Siapkan file bukti: foto → JPEG tanpa EXIF, PDF apa adanya; cek ukuran. */
// supabase-js (±250 KB) hanya dimuat saat benar-benar mengunggah, bukan saat halaman dibuka (T9.5).
const browserClient = async () => (await import("@/lib/supabase/client")).createClient();

export async function prepareProof(file: File): Promise<{ blob: Blob; mime: ProofMime } | { error: string }> {
  let blob: Blob;
  let mime: ProofMime;
  try {
    if (file.type === "application/pdf") {
      blob = file;
      mime = "application/pdf";
    } else if (file.type.startsWith("image/")) {
      blob = await reencode(file);
      mime = "image/jpeg";
    } else {
      return { error: "Bukti harus foto (JPG, PNG, WebP) atau PDF." };
    }
  } catch {
    return { error: "Foto tidak dapat dibaca. Coba format JPG atau PNG." };
  }
  if (blob.size > PROOF_MAX_BYTES) return { error: "Ukuran bukti maksimal 5 MB." };
  return { blob, mime };
}

/** Siapkan & unggah satu bukti untuk penerimaan draft. Mengembalikan pesan galat, atau null bila berhasil. */
export async function uploadReceiptProof(receiptId: string, file: File): Promise<string | null> {
  const prepared = await prepareProof(file);
  if ("error" in prepared) return prepared.error;
  const { blob, mime } = prepared;

  const path = proofPath("receipts", todayWib(), crypto.randomUUID(), mime);
  const { error } = await (await browserClient()).storage.from("proofs").upload(path, blob, { contentType: mime, upsert: false });
  if (error) return "Bukti gagal diunggah. Periksa koneksi lalu coba lagi.";
  const res = await registerProof(receiptId, path);
  return res.error ?? null;
}
