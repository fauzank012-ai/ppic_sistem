import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const { data, error } = await supabase.from('material_master').select('kode_st, alternative_kodes_st, alternative_kodes_lt').limit(5);
  console.log("DATA:", data);
}
run();
