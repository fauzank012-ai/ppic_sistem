-- 1. Add new 'periode' column to tables
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE forecasts ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE p3_data ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE cois_prod ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE down_time ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE down_grade ADD COLUMN IF NOT EXISTS periode TEXT;

-- 2. Populate new 'periode' column from 'periode_bulan' where applicable
-- We do not drop or rename the old column to avoid breaking existing views
UPDATE sales_orders SET periode = CAST(periode_bulan AS TEXT) WHERE periode_bulan IS NOT NULL;
UPDATE forecasts SET periode = CAST(periode_bulan AS TEXT) WHERE periode_bulan IS NOT NULL;
UPDATE deliveries SET periode = CAST(periode_bulan AS TEXT) WHERE periode_bulan IS NOT NULL;
