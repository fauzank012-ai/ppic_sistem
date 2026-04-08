import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const { data, error } = await supabase.from('stocks').select('*').limit(1);
  console.log("DATA:", data);
}
run();
