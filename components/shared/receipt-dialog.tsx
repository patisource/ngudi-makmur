"use client";

import { Printer, Usb } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Seg } from "@/components/ui/seg";
import { logPrint } from "@/features/orders/print-actions";
import { escposBytes, type ThermalLine } from "@/lib/thermal";
import { ThermalPaper } from "./thermal";

// Struk thermal (desain 05, StyleGuide §8.4): satu susunan baris → pratinjau, cetak via driver (jalur A), dan
// ESC/POS lewat Web Serial (jalur B, 9600 baud). Mencetak hanya menambah print_logs; stok/kas tidak berubah.
type Paper = "80" | "58";
const PAPER_KEY = "ngudi-makmur-paper";

// Web Serial belum ada di lib.dom TypeScript; cukup bagian yang dipakai.
type SerialPortLike = { writable: WritableStream<Uint8Array> | null; open(o: { baudRate: number }): Promise<void> };
type SerialLike = { getPorts(): Promise<SerialPortLike[]>; requestPort(): Promise<SerialPortLike> };
let port: SerialPortLike | null = null;

async function sendSerial(bytes: Uint8Array) {
  const serial = (navigator as Navigator & { serial?: SerialLike }).serial;
  if (!serial) throw new Error("Browser ini belum mendukung cetak langsung. Pakai Chrome atau Edge versi desktop.");
  if (!port) port = (await serial.getPorts())[0] ?? (await serial.requestPort());
  if (!port.writable) await port.open({ baudRate: 9600 });
  const w = port.writable?.getWriter();
  if (!w) throw new Error("Port printer tidak dapat ditulis.");
  try {
    await w.write(bytes);
  } finally {
    w.releaseLock();
  }
}

export function ReceiptDialog({
  title,
  docId,
  lines80,
  lines58,
  printed,
  canPrint,
  onClose,
}: {
  title: string;
  docId: string;
  lines80: ThermalLine[];
  lines58: ThermalLine[];
  /** jumlah cetakan sebelumnya */
  printed: number;
  canPrint: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  // Dialog hanya dirender di peramban (setelah diklik), jadi localStorage aman dibaca saat inisialisasi.
  const [paper, setPaper] = useState<Paper>(() => {
    try {
      const saved = localStorage.getItem(PAPER_KEY);
      return saved === "58" ? "58" : "80";
    } catch {
      return "80";
    }
  });
  const [printing, setPrinting] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const lines = paper === "80" ? lines80 : lines58;

  const pick = (p: Paper) => {
    setPaper(p);
    try {
      localStorage.setItem(PAPER_KEY, p);
    } catch {
      /* abaikan */
    }
  };

  // Jalur A: halaman cetak hanya berisi struk, @page selebar kertas.
  useEffect(() => {
    if (!printing) return;
    const style = document.createElement("style");
    style.textContent = `@page { size: ${paper}mm auto; margin: 0 }`;
    document.head.appendChild(style);
    document.documentElement.classList.add("printing");
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const t = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.documentElement.classList.remove("printing");
      style.remove();
    };
  }, [printing, paper]);

  const viaDriver = () =>
    start(async () => {
      const res = await logPrint("order", docId);
      if (res.error) return setMsg({ tone: "err", text: res.error });
      setMsg(null);
      setPrinting(true);
      router.refresh(); // cetakan berikutnya bertanda CETAK ULANG
    });

  const viaSerial = () =>
    start(async () => {
      try {
        await sendSerial(escposBytes(lines));
      } catch (e) {
        port = null;
        const name = e instanceof Error ? e.name : "";
        setMsg({
          tone: "err",
          text: name === "NotFoundError" ? "Tidak ada printer yang dipilih. Cetak dibatalkan; data tidak berubah." : `Gagal mengirim ke printer. Data tidak berubah; silakan cetak ulang.${e instanceof Error && e.message ? ` (${e.message})` : ""}`,
        });
        return;
      }
      const res = await logPrint("order", docId);
      setMsg(res.error ? { tone: "err", text: `Struk tercetak, tetapi log cetak gagal dicatat: ${res.error}` } : { tone: "ok", text: "Struk dikirim ke printer." });
      router.refresh();
    });

  return (
    <>
      <Dialog
        wide
        title={title}
        description={`Kertas ${paper} mm · ${paper === "80" ? 48 : 32} karakter per baris · diambil dari transaksi tersimpan`}
        onClose={onClose}
        footer={
          <>
            <Button kind="ghost" onClick={onClose}>
              Tutup
            </Button>
            {canPrint && (
              <>
                <Button disabled={pending} onClick={viaSerial}>
                  <Usb size={16} strokeWidth={1.75} />
                  Cetak langsung (USB/Serial)
                </Button>
                <Button kind="primary" disabled={pending} onClick={viaDriver}>
                  <Printer size={16} strokeWidth={1.75} />
                  {printed > 0 ? "Cetak ulang via driver" : "Cetak via driver"}
                </Button>
              </>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Seg
            label="Lebar kertas"
            value={paper}
            onChange={pick}
            options={[
              ["80", "80 mm"],
              ["58", "58 mm"],
            ]}
          />
          <span className="text-xs text-text-subtle">{printed > 0 ? `Sudah dicetak ${printed}× · berikutnya bertanda CETAK ULANG` : "Belum pernah dicetak"}</span>
        </div>
        <div className="flex justify-center overflow-x-auto rounded-lg bg-surface-muted px-2 py-5">
          <ThermalPaper lines={lines} narrow={paper === "58"} />
        </div>
        <p className="rounded-lg bg-surface-muted px-4 py-3 text-xs leading-relaxed text-text-muted">
          Via driver: pilih printer thermal di dialog cetak, ukuran kertas otomatis {paper} mm. Cetak langsung: kirim ESC/POS ke printer USB/Serial/Bluetooth (9600 baud), kertas
          terpotong otomatis. Nomor nota tetap sama dan kas tidak berubah.
        </p>
        {!canPrint && <p className="text-xs text-text-muted">Pratinjau saja; nota dicetak oleh admin kelompok.</p>}
        {msg && (
          <p role={msg.tone === "err" ? "alert" : "status"} className={msg.tone === "err" ? "rounded-md bg-danger-soft px-3 py-2 text-label text-danger" : "rounded-md bg-accent-soft px-3 py-2 text-label text-accent"}>
            {msg.text}
          </p>
        )}
      </Dialog>
      {printing &&
        createPortal(
          <div id="print-root">
            <ThermalPaper lines={lines} narrow={paper === "58"} />
          </div>,
          document.body,
        )}
    </>
  );
}
