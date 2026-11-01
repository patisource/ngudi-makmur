import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

const { hashPayload } = await import("@/lib/idempotency");

describe("hashPayload (Security.md §6)", () => {
  it("isi sama dengan urutan kunci berbeda → hash sama", () => {
    expect(hashPayload({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(hashPayload({ b: { d: [1, 2], c: 2 }, a: 1 }));
  });
  it("isi berbeda → hash berbeda (memicu 409 IDEMPOTENCY_CONFLICT)", () => {
    expect(hashPayload({ amount: 30000 })).not.toBe(hashPayload({ amount: 20000 }));
  });
  it("urutan array tetap berpengaruh", () => {
    expect(hashPayload([1, 2])).not.toBe(hashPayload([2, 1]));
  });
});
