import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const { data, error } = await supabase.rpc('exec_sql', { sql: `
    WITH unique_material_mapping AS (
        SELECT DISTINCT ON (normalized_code) normalized_code, canonical_kode_st
        FROM public.material_codes_expanded
    ),
    mapped_stocks AS (
        SELECT 
            s.*,
            COALESCE(m.canonical_kode_st, s.normalized_kode_material) as mapped_kode_st
        FROM public.stocks s
        LEFT JOIN unique_material_mapping m ON 
            s.normalized_kode_material = m.normalized_code
        WHERE s.created_at = (SELECT MAX(created_at) FROM public.stocks)
    ),
    stock_agg AS (
        SELECT 
            lower(regexp_replace(mapped_kode_st, '\\s+', '', 'g')) as normalized_kode_st, 
            SUM(wip_lt_pcs) as wip_lt_pcs, 
            SUM(wip_st_pcs) as wip_st_pcs, 
            SUM(wip_st_kg) as wip_st_kg,
            SUM(fg_st_pcs) as fg_st_pcs,
            SUM(fg_st_kg) as fg_st_kg,
            SUM(fg_lt_pcs) as fg_lt_pcs,
            SUM(fg_lt_kg) as fg_lt_kg
        FROM mapped_stocks
        GROUP BY lower(regexp_replace(mapped_kode_st, '\\s+', '', 'g'))
    )
    SELECT * FROM stock_agg LIMIT 5;
  ` });
  console.log("DATA:", data);
}
run();
