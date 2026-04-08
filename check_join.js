import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const { data: stocks, error: err1 } = await supabase.from('stocks').select('normalized_kode_material, wip_lt_pcs, wip_st_pcs, fg_st_pcs, fg_lt_pcs').limit(5);
  console.log("STOCKS:", stocks);
  
  if (stocks && stocks.length > 0) {
    const { data: mm, error: err2 } = await supabase.from('material_master').select('kode_st, normalized_kode_st, normalized_kode_lt, alternative_kodes_st, alternative_kodes_lt').eq('normalized_kode_st', stocks[0].normalized_kode_material);
    console.log("MM:", mm);
  }
}
run();
