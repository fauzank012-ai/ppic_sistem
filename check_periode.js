import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_KEY);
async function run() {
  const { data: so } = await supabase.from('sales_orders').select('periode').limit(1);
  console.log("SO Periode:", so);
}
run();
