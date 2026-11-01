import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Log audit · SIM Ngudi Makmur" };

const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Masuk",
  "auth.logout": "Keluar",
  "user.created": "Buat akun",
  "user.roles_changed": "Ubah peran",
  "user.permission_changed": "Ubah izin",
  "user.activated": "Aktifkan akun",
  "user.deactivated": "Nonaktifkan akun",
  "user.password_reset": "Atur ulang kata sandi",
};

const fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

// Log audit (Security.md §10): hanya ketua & admin_teknis; RLS di database menegakkan hal yang sama.
export default async function AuditPage() {
  await requireRole(["ketua", "admin_teknis"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, at, actor_name, action, entity, entity_id, reason, after")
    .order("at", { ascending: false })
    .limit(100);

  return (
    <>
      <PageHeader title="Log audit" description="Setiap perubahan akun dan aktivitas masuk tercatat di sini dan tidak bisa diubah atau dihapus. Menampilkan 100 catatan terbaru." />
      <Card className="overflow-hidden p-0">
        {error ? (
          <p className="p-5 text-danger">Log audit tidak dapat dimuat. Coba muat ulang halaman.</p>
        ) : !data?.length ? (
          <p className="p-5 text-text-muted">Belum ada catatan.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface-muted text-left text-xs font-medium text-text-muted">
                  <th className="px-5 py-2.5">Waktu</th>
                  <th className="px-3.5 py-2.5">Pelaku</th>
                  <th className="px-3.5 py-2.5">Aksi</th>
                  <th className="px-5 py-2.5">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-5 py-3 text-text-muted">{fmt.format(new Date(row.at))}</td>
                    <td className="px-3.5 py-3">{row.actor_name ?? "Sistem"}</td>
                    <td className="px-3.5 py-3">{ACTION_LABEL[row.action] ?? row.action}</td>
                    <td className="px-5 py-3 text-text-muted">{row.reason ?? (typeof row.after === "object" && row.after && "full_name" in row.after ? String(row.after.full_name) : "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
