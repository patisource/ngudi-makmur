import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Kind = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const KIND: Record<Kind, string> = {
  primary: "bg-primary text-primary-fg hover:opacity-90",
  secondary: "border border-border bg-surface text-text hover:bg-surface-muted",
  ghost: "bg-transparent text-text hover:bg-surface-muted",
  danger: "bg-danger text-white hover:opacity-90",
};
const SIZE: Record<Size, string> = { md: "h-10 px-4 text-sm", sm: "h-8 px-3 text-label" };

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; size?: Size };

// Tombol dasar (StyleGuide §5): tekan = skala 0,97 (transform saja), tanpa pantulan.
export function Button({ kind = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[background-color,opacity,transform] duration-150 ease-out-soft active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info",
        KIND[kind],
        SIZE[size],
        className,
      )}
      {...rest}
    />
  );
}
