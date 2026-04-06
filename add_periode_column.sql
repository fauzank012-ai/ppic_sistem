-- Rename and change type for sales_orders
ALTER TABLE sales_orders RENAME COLUMN periode_bulan TO periode;
ALTER TABLE sales_orders ALTER COLUMN periode TYPE TEXT;

-- Rename and change type for forecasts
ALTER TABLE forecasts RENAME COLUMN periode_bulan TO periode;
ALTER TABLE forecasts ALTER COLUMN periode TYPE TEXT;

-- Rename and change type for deliveries
ALTER TABLE deliveries RENAME COLUMN periode_bulan TO periode;
ALTER TABLE deliveries ALTER COLUMN periode TYPE TEXT;

-- Add periode column to others
ALTER TABLE p3_data ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE cois_prod ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE down_time ADD COLUMN IF NOT EXISTS periode TEXT;
ALTER TABLE down_grade ADD COLUMN IF NOT EXISTS periode TEXT;
