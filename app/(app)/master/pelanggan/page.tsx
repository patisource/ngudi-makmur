import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/card";
import { EmptyState, Pagination, SearchBar, Sub, Table, Td, Th } from "@/components/ui/table";
import { IrtCustomerLink } from "@/features/irt/components/link-customer";
import { irtSettings } from "@/features/irt/queries";
import { ArchiveButton } from "@/features/master/components/forms";
import { cleanQuery, listCustomers, PAGE_SIZE, parsePage, parseStatus } from "@/features/master/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pelanggan · Sistem Pengelolaan Jagung Desa Baturejo" };

const STATUSES: Array<[string, string]> = [
  ["aktif", "Aktif"],
  ["arsip", "Diarsip"],
  ["semua", "Semua"],
];
const NOTICE: Record<string, string> = { baru: "Pelanggan ditambahkan.", ubah: "Perubahan pelanggan disimpan." };

// Pelanggan (T2.5): tanpa akun; dipakai pesanan di M6. Lihat: admin_kelompok & ketua; kelola: admin_kelompok.
export default async function CustomersPage({ searchParams }: PageProps<"/master/pelanggan">) {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const canManage = canDo(user.roles, "master.kelola");
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const status = parseStatus(sp.status);
  const page = parsePage(sp.page);
  const { data, count, error } = await listCustomers({ q, status, page });
  const href = (p: number) => `/master/pelanggan?${new URLSearchParams({ ...(q && { q }), status, page: String(p) })}`;
  const notice = typeof sp.simpan === "string" ? NOTICE[sp.simpan] : undefined;
  // Hubungan pelanggan ↔ IRT (M10): hanya untuk yang boleh mengatur (admin kelompok).
  const canLinkIrt = canDo(user.roles, "irt.hubungkan");
  const [irt, active] = canLinkIrt
    ? await Promise.all([irtSettings(), createClient().then((sb) => sb.from("customers").select("id, name").is("archived_at", null).order("name"))])
    : [null, null];

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
          {notice}
        </p>
      )}
      {irt && <IrtCustomerLink irtName={irt.name} current={irt.customer_id} customers={active?.data ?? []} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBar q={q} status={status} placeholder="Cari nama atau kode pelanggan" statuses={STATUSES} />
        {canManage && (
          <Link href="/master/pelanggan/baru" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90">
            Tambah pelanggan
          </Link>
        )}
      </div>
      {error ? (
        <EmptyState title="Daftar pelanggan tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title={q || status !== "aktif" ? "Tidak ada pelanggan yang cocok" : "Belum ada pelanggan"}>
          {q || status !== "aktif" ? "Ubah kata kunci atau filter status." : canManage ? "Tambahkan pelanggan, mis. IRT Sekar Arum sebagai pelanggan usaha." : "Admin kelompok belum mencatat pelanggan."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Kode</Th>
                <Th>Nama</Th>
                <Th>Jenis</Th>
                <Th>Kontak</Th>
                <Th>Status</Th>
                {canManage && <Th num>Aksi</Th>}
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <Td className="font-mono text-xs">{c.code}</Td>
                  <Td>
                    {canManage ? (
                      <Link href={`/master/pelanggan/${c.id}`} className="font-medium underline-offset-4 hover:underline">
                        {c.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.name}</span>
                    )}
                    {c.address && <Sub>{c.address}</Sub>}
                  </Td>
                  <Td>{c.type === "usaha" ? "Usaha" : "Perorangan"}</Td>
                  <Td className="text-text-muted">{c.phone ?? "—"}</Td>
                  <Td>{c.archived_at ? <Badge>Diarsip</Badge> : <Badge tone="ok">Aktif</Badge>}</Td>
                  {canManage && (
                    <Td num>
                      <ArchiveButton table="customers" id={c.id} archived={Boolean(c.archived_at)} />
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} href={href} />
        </>
      )}
    </div>
  );
}
