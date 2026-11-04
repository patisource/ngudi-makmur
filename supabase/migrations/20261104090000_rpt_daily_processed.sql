-- Q19 (keputusan pengguna 4 Nov 2026): grafik dashboard "Jagung masuk vs jagung diolah".
-- "Jagung diolah" = kg bahan (tongkol) yang masuk batch PEMIPILAN terkonfirmasi pada hari itu. Penepungan tidak dihitung
-- agar jagung yang sama tidak terhitung dua kali (tongkol → pipilan → tepung).
-- Kolom return berubah, jadi fungsi dibuat ulang (CREATE OR REPLACE tidak bisa mengubah kolom RETURNS TABLE).

drop function public.rpt_daily(date, date);

create function public.rpt_daily(p_from date, p_to date)
returns table (day date, receipts_kg numeric, flour_kg numeric, sales_kg numeric, processed_kg numeric)
language sql stable security invoker set search_path = '' as $$
  select d::date,
         coalesce((select sum(r.weight_kg) from public.receipts r where r.status = 'confirmed' and r.business_date = d::date), 0),
         coalesce((select sum(l.qty_kg) from public.production_lines l join public.production_batches b on b.id = l.batch_id join public.products p on p.id = l.product_id
                    where b.status in ('confirmed', 'pending_void') and l.direction = 'output' and p.code = 'TP' and b.business_date = d::date), 0),
         coalesce((select sum(s.qty_kg) from public.rpt_sales(d::date, d::date) s where s.kind <> 'ongkir'), 0),
         coalesce((select sum(b.input_kg) from public.production_batches b
                    where b.status in ('confirmed', 'pending_void') and b.batch_type = 'pemipilan' and b.business_date = d::date), 0)
    from generate_series(p_from, least(p_to, p_from + 366), interval '1 day') d;
$$;

revoke execute on function public.rpt_daily(date, date) from public, anon;
grant execute on function public.rpt_daily(date, date) to authenticated;

notify pgrst, 'reload schema';
