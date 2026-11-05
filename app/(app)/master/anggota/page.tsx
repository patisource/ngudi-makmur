import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/card";
import { EmptyState, Pagination, SearchBar, Sub, Table, Td, Th } from "@/components/ui/table";
import { ArchiveButton } from "@/features/master/components/forms";
import { cleanQuery, listMembers, PAGE_SIZE, parsePage, parseStatus } from "@/features/master/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Anggota · Sistem Pengelolaan Jagung Desa Baturejo" };

const STATUSES: Array<[string, string]> = [
  ["aktif", "Aktif"],
  ["arsip", "Diarsip"],
  ["semua", "Semua"],
];
const NOTICE: Record<string, string> = { baru: "Anggota ditambahkan.", ubah: "Perubahan anggota disimpan." };

// Daftar anggota (FR-MST-01, FR-MST-06): cari nama/kode/dusun, filter status, paginasi di server.
export default async function MembersPage({ searchParams }: PageProps<"/master/anggota">) {
  const user = await requireRole(["admin_kelompok", "operator_produksi", "ketua"]);
  const canManage = canDo(user.roles, "master.kelola");
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const status = parseStatus(sp.status);
  const page = parsePage(sp.page);
  const { data, count, error } = await listMembers({ q, status, page });
  const href = (p: number) => `/master/anggota?${new URLSearchParams({ ...(q && { q }), status, page: String(p) })}`;
  const notice = typeof sp.simpan === "string" ? NOTICE[sp.simpan] : undefined;

  return (
    <div className="flex flex-col gap-4">
      {notice && (
        <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
          {notice}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBar q={q} status={status} placeholder="Cari nama, kode, atau dusun" statuses={STATUSES} />
        {canManage && (
          <Link href="/master/anggota/baru" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg hover:opacity-90">
            Tambah anggota
          </Link>
        )}
      </div>

      {error ? (
        <EmptyState title="Daftar anggota tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>
      ) : !data?.length ? (
        <EmptyState title={q || status !== "aktif" ? "Tidak ada anggota yang cocok" : "Belum ada anggota"}>
          {q || status !== "aktif" ? "Ubah kata kunci atau filter status." : canManage ? "Klik Tambah anggota untuk mencatat petani pertama." : "Admin kelompok belum mencatat anggota."}
        </EmptyState>
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Kode</Th>
                <Th>Nama</Th>
                <Th>Kontak</Th>
                <Th num>Luas lahan</Th>
                <Th>Status</Th>
                {canManage && <Th num>Aksi</Th>}
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id}>
                  <Td className="font-mono text-xs">{m.code}</Td>
                  <Td>
                    {canManage ? (
                      <Link href={`/master/anggota/${m.id}`} className="font-medium underline-offset-4 hover:underline">
                        {m.name}
                      </Link>
                    ) : (
                      <span className="font-medium">{m.name}</span>
                    )}
                    {m.hamlet && <Sub>{m.hamlet}</Sub>}
                  </Td>
                  <Td className="text-text-muted">
                    {m.phone_masked ?? "—"}
                    {m.nik_masked && <Sub>NIK {m.nik_masked}</Sub>}
                  </Td>
                  <Td num>{m.land_area_ha != null ? `${String(m.land_area_ha).replace(".", ",")} ha` : "—"}</Td>
                  <Td>{m.archived_at ? <Badge tone="neutral">Diarsip</Badge> : <Badge tone="ok">Aktif</Badge>}</Td>
                  {canManage && (
                    <Td num>
                      <ArchiveButton table="members" id={m.id} archived={Boolean(m.archived_at)} />
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
