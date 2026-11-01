// Gabung nama kelas, abaikan nilai kosong. Sengaja tanpa library tambahan.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
