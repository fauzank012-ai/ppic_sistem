import { useState, useEffect, ChangeEvent } from 'react';
import { Check, UploadCloud, Database } from 'lucide-react';
import { supabase, insertInChunks, upsertInChunks, fetchFromBackend } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

type TabType = 'material' | 'minmax' | 'rawmaterial' | 'mesin' | 'lebarstrip' | 'striprequirement' | 'konversispec';

interface TabInfo {
  id: TabType;
  title: string;
  desc: string;
  table: string;
}

const TABS: TabInfo[] = [
  { id: 'material', title: 'Master Material', desc: 'Upload file Excel Master Material', table: 'material_master' },
  { id: 'minmax', title: 'Min Max Stock', desc: 'Upload file Excel Min Max Stock', table: 'min_max_stock' },
  { id: 'rawmaterial', title: 'Master Data Coil', desc: 'Upload file Excel Master Data Coil', table: 'master_data_coil' },
  { id: 'mesin', title: 'Master Data Mesin', desc: 'Upload file Excel Master Data Mesin (Work Center, Shift, Hari Kerja, Kategori, Efisiensi, Target Yield, Target Roll Change)', table: 'master_data_mesin' },
  { id: 'lebarstrip', title: 'Master Lebar Strip', desc: 'Upload file Excel Master Data Lebar Strip (Bentuk, Spec, D1, D2, Dia, Thick, Strip Width)', table: 'master_lebar_strip' },
  { id: 'striprequirement', title: 'Strip Requirement', desc: 'Upload file Excel Strip Requirement (Spec, Strip Width, Net Requirement)', table: 'strip_requirement' },
  { id: 'konversispec', title: 'Master Konversi Spec', desc: 'Upload file Excel Master Konversi Spec Material (Spec, Spec Strip, Alternative Spec Strip, Spec Coil, Alternative Spec Coil)', table: 'master_konversi_spec_material' },
];

// Helper to read Excel file
const readExcel = async (file: File): Promise<any[]> => {
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

const parseNumber = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  // Handle string numbers with commas or dots
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
};

export default function MasterData() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lastUpdates, setLastUpdates] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, { type: 'success' | 'error', text: string }>>({});
  const { refreshKey } = useRefresh();

  const fetchCounts = async () => {
    const newCounts: Record<string, number> = {};
    const newLastUpdates: Record<string, string | null> = {};
    for (const tab of TABS) {
      try {
        const { count, error } = await supabase
          .from(tab.table)
          .select('*', { count: 'exact', head: true });
        
        if (!error && count !== null) {
          newCounts[tab.id] = count;
        } else {
          newCounts[tab.id] = 0;
        }

        const { data: latestData, error: latestError } = await supabase
          .from(tab.table)
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1);

        if (!latestError && latestData && latestData.length > 0) {
          newLastUpdates[tab.id] = latestData[0].created_at;
        } else {
          newLastUpdates[tab.id] = null;
        }
      } catch (err) {
        newCounts[tab.id] = 0;
        newLastUpdates[tab.id] = null;
      }
    }
    setCounts(newCounts);
    setLastUpdates(newLastUpdates);
  };

  useEffect(() => {
    fetchCounts();
  }, [refreshKey]);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>, tabId: TabType) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(prev => ({ ...prev, [tabId]: true }));
    setMessages(prev => ({ ...prev, [tabId]: undefined as any }));

    try {
      const data = await readExcel(file);
      if (!data || data.length === 0) {
        throw new Error('File Excel kosong atau tidak dapat dibaca.');
      }

      let error = null;
      let count = 0;

      // Normalize keys: lowercase, replace spaces, dots, and multiple underscores with a single underscore
      const normalizedData = data.map(row => {
        const newRow: any = {};
        for (const key in row) {
          const newKey = key.trim().toLowerCase()
            .replace(/[\s._-]+/g, '_') // Handle spaces, dots, underscores, dashes
            .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
          newRow[newKey] = row[key];
        }
        return newRow;
      });

      if (tabId === 'material') {
        const validData = normalizedData.filter((row: any) => row['kode_st'] || row['kode_material']);
        
        if (validData.length === 0) {
          throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode ST" atau "Kode Material".');
        }

        const formattedData = validData.map((row: any) => ({
          customer: (row['customer'] || '').trim(),
          short_name_customer: (row['short_name_customer'] || '').trim(),
          spec: (row['spec'] || '').trim(),
          dimensi: (row['dimensi'] || '').trim(),
          kode_st: (row['kode_st'] || row['kode_material'] || '').trim(),
          kode_lt: (row['kode_lt'] || '').trim(),
          alternative_kodes_st: (row['alternative_kodes_st'] || row['alternative_kode_st'] || '').trim(),
          alternative_kodes_lt: (row['alternative_kodes_lt'] || row['alternative_kode_lt'] || '').trim(),
          work_center_st: (row['work_center_st'] || '').trim(),
          work_center_lt: (row['work_center_lt'] || '').trim(),
          moq: Math.round(parseNumber(row['moq'])),
          d1: parseNumber(row['d1']),
          d2: parseNumber(row['d2']),
          dia: parseNumber(row['dia']),
          thick: parseNumber(row['thick']),
          act_thick: parseNumber(row['act_thick']),
          length: parseNumber(row['length']),
          berat_per_pcs: parseNumber(row['berat_per_pcs']),
          berat_per_pcs_lt: parseNumber(row['berat_per_pcs_lt']),
          konversi_lt_ke_st: parseNumber(row['konversi_lt_ke_st']),
          status_order: (row['status_order'] || '').trim(),
          kode_strip: (row['kode_strip'] || '').trim(),
          alternative_kode_strip: (row['alternative_kode_strip'] || '').trim(),
          proses: (row['proses'] || '').trim(),
          jenis_pipa: (row['jenis_pipa'] || '').trim(),
          class: (row['class'] || '').trim(),
          d_inch: (row['d"'] || row['d_inch'] || '').trim(),
          bentuk: (row['bentuk'] || '').trim(),
          lebar_strip: parseNumber(row['lebar_strip']),
          spec_strip: (row['spec_strip'] || '').trim(),
          alternative_spec_strip: (row['alternative_spec_strip'] || '').trim(),
          kg_per_jam_mill: parseNumber(row['kg_per_jam_mill']),
          pcs_per_jam_cut: parseNumber(row['pcs_per_jam_cut']),
        }));

        const uniqueDataMap = new Map();
        formattedData.forEach((item: any) => {
          uniqueDataMap.set(item.kode_st, item);
        });
        const uniqueFormattedData = Array.from(uniqueDataMap.values());

        if (uniqueFormattedData.length > 0) {
          try {
            await upsertInChunks('material_master', uniqueFormattedData, 'kode_st');
          } catch (err: any) {
            error = err;
          }
        }
        count = uniqueFormattedData.length;
      } else if (tabId === 'minmax') {
        const validData = normalizedData.filter((row: any) => row['kode_st'] || row['kode_material']);
        
        if (validData.length === 0) {
          throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode ST" atau "Kode Material".');
        }

        const formattedData = validData.map((row: any) => ({
          customer: (row['customer'] || '').trim(),
          kode_st: (row['kode_st'] || row['kode_material'] || '').trim(),
          kode_lt: (row['kode_lt'] || '').trim(),
          min_stock: parseNumber(row['min_stock']),
          max_stock: parseNumber(row['max_stock']),
          jenis: (row['jenis'] || '').trim(),
          class: (row['class'] || '').trim(),
        }));

        if (formattedData.length > 0) {
          const tabInfo = TABS.find(t => t.id === tabId);
          if (tabInfo) {
            // Only delete if we have new valid data to insert
            const { error: deleteError } = await supabase.from(tabInfo.table).delete().not('id', 'is', null);
            if (deleteError) throw deleteError;
            
            try {
              await insertInChunks(tabInfo.table, formattedData);
            } catch (err: any) {
              error = err;
            }
          }
        } else {
          throw new Error('File tidak valid. Pastikan terdapat kolom "Kode ST" atau "Kode Material".');
        }
        count = formattedData.length;
      } else if (tabId === 'rawmaterial') {
        const validData = normalizedData.filter((row: any) => row['kode_material_strip'] || row['kode_strip']);
        
        if (validData.length === 0) {
          throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Kode Material Strip" atau "Kode Strip".');
        }

        const formattedData = validData.map((row: any) => ({
          kode_material_strip: (row['kode_material_strip'] || row['kode_strip'] || '').trim(),
          kode_material_coil: (row['kode_material_coil'] || row['kode_coil'] || '').trim(),
          alternative_kode_material_coil: (row['alternative_kode_material_coil'] || row['alternative_coil'] || '').trim(),
        }));

        if (formattedData.length > 0) {
          const { error: deleteError } = await supabase.from('master_data_coil').delete().not('id', 'is', null);
          if (deleteError) throw deleteError;
          
          try {
            await insertInChunks('master_data_coil', formattedData);
          } catch (err: any) {
            error = err;
          }
        }
        count = formattedData.length;
      } else if (tabId === 'mesin') {
        const validData = normalizedData.filter((row: any) => row['work_center']);
        
        if (validData.length === 0) {
          throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Work Center".');
        }

        const formattedData = validData.map((row: any) => ({
          work_center: (row['work_center'] || '').trim().toUpperCase(),
          jumlah_shift: parseNumber(row['jumlah_shift']) || 3,
          hari_kerja_per_minggu: parseNumber(row['hari_kerja_per_minggu']) || 7,
          kategori: (row['kategori'] || '').trim(),
          efisiensi: parseNumber(row['efisiensi']) || 1.0,
          target_yield: parseNumber(row['target_yield']) || 0,
          target_roll_change: parseNumber(row['target_roll_change']) || 0,
        }));

        if (formattedData.length > 0) {
          const { error: deleteError } = await supabase.from('master_data_mesin').delete().not('id', 'is', null);
          if (deleteError) throw deleteError;
          
          try {
            await insertInChunks('master_data_mesin', formattedData);
          } catch (err: any) {
            error = err;
          }
        }
        count = formattedData.length;
      } else if (tabId === 'lebarstrip') {
        const validData = normalizedData.filter((row: any) => row['spec'] || row['strip_width']);
        
        if (validData.length === 0) {
          throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Spec" atau "Strip Width".');
        }

        const formattedData = validData.map((row: any) => ({
          bentuk: (row['bentuk'] || '').trim(),
          spec: (row['spec'] || '').trim(),
          d1: parseNumber(row['d1']),
          d2: parseNumber(row['d2']),
          dia: parseNumber(row['dia']),
          thick: parseNumber(row['thick']),
          strip_width: parseNumber(row['strip_width']),
        }));

        if (formattedData.length > 0) {
          const { error: deleteError } = await supabase.from('master_lebar_strip').delete().not('id', 'is', null);
          if (deleteError) throw deleteError;
          
          try {
            await insertInChunks('master_lebar_strip', formattedData);
          } catch (err: any) {
            error = err;
          }
        }
        count = formattedData.length;
      } else if (tabId === 'striprequirement') {
        const validData = normalizedData.filter((row: any) => row['spec'] || row['strip_width']);
        
        if (validData.length === 0) {
          throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Spec" atau "Strip Width".');
        }

        const formattedData = validData.map((row: any) => ({
          spec: (row['spec'] || '').trim(),
          strip_width: parseNumber(row['strip_width']),
          net_requirement: parseNumber(row['net_requirement'] || row['requirement']),
        }));

        if (formattedData.length > 0) {
          const { error: deleteError } = await supabase.from('strip_requirement').delete().not('id', 'is', null);
          if (deleteError) throw deleteError;
          
          try {
            await insertInChunks('strip_requirement', formattedData);
          } catch (err: any) {
            error = err;
          }
        }
        count = formattedData.length;
      } else if (tabId === 'konversispec') {
        const validData = normalizedData.filter((row: any) => row['spec'] || row['spec_strip']);
        
        if (validData.length === 0) {
          throw new Error('Tidak ada data valid ditemukan. Pastikan terdapat kolom "Spec" atau "Spec Strip".');
        }

        const formattedData = validData.map((row: any) => ({
          spec: (row['spec'] || '').trim(),
          spec_strip: (row['spec_strip'] || '').trim(),
          alternative_spec_strip: (row['alternative_spec_strip'] || '').trim(),
          spec_coil: (row['spec_coil'] || '').trim(),
          alternative_spec_coil: (row['alternative_spec_coil'] || '').trim(),
        }));

        if (formattedData.length > 0) {
          const { error: deleteError } = await supabase.from('master_konversi_spec_material').delete().not('id', 'is', null);
          if (deleteError) throw deleteError;
          
          try {
            await insertInChunks('master_konversi_spec_material', formattedData);
          } catch (err: any) {
            error = err;
          }
        }
        count = formattedData.length;
      } else {
        // For other master data types, we just insert the normalized data
        if (normalizedData.length > 0) {
          const tabInfo = TABS.find(t => t.id === tabId);
          if (tabInfo) {
            await supabase.from(tabInfo.table).delete().not('id', 'is', null);
            try {
              await insertInChunks(tabInfo.table, normalizedData);
            } catch (err: any) {
              error = err;
            }
          }
        }
        count = normalizedData.length;
      }

      if (error) throw error;
      
      // Refresh the materialized view
      try {
        await fetchFromBackend('/api/refresh', { method: 'POST' });
      } catch (refreshErr) {
        console.error('Error triggering refresh:', refreshErr);
      }
      
      let successMsg = `Berhasil upload ${count} baris!`;
      
      setMessages(prev => ({ ...prev, [tabId]: { type: 'success', text: successMsg } }));
      fetchCounts(); // Refresh counts
      
      // Clear the input
      event.target.value = '';
    } catch (err: any) {
      console.error(err);
      setMessages(prev => ({ ...prev, [tabId]: { type: 'error', text: err.message || 'Gagal upload file.' } }));
    } finally {
      setLoading(prev => ({ ...prev, [tabId]: false }));
    }
  };

  return (
    <div className="px-8 py-4 space-y-4 bg-[#FDFBF7] min-h-screen font-sans text-gray-900">
      {/* Upload Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {TABS.map((tab) => {
          const count = counts[tab.id] || 0;
          const lastUpdate = lastUpdates[tab.id];
          const isLoad = loading[tab.id];
          const msg = messages[tab.id];
          
          return (
            <div key={tab.id} className="bg-white border border-gray-200 rounded-xl p-6 flex flex-col relative overflow-hidden shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-gray-300">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <Database className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{tab.title}</h3>
                    <p className="text-xs text-gray-500">{tab.desc}</p>
                  </div>
                </div>
                {count > 0 && (
                  <div className="flex items-center space-x-1 bg-green-50 px-2 py-1 rounded text-green-700 text-xs font-medium border border-green-200">
                    <Check className="w-3 h-3" />
                    <span>{count.toLocaleString()} baris</span>
                  </div>
                )}
              </div>

              {lastUpdate && (
                <div className="mb-4 flex items-center text-[10px] text-gray-400 uppercase tracking-wider">
                  <span className="mr-1.5">Last Update:</span>
                  <span className="font-medium text-gray-600">
                    {new Date(lastUpdate).toLocaleString('id-ID', { 
                      day: '2-digit', 
                      month: 'short', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              )}

              {msg && (
                <div className={`mb-4 p-3 rounded-lg text-xs ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {msg.text}
                </div>
              )}

              <div className="mt-auto pt-4 border-t border-gray-100">
                <label className={`flex items-center justify-center w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  isLoad 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                }`}>
                  {isLoad ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4 mr-2" />
                      Upload File {tab.title}
                    </>
                  )}
                  <input 
                    type="file" 
                    className="hidden" 
                    accept=".xlsx, .xls" 
                    onChange={(e) => handleFileUpload(e, tab.id)}
                    disabled={isLoad}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
