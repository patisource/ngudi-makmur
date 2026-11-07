"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formCls } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { toastResult } from "@/components/ui/toast";
import { linkIrtCustomer } from "@/features/irt/actions";

// Admin kelompok memilih pelanggan kelompok yang merupakan IRT. Tepung pesanan pelanggan ini otomatis menjadi bahan
// masuk IRT saat diserahkan (M10). Bisa dipasang ulang bila pelanggan dibuat ulang setelah data uji dibersihkan.
export function IrtCustomerLink({ irtName, current, customers }: { irtName: string; current: string | null; customers: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const res = await linkIrtCustomer(value || null);
      toastResult(res);
      if (res.ok) router.refresh();
    });
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <label htmlFor="irt-customer" className="text-label font-medium">
        Pelanggan yang merupakan {irtName}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="irt-customer" value={value} onChange={(e) => setValue(e.target.value)} className={`${formCls.select} sm:max-w-sm`}>
          <option value="">Belum dihubungkan</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button size="sm" disabled={pending || value === (current ?? "")} onClick={save}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
      <p className="text-xs text-text-subtle">Tepung dari pesanan pelanggan ini otomatis tercatat sebagai bahan masuk {irtName} saat barang diserahkan.</p>
    </div>
  );
}
