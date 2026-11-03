"use server";

import { z } from "zod";
import { requireAction } from "@/lib/auth/session";
import { mapDbError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";

// Catat satu cetakan nota/kuitansi (FR-RPT-03): hanya menambah print_logs — tidak menyentuh stok, kas, atau status.
export async function logPrint(docType: "order" | "payment", docId: string): Promise<{ ok?: boolean; n?: number; error?: string }> {
  await requireAction("penjualan.kelola");
  if (!z.uuid().safeParse(docId).success || (docType !== "order" && docType !== "payment")) return { error: "Data tidak valid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("log_print", { p_doc_type: docType, p_doc_id: docId });
  if (error) return { error: mapDbError(error).message };
  return { ok: true, n: data };
}
