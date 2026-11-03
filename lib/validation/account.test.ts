import { describe, expect, it } from "vitest";
import { changePasswordSchema } from "./account";

const ok = { current: "lama-123", next: "baru1234", confirm: "baru1234" };

describe("ganti kata sandi sendiri (Security.md §3)", () => {
  it("menerima 8 karakter", () => {
    expect(changePasswordSchema.safeParse(ok).success).toBe(true);
  });
  it("menolak kurang dari 8 karakter", () => {
    expect(changePasswordSchema.safeParse({ ...ok, next: "abc1234", confirm: "abc1234" }).success).toBe(false);
  });
  it("menolak konfirmasi berbeda", () => {
    const r = changePasswordSchema.safeParse({ ...ok, confirm: "baru12345" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual(["confirm"]);
  });
  it("menolak sama dengan kata sandi lama", () => {
    expect(changePasswordSchema.safeParse({ current: "baru1234", next: "baru1234", confirm: "baru1234" }).success).toBe(false);
  });
  it("menolak lebih dari 72 byte dan spasi di tepi", () => {
    const long = "a".repeat(73);
    expect(changePasswordSchema.safeParse({ ...ok, next: long, confirm: long }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, next: " baru1234", confirm: " baru1234" }).success).toBe(false);
  });
  it("kata sandi saat ini wajib; kunci asing ditolak", () => {
    expect(changePasswordSchema.safeParse({ ...ok, current: "" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ ...ok, userId: "x" }).success).toBe(false);
  });
});
