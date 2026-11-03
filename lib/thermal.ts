// Susunan baris struk thermal (StyleGuide §8.4): satu daftar baris dipakai pratinjau, cetak via driver, dan
// (nanti) byte ESC/POS. Hanya ASCII; baris kiri–kanan diratakan dengan spasi ke jumlah kolom kertas.

export type PaperCols = 48 | 32; // 80 mm | 58 mm (Font A)
export type ThermalLine = { text: string; align?: "left" | "center" | "right"; bold?: boolean; big?: boolean };

const MAP: Record<string, string> = { "·": "-", "•": "-", "–": "-", "—": "-", "−": "-", "×": "x", "→": ">", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "..." };

/** Transliterasi ke ASCII cetak: simbol umum dipetakan, huruf beraksen → huruf dasar, sisanya → "?". */
export function toAscii(s: string): string {
  // per titik kode (bukan unit UTF-16) agar satu emoji menjadi satu "?"
  return Array.from(s)
    .map((c) => {
      const base = MAP[c] ?? c.normalize("NFD").replace(/[̀-ͯ]/g, "");
      return /^[\x20-\x7e]*$/.test(base) ? base : "?";
    })
    .join("");
}

const fit = (s: string, width: number) => (width <= 0 ? "" : s.length <= width ? s : `${s.slice(0, width - 1)}.`);

export const sep = (cols: PaperCols): ThermalLine => ({ text: "-".repeat(cols) });

/** Label kiri, nilai kanan, tepat selebar kolom. Nilai menyisakan tempat untuk label (≤ 8 karakter) + satu spasi. */
export function lr(label: string, value: string, cols: PaperCols, bold = false): ThermalLine {
  const labelText = toAscii(label);
  const v = fit(toAscii(value), cols - Math.min(labelText.length, 8) - 1);
  const l = fit(labelText, cols - v.length - 1);
  return { text: l + " ".repeat(cols - l.length - v.length) + v, bold };
}

export const center = (s: string, opts: Omit<ThermalLine, "text" | "align"> = {}): ThermalLine => ({ text: toAscii(s), align: "center", ...opts });

/** Teks panjang dipecah per kata ke lebar kolom. */
export function wrap(s: string, cols: PaperCols): ThermalLine[] {
  const out: string[] = [];
  let cur = "";
  for (const word of toAscii(s).split(/\s+/).filter(Boolean)) {
    const w = fit(word, cols);
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= cols) cur += ` ${w}`;
    else {
      out.push(cur);
      cur = w;
    }
  }
  if (cur) out.push(cur);
  return out.map((text) => ({ text }));
}

export const HEADER_LINES = (cols: PaperCols): ThermalLine[] => [
  center("NGUDI MAKMUR", { bold: true, big: true }),
  center("Kelompok Tani - Desa Baturejo"),
  center("Kec. Sukolilo, Kab. Pati"),
  sep(cols),
];

/**
 * Byte ESC/POS (StyleGuide §8.4 jalur B): ESC @ (init) → ESC t 0 (PC437) → per baris ESC a n (rata), ESC E n (tebal),
 * GS ! 0x11/0 (ukuran ganda/normal), teks ASCII, LF → akhir: ESC d 4 (feed 4) lalu GS V 66 0 (potong).
 */
export function escposBytes(lines: ThermalLine[]): Uint8Array {
  const ESC = 0x1b;
  const GS = 0x1d;
  const out: number[] = [ESC, 0x40, ESC, 0x74, 0x00];
  for (const l of lines) {
    out.push(ESC, 0x61, l.align === "center" ? 1 : l.align === "right" ? 2 : 0, ESC, 0x45, l.bold ? 1 : 0, GS, 0x21, l.big ? 0x11 : 0x00);
    for (const ch of toAscii(l.text)) out.push(ch.charCodeAt(0));
    out.push(0x0a);
  }
  out.push(ESC, 0x61, 0, GS, 0x21, 0, ESC, 0x64, 4, GS, 0x56, 66, 0);
  return new Uint8Array(out);
}
