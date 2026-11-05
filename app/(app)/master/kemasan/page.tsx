import type { Metadata } from "next";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState, Table, Td, Th } from "@/components/ui/table";
import { ArchiveButton, ChannelForm, DigitalToggle, PackagingForm } from "@/features/master/components/forms";
import { listPackagingsAndChannels } from "@/features/master/queries";
import { canDo } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Jenis kemasan & saluran · Sistem Pengelolaan Jagung Desa Baturejo" };

// T2.4: jenis kemasan (pak, karung, …) & saluran penjualan. Saluran digital dipakai indikator penjualan digital (PRD §4.8).
export default async function PackagingChannelsPage() {
  const user = await requireRole(["admin_kelompok", "ketua"]);
  const canManage = canDo(user.roles, "master.kelola");
  const { packagings, channels, error } = await listPackagingsAndChannels();
  if (error) return <EmptyState title="Data tidak dapat dimuat">Coba muat ulang halaman.</EmptyState>;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="font-semibold">Jenis kemasan</h2>
        <p className="text-sm text-text-muted">Isi kg tiap kemasan diatur per produk di tab Produk & kemasan.</p>
        <Table>
          <thead>
            <tr>
              <Th>Nama</Th>
              <Th>Status</Th>
              {canManage && <Th num>Aksi</Th>}
            </tr>
          </thead>
          <tbody>
            {packagings.map((p) => (
              <tr key={p.id}>
                <Td className="font-medium">{p.name}</Td>
                <Td>{p.archived_at ? <Badge>Diarsip</Badge> : <Badge tone="ok">Aktif</Badge>}</Td>
                {canManage && (
                  <Td num>
                    <ArchiveButton table="packagings" id={p.id} archived={Boolean(p.archived_at)} />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
        {canManage && <PackagingForm />}
      </Card>

      <Card>
        <h2 className="font-semibold">Saluran penjualan</h2>
        <p className="text-sm text-text-muted">Setiap pesanan wajib memilih saluran. Saluran bertanda digital dihitung pada indikator penjualan digital.</p>
        <Table>
          <thead>
            <tr>
              <Th>Saluran</Th>
              <Th>Jenis</Th>
              {canManage && <Th num>Aksi</Th>}
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => (
              <tr key={c.code} className={c.archived_at ? "opacity-60" : undefined}>
                <Td>
                  <span className="font-medium">{c.name}</span>
                  <span className="ml-2 font-mono text-xs text-text-subtle">{c.code}</span>
                </Td>
                <Td>{canManage && !c.archived_at ? <DigitalToggle code={c.code} isDigital={c.is_digital} /> : c.is_digital ? <Badge tone="info">Digital</Badge> : "Non-digital"}</Td>
                {canManage && (
                  <Td num>
                    <ArchiveButton table="sales_channels" id={c.code} archived={Boolean(c.archived_at)} />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
        {canManage && <ChannelForm />}
      </Card>
    </div>
  );
}
