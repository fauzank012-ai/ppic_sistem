-- Create down_time table
CREATE TABLE IF NOT EXISTS public.down_time (
    id SERIAL PRIMARY KEY,
    order_no VARCHAR(100),
    work_center VARCHAR(100),
    down_time DECIMAL(10, 2),
    down_time_kategori VARCHAR(100),
    pic_down_time VARCHAR(100),
    keterangan_down_time TEXT,
    durasi_down_time DECIMAL(10, 2)
);

-- Enable RLS
ALTER TABLE public.down_time ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY "Enable all access for down_time" ON public.down_time FOR ALL USING (true);
