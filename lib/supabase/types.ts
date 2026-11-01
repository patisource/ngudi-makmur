// Tipe database — sementara DITULIS TANGAN sesuai migrasi 20261101120000_auth_rbac.sql.
// Ganti dengan hasil `pnpm db:types:remote` setelah Supabase CLI tersambung (supabase login + link).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin_kelompok" | "operator_produksi" | "ketua" | "admin_teknis";
export type AppPermission = "production.confirm";
export type ProductCategory = "mentah" | "olahan";
export type CustomerType = "perorangan" | "usaha";

// numeric(…) dari PostgREST datang sebagai number; kita ubah ke gram lewat lib/qty sebelum dihitung.
type Ts = string;
type Master = { archived_at: Ts | null; created_at: Ts; updated_at: Ts };

type Rel = { foreignKeyName: string; columns: string[]; isOneToOne: boolean; referencedRelation: string; referencedColumns: string[] };
type Table<Row, R extends Rel[] = []> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: R };
// Relasi FK (pola nama bawaan Postgres: <tabel>_<kolom>_fkey) agar select bersarang PostgREST bertipe.
type Fk<T extends string, C extends string, R extends string> = { foreignKeyName: `${T}_${C}_fkey`; columns: [C]; isOneToOne: false; referencedRelation: R; referencedColumns: ["id"] };

export type Database = {
  public: {
    Tables: {
      profiles: Table<{ id: string; full_name: string; email: string; is_active: boolean; created_at: string; updated_at: string }>;
      user_roles: Table<{ user_id: string; role: AppRole; granted_at: string; granted_by: string | null }>;
      user_permissions: Table<{ user_id: string; permission: AppPermission; granted_at: string; granted_by: string | null }>;
      audit_logs: Table<{
        id: number;
        at: string;
        user_id: string | null;
        actor_name: string | null;
        action: string;
        entity: string;
        entity_id: string | null;
        before: Json | null;
        after: Json | null;
        reason: string | null;
        ip: string | null;
        user_agent: string | null;
        request_id: string | null;
      }>;
      members: Table<
        Master & {
          id: string;
          code: string;
          name: string;
          hamlet: string | null;
          address: string | null;
          land_area_ha: number | null;
          joined_on: string | null;
          nik_masked: string | null;
          phone_masked: string | null;
        }
      >;
      member_contacts: Table<{ member_id: string; nik: string | null; phone: string | null; updated_at: Ts }>;
      products: Table<
        Master & { id: string; code: string; name: string; category: ProductCategory; base_unit: "kg"; default_price_per_kg: number | null; min_stock_kg: number }
      >;
      packagings: Table<Master & { id: string; name: string }>;
      product_packagings: Table<
        Master & { id: string; product_id: string; packaging_id: string; content_kg: number; default_price: number | null },
        [Fk<"product_packagings", "product_id", "products">, Fk<"product_packagings", "packaging_id", "packagings">]
      >;
      customers: Table<
        Master & { id: string; code: string; name: string; type: CustomerType; phone: string | null; address: string | null; note: string | null }
      >;
      sales_channels: Table<Master & { code: string; name: string; is_digital: boolean; sort_order: number }>;
      batch_type_rules: Table<{ batch_type: string; name: string; input_product_id: string; output_product_id: string }>;
    };
    Views: { [_ in never]: never };
    Functions: {
      has_role: { Args: { r: AppRole }; Returns: boolean };
      has_permission: { Args: { perm: AppPermission }; Returns: boolean };
      log_auth_event: { Args: { p_action: "auth.login" | "auth.logout" }; Returns: undefined };
      admin_set_roles: { Args: { p_user: string; p_roles: AppRole[]; p_reason?: string }; Returns: Json };
      admin_set_permission: { Args: { p_user: string; p_permission: AppPermission; p_granted: boolean; p_reason?: string }; Returns: Json };
      admin_set_active: { Args: { p_user: string; p_active: boolean; p_reason: string }; Returns: Json };
      admin_register_user: { Args: { p_user: string; p_full_name: string; p_roles: AppRole[] }; Returns: Json };
      admin_note_password_reset: { Args: { p_user: string; p_reason?: string }; Returns: undefined };
      product_on_hand: { Args: { p_product: string }; Returns: number };
      packaging_qty_kg: { Args: { p_product_packaging: string; p_qty: number }; Returns: number };
    };
    Enums: { app_role: AppRole; app_permission: AppPermission; product_category: ProductCategory; customer_type: CustomerType };
    CompositeTypes: { [_ in never]: never };
  };
};
