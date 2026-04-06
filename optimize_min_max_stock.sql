-- Optimization for Min-Max Stock Report
-- Adding indexes to speed up queries and lookups

-- Indexes for min_max_stock table
CREATE INDEX IF NOT EXISTS idx_min_max_stock_jenis ON min_max_stock(jenis);
CREATE INDEX IF NOT EXISTS idx_min_max_stock_class ON min_max_stock(class);
CREATE INDEX IF NOT EXISTS idx_min_max_stock_customer ON min_max_stock(customer);
CREATE INDEX IF NOT EXISTS idx_min_max_stock_kode_st ON min_max_stock(kode_st);
CREATE INDEX IF NOT EXISTS idx_min_max_stock_kode_lt ON min_max_stock(kode_lt);

-- Indexes for stocks table
CREATE INDEX IF NOT EXISTS idx_stocks_kode_material ON stocks(kode_material);
CREATE INDEX IF NOT EXISTS idx_stocks_created_at ON stocks(created_at);

-- Index for material_master
CREATE INDEX IF NOT EXISTS idx_material_master_kode_st ON material_master(kode_st);
CREATE INDEX IF NOT EXISTS idx_material_master_kode_lt ON material_master(kode_lt);
CREATE INDEX IF NOT EXISTS idx_material_master_customer ON material_master(customer);
