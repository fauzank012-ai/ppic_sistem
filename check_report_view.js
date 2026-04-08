import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const { data, error } = await supabase.from('report_view_mat').select('kode_st, wip_lt_pcs, wip_st_pcs, fg_st_pcs, fg_lt_pcs').limit(5);
  console.log("DATA:", data);
  console.log("ERROR:", error);
}
run();
