-- =====================================================================
-- M4 — Jagung masuk (T4.1, T4.3, T4.5) · FR-RCV-*
-- Penerimaan draft → konfirmasi (nomor RCV, mutasi receipt_in tepat satu kali, terkunci) → void (mutasi balik).
-- Biaya perolehan hanya nilai persediaan; TIDAK membuat kas (FR-RCV-04, PRD §4.7).
-- Bukti: tabel attachments + bucket Storage privat 'proofs' (Security.md §8).
-- =====================================================================

create type public.receipt_status as enum ('draft', 'confirmed', 'void');
create type public.receipt_source as enum ('anggota', 'luar');

create table public.receipts (
  id                uuid primary key default gen_random_uuid(),
  doc_number        text unique,                                   -- diisi saat konfirmasi
  status            public.receipt_status not null default 'draft',
  business_date     date not null default (now() at time zone 'Asia/Jakarta')::date,
  source_type       public.receipt_source not null,
  member_id         uuid references public.members (id),
  supplier_name     text check (char_length(btrim(supplier_name)) between 1 and 120),
  product_id        uuid not null references public.products (id),
  weight_kg         numeric(14, 3) not null check (weight_kg > 0 and weight_kg <= 1000000),
  moisture_pct      numeric(5, 2) check (moisture_pct >= 0 and moisture_pct <= 100),
  acquisition_cost  bigint not null default 0 check (acquisition_cost between 0 and 10000000000),
  note              text check (char_length(note) <= 1000),
  created_by        uuid default auth.uid(),
  confirmed_at      timestamptz,
  confirmed_by      uuid,
  voided_at         timestamptz,
  voided_by         uuid,
  void_reason       text check (char_length(void_reason) <= 500),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- sumber anggota wajib member_id; sumber luar wajib nama pemasok (Security.md §5.2)
  check ((source_type = 'anggota' and member_id is not null and supplier_name is null)
      or (source_type = 'luar' and member_id is null and supplier_name is not null)),
  check ((status = 'draft') = (doc_number is null)),
  check (status <> 'void' or (void_reason is not null and voided_at is not null))
);
create index receipts_date_idx on public.receipts (business_date desc, created_at desc);
create index receipts_member_idx on public.receipts (member_id) where member_id is not null;
create index receipts_product_idx on public.receipts (product_id);
create trigger receipts_touch before update on public.receipts for each row execute function public.touch_updated_at();

-- Validasi draft & kunci dokumen terkonfirmasi. Berjalan juga saat konfirmasi (draft → confirmed), sehingga
-- produk/anggota yang diarsip setelah draft disimpan ikut ditolak.
create function public.guard_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_cat public.product_category;
  v_prod_archived timestamptz;
  v_member_archived timestamptz;
begin
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if (new.business_date, new.source_type, new.member_id, new.supplier_name, new.product_id, new.weight_kg, new.moisture_pct,
        new.acquisition_cost, new.note, new.doc_number, new.confirmed_at, new.confirmed_by)
       is distinct from
       (old.business_date, old.source_type, old.member_id, old.supplier_name, old.product_id, old.weight_kg, old.moisture_pct,
        old.acquisition_cost, old.note, old.doc_number, old.confirmed_at, old.confirmed_by)
       or (new.status <> old.status and not (old.status = 'confirmed' and new.status = 'void')) then
      raise exception 'Penerimaan % sudah % dan terkunci', old.doc_number, case old.status when 'void' then 'dibatalkan' else 'dikonfirmasi' end
        using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'Penerimaan baru harus berstatus draft' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;

  if new.business_date > (now() at time zone 'Asia/Jakarta')::date then
    raise exception 'Tanggal penerimaan tidak boleh melebihi hari ini' using errcode = '22023';
  end if;
  select category, archived_at into v_cat, v_prod_archived from public.products where id = new.product_id;
  if v_cat is distinct from 'mentah' then
    raise exception 'Jagung masuk hanya untuk produk mentah (tongkol atau pipilan)' using errcode = '22023';
  end if;
  if v_prod_archived is not null then
    raise exception 'Produk sudah diarsip' using errcode = '22023';
  end if;
  if new.source_type = 'anggota' then
    select archived_at into v_member_archived from public.members where id = new.member_id;
    if not found or v_member_archived is not null then
      raise exception 'Anggota tidak ditemukan atau sudah diarsip' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger receipts_guard before insert or update on public.receipts for each row execute function public.guard_receipt();

create function public.guard_receipt_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' then
    raise exception 'Penerimaan terkonfirmasi tidak dapat dihapus; gunakan pembatalan dengan alasan' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  return old;
end;
$$;
create trigger receipts_guard_delete before delete on public.receipts for each row execute function public.guard_receipt_delete();

-- Audit draft (buat/ubah/hapus). Transisi status dicatat oleh fungsi posting beserta alasannya.
create function public.audit_receipt_draft() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('receipt.draft_created', 'receipt', new.id::text, null, to_jsonb(new) - 'updated_at');
  elsif tg_op = 'DELETE' then
    perform public.write_audit('receipt.draft_deleted', 'receipt', old.id::text, to_jsonb(old) - 'updated_at', null);
    return old;
  elsif old.status = 'draft' and new.status = 'draft' and to_jsonb(old) - 'updated_at' <> to_jsonb(new) - 'updated_at' then
    perform public.write_audit('receipt.draft_updated', 'receipt', new.id::text, to_jsonb(old) - 'updated_at', to_jsonb(new) - 'updated_at');
  end if;
  return new;
end;
$$;
create trigger receipts_audit after insert or update or delete on public.receipts for each row execute function public.audit_receipt_draft();

-- ---------- lampiran bukti (metadata; file di Storage) ----------
-- Satu kolom induk per jenis dokumen (modul berikutnya menambah kolom), tepat satu terisi.
create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  receipt_id    uuid references public.receipts (id) on delete cascade,
  storage_path  text not null unique check (storage_path ~ '^[a-z_]+/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'),
  mime_type     text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes    integer not null check (size_bytes between 1 and 5242880),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  check (num_nonnulls(receipt_id) = 1)
);
create index attachments_receipt_idx on public.attachments (receipt_id) where receipt_id is not null;

-- Bukti hanya bisa ditambah/dihapus selama dokumen induk masih draft; maksimal 5 per dokumen.
create function public.guard_attachment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_status public.receipt_status;
begin
  if tg_op = 'INSERT' then
    select status into v_status from public.receipts where id = new.receipt_id for update;
    if v_status is distinct from 'draft' then
      raise exception 'Bukti hanya bisa ditambah selama penerimaan masih draft' using errcode = 'P0001', hint = 'INVALID_STATE';
    end if;
    if (select count(*) from public.attachments where receipt_id = new.receipt_id) >= 5 then
      raise exception 'Maksimal 5 bukti per penerimaan' using errcode = '22023';
    end if;
    perform public.write_audit('attachment.added', 'receipt', new.receipt_id::text, null, to_jsonb(new));
    return new;
  end if;
  -- DELETE: induk terhapus (cascade draft) → lewati; induk masih ada → harus draft
  select status into v_status from public.receipts where id = old.receipt_id;
  if found and v_status <> 'draft' then
    raise exception 'Bukti penerimaan terkonfirmasi tidak dapat dihapus' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;
  if found then
    perform public.write_audit('attachment.removed', 'receipt', old.receipt_id::text, to_jsonb(old), null);
  end if;
  return old;
end;
$$;
create trigger attachments_guard before insert or delete on public.attachments for each row execute function public.guard_attachment();
create trigger attachments_no_update before update on public.attachments for each row execute function public.prevent_mutation();

-- ---------- fungsi posting ----------
-- Konfirmasi (FR-RCV-03): kunci dokumen, nomor RCV, mutasi receipt_in bernilai biaya perolehan. Konfirmasi ulang
-- dokumen yang sudah confirmed mengembalikan hasil yang sama tanpa mutasi baru.
create function public.confirm_receipt(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.receipts%rowtype;
  v_after public.receipts%rowtype;
  v_doc text;
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat mengonfirmasi jagung masuk' using errcode = '42501';
  end if;
  select * into v_before from public.receipts where id = p_id for update;
  if not found then
    raise exception 'Penerimaan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_before.status = 'confirmed' then
    return jsonb_build_object('id', v_before.id, 'doc_number', v_before.doc_number, 'status', v_before.status, 'already', true);
  end if;
  if v_before.status <> 'draft' then
    raise exception 'Penerimaan yang sudah dibatalkan tidak dapat dikonfirmasi' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;

  v_doc := public.next_doc_number('RCV', v_before.business_date);
  update public.receipts
     set status = 'confirmed', doc_number = v_doc, confirmed_at = now(), confirmed_by = (select auth.uid())
   where id = p_id
   returning * into v_after;                                   -- guard_receipt memvalidasi ulang produk, anggota, tanggal
  perform public._post_movement(v_after.product_id, 'in', v_after.weight_kg, 'receipt_in', 'receipt', v_after.id, v_doc,
                                v_after.business_date, v_after.acquisition_cost);
  perform public.write_audit('receipt.confirmed', 'receipt', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at');
  return jsonb_build_object('id', v_after.id, 'doc_number', v_doc, 'status', v_after.status, 'already', false);
end;
$$;

-- Pembatalan (FR-RCV-05): alasan wajib, mutasi balik senilai mutasi masuk; ditolak bila stok tersedia tidak cukup.
create function public.void_receipt(p_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_before public.receipts%rowtype;
  v_after public.receipts%rowtype;
  v_value bigint;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.has_role('admin_kelompok') then
    raise exception 'Hanya admin kelompok yang dapat membatalkan jagung masuk' using errcode = '42501';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Alasan pembatalan wajib diisi (5–500 karakter)' using errcode = '22023';
  end if;
  select * into v_before from public.receipts where id = p_id for update;
  if not found then
    raise exception 'Penerimaan tidak ditemukan' using errcode = 'P0002';
  end if;
  if v_before.status = 'void' then
    return jsonb_build_object('id', v_before.id, 'doc_number', v_before.doc_number, 'status', v_before.status, 'already', true);
  end if;
  if v_before.status <> 'confirmed' then
    raise exception 'Draft tidak perlu dibatalkan; hapus saja draftnya' using errcode = 'P0001', hint = 'INVALID_STATE';
  end if;

  select value_rp into v_value from public.stock_movements
   where source_type = 'receipt' and source_id = p_id and movement_type = 'receipt_in' and direction = 'in';
  perform public._post_movement(v_before.product_id, 'out', v_before.weight_kg, 'reversal', 'receipt', p_id, v_before.doc_number,
                                (now() at time zone 'Asia/Jakarta')::date, v_value, '', 'Batal ' || v_before.doc_number || ': ' || v_reason);
  update public.receipts
     set status = 'void', voided_at = now(), voided_by = (select auth.uid()), void_reason = v_reason
   where id = p_id
   returning * into v_after;
  perform public.write_audit('receipt.voided', 'receipt', p_id::text, to_jsonb(v_before) - 'updated_at', to_jsonb(v_after) - 'updated_at', v_reason);
  return jsonb_build_object('id', v_after.id, 'doc_number', v_after.doc_number, 'status', v_after.status, 'already', false);
end;
$$;

-- ---------- RLS & hak ----------
alter table public.receipts enable row level security;
alter table public.attachments enable row level security;

revoke all on public.receipts, public.attachments from anon, authenticated;
grant select on public.receipts, public.attachments to authenticated;
-- Kolom hitungan (status, nomor, konfirmasi, void) hanya diisi fungsi (Security.md §5.2, cegah mass assignment).
grant insert (business_date, source_type, member_id, supplier_name, product_id, weight_kg, moisture_pct, acquisition_cost, note),
      update (business_date, source_type, member_id, supplier_name, product_id, weight_kg, moisture_pct, acquisition_cost, note),
      delete on public.receipts to authenticated;
grant insert (receipt_id, storage_path, mime_type, size_bytes), delete on public.attachments to authenticated;

-- Jagung masuk: kelola = admin_kelompok; lihat = operator_produksi, ketua (PRD §3.1).
create policy receipts_select on public.receipts for select to authenticated
  using (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua'));
create policy receipts_insert on public.receipts for insert to authenticated with check (public.has_role('admin_kelompok'));
create policy receipts_update on public.receipts for update to authenticated
  using (public.has_role('admin_kelompok') and status = 'draft') with check (public.has_role('admin_kelompok') and status = 'draft');
create policy receipts_delete on public.receipts for delete to authenticated using (public.has_role('admin_kelompok') and status = 'draft');

create policy attachments_select on public.attachments for select to authenticated
  using (receipt_id is not null and (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua')));
create policy attachments_insert on public.attachments for insert to authenticated
  with check (receipt_id is not null and public.has_role('admin_kelompok') and storage_path like 'receipts/%');
create policy attachments_delete on public.attachments for delete to authenticated
  using (receipt_id is not null and public.has_role('admin_kelompok'));

revoke execute on function public.guard_receipt(), public.guard_receipt_delete(), public.audit_receipt_draft(), public.guard_attachment()
  from public, anon, authenticated;
revoke execute on function public.confirm_receipt(uuid), public.void_receipt(uuid, text) from public, anon;
grant execute on function public.confirm_receipt(uuid), public.void_receipt(uuid, text) to authenticated;

-- ---------- Storage: bucket privat 'proofs' (Security.md §8) ----------
-- Path {tabel}/{yyyy}/{mm}/{uuid}.{ext}, bukan nama file asli. Batas ukuran & tipe juga ditegakkan oleh Storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy proofs_receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'proofs' and name ~ '^receipts/[0-9]{4}/[0-9]{2}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$' and public.has_role('admin_kelompok'));
create policy proofs_receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'proofs' and name like 'receipts/%'
         and (public.has_role('admin_kelompok') or public.has_role('operator_produksi') or public.has_role('ketua')));
-- Hapus file hanya bila tidak lagi tercatat di attachments (unggahan gagal verifikasi, atau bukti draft yang dilepas).
create policy proofs_receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'proofs' and name like 'receipts/%' and public.has_role('admin_kelompok')
         and not exists (select 1 from public.attachments a where a.storage_path = storage.objects.name));
