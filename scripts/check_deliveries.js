import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Attempting to fetch summary from database view (delivery_mapping_summary)...');
  const { data: viewData, error: viewError } = await supabase
    .from('delivery_mapping_summary')
    .select('*')
    .single();

  if (!viewError && viewData) {
    console.log('\n--- Results (from Database View) ---');
    console.log(`Total DB Qty: ${viewData.total_db}`);
    console.log(`Total Mapped Qty: ${viewData.total_mapped}`);
    console.log(`Difference Qty: ${viewData.total_db - viewData.total_mapped}`);
    console.log(`Unmapped row count: ${viewData.unmapped_count}`);
    console.log('\nNote: For detailed unmapped samples, use the paginated Node.js check.');
    return;
  }

  console.log('View not found or error. Falling back to paginated Node.js check...');
  await checkPaginated();
}

async function checkPaginated() {
  console.log('Fetching materials...');
  const { data: materials } = await supabase.from('material_master').select('*');
  
  const normalizeCust = (s) => (s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const normalizeCode = (s) => (s || '').replace(/\s+/g, '').toLowerCase();

  console.log('Building mapping...');
  const kodeSTMapping = new Map();
  const validPairs = new Set();

  materials.forEach((m) => {
    const cust = normalizeCust(m.customer);
    const st = normalizeCode(m.kode_st);
    const lt = normalizeCode(m.kode_lt);

    validPairs.add(`${cust}|${st}`);
    kodeSTMapping.set(`${cust}|${st}`, m.kode_st);
    
    if (lt) {
      kodeSTMapping.set(`${cust}|${lt}`, m.kode_st);
    }
    if (m.alternative_kodes_st) {
      m.alternative_kodes_st.split(',').forEach((alt) => {
        kodeSTMapping.set(`${cust}|${normalizeCode(alt)}`, m.kode_st);
      });
    }
    if (m.alternative_kodes_lt) {
      m.alternative_kodes_lt.split(',').forEach((alt) => {
        kodeSTMapping.set(`${cust}|${normalizeCode(alt)}`, m.kode_st);
      });
    }
  });

  let totalDb = 0;
  let totalMapped = 0;
  let unmappedCount = 0;
  let sampleUnmapped = [];

  console.log('Processing deliveries in chunks...');
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data: deliveries, error } = await supabase
      .from('deliveries')
      .select('*')
      .range(from, from + step - 1);

    if (error) {
      console.error('Error fetching deliveries:', error);
      break;
    }

    if (!deliveries || deliveries.length === 0) {
      hasMore = false;
      break;
    }

    deliveries.forEach(d => {
      totalDb += d.qty_delivery_pcs || 0;
      const cust = normalizeCust(d.customer);
      const code = normalizeCode(d.kode_st);
      const mappedCode = kodeSTMapping.get(`${cust}|${code}`) || d.kode_st;
      
      const exists = validPairs.has(`${cust}|${mappedCode}`);
      if (exists) {
        totalMapped += d.qty_delivery_pcs || 0;
      } else {
        unmappedCount++;
        if (sampleUnmapped.length < 5) {
          sampleUnmapped.push(d);
        }
      }
    });

    console.log(`Processed ${from + deliveries.length} deliveries...`);
    from += step;
    if (deliveries.length < step) {
      hasMore = false;
    }
  }

  console.log('\n--- Results (Paginated Node.js) ---');
  console.log(`Total DB Qty: ${totalDb}`);
  console.log(`Total Mapped Qty: ${totalMapped}`);
  console.log(`Difference Qty: ${totalDb - totalMapped}`);
  console.log(`Unmapped row count: ${unmappedCount}`);
  if (sampleUnmapped.length > 0) {
    console.log('Sample unmapped rows:', sampleUnmapped);
  }
}

check();
