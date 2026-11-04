import { notFound, redirect } from "next/navigation";
import { hasAnyRole, navItemFor } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";

// Rute tak dikenal di bawah menu yang ada (mis. /kas/xyz). Tetap dijaga peran dulu: operator_produksi yang membuka
// /kas/... mendapat 403, bukan 404 (uji wajib SRS §11, sisi halaman); selebihnya 404.
export default async function UnknownModule({ params }: PageProps<"/[...modul]">) {
  const { modul } = await params;
  const item = navItemFor("/" + modul.join("/"));
  if (!item) notFound();

  const user = await requireUser();
  if (!hasAnyRole(user.roles, item.roles)) redirect("/403");
  notFound();
}
