import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const { data, error } = await supabase.from('report_view_mat').select('periode, normalized_kode_st, wip_st_pcs, fg_st_pcs').limit(5);
  console.log("RVM Data:", data);
  
  const { data: p3Data } = await supabase.from('p3_data').select('tanggal_delivery').limit(1);
  console.log("P3 Data sample date:", p3Data);
}
run();
