-- 1. Remove aggressive triggers to prevent database overload during bulk imports
-- Instead of automatic refresh, we'll rely on manual refresh via dashboard or scheduled refresh
DROP TRIGGER IF EXISTS refresh_report_on_mm_change ON public.material_master;
DROP TRIGGER IF EXISTS refresh_report_on_loo_change ON public.loo_data;
DROP TRIGGER IF EXISTS refresh_report_on_so_change ON public.sales_orders;
DROP TRIGGER IF EXISTS refresh_report_on_stock_change ON public.stocks;
DROP TRIGGER IF EXISTS refresh_report_on_delivery_change ON public.deliveries;
DROP TRIGGER IF EXISTS refresh_report_on_forecast_change ON public.forecasts;

-- 2. Add composite indexes for frequently filtered columns to optimize query performance
-- Index for material_master filtering
CREATE INDEX IF NOT EXISTS idx_material_master_status_order ON public.material_master(status_order);

-- Composite index for sales_orders (status_order is not in sales_orders, but periode is)
CREATE INDEX IF NOT EXISTS idx_sales_orders_periode ON public.sales_orders(periode);

-- Composite index for forecasts
CREATE INDEX IF NOT EXISTS idx_forecasts_periode ON public.forecasts(periode);

-- 3. Schedule refresh with pg_cron (Ensure extension is enabled)
-- This command must be run in the Supabase SQL editor
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('refresh-report-view', '*/15 * * * *', 'SELECT public.refresh_report_view()');

-- 4. Verify current indexes on the materialized view
-- These were already created in fix_report_view.sql but ensuring they exist
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_view_mat_unique ON public.report_view_mat(customer, kode_st);
CREATE INDEX IF NOT EXISTS idx_report_view_mat_id ON public.report_view_mat(id);
