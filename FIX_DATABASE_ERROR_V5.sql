-- Fix for the "wip_lt_pcs", "wip_st_pcs", and "fg_st_pcs" calculation
-- This script updates the report_view_mat VIEW to only take the latest stock data.

-- 1. Drop existing view
DROP VIEW IF EXISTS public.report_view_mat CASCADE;

-- 2. Recreate the VIEW
CREATE OR REPLACE VIEW public.report_view_mat AS
WITH 
combinations AS (
    SELECT DISTINCT normalized_customer, normalized_kode_st, CAST(periode AS TEXT) as periode FROM public.sales_orders
    UNION
    SELECT DISTINCT normalized_customer, normalized_kode_st, CAST(periode AS TEXT) as periode FROM public.forecasts
    UNION
    SELECT DISTINCT normalized_customer, normalized_kode_st, CAST(periode AS TEXT) as periode FROM public.deliveries
),
loo_agg AS (
    SELECT normalized_customer, normalized_kode_st, SUM(sisa_loo_pcs) as loo_pcs, SUM(sisa_loo_kg) as loo_kg, SUM(sisa_order_pcs) as sisa_order_pcs, SUM(sisa_order_kg) as sisa_order_kg
    FROM public.loo_data
    GROUP BY normalized_customer, normalized_kode_st
),
so_agg AS (
    SELECT normalized_customer, normalized_kode_st, CAST(periode AS TEXT) as periode, SUM(qty_order_pcs) as order_pcs, SUM(qty_order_kg) as order_kg
    FROM public.sales_orders
    GROUP BY normalized_customer, normalized_kode_st, CAST(periode AS TEXT)
),
forecast_agg AS (
    SELECT normalized_customer, normalized_kode_st, CAST(periode AS TEXT) as periode, SUM(qty_pcs) as forecast_pcs, SUM(qty_forecast_kg) as forecast_kg
    FROM public.forecasts
    GROUP BY normalized_customer, normalized_kode_st, CAST(periode AS TEXT)
),
-- Fix: Only take the latest stock data
stock_agg AS (
    SELECT 
        normalized_kode_material as normalized_kode_st, 
        SUM(wip_lt_pcs) as wip_lt_pcs, 
        SUM(wip_st_pcs) as wip_st_pcs, 
        SUM(fg_st_pcs) as fg_st_pcs
    FROM public.stocks
    WHERE tanggal_stok = (SELECT MAX(tanggal_stok) FROM public.stocks)
    GROUP BY normalized_kode_material
),
-- Calculate 3-month rolling average
three_month_delivery_agg AS (
    SELECT 
        normalized_customer, 
        lower(regexp_replace(mapped_kode_st, '\s+', '', 'g')) as normalized_kode_st, 
        SUM(qty_delivery_pcs) as total_delivery_pcs_3m,
        COUNT(DISTINCT tanggal_delivery) as unique_days_3m
    FROM public.mapped_deliveries
    WHERE tanggal_delivery >= (CURRENT_DATE - INTERVAL '3 months')
    GROUP BY normalized_customer, lower(regexp_replace(mapped_kode_st, '\s+', '', 'g'))
),
-- Keep period-specific delivery info for last_delivery_date
delivery_agg_period AS (
    SELECT 
        normalized_customer, 
        lower(regexp_replace(mapped_kode_st, '\s+', '', 'g')) as normalized_kode_st, 
        CAST(periode AS TEXT) as periode,
        MAX(tanggal_delivery) as last_delivery_date
    FROM public.mapped_deliveries
    WHERE mapped_kode_st IS NOT NULL
    GROUP BY normalized_customer, lower(regexp_replace(mapped_kode_st, '\s+', '', 'g')), CAST(periode AS TEXT)
),
base_report AS (
    SELECT 
        c.periode,
        m.*,
        COALESCE(l.loo_pcs, 0) as loo_pcs,
        COALESCE(l.loo_kg, 0) as loo_kg,
        COALESCE(l.sisa_order_pcs, 0) as sisa_order_pcs,
        COALESCE(l.sisa_order_kg, 0) as sisa_order_kg,
        COALESCE(s.order_pcs, 0) as order_pcs,
        COALESCE(s.order_kg, 0) as order_kg,
        COALESCE(f.forecast_pcs, 0) as forecast_pcs,
        COALESCE(f.forecast_kg, 0) as forecast_kg,
        COALESCE(st.wip_lt_pcs, 0) as wip_lt_pcs,
        COALESCE(st.wip_lt_pcs, 0) * COALESCE(m.konversi_lt_ke_st, 0) as konversi_st_pcs,
        COALESCE(st.wip_lt_pcs, 0) * COALESCE(m.konversi_lt_ke_st, 0) * m.berat_per_pcs as konversi_st_kg,
        COALESCE(st.wip_st_pcs, 0) as wip_st_pcs,
        COALESCE(st.wip_st_pcs, 0) * m.berat_per_pcs as wip_st_kg,
        COALESCE(st.fg_st_pcs, 0) as fg_st_pcs,
        COALESCE(st.fg_st_pcs, 0) * m.berat_per_pcs as fg_kg,
        COALESCE(t.total_delivery_pcs_3m, 0) as total_delivery_pcs_3m,
        CASE 
          WHEN COALESCE(t.unique_days_3m, 0) > 0 
          THEN CAST(t.total_delivery_pcs_3m AS REAL) / t.unique_days_3m
          ELSE 0 
        END as avg_delivery_per_day,
        dp.last_delivery_date
    FROM combinations c
    JOIN public.material_master m ON c.normalized_customer = m.normalized_customer AND c.normalized_kode_st = m.normalized_kode_st
    LEFT JOIN loo_agg l ON m.normalized_customer = l.normalized_customer AND m.normalized_kode_st = l.normalized_kode_st
    LEFT JOIN so_agg s ON m.normalized_customer = s.normalized_customer AND m.normalized_kode_st = s.normalized_kode_st AND c.periode = s.periode
    LEFT JOIN forecast_agg f ON m.normalized_customer = f.normalized_customer AND m.normalized_kode_st = f.normalized_kode_st AND c.periode = f.periode
    LEFT JOIN stock_agg st ON m.normalized_kode_st = st.normalized_kode_st
    LEFT JOIN three_month_delivery_agg t ON m.normalized_customer = t.normalized_customer AND m.normalized_kode_st = t.normalized_kode_st
    LEFT JOIN delivery_agg_period dp ON m.normalized_customer = dp.normalized_customer AND m.normalized_kode_st = dp.normalized_kode_st AND c.periode = dp.periode
)
SELECT 
    *,
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
    END as persentase_st_kg_val,
    CASE 
        WHEN (konversi_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (fg_st_pcs * 100.0) / (konversi_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_fg_pcs,
    CASE 
        WHEN (konversi_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (fg_st_pcs * 100.0) / (konversi_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_fg_kg_val
FROM base_report;
