-- Add work_center column to saved sliting tables
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='saved_coil_input' AND column_name='work_center') THEN
        ALTER TABLE public.saved_coil_input ADD COLUMN work_center VARCHAR(100);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='saved_sliting_combination' AND column_name='work_center') THEN
        ALTER TABLE public.saved_sliting_combination ADD COLUMN work_center VARCHAR(100);
    END IF;
END $$;
