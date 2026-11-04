import { Skeleton, SkeletonArea } from "@/components/ui/skeleton";

// Kerangka halaman saat pindah menu (StyleGuide §5.2: setiap halaman punya state loading). Bentuknya mengikuti pola
// umum halaman: judul + aksi, kartu ringkasan, lalu tabel.
export default function Loading() {
  return (
    <SkeletonArea label="Memuat halaman" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-10 w-36" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5">
        <Skeleton className="h-4 w-40" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </SkeletonArea>
  );
}
