// Pesan hasil aksi (sukses/galat) di bawah form atau panel; galat diumumkan pembaca layar (role="alert").
export function Notice({ state }: { state: { ok?: boolean; message?: string; error?: string } }) {
  if (state.error)
    return (
      <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-label text-danger">
        {state.error}
      </p>
    );
  if (state.ok && state.message)
    return (
      <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-label text-accent">
        {state.message}
      </p>
    );
  return null;
}

/** Kelas bersama form kas/penjualan (StyleGuide §5.3: input ≥ 16 px & target sentuh 44 px di ponsel). */
export const formCls = {
  input: "h-11 text-base sm:h-10 sm:text-sm",
  select: "h-11 w-full rounded-md border border-border bg-surface px-3 text-base outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft sm:h-10 sm:text-sm aria-invalid:border-danger",
  textarea: "rounded-md border border-border bg-surface px-3 py-2 text-base outline-none focus:border-border-strong focus:ring-4 focus:ring-info-soft sm:text-sm",
  panel: "flex flex-col gap-3 rounded-lg border border-border-strong bg-surface-muted p-4",
  chip:
    "flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-muted transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-fg has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-info-soft",
};
