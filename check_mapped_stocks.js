import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: `
    WITH mapped_stocks AS (
        SELECT 
            s.normalized_kode_material,
            s.wip_lt_pcs,
            COALESCE(m.canonical_kode_st, s.normalized_kode_material) as mapped_kode_st
        FROM public.stocks s
        LEFT JOIN public.material_codes_expanded m ON 
            s.normalized_kode_material = m.normalized_code
        WHERE s.created_at = (SELECT MAX(created_at) FROM public.stocks)
        LIMIT 5
    )
    SELECT * FROM mapped_stocks;
  ` });
  console.log("DATA:", data);
  console.log("ERROR:", error);
}
run();
