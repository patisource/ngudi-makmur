import type { HTMLAttributes } from "react";

// Blok skeleton (StyleGuide §6.3). Bungkus satu area pemuatan dengan <SkeletonArea> agar tampil hanya setelah 300 ms.
export function Skeleton({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={`skeleton ${className}`} {...rest} />;
}

export function SkeletonArea({ label = "Memuat", className = "", children }: { label?: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={`skel-wait ${className}`}>
      {children}
    </div>
  );
}
