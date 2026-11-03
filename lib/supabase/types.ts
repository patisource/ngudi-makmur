// Tipe database — sementara DITULIS TANGAN sesuai migrasi supabase/migrations (s.d. 20261103160000_reports.sql).
// Ganti dengan hasil `pnpm db:types:remote` setelah Supabase CLI tersambung (supabase login + link).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRole = "admin_kelompok" | "operator_produksi" | "ketua" | "admin_teknis";
export type AppPermission = "production.confirm";
export type ProductCategory = "mentah" | "olahan";
export type CustomerType = "perorangan" | "usaha";
export type StockDirection = "in" | "out";
export type MovementType = "receipt_in" | "production_out" | "production_in" | "sale_out" | "return_in" | "opname_adjust" | "correction" | "reversal";
export type ReservationStatus = "active" | "released" | "fulfilled";
export type ReceiptStatus = "draft" | "confirmed" | "void";
export type ReceiptSource = "anggota" | "luar";
export type ProductionStatus = "draft" | "confirmed" | "pending_void" | "void";
export type LineDirection = "input" | "output";
export type BatchCostCategory = "tenaga_kerja" | "kemasan" | "listrik_bbm" | "lain";
export type OrderStatus = "draft" | "confirmed" | "delivered" | "cancelled";
export type OrderPaymentStatus = "unpaid" | "partial" | "paid" | "refunded";
export type ReturnStatus = "draft" | "verified";
export type CashDirection = "in" | "out";
export type CashAccountKind = "tunai" | "bank";
export type PaymentMethod = "tunai" | "transfer";
export type PaymentStatus = "pending" | "verified" | "rejected";
export type CorrectionStatus = "pending" | "approved" | "rejected";
export type SalesReportRow = {
  kind: "penjualan" | "ongkir" | "retur";
  order_id: string;
  doc_number: string | null;
  business_date: string;
  customer_id: string;
  customer_name: string;
  channel: string;
  channel_name: string;
  is_digital: boolean;
  product_id: string | null;
  product_code: string | null;
  product_name: string;
  category: ProductCategory | null;
  qty_kg: number;
  value_rp: number;
};
export type StockReportRow = {
  product_id: string;
  code: string;
  name: string;
  category: ProductCategory;
  opening_kg: number;
  in_kg: number;
  out_kg: number;
  closing_kg: number;
  on_hand_kg: number;
  reserved_kg: number;
  available_kg: number;
  value_rp: number;
  min_stock_kg: number;
  below_min: boolean;
};
export type CashSourceType = "opening_balance" | "payment" | "other_income" | "expense" | "refund" | "cash_correction";
export type ProofMime ="image/jpeg" | "image/png" | "image/webp" | "application/pdf";
/** Hasil fungsi posting dokumen (confirm_receipt, void_receipt). */
export type PostingResult = { id: string; doc_number: string | null; status: string; already: boolean };

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
      batch_type_rules: Table<
        { batch_type: string; name: string; input_product_id: string; output_product_id: string; max_loss_pct: number | null },
        [
          { foreignKeyName: "batch_type_rules_input_product_id_fkey"; columns: ["input_product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
          { foreignKeyName: "batch_type_rules_output_product_id_fkey"; columns: ["output_product_id"]; isOneToOne: false; referencedRelation: "products"; referencedColumns: ["id"] },
        ]
      >;
      stock_balances: Table<{ product_id: string; on_hand_kg: number; value_rp: number; updated_at: Ts }>;
      stock_movements: Table<
        {
          id: number;
          product_id: string;
          movement_type: MovementType;
          direction: StockDirection;
          qty_kg: number;
          value_rp: number;
          balance_after_kg: number;
          source_type: string;
          source_id: string;
          source_line: string;
          doc_number: string | null;
          business_date: string;
          note: string | null;
          created_by: string | null;
          created_at: Ts;
        },
        [Fk<"stock_movements", "product_id", "products">]
      >;
      stock_reservations: Table<{ id: string; order_id: string; product_id: string; qty_kg: number; status: ReservationStatus; created_at: Ts; updated_at: Ts }>;
      receipts: Table<
        {
          id: string;
          doc_number: string | null;
          status: ReceiptStatus;
          business_date: string;
          source_type: ReceiptSource;
          member_id: string | null;
          supplier_name: string | null;
          product_id: string;
          weight_kg: number;
          moisture_pct: number | null;
          acquisition_cost: number;
          note: string | null;
          created_by: string | null;
          confirmed_at: Ts | null;
          confirmed_by: string | null;
          voided_at: Ts | null;
          voided_by: string | null;
          void_reason: string | null;
          created_at: Ts;
          updated_at: Ts;
        },
        [Fk<"receipts", "member_id", "members">, Fk<"receipts", "product_id", "products">]
      >;
      production_batches: Table<
        {
          id: string;
          doc_number: string | null;
          status: ProductionStatus;
          batch_type: string;
          business_date: string;
          operator_id: string;
          operator_name: string;
          note: string | null;
          residue_kg: number;
          input_kg: number;
          output_kg: number;
          loss_kg: number;
          material_cost: number | null;
          other_cost: number;
          total_cost: number | null;
          hpp_per_kg: number | null;
          confirmed_at: Ts | null;
          confirmed_by: string | null;
          void_reason: string | null;
          void_requested_at: Ts | null;
          void_requested_by: string | null;
          voided_at: Ts | null;
          voided_by: string | null;
          created_at: Ts;
          updated_at: Ts;
        },
        [{ foreignKeyName: "production_batches_batch_type_fkey"; columns: ["batch_type"]; isOneToOne: false; referencedRelation: "batch_type_rules"; referencedColumns: ["batch_type"] }]
      >;
      production_lines: Table<
        { id: string; batch_id: string; direction: LineDirection; product_id: string; qty_kg: number; value_rp: number | null; sort_order: number; created_at: Ts },
        [Fk<"production_lines", "batch_id", "production_batches">, Fk<"production_lines", "product_id", "products">]
      >;
      batch_costs: Table<
        { id: string; batch_id: string; category: BatchCostCategory; amount_rp: number; source_ref: string | null; note: string | null; sort_order: number; created_at: Ts },
        [Fk<"batch_costs", "batch_id", "production_batches">]
      >;
      orders: Table<
        {
          id: string;
          doc_number: string | null;
          status: OrderStatus;
          payment_status: OrderPaymentStatus;
          business_date: string;
          customer_id: string;
          customer_name: string;
          channel: string;
          note: string | null;
          subtotal_rp: number;
          discount_rp: number;
          shipping_rp: number;
          total_rp: number;
          confirmed_at: Ts | null;
          confirmed_by: string | null;
          delivered_on: string | null;
          delivered_at: Ts | null;
          delivered_by: string | null;
          recipient_name: string | null;
          cancelled_at: Ts | null;
          cancelled_by: string | null;
          cancel_reason: string | null;
          created_by: string | null;
          created_at: Ts;
          updated_at: Ts;
        },
        [
          Fk<"orders", "customer_id", "customers">,
          { foreignKeyName: "orders_channel_fkey"; columns: ["channel"]; isOneToOne: false; referencedRelation: "sales_channels"; referencedColumns: ["code"] },
        ]
      >;
      order_items: Table<
        {
          id: string;
          order_id: string;
          product_id: string;
          product_packaging_id: string | null;
          unit_label: string;
          qty_input: number;
          qty_kg: number;
          price_snapshot: number;
          gross_rp: number;
          discount_rp: number;
          line_total_rp: number;
          sort_order: number;
          created_at: Ts;
        },
        [Fk<"order_items", "order_id", "orders">, Fk<"order_items", "product_id", "products">, Fk<"order_items", "product_packaging_id", "product_packagings">]
      >;
      order_returns: Table<
        {
          id: string;
          doc_number: string | null;
          status: ReturnStatus;
          order_id: string;
          business_date: string;
          reason: string;
          total_kg: number;
          sales_value_rp: number;
          stock_value_rp: number | null;
          created_by: string;
          created_by_name: string;
          verified_at: Ts | null;
          verified_by: string | null;
          verified_by_name: string | null;
          created_at: Ts;
          updated_at: Ts;
        },
        [Fk<"order_returns", "order_id", "orders">]
      >;
      order_return_items: Table<
        { id: string; return_id: string; order_item_id: string; product_id: string; qty_kg: number; sales_value_rp: number; stock_value_rp: number | null; sort_order: number },
        [Fk<"order_return_items", "return_id", "order_returns">, Fk<"order_return_items", "order_item_id", "order_items">, Fk<"order_return_items", "product_id", "products">]
      >;
      attachments: Table<
        { id: string; receipt_id: string | null; storage_path: string; mime_type: ProofMime; size_bytes: number; created_by: string | null; created_at: Ts },
        [Fk<"attachments", "receipt_id", "receipts">]
      >;
      cash_accounts: Table<{
        id: string;
        code: string;
        name: string;
        kind: CashAccountKind;
        balance_rp: number;
        opening_set_at: Ts | null;
        sort_order: number;
        archived_at: Ts | null;
        created_at: Ts;
        updated_at: Ts;
      }>;
      cash_transactions: Table<
        {
          id: number;
          account_id: string;
          direction: CashDirection;
          amount_rp: number;
          balance_after_rp: number;
          source_type: CashSourceType;
          source_id: string;
          doc_number: string | null;
          business_date: string;
          note: string | null;
          created_by: string | null;
          created_at: Ts;
        },
        [Fk<"cash_transactions", "account_id", "cash_accounts">]
      >;
      payments: Table<
        {
          id: string;
          doc_number: string | null;
          order_id: string;
          business_date: string;
          method: PaymentMethod;
          account_id: string;
          amount_rp: number;
          status: PaymentStatus;
          note: string | null;
          created_by: string | null;
          created_at: Ts;
          verified_at: Ts | null;
          verified_by: string | null;
          rejected_at: Ts | null;
          rejected_by: string | null;
          reject_reason: string | null;
          updated_at: Ts;
        },
        [Fk<"payments", "order_id", "orders">, Fk<"payments", "account_id", "cash_accounts">]
      >;
      refunds: Table<
        {
          id: string;
          doc_number: string;
          order_id: string;
          return_id: string | null;
          account_id: string;
          amount_rp: number;
          reason: string;
          business_date: string;
          created_by: string | null;
          created_at: Ts;
        },
        [Fk<"refunds", "order_id", "orders">, Fk<"refunds", "account_id", "cash_accounts">, Fk<"refunds", "return_id", "order_returns">]
      >;
      expense_categories: Table<{ code: string; name: string; sort_order: number; archived_at: Ts | null; created_at: Ts }>;
      income_categories: Table<{ code: string; name: string; sort_order: number; archived_at: Ts | null; created_at: Ts }>;
      expenses: Table<
        {
          id: string;
          doc_number: string;
          business_date: string;
          category: string;
          account_id: string;
          amount_rp: number;
          description: string;
          reference: string | null;
          created_by: string | null;
          created_at: Ts;
        },
        [
          Fk<"expenses", "account_id", "cash_accounts">,
          { foreignKeyName: "expenses_category_fkey"; columns: ["category"]; isOneToOne: false; referencedRelation: "expense_categories"; referencedColumns: ["code"] },
        ]
      >;
      other_incomes: Table<
        { id: string; doc_number: string; business_date: string; category: string; account_id: string; amount_rp: number; description: string; created_by: string | null; created_at: Ts },
        [
          Fk<"other_incomes", "account_id", "cash_accounts">,
          { foreignKeyName: "other_incomes_category_fkey"; columns: ["category"]; isOneToOne: false; referencedRelation: "income_categories"; referencedColumns: ["code"] },
        ]
      >;
      print_logs: Table<{ id: number; doc_type: "order" | "payment"; doc_id: string; printed_by: string | null; printed_at: Ts }>;
      cash_corrections: Table<
        {
          id: string;
          doc_number: string;
          account_id: string;
          direction: CashDirection;
          amount_rp: number;
          reason: string;
          business_date: string;
          status: CorrectionStatus;
          requested_by: string;
          requested_by_name: string;
          decided_at: Ts | null;
          decided_by: string | null;
          decided_by_name: string | null;
          decision_note: string | null;
          created_at: Ts;
          updated_at: Ts;
        },
        [Fk<"cash_corrections", "account_id", "cash_accounts">]
      >;
    };
    Views: {
      v_stock_balance: {
        Row: {
          product_id: string;
          code: string;
          name: string;
          category: ProductCategory;
          min_stock_kg: number;
          archived_at: Ts | null;
          on_hand_kg: number;
          reserved_kg: number;
          available_kg: number;
          value_rp: number;
          avg_cost_per_kg: number | null;
          below_min: boolean;
        };
        Relationships: [];
      };
      v_order_balance: {
        Row: {
          order_id: string;
          doc_number: string | null;
          customer_id: string;
          status: OrderStatus;
          payment_status: OrderPaymentStatus;
          total_rp: number;
          paid_rp: number;
          refunded_rp: number;
          outstanding_rp: number;
          returned_rp: number;
          bill_rp: number;
          credit_rp: number;
          pending_rp: number;
        };
        Relationships: [];
      };
      v_cash_balance: {
        Row: { account_id: string; code: string; name: string; kind: CashAccountKind; balance_rp: number; opening_set_at: Ts | null; archived_at: Ts | null; sort_order: number };
        Relationships: [];
      };
    };
    Functions: {
      has_role: { Args: { r: AppRole }; Returns: boolean };
      has_permission: { Args: { perm: AppPermission }; Returns: boolean };
      log_auth_event: { Args: { p_action: "auth.login" | "auth.logout" | "auth.password_changed" }; Returns: undefined };
      admin_set_roles: { Args: { p_user: string; p_roles: AppRole[]; p_reason?: string }; Returns: Json };
      admin_set_permission: { Args: { p_user: string; p_permission: AppPermission; p_granted: boolean; p_reason?: string }; Returns: Json };
      admin_set_active: { Args: { p_user: string; p_active: boolean; p_reason: string }; Returns: Json };
      admin_register_user: { Args: { p_user: string; p_full_name: string; p_roles: AppRole[] }; Returns: Json };
      admin_note_password_reset: { Args: { p_user: string; p_reason?: string }; Returns: undefined };
      product_on_hand: { Args: { p_product: string }; Returns: number };
      packaging_qty_kg: { Args: { p_product_packaging: string; p_qty: number }; Returns: number };
      idem_begin: { Args: { p_key: string; p_endpoint: string; p_hash: string }; Returns: Json };
      idem_finish: { Args: { p_key: string; p_response: Json }; Returns: undefined };
      idem_abort: { Args: { p_key: string }; Returns: undefined };
      confirm_receipt: { Args: { p_id: string }; Returns: Json };
      void_receipt: { Args: { p_id: string; p_reason: string }; Returns: Json };
      calc_hpp: { Args: { p_total: number; p_output_kg: number }; Returns: number | null };
      save_production_draft: {
        Args: { p_id: string | null; p_batch_type: string; p_date: string; p_note: string | null; p_residue_kg: number; p_inputs: number[]; p_outputs: number[]; p_costs: Json };
        Returns: string;
      };
      delete_production_draft: { Args: { p_id: string }; Returns: undefined };
      confirm_production: { Args: { p_id: string }; Returns: Json };
      save_order_draft: {
        Args: { p_id: string | null; p_date: string; p_customer: string; p_channel: string; p_note: string | null; p_shipping_rp: number; p_items: Json };
        Returns: string;
      };
      delete_order_draft: { Args: { p_id: string }; Returns: undefined };
      confirm_order: { Args: { p_id: string }; Returns: Json };
      cancel_order: { Args: { p_id: string; p_reason: string; p_refund_account?: string | null }; Returns: Json };
      fulfill_order: { Args: { p_id: string; p_recipient: string | null; p_date?: string | null }; Returns: Json };
      create_return: { Args: { p_order: string; p_date: string; p_reason: string; p_items: Json }; Returns: string };
      delete_return_draft: { Args: { p_id: string }; Returns: undefined };
      verify_return: { Args: { p_id: string }; Returns: Json };
      set_opening_balance: { Args: { p_account: string; p_amount: number; p_date: string | null }; Returns: Json };
      record_payment: {
        Args: { p_order: string; p_date: string | null; p_method: PaymentMethod; p_account: string; p_amount: number; p_note: string | null; p_verified: boolean };
        Returns: Json;
      };
      verify_payment: { Args: { p_id: string }; Returns: Json };
      reject_payment: { Args: { p_id: string; p_reason: string }; Returns: Json };
      create_refund: { Args: { p_order: string; p_account: string; p_amount: number; p_reason: string; p_date: string | null; p_return?: string | null }; Returns: Json };
      create_expense: { Args: { p_date: string | null; p_category: string; p_account: string; p_amount: number; p_description: string; p_reference: string | null }; Returns: Json };
      create_other_income: { Args: { p_date: string | null; p_category: string; p_account: string; p_amount: number; p_description: string }; Returns: Json };
      request_cash_correction: { Args: { p_account: string; p_direction: CashDirection; p_amount: number; p_reason: string; p_date: string | null }; Returns: Json };
      decide_cash_correction: { Args: { p_id: string; p_approve: boolean; p_note: string | null }; Returns: Json };
      log_print: { Args: { p_doc_type: "order" | "payment"; p_doc_id: string }; Returns: number };
      rpt_kpi: { Args: { p_from: string; p_to: string }; Returns: Json };
      rpt_daily: { Args: { p_from: string; p_to: string }; Returns: { day: string; receipts_kg: number; flour_kg: number; sales_kg: number }[] };
      rpt_sales: { Args: { p_from: string; p_to: string }; Returns: SalesReportRow[] };
      rpt_stock: { Args: { p_from: string; p_to: string }; Returns: StockReportRow[] };
    };
    Enums: {
      app_role: AppRole;
      app_permission: AppPermission;
      product_category: ProductCategory;
      customer_type: CustomerType;
      stock_direction: StockDirection;
      movement_type: MovementType;
      reservation_status: ReservationStatus;
      receipt_status: ReceiptStatus;
      receipt_source: ReceiptSource;
      production_status: ProductionStatus;
      line_direction: LineDirection;
      batch_cost_category: BatchCostCategory;
      order_status: OrderStatus;
      order_payment_status: OrderPaymentStatus;
      return_status: ReturnStatus;
      cash_direction: CashDirection;
      cash_account_kind: CashAccountKind;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      correction_status: CorrectionStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};
