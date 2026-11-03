"use server";

import { z } from "zod";
import { canOpen } from "@/lib/auth/permissions";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

// Pencarian dokumen untuk palet perintah (StyleGuide §6.7): pesanan, jagung masuk, batch — hanya jenis yang halamannya
// boleh dibuka peran pengguna (operator tidak melihat pesanan). RLS tetap berlaku. Maks 12 hasil.
export type SearchHit = { kind: "Pesanan" | "Jagung masuk" | "Batch"; label: string; href: string; icon: "cart" | "inbox" | "factory" };

const rp = (v: number) => `Rp${new Intl.NumberFormat("id-ID").format(v)}`;
const kg = (v: number | string) => `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(v))} kg`;

export async function searchDocuments(raw: string): Promise<SearchHit[]> {
  const user = await getSessionUser();
  if (!user || !user.isActive) return [];
  const parsed = z.string().trim().max(60).safeParse(raw);
  if (!parsed.success || parsed.data.length < 2) return [];
  // Hanya huruf, angka, spasi, tanda hubung: aman untuk pola ilike (tanpa % _ , . ( ) dari pengguna).
  const term = parsed.data.replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const supabase = await createClient();
  const jobs: Array<Promise<SearchHit[]>> = [];

  if (canOpen(user.roles, "/penjualan")) {
    jobs.push(
      Promise.resolve(
        supabase.from("orders").select("id, doc_number, customer_name, total_rp, status").or(`doc_number.ilike.${like},customer_name.ilike.${like}`).order("created_at", { ascending: false }).limit(6),
      ).then(({ data }) =>
        (data ?? []).map((o) => ({ kind: "Pesanan" as const, icon: "cart" as const, href: `/penjualan/${o.id}`, label: `${o.doc_number ?? "Draft"} · ${o.customer_name} · ${rp(o.total_rp)}` })),
      ),
    );
  }
  if (canOpen(user.roles, "/jagung-masuk")) {
    jobs.push(
      Promise.resolve(
        supabase
          .from("receipts")
          .select("id, doc_number, weight_kg, supplier_name, products(name), members(name)")
          .or(`doc_number.ilike.${like},supplier_name.ilike.${like}`)
          .order("created_at", { ascending: false })
          .limit(6),
      ).then(({ data }) =>
        (data ?? []).map((r) => ({
          kind: "Jagung masuk" as const,
          icon: "inbox" as const,
          href: `/jagung-masuk/${r.id}`,
          label: `${r.doc_number ?? "Draft"} · ${r.products?.name ?? ""} ${kg(r.weight_kg)} · ${r.members?.name ?? r.supplier_name ?? ""}`,
        })),
      ),
    );
  }
  if (canOpen(user.roles, "/produksi")) {
    jobs.push(
      Promise.resolve(supabase.from("production_batches").select("id, doc_number, batch_type, hpp_per_kg").ilike("doc_number", like).order("created_at", { ascending: false }).limit(6)).then(({ data }) =>
        (data ?? []).map((b) => ({
          kind: "Batch" as const,
          icon: "factory" as const,
          href: `/produksi/${b.id}`,
          label: `${b.doc_number ?? "Draft"} · ${b.batch_type}${b.hpp_per_kg ? ` · HPP ${rp(b.hpp_per_kg)}/kg` : ""}`,
        })),
      ),
    );
  }
  return (await Promise.all(jobs)).flat().slice(0, 12);
}
