import { supabase, insertInChunks, upsertInChunks, fetchAllRows } from '../lib/supabase';

// Helper to read Excel file
export const readExcel = async (file: File): Promise<any[]> => {
  const xlsx = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = xlsx.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = xlsx.utils.sheet_to_json(sheet);
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsArrayBuffer(file);
  });
};

// Helper to format date for Supabase (YYYY-MM-DD)
export const formatDate = (val: any) => {
  if (!val) return null;
  
  if (typeof val === 'number') {
    // Excel serial date
    const date = new Date((val - (25567 + 2)) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }

  if (typeof val === 'string') {
    let trimmed = val.trim();
    if (trimmed.toLowerCase() === '(blank)') return null;
    
    // Remove time part if exists
    if (trimmed.includes('T')) trimmed = trimmed.split('T')[0];
    else if (trimmed.includes(' ')) trimmed = trimmed.split(' ')[0];

    const parts = trimmed.split(/[-/]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      } else if (parts[2].length === 4) {
        // DD/MM/YYYY or MM/DD/YYYY. Assume DD/MM/YYYY for Indonesia
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else if (parts[2].length === 2) {
        // DD/MM/YY
        const year = parseInt(parts[2], 10) + 2000;
        return `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }
  
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  
  return null;
};

export const parseNumber = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
};

export const normalizeData = (data: any[]) => {
  return data.map(row => {
    const newRow: any = {};
    for (const key in row) {
      const newKey = key.trim().toLowerCase()
        .replace(/[\s._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
      newRow[newKey] = row[key];
    }
    return newRow;
  });
};

export const getMaterialMappings = async () => {
  const materialData = await fetchAllRows('material_master', 'customer, kode_st, kode_lt, alternative_kodes_st, alternative_kodes_lt');
  const kodeSTMapping = new Map<string, string>();
  const kodeGeneralMapping = new Map<string, string>();

  const normalizeCust = (s: string) => {
    if (!s) return '';
    let res = s.trim().toUpperCase();
    res = res.replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '');
    return res.replace(/[^A-Z0-9]/g, '').toLowerCase();
  };

  // First pass: Register all primary kode_st to ensure they map to themselves
  materialData.forEach(m => {
    const st = (m.kode_st || '').trim().toLowerCase();
    if (st) {
      kodeGeneralMapping.set(st, m.kode_st);
    }
  });

  // Second pass: Register kode_lt and alternatives
  materialData.forEach(m => {
    const cust = normalizeCust(m.customer);
    const st = (m.kode_st || '').trim().toLowerCase();
    const lt = (m.kode_lt || '').trim().toLowerCase();

    // Customer-specific mapping (ST always maps to ST)
    if (st) kodeSTMapping.set(`${cust}|${st}`, m.kode_st);
    
    // LT maps to ST
    if (lt) {
      kodeSTMapping.set(`${cust}|${lt}`, m.kode_st);
      if (!kodeGeneralMapping.has(lt)) {
        kodeGeneralMapping.set(lt, m.kode_st);
      }
    }

    // Process alternatives
    const altST = (m.alternative_kodes_st || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
    const altLT = (m.alternative_kodes_lt || '').split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);
    
    [...altST, ...altLT].forEach(alt => {
      kodeSTMapping.set(`${cust}|${alt}`, m.kode_st);
      if (!kodeGeneralMapping.has(alt)) {
        kodeGeneralMapping.set(alt, m.kode_st);
      }
    });
  });

  return { kodeSTMapping, kodeGeneralMapping, normalizeCust };
};

export const uploadSO = async (normalizedData: any[]) => {
  const { kodeSTMapping, kodeGeneralMapping, normalizeCust } = await getMaterialMappings();
  const validData = normalizedData.filter((row: any) => row['kode_st'] || row['kode_material']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode ST" atau "Kode Material".');
  }

  const formattedData = validData.map((row: any) => {
    const cust = (row['customer'] || '').trim();
    const originalKode = (row['kode_st'] || row['kode_material'] || '').trim();
    const key = `${normalizeCust(cust)}|${originalKode.toLowerCase()}`;
    let mappedKode = kodeSTMapping.get(key);
    if (!mappedKode) {
      mappedKode = kodeGeneralMapping.get(originalKode.toLowerCase()) || originalKode;
    }
    return {
      customer: cust,
      kode_st: mappedKode,
      qty_order_pcs: Math.round(parseNumber(row['qty_order_pcs'] || row['qty_order'])),
      qty_order_kg: parseNumber(row['qty_order_kg'] || row['qty_kg'] || row['order_kg']),
      periode: String(row['periode'] || row['periode_bulan'] || '').trim(),
    };
  });

  const periods = Array.from(new Set(formattedData.map((d: any) => d.periode)));
  
  for (const periode of periods) {
    await supabase.from('sales_orders').delete().eq('periode', periode);
  }
  
  await insertInChunks('sales_orders', formattedData);
  return formattedData.length;
};

export const uploadLOO = async (normalizedData: any[]) => {
  const { kodeSTMapping, kodeGeneralMapping, normalizeCust } = await getMaterialMappings();
  const validData = normalizedData.filter((row: any) => row['kode_st'] || row['kode_material']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode ST" atau "Kode Material".');
  }

  const formattedData = validData.map((row: any) => {
    const cust = (row['customer'] || '').trim();
    const originalKode = (row['kode_st'] || row['kode_material'] || '').trim();
    const key = `${normalizeCust(cust)}|${originalKode.toLowerCase()}`;
    let mappedKode = kodeSTMapping.get(key);
    if (!mappedKode) {
      mappedKode = kodeGeneralMapping.get(originalKode.toLowerCase()) || originalKode;
    }
    return {
      customer: cust,
      kode_st: mappedKode,
      sisa_loo_pcs: Math.round(parseNumber(row['sisa_loo_pcs'] || row['loo_pcs'])),
      sisa_loo_kg: parseNumber(row['sisa_loo_kg'] || row['loo_kg']),
      sisa_order_pcs: Math.round(parseNumber(row['sisa_order_pcs'] || row['sisa_order'])),
      sisa_order_kg: parseNumber(row['sisa_order_kg'] || row['order_kg']),
    };
  });

  await supabase.from('loo_data').delete().not('id', 'is', null);
  await insertInChunks('loo_data', formattedData);
  return formattedData.length;
};

export const uploadDelivery = async (normalizedData: any[]) => {
  const { kodeSTMapping, kodeGeneralMapping, normalizeCust } = await getMaterialMappings();
  const validData = normalizedData.filter((row: any) => row['kode_st'] || row['kode_material']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode ST" atau "Kode Material".');
  }

  const formattedData = validData.map((row: any) => {
    const cust = (row['customer'] || '').trim();
    const originalKode = (row['kode_st'] || row['kode_material'] || '').trim();
    const key = `${normalizeCust(cust)}|${originalKode.toLowerCase()}`;
    let mappedKode = kodeSTMapping.get(key);
    if (!mappedKode) {
      mappedKode = kodeGeneralMapping.get(originalKode.toLowerCase()) || originalKode;
    }
    return {
      customer: cust,
      kode_st: mappedKode,
      qty_delivery_pcs: Math.round(parseNumber(row['qty_delivery_pcs'] || row['qty_delivery'])),
      qty_delivery_kg: parseNumber(row['qty_delivery_kg'] || row['qty_kg'] || row['delivery_kg']),
      tanggal_delivery: formatDate(row['tanggal_delivery'] || row['tanggal']),
      periode: String(row['periode'] || row['periode_bulan'] || '').trim(),
    };
  });

  const filteredData = formattedData.filter((row: any) => {
    const kode = (row.kode_st || '').toUpperCase();
    return !(kode.startsWith('C1') || kode.startsWith('C2') || kode.startsWith('C3'));
  });

  const periods = Array.from(new Set(formattedData.map((d: any) => d.periode)));
  
  for (const periode of periods) {
    await supabase.from('deliveries').delete().eq('periode', periode);
  }
  
  await insertInChunks('deliveries', filteredData);
  return filteredData.length;
};

export const uploadStock = async (normalizedData: any[], stockDate: string) => {
  const { kodeGeneralMapping } = await getMaterialMappings();
  
  // More robust filter for material code column
  const validData = normalizedData.filter((row: any) => 
    row['kode_material'] || row['kode_st'] || row['material'] || row['item'] || row['kode'] || row['part_no']
  );
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode Material", "Kode ST", atau "Material".');
  }

  const [year, month, day] = stockDate.split('-').map(Number);
  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  
  if (isNaN(targetDate.getTime())) {
    throw new Error('Tanggal stock tidak valid.');
  }

  const formattedData = validData.map((row: any) => {
    const originalKode = (row['kode_material'] || row['kode_st'] || row['material'] || row['item'] || row['kode'] || row['part_no'] || '').trim();
    const mappedKode = kodeGeneralMapping.get(originalKode.toLowerCase()) || originalKode;
    
    // Improved mapping for all fields with more aliases
    return {
      kode_material: mappedKode,
      wip_lt_pcs: Math.round(parseNumber(row['wip_lt_pcs'] || row['wip_lt_pc'] || row['wip_lt'])),
      wip_lt_kg: parseNumber(row['wip_lt_kg'] || row['wip_lt_weight'] || (row['wip_lt_pcs'] ? row['wip_lt'] : 0)),
      wip_st_pcs: Math.round(parseNumber(row['wip_st_pcs'] || row['wip_st_pc'] || row['wip_st'])),
      wip_st_kg: parseNumber(row['wip_st_kg'] || row['wip_st_weight'] || (row['wip_st_pcs'] ? row['wip_st'] : 0)),
      fg_st_pcs: Math.round(parseNumber(row['fg_st_pcs'] || row['fg_st_pc'] || row['fg_st'])),
      fg_st_kg: parseNumber(row['fg_st_kg'] || row['fg_st_weight'] || (row['fg_st_pcs'] ? row['fg_st'] : 0)),
      fg_lt_pcs: Math.round(parseNumber(row['fg_lt_pcs'] || row['fg_lt_pc'] || row['fg_lt'])),
      fg_lt_kg: parseNumber(row['fg_lt_kg'] || row['fg_lt_weight'] || (row['fg_lt_pcs'] ? row['fg_lt'] : 0)),
      jenis_stock: row['jenis_stock'] || row['jenis_stok'] || row['jenis'] || null,
      pasm: row['pasm'] || row['status_pasm'] || null,
      lokasi_gudang: row['lokasi_gudang'] || row['gudang'] || row['location'] || null,
      sloc: row['sloc'] || row['storage_location'] || null,
      grade: row['grade'] || row['quality'] || null,
      unfifo: row['unfifo'] || null,
      created_at: targetDate.toISOString(),
    };
  });

  // Delete existing data for the same day
  await supabase.from('stocks')
    .delete()
    .gte('created_at', targetDate.toISOString())
    .lt('created_at', tomorrow.toISOString());

  await insertInChunks('stocks', formattedData);
  return formattedData.length;
};

export const uploadForecast = async (normalizedData: any[]) => {
  const { kodeSTMapping, kodeGeneralMapping, normalizeCust } = await getMaterialMappings();
  const validData = normalizedData.filter((row: any) => row['kode_st'] || row['kode_material']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode ST" atau "Kode Material".');
  }

  const formattedData = validData.map((row: any) => {
    const cust = (row['customer'] || '').trim();
    const originalKode = (row['kode_st'] || row['kode_material'] || '').trim();
    const key = `${normalizeCust(cust)}|${originalKode.toLowerCase()}`;
    let mappedKode = kodeSTMapping.get(key);
    if (!mappedKode) {
      mappedKode = kodeGeneralMapping.get(originalKode.toLowerCase()) || originalKode;
    }
    return {
      customer: cust,
      kode_st: mappedKode,
      qty_pcs: Math.round(parseNumber(row['qty_pcs'] || row['forecast_pcs'])),
      qty_forecast_kg: parseNumber(row['qty_forecast_kg'] || row['forecast_kg'] || row['qty_kg']),
      periode: String(row['periode'] || row['periode_bulan'] || '').trim(),
    };
  });

  const periods = Array.from(new Set(formattedData.map((d: any) => d.periode)));
  
  for (const periode of periods) {
    await supabase.from('forecasts').delete().eq('periode', periode);
  }
  
  await insertInChunks('forecasts', formattedData);
  return formattedData.length;
};

export const uploadP3 = async (normalizedData: any[]) => {
  const { kodeSTMapping, normalizeCust } = await getMaterialMappings();
  const validData = normalizedData.filter((row: any) => row['kode_st'] || row['kode_material']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode ST" atau "Kode Material".');
  }

  const formattedData = validData.map((row: any) => {
    const cust = (row['customer'] || '').trim();
    const originalKode = (row['kode_st'] || row['kode_material'] || '').trim();
    const key = `${normalizeCust(cust)}|${originalKode.toLowerCase()}`;
    const mappedKode = kodeSTMapping.get(key) || originalKode;
      return {
        customer: cust,
        kode_st: mappedKode,
        qty_p3_pcs: Math.round(parseNumber(row['qty_p3_pcs'] || row['qty_p3'])),
        qty_p3_kg: parseNumber(row['qty_p3_kg'] || row['qty_kg'] || row['p3_kg']),
        tanggal_delivery: formatDate(row['tanggal_delivery'] || row['tanggal']),
        periode: String(row['periode'] || '').trim(),
      };
  });

  const filteredData = formattedData.filter((row: any) => {
    const kode = (row.kode_st || '').toUpperCase();
    return !(kode.startsWith('C1') || kode.startsWith('C2') || kode.startsWith('C3'));
  });

  const periods = Array.from(new Set(formattedData.map((d: any) => d.periode)));
  
  for (const periode of periods) {
    await supabase.from('p3_data').delete().eq('periode', periode);
  }
  
  await insertInChunks('p3_data', filteredData);
  return filteredData.length;
};

export const uploadStockStrip = async (normalizedData: any[]) => {
  const validData = normalizedData.filter((row: any) => row['kode_material_strip'] || row['kode_strip']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode Material Strip" atau "Kode Strip".');
  }

  const formattedData = validData.map((row: any) => ({
    kode_material_strip: (row['kode_material_strip'] || row['kode_strip'] || '').trim(),
    qty_kg: parseNumber(row['qty_kg'] || row['qty']),
    lebar_strip: parseNumber(row['lebar_strip']),
    tebal_strip: parseNumber(row['tebal_strip']),
    spec_strip: (row['spec_strip'] || '').trim(),
  }));

  await supabase.from('stock_strip').delete().not('id', 'is', null);
  await insertInChunks('stock_strip', formattedData);
  return formattedData.length;
};

export const uploadStockCoil = async (normalizedData: any[]) => {
  const validData = normalizedData.filter((row: any) => row['kode_material_coil'] || row['kode_coil']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode Material Coil" atau "Kode Coil".');
  }

  const formattedData = validData.map((row: any) => ({
    kode_material_coil: (row['kode_material_coil'] || row['kode_coil'] || '').trim(),
    qty_kg: parseNumber(row['qty_kg'] || row['qty']),
    tebal_coil: parseNumber(row['tebal_coil'] || row['tebal']),
    lebar_coil: parseNumber(row['lebar_coil'] || row['lebar']),
    spec: (row['spec'] || '').trim(),
  }));

  await supabase.from('stock_coil').delete().not('id', 'is', null);
  await insertInChunks('stock_coil', formattedData);
  return formattedData.length;
};

export const uploadMB51Prod = async (normalizedData: any[]) => {
  const validData = normalizedData.filter((row: any) => row['order_no'] || row['kode_lt']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Order No" atau "Kode LT".');
  }

  const formattedData = validData.map((row: any) => ({
    work_centre_lt: (row['work_centre_lt'] || row['work_centre'] || '').trim(),
    order_no: String(row['order_no'] || '').trim(),
    customer: (row['customer'] || '').trim(),
    kode_lt: (row['kode_lt'] || '').trim(),
    proses: (row['proses'] || '').trim(),
    gr_qty_pcs: Math.round(parseNumber(row['gr_qty_pcs'] || row['gr_qty'] || row['gr'])),
    gr_qty_kg: parseNumber(row['gr_qty_kg'] || row['gr_kg']),
    gi_qty_kg: parseNumber(row['gi_qty_kg'] || row['gi_qty'] || row['gi']),
    tanggal: formatDate(row['tanggal'] || row['date']),
    periode: typeof row['periode'] === 'number' ? formatDate(row['periode']) : String(row['periode'] || '').trim(),
  }));

  const periods = Array.from(new Set(formattedData.map((d: any) => d.periode)));
  
  for (const periode of periods) {
    await supabase.from('mb51_prod').delete().eq('periode', periode);
  }
  
  await insertInChunks('mb51_prod', formattedData);
  return formattedData.length;
};

export const uploadCoisProd = async (normalizedData: any[]) => {
  const formattedData = normalizedData.map((row: any) => ({
    work_centre: (row['work_centre'] || '').trim(),
    order_no: (row['order_no'] || '').trim(),
    bongkar: parseNumber(row['bongkar']),
    down_time: parseNumber(row['down_time']),
    set_up: parseNumber(row['set_up']),
    machine_time: parseNumber(row['machine_time']),
    proses: (row['proses'] || '').trim(),
    tanggal: formatDate(row['tanggal']),
    periode: String(row['periode'] || '').trim(),
  }));

  const periods = Array.from(new Set(formattedData.map((d: any) => d.periode)));
  
  for (const periode of periods) {
    await supabase.from('cois_prod').delete().eq('periode', periode);
  }
  
  await insertInChunks('cois_prod', formattedData);
  return formattedData.length;
};

export const uploadAverageOrder = async (normalizedData: any[]) => {
  const validData = normalizedData.filter((row: any) => row['spec']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "spec".');
  }

  const formattedData = validData.map((row: any) => ({
    spec: String(row['spec'] || '').trim(),
    d1: String(row['d1'] || '').trim(),
    d2: String(row['d2'] || '').trim(),
    dia: String(row['dia'] || '').trim(),
    thick: String(row['thick'] || '').trim(),
    avg_order_month_3: parseNumber(row['avg_order_month_3'] || row['avg_order_3'] || row['avg_order_month_3_month'] || row['avg_order_month_3_months']),
    avg_order_month_6: parseNumber(row['avg_order_month_6'] || row['avg_order_6'] || row['avg_order_month_6_month'] || row['avg_order_month_6_months']),
    avg_order_month_12: parseNumber(row['avg_order_month_12'] || row['avg_order_12'] || row['avg_order_month_12_month'] || row['avg_order_month_12_months']),
  }));

  await supabase.from('average_order').delete().not('id', 'is', null);
  await insertInChunks('average_order', formattedData);
  return formattedData.length;
};

export const uploadDaftarShift = async (normalizedData: any[]) => {
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  
  const formattedData = normalizedData.map((row: any) => {
    const tanggal = formatDate(row['tanggal']);
    let periode = String(row['periode'] || row['periode_bulan'] || row['period'] || '').trim();
    
    // If periode is missing or in YYYY-MM format, calculate it from tanggal
    if (!periode || /^\d{4}-\d{2}$/.test(periode)) {
      if (tanggal) {
        const date = new Date(tanggal);
        const monthName = monthNames[date.getMonth()];
        const year = date.getFullYear();
        periode = `${monthName}-${year}`;
      }
    }
    
    return {
      work_center: (row['work_center'] || '').trim(),
      tanggal,
      plan_working_hour: parseNumber(row['plan_working_hour'] || row['plan_working_hours']),
      periode,
    };
  });

  await supabase.from('daftar_shift').delete().not('id', 'is', null);
  await insertInChunks('daftar_shift', formattedData);
  return formattedData.length;
};

export const uploadMaterialMaster = async (normalizedData: any[]) => {
  const formattedData = normalizedData.map((row: any) => ({
    customer: row['customer'],
    short_name_customer: row['short_name_customer'] || row['short_name'] || null,
    spec: row['spec'],
    dimensi: row['dimensi'],
    kode_st: row['kode_st'],
    kode_lt: row['kode_lt'],
    alternative_kodes_st: row['alternative_kodes_st'] || row['alternative_kode_st'] || null,
    alternative_kodes_lt: row['alternative_kodes_lt'] || row['alternative_kode_lt'] || null,
    work_center_st: row['work_center_st'],
    work_center: row['work_center_lt'] || row['work_center'] || null,
    moq: Number(row['moq']) || 0,
    d1: Number(row['d1']) || 0,
    d2: Number(row['d2']) || 0,
    dia: Number(row['dia']) || 0,
    thick: Number(row['thick']) || 0,
    length: Number(row['length']) || 0,
    berat_per_pcs: Number(row['berat_per_pcs']) || 0,
    konversi_lt_ke_st: Number(row['konversi_lt_ke_st']) || 0,
  }));
  
  // Deduplicate by kode_st
  const uniqueDataMap = new Map();
  formattedData.forEach((item: any) => {
    uniqueDataMap.set(item.kode_st, item);
  });
  const uniqueFormattedData = Array.from(uniqueDataMap.values());

  await upsertInChunks('material_master', uniqueFormattedData, 'kode_st');
  return uniqueFormattedData.length;
};

export const uploadDowntime = async (normalizedData: any[]) => {
  const validData = normalizedData.filter((row: any) => row['order_no'] || row['work_center']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Order No" atau "Work Center".');
  }

  const formattedData = validData.map((row: any) => ({
    order_no: String(row['order_no'] || '').trim(),
    work_center: String(row['work_center'] || '').trim(),
    down_time: String(row['down_time'] || '').trim(),
    down_time_kategori: String(row['down_time_kategori'] || '').trim(),
    pic_down_time: String(row['pic_down_time'] || '').trim(),
    keterangan_down_time: String(row['keterangan_down_time'] || '').trim(),
    durasi_down_time: parseNumber(row['durasi_down_time'] || row['durasi']),
    periode: String(row['periode'] || '').trim(),
    tanggal: formatDate(row['tanggal'] || row['date']),
  }));

  const periods = Array.from(new Set(formattedData.map((d: any) => d.periode)));
  
  for (const periode of periods) {
    await supabase.from('down_time').delete().eq('periode', periode);
  }
  
  if (formattedData.length > 0) {
    await insertInChunks('down_time', formattedData);
  }
  return formattedData.length;
};

export const uploadDownGrade = async (normalizedData: any[]) => {
  const validData = normalizedData.filter((row: any) => row['order_no']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Order No".');
  }

  const formattedData = validData.map((row: any) => ({
    order_no: String(row['order_no'] || '').trim(),
    work_center: String(row['work_center'] || '').trim(),
    problem: String(row['problem'] || '').trim(),
    keterangan: String(row['keterangan'] || '').trim(),
    qty_dg_pcs: Math.round(parseNumber(row['qty_dg_pcs'] || row['qty_dg_pcs'])),
    qty_dg_kg: parseNumber(row['qty_dg_kg'] || row['qty_dg_kg']),
    qty_reject_mtr: parseNumber(row['qty_reject_mtr'] || row['qty_reject_mtr']),
    qty_reject_kg: parseNumber(row['qty_reject_kg'] || row['qty_reject_kg']),
    periode: String(row['periode'] || '').trim(),
  }));

  const periods = Array.from(new Set(formattedData.map((d: any) => d.periode)));
  
  for (const periode of periods) {
    await supabase.from('down_grade').delete().eq('periode', periode);
  }
  
  if (formattedData.length > 0) {
    await insertInChunks('down_grade', formattedData);
  }
  return formattedData.length;
};

export const uploadPlanSchedule = async (normalizedData: any[]) => {
  const validData = normalizedData.filter((row: any) => row['order_no'] || row['kode_material']);
  
  if (validData.length === 0) {
    throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Order No" atau "Kode Material".');
  }

  const formattedData = validData.map((row: any) => ({
    order_no: String(row['order_no'] || '').trim(),
    customer: String(row['customer'] || '').trim(),
    kode_material: String(row['kode_material'] || '').trim(),
    work_center: String(row['work_center'] || row['work_centre'] || row['work_centre_lt'] || row['mesin'] || '').trim(),
    tanggal_produksi: formatDate(row['tanggal_produksi'] || row['tanggal'] || row['date'] || row['tgl'] || row['tgl_produksi'] || row['plan_date'] || row['tanggal_plan']),
    qty_pc: parseNumber(row['qty_pc'] || row['qty']),
    qty_kg: parseNumber(row['qty_kg'] || row['qty_kg']),
  }));

  if (formattedData.length > 0) {
    await insertInChunks('plan_schedule', formattedData);
  }
  return formattedData.length;
};
