-- Add missing columns to material_master table if they don't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_master' AND column_name='act_thick') THEN
        ALTER TABLE public.material_master ADD COLUMN act_thick DECIMAL(10, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_master' AND column_name='status_order') THEN
        ALTER TABLE public.material_master ADD COLUMN status_order VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_master' AND column_name='kode_strip') THEN
        ALTER TABLE public.material_master ADD COLUMN kode_strip VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='material_master' AND column_name='alternative_kode_strip') THEN
        ALTER TABLE public.material_master ADD COLUMN alternative_kode_strip TEXT;
    END IF;
END $$;

-- Create missing tables
CREATE TABLE IF NOT EXISTS public.min_max_stock (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer VARCHAR(255),
    kode_st VARCHAR(255),
    kode_lt VARCHAR(255),
    min_stock INTEGER DEFAULT 0,
    max_stock INTEGER DEFAULT 0,
    jenis VARCHAR(100),
    class VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.master_data_coil (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode_material_strip VARCHAR(255),
    kode_material_coil VARCHAR(255),
    alternative_kode_material_coil TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.storage_location (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sloc VARCHAR(50),
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_strip (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode_material_strip VARCHAR(255),
    qty_kg DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.stock_coil (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kode_material_coil VARCHAR(255),
    qty_kg DECIMAL(12, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
