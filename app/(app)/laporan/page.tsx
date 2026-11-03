import { redirect } from "next/navigation";
import { reportsFor } from "@/features/reports/definitions";
import { requireRole } from "@/lib/auth/session";

export default async function ReportsIndex() {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const first = reportsFor(user.roles)[0];
  redirect(first ? `/laporan/${first.type}` : "/403");
}
