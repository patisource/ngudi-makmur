import { describe, expect, it } from "vitest";
import { canDo, canOpen, homeFor, navFor, navItemFor } from "./permissions";
import type { AppRole } from "@/lib/supabase/types";

// Matriks PRD §3.1 (kolom L/K = boleh membuka halaman). Diuji per peran agar perubahan konfigurasi
// yang tidak sengaja membuka akses langsung ketahuan.
const MATRIX: Record<string, Record<AppRole, boolean>> = {
  "/dashboard": { admin_kelompok: true, operator_produksi: true, ketua: true, admin_teknis: false, pengurus_irt: false },
  "/jagung-masuk": { admin_kelompok: true, operator_produksi: true, ketua: true, admin_teknis: false, pengurus_irt: false },
  "/produksi": { admin_kelompok: true, operator_produksi: true, ketua: true, admin_teknis: false, pengurus_irt: false },
  "/stok": { admin_kelompok: true, operator_produksi: true, ketua: true, admin_teknis: false, pengurus_irt: false },
  "/penjualan": { admin_kelompok: true, operator_produksi: false, ketua: true, admin_teknis: false, pengurus_irt: false },
  "/kas": { admin_kelompok: true, operator_produksi: false, ketua: true, admin_teknis: false, pengurus_irt: false },
  "/laporan": { admin_kelompok: true, operator_produksi: true, ketua: true, admin_teknis: false, pengurus_irt: false },
  "/master": { admin_kelompok: true, operator_produksi: true, ketua: true, admin_teknis: false, pengurus_irt: false },
  "/audit": { admin_kelompok: false, operator_produksi: false, ketua: true, admin_teknis: true, pengurus_irt: false },
  "/pengaturan/akun": { admin_kelompok: false, operator_produksi: false, ketua: true, admin_teknis: true, pengurus_irt: false },
  // IRT Sekar Arum (M10): pengurus IRT kelola, ketua baca; peran kelompok lain tidak.
  "/irt": { admin_kelompok: false, operator_produksi: false, ketua: true, admin_teknis: false, pengurus_irt: true },
  "/irt/bahan-masuk": { admin_kelompok: false, operator_produksi: false, ketua: true, admin_teknis: false, pengurus_irt: true },
  "/irt/produksi/baru": { admin_kelompok: false, operator_produksi: false, ketua: true, admin_teknis: false, pengurus_irt: true },
  "/irt/stok": { admin_kelompok: false, operator_produksi: false, ketua: true, admin_teknis: false, pengurus_irt: true },
  "/irt/penjualan": { admin_kelompok: false, operator_produksi: false, ketua: true, admin_teknis: false, pengurus_irt: true },
  "/irt/produk": { admin_kelompok: false, operator_produksi: false, ketua: true, admin_teknis: false, pengurus_irt: true },
};

describe("matriks hak akses halaman (PRD §3.1)", () => {
  for (const [path, byRole] of Object.entries(MATRIX)) {
    for (const [role, allowed] of Object.entries(byRole) as [AppRole, boolean][]) {
      it(`${role} ${allowed ? "boleh" : "tidak boleh"} membuka ${path}`, () => {
        expect(canOpen([role], path)).toBe(allowed);
      });
    }
  }
});

describe("uji wajib SRS §11 — sisi aplikasi", () => {
  it("operator_produksi tidak bisa membuka pembayaran/kas maupun penjualan", () => {
    for (const p of ["/kas", "/kas/pembayaran", "/penjualan", "/penjualan/INV-1"]) expect(canOpen(["operator_produksi"], p)).toBe(false);
  });
  it("admin_teknis tidak mendapat menu transaksi usaha", () => {
    const hrefs = navFor(["admin_teknis"]).map((n) => n.href);
    expect(hrefs).toEqual(["/pengaturan/akun", "/audit"]);
  });
});

describe("modul IRT (M10)", () => {
  it("pengurus IRT hanya mendapat menu IRT dan mendarat di Dashboard IRT", () => {
    const hrefs = navFor(["pengurus_irt"]).map((n) => n.href);
    expect(hrefs.every((h) => h.startsWith("/irt"))).toBe(true);
    expect(homeFor(["pengurus_irt"])).toBe("/irt");
  });
  it("pengurus IRT tidak bisa membuka kas, penjualan, anggota, laporan kelompok", () => {
    for (const p of ["/dashboard", "/kas", "/penjualan", "/master/anggota", "/laporan/penjualan", "/stok", "/audit"]) expect(canOpen(["pengurus_irt"], p)).toBe(false);
  });
  it("hanya pengurus IRT yang mencatat data IRT; hubungkan pelanggan oleh admin kelompok/teknis", () => {
    expect(canDo(["pengurus_irt"], "irt.kelola")).toBe(true);
    for (const r of ["admin_kelompok", "operator_produksi", "ketua", "admin_teknis"] as AppRole[]) expect(canDo([r], "irt.kelola")).toBe(false);
    for (const r of ["admin_kelompok", "admin_teknis"] as AppRole[]) expect(canDo([r], "irt.hubungkan")).toBe(true);
    for (const r of ["pengurus_irt", "ketua", "operator_produksi"] as AppRole[]) expect(canDo([r], "irt.hubungkan")).toBe(false);
  });
});

describe("aksi kelola akun", () => {
  it("hanya admin_teknis", () => {
    expect(canDo(["admin_teknis"], "akun.kelola")).toBe(true);
    for (const r of ["admin_kelompok", "operator_produksi", "ketua", "pengurus_irt"] as AppRole[]) expect(canDo([r], "akun.kelola")).toBe(false);
  });
});

describe("aksi penjualan (PRD §3.1: pesanan K = admin_kelompok, ketua L)", () => {
  it("hanya admin_kelompok yang mencatat, mengonfirmasi, membatalkan, dan menyerahkan pesanan", () => {
    expect(canDo(["admin_kelompok"], "penjualan.kelola")).toBe(true);
    for (const r of ["operator_produksi", "ketua", "admin_teknis"] as AppRole[]) expect(canDo([r], "penjualan.kelola")).toBe(false);
  });
});

describe("peran rangkap = gabungan hak", () => {
  it("ketua merangkap admin kelompok bisa membuka kas dan akun", () => {
    expect(canOpen(["ketua", "admin_kelompok"], "/kas")).toBe(true);
    expect(canOpen(["ketua", "admin_kelompok"], "/pengaturan/akun")).toBe(true);
  });
  it("tanpa peran tidak bisa membuka apa pun", () => {
    expect(navFor([])).toEqual([]);
    expect(homeFor([])).toBe("/403");
  });
});

describe("navItemFor", () => {
  it("mencocokkan prefix terpanjang dan menolak path tak dikenal", () => {
    expect(navItemFor("/pengaturan/akun/123")?.href).toBe("/pengaturan/akun");
    expect(navItemFor("/kasir")).toBeUndefined();
    expect(navItemFor("/rahasia")).toBeUndefined();
  });
  it("halaman awal: admin_teknis ke Akun & izin, lainnya ke dashboard", () => {
    expect(homeFor(["admin_teknis"])).toBe("/pengaturan/akun");
    expect(homeFor(["operator_produksi"])).toBe("/dashboard");
  });
});

describe("aksi retur (PRD Q7: catat admin_kelompok, verifikasi ketua)", () => {
  it("hanya admin_kelompok mencatat, hanya ketua memverifikasi", () => {
    expect(canDo(["admin_kelompok"], "retur.catat")).toBe(true);
    expect(canDo(["admin_kelompok"], "retur.verifikasi")).toBe(false);
    expect(canDo(["ketua"], "retur.verifikasi")).toBe(true);
    expect(canDo(["ketua"], "retur.catat")).toBe(false);
    for (const r of ["operator_produksi", "admin_teknis"] as AppRole[]) {
      expect(canDo([r], "retur.catat")).toBe(false);
      expect(canDo([r], "retur.verifikasi")).toBe(false);
    }
  });
});

describe("UJI WAJIB SRS §11: pembayaran & kas", () => {
  it("hanya admin_kelompok mencatat pembayaran/pengeluaran/refund; operator & admin teknis tidak pernah", () => {
    expect(canDo(["admin_kelompok"], "kas.kelola")).toBe(true);
    for (const r of ["operator_produksi", "ketua", "admin_teknis", "pengurus_irt"] as AppRole[]) expect(canDo([r], "kas.kelola")).toBe(false);
  });
  it("koreksi kas diputuskan ketua saja", () => {
    expect(canDo(["ketua"], "kas.putuskan")).toBe(true);
    for (const r of ["admin_kelompok", "operator_produksi", "admin_teknis"] as AppRole[]) expect(canDo([r], "kas.putuskan")).toBe(false);
  });
  it("operator produksi tidak bisa membuka halaman kas mana pun", () => {
    for (const p of ["/kas/buku", "/kas/pembayaran", "/kas/pengeluaran", "/kas/pemasukan", "/kas/koreksi"]) expect(canOpen(["operator_produksi"], p)).toBe(false);
  });
});

describe("stok opname, koreksi stok, pembatalan batch (PRD §3.1, Security.md §4.3)", () => {
  it("opname & ajukan koreksi: admin kelompok + operator; ketua & admin teknis tidak", () => {
    for (const r of ["admin_kelompok", "operator_produksi"] as AppRole[]) expect(canDo([r], "stok.hitung")).toBe(true);
    for (const r of ["ketua", "admin_teknis"] as AppRole[]) expect(canDo([r], "stok.hitung")).toBe(false);
  });
  it("setujui koreksi stok & pembatalan batch: ketua saja", () => {
    expect(canDo(["ketua"], "stok.putuskan")).toBe(true);
    expect(canDo(["ketua"], "produksi.batal.putuskan")).toBe(true);
    for (const r of ["admin_kelompok", "operator_produksi", "admin_teknis"] as AppRole[]) {
      expect(canDo([r], "stok.putuskan")).toBe(false);
      expect(canDo([r], "produksi.batal.putuskan")).toBe(false);
    }
  });
  it("ajukan pembatalan batch: operator produksi saja", () => {
    expect(canDo(["operator_produksi"], "produksi.batal.ajukan")).toBe(true);
    for (const r of ["admin_kelompok", "ketua", "admin_teknis"] as AppRole[]) expect(canDo([r], "produksi.batal.ajukan")).toBe(false);
  });
});
