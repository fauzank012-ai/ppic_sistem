-- Fix for the "invalid value 'Mare' for 'YYYY'" error
-- This error occurs because 'periode' is being implicitly or explicitly cast to DATE,
-- but it contains text values like 'Maret-2026'.

-- 1. Ensure 'periode' columns are TEXT in all source tables
ALTER TABLE public.sales_orders ALTER COLUMN periode TYPE TEXT;
ALTER TABLE public.forecasts ALTER COLUMN periode TYPE TEXT;
ALTER TABLE public.deliveries ALTER COLUMN periode TYPE TEXT;

-- 2. Drop the existing view/materialized view and triggers
DROP TRIGGER IF EXISTS refresh_report_on_mm_change ON public.material_master;
DROP TRIGGER IF EXISTS refresh_report_on_loo_change ON public.loo_data;
DROP TRIGGER IF EXISTS refresh_report_on_so_change ON public.sales_orders;
DROP TRIGGER IF EXISTS refresh_report_on_stock_change ON public.stocks;
DROP TRIGGER IF EXISTS refresh_report_on_delivery_change ON public.deliveries;
DROP TRIGGER IF EXISTS refresh_report_on_forecast_change ON public.forecasts;

DROP VIEW IF EXISTS public.report_view_mat CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.report_view_mat CASCADE;

-- 3. Recreate mapped_deliveries view with explicit cast
DROP VIEW IF EXISTS public.mapped_deliveries CASCADE;
CREATE OR REPLACE VIEW public.mapped_deliveries AS
SELECT 
    d.*,
    m.canonical_kode_st as mapped_kode_st,
    m.id as material_id
FROM public.deliveries d
LEFT JOIN public.material_codes_expanded m ON 
    d.normalized_customer = m.normalized_customer AND
    d.normalized_kode_st = m.normalized_code;

-- 4. Recreate the Materialized View with explicit CAST to TEXT for periode
CREATE MATERIALIZED VIEW public.report_view_mat AS
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
stock_agg AS (
    SELECT normalized_kode_material as normalized_kode_st, SUM(wip_lt_pcs) as wip_lt_pcs, SUM(wip_st_pcs) as wip_st_pcs, SUM(fg_st_pcs) as fg_st_pcs
    FROM public.stocks
    GROUP BY normalized_kode_material
),
delivery_agg AS (
    SELECT 
        normalized_customer, 
        lower(regexp_replace(mapped_kode_st, '\s+', '', 'g')) as normalized_kode_st, 
        CAST(periode AS TEXT) as periode,
        SUM(qty_delivery_pcs) as total_delivery_pcs,
        COUNT(DISTINCT tanggal_delivery) as unique_days,
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
    -- n_c_st (Net Requirement) calculation
    CASE 
        WHEN EXTRACT(DAY FROM CURRENT_DATE) <= 15 THEN
            CASE 
                WHEN forecast_pcs > order_pcs THEN (loo_kg + sisa_order_kg + (forecast_kg - order_kg))
                ELSE (loo_kg + sisa_order_kg)
            END
        ELSE (loo_kg + sisa_order_kg)
    END as n_c_st,
    -- Total Stok
    (konversi_st_pcs + wip_st_pcs + fg_st_pcs) as total_stok_pcs,
    -- Percentages
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

-- 5. Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_report_view_mat_unique ON public.report_view_mat(customer, kode_st, periode);
CREATE INDEX idx_report_view_mat_periode ON public.report_view_mat(periode);

-- 6. Recreate triggers
CREATE OR REPLACE FUNCTION refresh_report_view()
RETURNS TRIGGER AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.report_view_mat;
    RETURN NULL;
EXCEPTION
    WHEN OTHERS THEN
        -- Fallback to non-concurrent refresh if concurrent fails
        REFRESH MATERIALIZED VIEW public.report_view_mat;
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER refresh_report_on_mm_change 
AFTER INSERT OR UPDATE OR DELETE ON public.material_master 
FOR EACH STATEMENT EXECUTE FUNCTION refresh_report_view();

CREATE TRIGGER refresh_report_on_loo_change 
AFTER INSERT OR UPDATE OR DELETE ON public.loo_data 
FOR EACH STATEMENT EXECUTE FUNCTION refresh_report_view();

CREATE TRIGGER refresh_report_on_so_change 
AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders 
FOR EACH STATEMENT EXECUTE FUNCTION refresh_report_view();

CREATE TRIGGER refresh_report_on_stock_change 
AFTER INSERT OR UPDATE OR DELETE ON public.stocks 
FOR EACH STATEMENT EXECUTE FUNCTION refresh_report_view();

CREATE TRIGGER refresh_report_on_delivery_change 
AFTER INSERT OR UPDATE OR DELETE ON public.deliveries 
FOR EACH STATEMENT EXECUTE FUNCTION refresh_report_view();

CREATE TRIGGER refresh_report_on_forecast_change 
AFTER INSERT OR UPDATE OR DELETE ON public.forecasts 
FOR EACH STATEMENT EXECUTE FUNCTION refresh_report_view();
