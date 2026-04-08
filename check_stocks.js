import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const { data, error } = await supabase.from('stocks').select('created_at, normalized_kode_material').order('created_at', { ascending: false }).limit(5);
  console.log("DATA:", data);
}
run();
