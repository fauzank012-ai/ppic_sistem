-- Add order_no and keterangan columns to saved sliting tables
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='saved_coil_input' AND column_name='order_no') THEN
        ALTER TABLE public.saved_coil_input ADD COLUMN order_no VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='saved_coil_input' AND column_name='keterangan') THEN
        ALTER TABLE public.saved_coil_input ADD COLUMN keterangan TEXT;
    END IF;
END $$;
