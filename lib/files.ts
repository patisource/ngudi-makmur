// Pemeriksaan file bukti (Security.md §8): tipe dari magic bytes (bukan nama/Content-Type), ukuran, dan metadata EXIF.
// Fungsi murni tanpa API Node/peramban — dipakai server (verifikasi) dan uji unit.
import type { ProofMime } from "@/lib/supabase/types";

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_EXT: Record<ProofMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

const ascii = (b: Uint8Array, at: number, s: string) => s.split("").every((c, i) => b[at + i] === c.charCodeAt(0));

/** Tipe file dari byte awal; null bila bukan JPEG/PNG/WebP/PDF. */
export function sniffMime(b: Uint8Array): ProofMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return "image/png";
  if (b.length >= 12 && ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return "image/webp";
  if (b.length >= 5 && ascii(b, 0, "%PDF-")) return "application/pdf";
  return null;
}

/** true bila gambar masih membawa blok EXIF (bisa berisi lokasi GPS). Klien membuang EXIF lewat re-encode kanvas. */
export function hasExif(b: Uint8Array, mime: ProofMime): boolean {
  if (mime === "image/jpeg") {
    let i = 2;
    while (i + 4 <= b.length && b[i] === 0xff) {
      const marker = b[i + 1];
      if (marker === 0xda || marker === 0xd9) return false; // awal data gambar / akhir file
      const len = (b[i + 2] << 8) | b[i + 3];
      if (marker === 0xe1 && ascii(b, i + 4, "Exif")) return true;
      i += 2 + len;
    }
    return false;
  }
  if (mime === "image/png") {
    let i = 8;
    while (i + 8 <= b.length) {
      const len = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
      if (ascii(b, i + 4, "eXIf")) return true;
      if (ascii(b, i + 4, "IEND")) return false;
      i += 12 + len;
    }
    return false;
  }
  if (mime === "image/webp") {
    let i = 12;
    while (i + 8 <= b.length) {
      if (ascii(b, i, "EXIF")) return true;
      const len = b[i + 4] + (b[i + 5] << 8) + (b[i + 6] << 16) + ((b[i + 7] << 24) >>> 0);
      i += 8 + len + (len % 2);
    }
    return false;
  }
  return false;
}

/** Nama file bukti baru: {receipts|payments}/yyyy/mm/uuid.ext (tanpa nama file asli). */
export function proofPath(folder: "receipts" | "payments", dateYmd: string, uuid: string, mime: ProofMime) {
  const [y, m] = dateYmd.split("-");
  return `${folder}/${y}/${m}/${uuid}.${PROOF_EXT[mime]}`;
}
