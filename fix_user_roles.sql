-- Script to ensure user_roles table allows new roles and has no restrictive constraints
-- Run this in your Supabase SQL Editor

-- 1. Ensure the table exists (it should, but just in case)
CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'produksi',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Enable RLS if not enabled
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Create policy to allow service role to do everything (backend uses service role)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'user_roles' AND policyname = 'Service role full access'
    ) THEN
        CREATE POLICY "Service role full access" ON public.user_roles 
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. Check for any existing CHECK constraints on the role column and drop them
-- This is often the cause of "cannot add role" errors if the DB was set up with a fixed list
DO $$ 
DECLARE 
    constraint_name TEXT;
BEGIN 
    FOR constraint_name IN 
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.user_roles'::regclass 
        AND contype = 'c' 
    LOOP
        EXECUTE 'ALTER TABLE public.user_roles DROP CONSTRAINT ' || constraint_name;
    END LOOP;
END $$;

-- 5. Explicitly allow the new roles if you want to keep a check constraint (optional, but safer to just have no constraint)
-- For now, we've dropped all check constraints in step 4.

-- 6. Ensure the column is wide enough
ALTER TABLE public.user_roles ALTER COLUMN role TYPE VARCHAR(50);
