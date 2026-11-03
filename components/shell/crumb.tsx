"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Label remah terakhir untuk halaman detail (mis. nomor dokumen). Halaman memasang <Crumb label="INV-…" />;
// tanpa itu topbar memakai label segmen bawaan.
const Ctx = createContext<{ label: string | null; set: (l: string | null) => void }>({ label: null, set: () => {} });

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [label, set] = useState<string | null>(null);
  return <Ctx.Provider value={{ label, set }}>{children}</Ctx.Provider>;
}

export const useCrumb = () => useContext(Ctx).label;

export function Crumb({ label }: { label: string }) {
  const { set } = useContext(Ctx);
  useEffect(() => {
    set(label);
    return () => set(null);
  }, [label, set]);
  return null;
}
