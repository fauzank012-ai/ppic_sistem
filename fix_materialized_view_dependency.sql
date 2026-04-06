-- 1. Drop the materialized view that depends on the column
DROP MATERIALIZED VIEW IF EXISTS public.report_view_mat CASCADE;

-- 2. Rename and change type for sales_orders
ALTER TABLE sales_orders RENAME COLUMN periode_bulan TO periode;
ALTER TABLE sales_orders ALTER COLUMN periode TYPE TEXT;

-- 3. Rename and change type for forecasts
ALTER TABLE forecasts RENAME COLUMN periode_bulan TO periode;
ALTER TABLE forecasts ALTER COLUMN periode TYPE TEXT;

-- 4. Rename and change type for deliveries
ALTER TABLE deliveries RENAME COLUMN periode_bulan TO periode;
ALTER TABLE deliveries ALTER COLUMN periode TYPE TEXT;

-- 5. Add periode column to others
ALTER TABLE p3_data ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE cois_prod ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE down_time ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE down_grade ADD COLUMN IF NOT EXISTS periode TEXT;

-- 6. Recreate the Materialized View (from fix_report_view.sql)
CREATE MATERIALIZED VIEW public.report_view_mat AS
WITH 
combinations AS (
    SELECT DISTINCT normalized_customer, normalized_kode_st, periode FROM public.sales_orders
    UNION
    SELECT DISTINCT normalized_customer, normalized_kode_st, periode FROM public.forecasts
    UNION
    SELECT DISTINCT normalized_customer, normalized_kode_st, periode FROM public.deliveries
),
loo_agg AS (
    SELECT normalized_customer, normalized_kode_st, SUM(sisa_loo_pcs) as loo_pcs, SUM(sisa_order_pcs) as sisa_order_pcs
    FROM public.loo_data
    GROUP BY normalized_customer, normalized_kode_st
),
so_agg AS (
    SELECT normalized_customer, normalized_kode_st, periode, SUM(qty_order_pcs) as order_pcs
    FROM public.sales_orders
    GROUP BY normalized_customer, normalized_kode_st, periode
),
forecast_agg AS (
    SELECT normalized_customer, normalized_kode_st, periode, SUM(qty_pcs) as forecast_pcs
    FROM public.forecasts
    GROUP BY normalized_customer, normalized_kode_st, periode
),
stock_agg AS (
    SELECT normalized_kode_material as normalized_kode_st, SUM(wip_lt_pcs) as wip_lt_pcs, SUM(wip_st_pcs) as wip_st_pcs, SUM(fg_st_pcs) as fg_st_pcs
    FROM public.stocks
    GROUP BY normalized_kode_material
),
delivery_agg AS (
    SELECT 
        normalized_customer, 
        lower(regexp_replace(mapped_kode_st, '\s+', '', 'g')) as normalized_kode_st, 
        periode,
        SUM(qty_delivery_pcs) as total_delivery_pcs,
        COUNT(DISTINCT tanggal_delivery) as unique_days,
        MAX(tanggal_delivery) as last_delivery_date
    FROM public.mapped_deliveries
    WHERE mapped_kode_st IS NOT NULL
    GROUP BY normalized_customer, lower(regexp_replace(mapped_kode_st, '\s+', '', 'g')), periode
),
base_report AS (
    SELECT 
        c.periode,
        m.*,
        COALESCE(l.loo_pcs, 0) as loo_pcs,
        COALESCE(l.loo_pcs, 0) * m.berat_per_pcs as loo_kg,
        COALESCE(l.sisa_order_pcs, 0) as sisa_order_pcs,
        COALESCE(l.sisa_order_pcs, 0) * m.berat_per_pcs as sisa_order_kg,
        COALESCE(s.order_pcs, 0) as order_pcs,
        COALESCE(s.order_pcs, 0) * m.berat_per_pcs as order_kg,
        COALESCE(f.forecast_pcs, 0) as forecast_pcs,
        COALESCE(f.forecast_pcs, 0) * m.berat_per_pcs as forecast_kg,
        COALESCE(st.wip_lt_pcs, 0) as wip_lt_pcs,
        COALESCE(st.wip_lt_pcs, 0) * COALESCE(m.konversi_lt_ke_st, 0) as konversi_st_pcs,
        COALESCE(st.wip_lt_pcs, 0) * COALESCE(m.konversi_lt_ke_st, 0) * m.berat_per_pcs as konversi_st_kg,
        COALESCE(st.wip_st_pcs, 0) as wip_st_pcs,
        COALESCE(st.wip_st_pcs, 0) * m.berat_per_pcs as wip_st_kg,
        COALESCE(st.fg_st_pcs, 0) as fg_st_pcs,
        COALESCE(st.fg_st_pcs, 0) * m.berat_per_pcs as fg_kg,
        COALESCE(d.total_delivery_pcs, 0) as total_delivery_pcs,
        COALESCE(d.total_delivery_pcs, 0) * m.berat_per_pcs as total_delivery_kg,
        CASE 
          WHEN COALESCE(d.unique_days, 0) > 0 
          THEN CAST(d.total_delivery_pcs AS REAL) / d.unique_days
          ELSE 0 
        END as avg_delivery_per_day,
        d.last_delivery_date
    FROM combinations c
    JOIN public.material_master m ON c.normalized_customer = m.normalized_customer AND c.normalized_kode_st = m.normalized_kode_st
    LEFT JOIN loo_agg l ON m.normalized_customer = l.normalized_customer AND m.normalized_kode_st = l.normalized_kode_st
    LEFT JOIN so_agg s ON m.normalized_customer = s.normalized_customer AND m.normalized_kode_st = s.normalized_kode_st AND c.periode = s.periode
    LEFT JOIN forecast_agg f ON m.normalized_customer = f.normalized_customer AND m.normalized_kode_st = f.normalized_kode_st AND c.periode = f.periode
    LEFT JOIN stock_agg st ON m.normalized_kode_st = st.normalized_kode_st
    LEFT JOIN delivery_agg d ON m.normalized_customer = d.normalized_customer AND m.normalized_kode_st = d.normalized_kode_st AND c.periode = d.periode
)
SELECT 
    *,
    (konversi_st_pcs + wip_st_pcs + fg_st_pcs - sisa_order_pcs) as balance_pcs,
    (konversi_st_pcs + wip_st_pcs + fg_st_pcs - sisa_order_pcs) * berat_per_pcs as balance_kg,
    CASE 
        WHEN EXTRACT(DAY FROM CURRENT_DATE) <= 15 THEN
            CASE 
                WHEN forecast_pcs > order_pcs THEN (loo_kg + sisa_order_kg + (forecast_kg - order_kg))
                ELSE (loo_kg + sisa_order_kg)
            END
        ELSE (loo_kg + sisa_order_kg)
    END as n_c_st,
    (konversi_st_pcs + wip_st_pcs + fg_st_pcs) as total_stok_pcs,
    CASE 
        WHEN (konversi_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (konversi_st_pcs * 100.0) / (konversi_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_lt_pcs,
    CASE 
        WHEN (konversi_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (konversi_st_pcs * 100.0) / (konversi_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_lt_kg_val,
    CASE 
        WHEN (konversi_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (wip_st_pcs * 100.0) / (konversi_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_st_pcs,
    CASE 
        WHEN (konversi_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (wip_st_pcs * 100.0) / (konversi_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_st_kg,
    CASE 
        WHEN avg_delivery_per_day > 0 
        THEN fg_st_pcs / avg_delivery_per_day
        ELSE 0 
    END as doc_fg,
    CASE 
        WHEN avg_delivery_per_day > 0 
        THEN wip_st_pcs / avg_delivery_per_day
        ELSE 0 
    END as doc_wip,
    CASE 
        WHEN avg_delivery_per_day > 0 
        THEN wip_lt_pcs / avg_delivery_per_day
        ELSE 0 
    END as doc_wip_lt,
    CASE 
        WHEN (konversi_st_pcs + wip_st_pcs + fg_st_pcs - sisa_order_pcs) < 0 THEN 'Alert' 
        ELSE 'OK' 
    END as alert_st,
    CASE 
        WHEN avg_delivery_per_day > 0 AND (wip_lt_pcs / avg_delivery_per_day) < 7 THEN 'Alert' 
        ELSE 'OK' 
    END as alert_lt
FROM base_report
WITH DATA;

-- 7. Recreate indexes on materialized view
CREATE UNIQUE INDEX idx_report_view_mat_unique ON public.report_view_mat(customer, kode_st, periode);
CREATE INDEX idx_report_view_mat_id ON public.report_view_mat(id);
CREATE INDEX idx_report_view_mat_norm_cust ON public.report_view_mat(normalized_customer);
CREATE INDEX idx_report_view_mat_norm_st ON public.report_view_mat(normalized_kode_st);
CREATE INDEX idx_report_view_mat_periode ON public.report_view_mat(periode);
CREATE INDEX idx_report_view_mat_status ON public.report_view_mat(status_order);
