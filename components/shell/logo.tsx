import Image from "next/image";
import { cn } from "@/lib/cn";

// Logo aplikasi (logogram tongkol jagung, diberikan pengguna 18 Nov 2026). Selalu versi "ubin" (public/logo-tile.svg):
// celah & tulang daun berwarna krem #F4EEE1, jadi logo diletakkan di atas ubin krem agar benar di mode terang & gelap.
// SVG statis → unoptimized (tanpa pemrosesan gambar Next). Dekoratif: nama sistem selalu tampil sebagai teks di sebelahnya.
export function Logo({ size = 36, className }: { size?: number; className?: string }) {
  return <Image src="/logo-tile.svg" alt="" aria-hidden width={size} height={size} unoptimized priority className={cn("shrink-0 select-none", className)} />;
}
