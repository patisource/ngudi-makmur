import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card } from "@/components/ui/card";
import { ArchiveButton, MemberForm } from "@/features/master/components/forms";
import { getMember } from "@/features/master/queries";
import { requireAction } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Ubah anggota · SIM Ngudi Makmur" };

export default async function EditMemberPage({ params }: PageProps<"/master/anggota/[id]">) {
  await requireAction("master.kelola");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { member, contact } = await getMember(id);
  if (!member) notFound();

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{member.name}</h2>
          <span className="font-mono text-xs text-text-muted">{member.code}</span>
          {member.archived_at && <Badge>Diarsip</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <ArchiveButton table="members" id={member.id} archived={Boolean(member.archived_at)} />
          <Link href="/master/anggota" className="text-sm text-text-muted hover:text-text">
            Kembali
          </Link>
        </div>
      </div>
      <MemberForm
        memberId={member.id}
        canSeeContacts
        defaults={{ name: member.name, hamlet: member.hamlet, address: member.address, landAreaHa: member.land_area_ha, joinedOn: member.joined_on, nik: contact?.nik, phone: contact?.phone }}
      />
    </Card>
  );
}
