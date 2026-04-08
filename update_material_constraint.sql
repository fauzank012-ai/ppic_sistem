-- Drop the existing unique constraint on kode_st
ALTER TABLE public.material_master DROP CONSTRAINT IF EXISTS material_master_kode_st_key;

-- Add the new composite unique constraint on kode_st and customer
ALTER TABLE public.material_master ADD CONSTRAINT material_master_kode_st_customer_key UNIQUE (kode_st, customer);
