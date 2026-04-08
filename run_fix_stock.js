import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const sql = fs.readFileSync('fix_stock_agg.sql', 'utf8');
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  console.log("DATA:", data);
  console.log("ERROR:", error);
}
run();
