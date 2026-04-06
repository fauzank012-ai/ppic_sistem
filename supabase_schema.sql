-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Table Material Master
CREATE TABLE public.material_master (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer VARCHAR(255),
    short_name_customer VARCHAR(100),
    spec VARCHAR(255),
    dimensi VARCHAR(255),
    kode_st VARCHAR(255) NOT NULL,
    kode_lt VARCHAR(255),
    alternative_kodes_st TEXT, -- Comma-separated alternative codes for ST
    alternative_kodes_lt TEXT, -- Comma-separated alternative codes for LT
    work_center_st VARCHAR(100),
    work_center_lt VARCHAR(100),
    moq INTEGER DEFAULT 0,
    d1 DECIMAL(10, 2) DEFAULT 0,
    d2 DECIMAL(10, 2) DEFAULT 0,
    dia DECIMAL(10, 2) DEFAULT 0,
    thick DECIMAL(10, 2) DEFAULT 0,
    length DECIMAL(10, 2) DEFAULT 0,
    berat_per_pcs DECIMAL(12, 4) DEFAULT 0,
    konversi_lt_ke_st DECIMAL(10, 4) DEFAULT 0,
    -- Normalized columns for efficient joining
    normalized_customer VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(customer, '[^a-zA-Z0-9]', '', 'g'))) STORED,
    normalized_kode_st VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(kode_st, '\s+', '', 'g'))) STORED,
    normalized_kode_lt VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(kode_lt, '\s+', '', 'g'))) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(kode_st)
);

-- 2. Table SO
CREATE TABLE public.sales_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer VARCHAR(255),
    kode_st VARCHAR(255),
    qty_order_pcs INTEGER DEFAULT 0,
    periode_bulan DATE, -- Format YYYY-MM-01
    normalized_customer VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(customer, '[^a-zA-Z0-9]', '', 'g'))) STORED,
    normalized_kode_st VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(kode_st, '\s+', '', 'g'))) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Table LOO
CREATE TABLE public.loo_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer VARCHAR(255),
    kode_st VARCHAR(255),
    sisa_loo_pcs INTEGER DEFAULT 0,
    sisa_order_pcs INTEGER DEFAULT 0,
    normalized_customer VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(customer, '[^a-zA-Z0-9]', '', 'g'))) STORED,
    normalized_kode_st VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(kode_st, '\s+', '', 'g'))) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Table Delivery
CREATE TABLE public.deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer VARCHAR(255),
    kode_st VARCHAR(255),
    qty_delivery_pcs INTEGER DEFAULT 0,
    qty_delivery_kg NUMERIC DEFAULT 0,
    tanggal_delivery DATE,
    periode_bulan DATE, -- Format YYYY-MM-01
    normalized_customer VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(customer, '[^a-zA-Z0-9]', '', 'g'))) STORED,
    normalized_kode_st VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(kode_st, '\s+', '', 'g'))) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Table Stok
CREATE TABLE public.stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode_material VARCHAR(255), -- Mapping ke Kode_ST
    wip_lt_pcs INTEGER DEFAULT 0,
    wip_st_pcs INTEGER DEFAULT 0,
    fg_st_pcs INTEGER DEFAULT 0,
    fg_lt_pcs INTEGER DEFAULT 0,
    normalized_kode_material VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(kode_material, '\s+', '', 'g'))) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Table Forecast
CREATE TABLE public.forecasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer VARCHAR(255),
    kode_st VARCHAR(255),
    qty_pcs INTEGER DEFAULT 0,
    periode_bulan DATE, -- Format YYYY-MM-01
    normalized_customer VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(customer, '[^a-zA-Z0-9]', '', 'g'))) STORED,
    normalized_kode_st VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(kode_st, '\s+', '', 'g'))) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. Table P3
CREATE TABLE public.p3_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer VARCHAR(255),
    kode_st VARCHAR(255),
    tanggal_delivery DATE,
    qty_p3_pcs INTEGER DEFAULT 0,
    normalized_customer VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(customer, '[^a-zA-Z0-9]', '', 'g'))) STORED,
    normalized_kode_st VARCHAR(255) GENERATED ALWAYS AS (lower(regexp_replace(kode_st, '\s+', '', 'g'))) STORED,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. Table Master Data Mesin
CREATE TABLE public.master_data_mesin (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_center VARCHAR(100) NOT NULL UNIQUE,
    jumlah_shift INTEGER DEFAULT 3,
    hari_kerja_per_minggu INTEGER DEFAULT 7,
    kategori VARCHAR(100),
    efisiensi NUMERIC DEFAULT 1.0,
    target_yield NUMERIC DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_material_master_kode_st ON public.material_master(kode_st);
CREATE INDEX idx_material_master_norm_cust ON public.material_master(normalized_customer);
CREATE INDEX idx_material_master_norm_st ON public.material_master(normalized_kode_st);

CREATE INDEX idx_sales_orders_kode_st ON public.sales_orders(kode_st);
CREATE INDEX idx_sales_orders_norm_cust ON public.sales_orders(normalized_customer);
CREATE INDEX idx_sales_orders_norm_st ON public.sales_orders(normalized_kode_st);

CREATE INDEX idx_loo_data_kode_st ON public.loo_data(kode_st);
CREATE INDEX idx_loo_data_norm_cust ON public.loo_data(normalized_customer);
CREATE INDEX idx_loo_data_norm_st ON public.loo_data(normalized_kode_st);

CREATE INDEX idx_deliveries_kode_st ON public.deliveries(kode_st);
CREATE INDEX idx_deliveries_norm_cust ON public.deliveries(normalized_customer);
CREATE INDEX idx_deliveries_norm_st ON public.deliveries(normalized_kode_st);

CREATE INDEX idx_stocks_kode_material ON public.stocks(kode_material);
CREATE INDEX idx_stocks_norm_mat ON public.stocks(normalized_kode_material);

CREATE INDEX idx_forecasts_kode_st ON public.forecasts(kode_st);
CREATE INDEX idx_forecasts_norm_cust ON public.forecasts(normalized_customer);
CREATE INDEX idx_forecasts_norm_st ON public.forecasts(normalized_kode_st);

CREATE INDEX idx_p3_data_kode_st ON public.p3_data(kode_st);
CREATE INDEX idx_p3_data_norm_cust ON public.p3_data(normalized_customer);
CREATE INDEX idx_p3_data_norm_st ON public.p3_data(normalized_kode_st);

-- Enable RLS
ALTER TABLE public.material_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loo_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p3_data ENABLE ROW LEVEL SECURITY;

-- Create policies (Allow all access for now, adjust for production)
CREATE POLICY "Enable all access for material_master" ON public.material_master FOR ALL USING (true);
CREATE POLICY "Enable all access for sales_orders" ON public.sales_orders FOR ALL USING (true);
CREATE POLICY "Enable all access for loo_data" ON public.loo_data FOR ALL USING (true);
CREATE POLICY "Enable all access for deliveries" ON public.deliveries FOR ALL USING (true);
CREATE POLICY "Enable all access for stocks" ON public.stocks FOR ALL USING (true);
CREATE POLICY "Enable all access for forecasts" ON public.forecasts FOR ALL USING (true);
CREATE POLICY "Enable all access for p3_data" ON public.p3_data FOR ALL USING (true);

-- 8. Optimized Views for Delivery Mapping
-- This view expands material_master into all possible codes (canonical, LT, and alternatives)
-- with normalized customer and code strings for efficient joining.
CREATE OR REPLACE VIEW public.material_codes_expanded AS
WITH base AS (
    SELECT 
        id,
        customer,
        kode_st AS canonical_kode_st,
        normalized_customer,
        normalized_kode_st as normalized_code
    FROM public.material_master
    UNION
    SELECT 
        id,
        customer,
        kode_st AS canonical_kode_st,
        normalized_customer,
        normalized_kode_lt as normalized_code
    FROM public.material_master
    WHERE kode_lt IS NOT NULL AND kode_lt != ''
    UNION
    SELECT 
        id,
        customer,
        kode_st AS canonical_kode_st,
        normalized_customer,
        lower(regexp_replace(unnest(string_to_array(alternative_kodes_st, ',')), '\s+', '', 'g')) as normalized_code
    FROM public.material_master
    WHERE alternative_kodes_st IS NOT NULL AND alternative_kodes_st != ''
    UNION
    SELECT 
        id,
        customer,
        kode_st AS canonical_kode_st,
        normalized_customer,
        lower(regexp_replace(unnest(string_to_array(alternative_kodes_lt, ',')), '\s+', '', 'g')) as normalized_code
    FROM public.material_master
    WHERE alternative_kodes_lt IS NOT NULL AND alternative_kodes_lt != ''
)
SELECT DISTINCT ON (normalized_customer, normalized_code) * FROM base;

-- This view joins deliveries with the expanded material codes to provide mapped canonical codes.
CREATE OR REPLACE VIEW public.mapped_deliveries AS
SELECT 
    d.*,
    m.canonical_kode_st as mapped_kode_st,
    m.id as material_id
FROM public.deliveries d
LEFT JOIN public.material_codes_expanded m ON 
    d.normalized_customer = m.normalized_customer AND
    d.normalized_kode_st = m.normalized_code;

-- This view provides a summary of the delivery mapping results.
CREATE OR REPLACE VIEW public.delivery_mapping_summary AS
SELECT 
    COALESCE(SUM(qty_delivery_pcs), 0) as total_db,
    COALESCE(SUM(CASE WHEN material_id IS NOT NULL THEN qty_delivery_pcs ELSE 0 END), 0) as total_mapped,
    COUNT(*) FILTER (WHERE material_id IS NULL) as unmapped_count
FROM public.mapped_deliveries;

-- 9. Comprehensive Report View (Materialized for performance)
-- This view aggregates data from all tables to provide a complete report.
DROP VIEW IF EXISTS public.report_view;
DROP MATERIALIZED VIEW IF EXISTS public.report_view_mat;

CREATE MATERIALIZED VIEW public.report_view_mat AS
WITH 
loo_agg AS (
    SELECT normalized_customer, normalized_kode_st, SUM(sisa_loo_pcs) as loo_pcs, SUM(sisa_order_pcs) as sisa_order_pcs
    FROM public.loo_data
    GROUP BY normalized_customer, normalized_kode_st
),
so_agg AS (
    SELECT normalized_customer, normalized_kode_st, SUM(qty_order_pcs) as order_pcs
    FROM public.sales_orders
    GROUP BY normalized_customer, normalized_kode_st
),
forecast_agg AS (
    SELECT normalized_customer, normalized_kode_st, SUM(qty_pcs) as forecast_pcs
    FROM public.forecasts
    GROUP BY normalized_customer, normalized_kode_st
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
        SUM(qty_delivery_pcs) as total_delivery_pcs,
        COUNT(DISTINCT tanggal_delivery) as unique_days,
        MAX(tanggal_delivery) as last_delivery_date
    FROM public.mapped_deliveries
    WHERE mapped_kode_st IS NOT NULL
    GROUP BY normalized_customer, lower(regexp_replace(mapped_kode_st, '\s+', '', 'g'))
),
base_report AS (
    SELECT 
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
        COALESCE(st.wip_lt_pcs, 0) * COALESCE(m.konversi_lt_ke_st, 0) as konversi_ke_st_pcs,
        COALESCE(st.wip_lt_pcs, 0) * COALESCE(m.konversi_lt_ke_st, 0) * m.berat_per_pcs as konversi_ke_st_kg,
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
        END as average_delivery_per_day_pcs,
        d.last_delivery_date
    FROM public.material_master m
    LEFT JOIN loo_agg l ON m.normalized_customer = l.normalized_customer AND m.normalized_kode_st = l.normalized_kode_st
    LEFT JOIN so_agg s ON m.normalized_customer = s.normalized_customer AND m.normalized_kode_st = s.normalized_kode_st
    LEFT JOIN forecast_agg f ON m.normalized_customer = f.normalized_customer AND m.normalized_kode_st = f.normalized_kode_st
    LEFT JOIN stock_agg st ON m.normalized_kode_st = st.normalized_kode_st
    LEFT JOIN delivery_agg d ON m.normalized_customer = d.normalized_customer AND m.normalized_kode_st = d.normalized_kode_st
)
SELECT 
    *,
    -- Balance = (Konversi ST + WIP ST + FG) - Sisa Order
    (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs - sisa_order_pcs) as balance_pcs,
    (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs - sisa_order_pcs) * berat_per_pcs as balance_kg,
    -- Total Stok
    (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs) as total_stok_pcs,
    -- Percentages
    CASE 
        WHEN (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (konversi_ke_st_pcs * 100.0) / (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_lt_pcs,
    CASE 
        WHEN (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (konversi_ke_st_pcs * 100.0) / (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_lt_kg,
    CASE 
        WHEN (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (wip_st_pcs * 100.0) / (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_st_pcs,
    CASE 
        WHEN (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs) > 0 
        THEN (wip_st_pcs * 100.0) / (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs)
        ELSE 0 
    END as persentase_st_kg,
    -- DOC
    CASE 
        WHEN average_delivery_per_day_pcs > 0 
        THEN fg_st_pcs / average_delivery_per_day_pcs
        ELSE 0 
    END as doc_fg,
    CASE 
        WHEN average_delivery_per_day_pcs > 0 
        THEN wip_st_pcs / average_delivery_per_day_pcs
        ELSE 0 
    END as doc_wip,
    CASE 
        WHEN average_delivery_per_day_pcs > 0 
        THEN wip_lt_pcs / average_delivery_per_day_pcs
        ELSE 0 
    END as doc_wip_lt,
    -- Alerts
    CASE 
        WHEN (konversi_ke_st_pcs + wip_st_pcs + fg_st_pcs - sisa_order_pcs) < 0 THEN 'Alert' 
        ELSE 'OK' 
    END as alert_st,
    CASE 
        WHEN average_delivery_per_day_pcs > 0 AND (wip_lt_pcs / average_delivery_per_day_pcs) < 7 THEN 'Alert' 
        ELSE 'OK' 
    END as alert_lt
FROM base_report;

-- Create indexes on materialized view (Required for CONCURRENTLY)
CREATE UNIQUE INDEX idx_report_view_mat_unique ON public.report_view_mat(customer, kode_st);
CREATE INDEX idx_report_view_mat_id ON public.report_view_mat(id);
CREATE INDEX idx_report_view_mat_norm_cust ON public.report_view_mat(normalized_customer);
CREATE INDEX idx_report_view_mat_norm_st ON public.report_view_mat(normalized_kode_st);

-- Fungsi Trigger untuk Refresh Materialized View
CREATE OR REPLACE FUNCTION public.trigger_refresh_report_view()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.refresh_report_view();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Pasang Trigger di semua tabel terkait
CREATE TRIGGER refresh_report_on_mm_change 
AFTER INSERT OR UPDATE OR DELETE ON public.material_master 
FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_report_view();

CREATE TRIGGER refresh_report_on_loo_change 
AFTER INSERT OR UPDATE OR DELETE ON public.loo_data 
FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_report_view();

CREATE TRIGGER refresh_report_on_so_change 
AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders 
FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_report_view();

CREATE TRIGGER refresh_report_on_stock_change 
AFTER INSERT OR UPDATE OR DELETE ON public.stocks 
FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_report_view();

CREATE TRIGGER refresh_report_on_delivery_change 
AFTER INSERT OR UPDATE OR DELETE ON public.deliveries 
FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_report_view();

CREATE TRIGGER refresh_report_on_forecast_change 
AFTER INSERT OR UPDATE OR DELETE ON public.forecasts 
FOR EACH STATEMENT EXECUTE FUNCTION public.trigger_refresh_report_view();

-- 10. Dashboard Optimization Views
-- These views push aggregation logic to the database for faster dashboard loading.

CREATE OR REPLACE VIEW public.dashboard_order_fulfillment AS
WITH so_sum AS (
    SELECT customer, SUM(qty_order_pcs) as total_order
    FROM public.sales_orders
    GROUP BY customer
),
del_sum AS (
    SELECT customer, SUM(qty_delivery_pcs) as total_delivery
    FROM public.deliveries
    GROUP BY customer
)
SELECT 
    COALESCE(s.customer, d.customer) as "Customer",
    COALESCE(s.total_order, 0) as "Total_Order",
    COALESCE(d.total_delivery, 0) as "Total_Delivery"
FROM so_sum s
FULL OUTER JOIN del_sum d ON s.customer = d.customer;

CREATE OR REPLACE VIEW public.dashboard_stock_composition AS
SELECT 'WIP LT' AS name, COALESCE(SUM(wip_lt_pcs), 0) AS value FROM public.stocks
UNION ALL
SELECT 'WIP ST', COALESCE(SUM(wip_st_pcs), 0) FROM public.stocks
UNION ALL
SELECT 'FG', COALESCE(SUM(fg_st_pcs), 0) FROM public.stocks;

CREATE OR REPLACE VIEW public.dashboard_forecast_vs_actual AS
WITH f_sum AS (
    SELECT periode_bulan, SUM(qty_pcs) as forecast
    FROM public.forecasts
    GROUP BY periode_bulan
),
a_sum AS (
    SELECT periode_bulan, SUM(qty_delivery_pcs) as actual
    FROM public.deliveries
    GROUP BY periode_bulan
)
SELECT 
    COALESCE(f.periode_bulan, a.periode_bulan) as "Periode_bulan",
    COALESCE(f.forecast, 0) as "Forecast",
    COALESCE(a.actual, 0) as "Actual"
FROM f_sum f
FULL OUTER JOIN a_sum a ON f.periode_bulan = a.periode_bulan;

-- 11. Tables for Saved Sliting Data
CREATE TABLE IF NOT EXISTS public.saved_coil_input (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    save_date DATE NOT NULL,
    kode_material VARCHAR(255),
    coil_spec VARCHAR(255),
    batch_no VARCHAR(255),
    thick DECIMAL(10, 3),
    width DECIMAL(10, 3),
    qty INTEGER,
    coil_weight DECIMAL(12, 3),
    heat_no VARCHAR(255),
    coil_manufactur VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.saved_sliting_combination (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(255) NOT NULL,
    save_date DATE NOT NULL,
    customer VARCHAR(255),
    pipe_spec VARCHAR(255),
    d1 DECIMAL(10, 2),
    d2 DECIMAL(10, 2),
    dia DECIMAL(10, 2),
    thick DECIMAL(10, 3),
    strip_width DECIMAL(10, 3),
    net_requirement DECIMAL(12, 3),
    lines INTEGER,
    strip_weight DECIMAL(12, 3),
    total_strip_weight DECIMAL(12, 3),
    current_stock DECIMAL(12, 3),
    avg_order_month DECIMAL(12, 3),
    avg_order_month_6 DECIMAL(12, 3),
    avg_order_month_12 DECIMAL(12, 3),
    status VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 12. Table Strip Requirement
CREATE TABLE IF NOT EXISTS public.strip_requirement (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    spec VARCHAR(255),
    strip_width DECIMAL(10, 3),
    net_requirement DECIMAL(12, 3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for strip_requirement
ALTER TABLE public.strip_requirement ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for strip_requirement" ON public.strip_requirement FOR ALL USING (true);

-- Indexes for saved data
CREATE INDEX IF NOT EXISTS idx_saved_coil_date ON public.saved_coil_input(save_date);
CREATE INDEX IF NOT EXISTS idx_saved_sliting_date ON public.saved_sliting_combination(save_date);
CREATE INDEX IF NOT EXISTS idx_saved_coil_session ON public.saved_coil_input(session_id);
CREATE INDEX IF NOT EXISTS idx_saved_sliting_session ON public.saved_sliting_combination(session_id);

-- RLS for saved data
ALTER TABLE public.saved_coil_input ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_sliting_combination ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for saved_coil_input" ON public.saved_coil_input FOR ALL USING (true);
CREATE POLICY "Enable all access for saved_sliting_combination" ON public.saved_sliting_combination FOR ALL USING (true);

-- Function to refresh the materialized view
CREATE OR REPLACE FUNCTION public.refresh_report_view()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.report_view_mat;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Table Average Order
CREATE TABLE IF NOT EXISTS public.average_order (
    id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    spec VARCHAR(255),
    d1 VARCHAR(50),
    d2 VARCHAR(50),
    dia VARCHAR(50),
    thick VARCHAR(50),
    avg_order_month_3 DECIMAL(12, 3),
    avg_order_month_6 DECIMAL(12, 3),
    avg_order_month_12 DECIMAL(12, 3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for average_order
ALTER TABLE public.average_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for average_order" ON public.average_order FOR ALL USING (true);

