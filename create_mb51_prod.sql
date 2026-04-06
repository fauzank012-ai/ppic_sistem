CREATE TABLE IF NOT EXISTS public.mb51_prod (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    work_centre_lt TEXT,
    order_no TEXT,
    customer TEXT,
    kode_lt TEXT,
    proses TEXT,
    gr_qty_pcs NUMERIC,
    gi_qty_kg NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.mb51_prod ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all actions for all users" ON public.mb51_prod
    FOR ALL
    USING (true)
    WITH CHECK (true);
