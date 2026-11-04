"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { CashEntryForm, CorrectionForm, TransferForm } from "./cash-forms";

type Account = { id: string; name: string; balanceRp: number };
type Category = { code: string; name: string };
type Kind = "income" | "transfer" | "correction" | "expense";

const TITLE: Record<Kind, string> = { income: "Pemasukan lain", transfer: "Transfer antar akun", correction: "Ajukan koreksi kas", expense: "Catat pengeluaran" };

// Tombol aksi kas di header (desain 06): setiap entri lewat dialog; kas berubah hanya dari dokumen yang tersimpan.
export function CashActions({ accounts, expenseCategories, incomeCategories }: { accounts: Account[]; expenseCategories: Category[]; incomeCategories: Category[] }) {
  const [open, setOpen] = useState<Kind | null>(null);
  const finish = (message: string) => {
    setOpen(null);
    toast(message);
  };
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => setOpen("income")}>Pemasukan lain</Button>
        <Button onClick={() => setOpen("transfer")}>Transfer antar akun</Button>
        <Button onClick={() => setOpen("correction")}>Koreksi kas</Button>
        <Button kind="primary" onClick={() => setOpen("expense")}>
          Catat pengeluaran
        </Button>
      </div>
      {open && (
        <Dialog title={TITLE[open]} onClose={() => setOpen(null)}>
          {open === "expense" && <CashEntryForm inDialog kind="expense" categories={expenseCategories} accounts={accounts} onDone={finish} />}
          {open === "income" && <CashEntryForm inDialog kind="income" categories={incomeCategories} accounts={accounts} onDone={finish} />}
          {open === "transfer" && <TransferForm inDialog accounts={accounts} onDone={finish} />}
          {open === "correction" && <CorrectionForm inDialog accounts={accounts} onDone={finish} />}
        </Dialog>
      )}
    </div>
  );
}
