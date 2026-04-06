import { useState, useEffect, ChangeEvent } from 'react';
import { Check, UploadCloud, FileSpreadsheet } from 'lucide-react';
import { supabase, fetchFromBackend } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { 
  readExcel, 
  normalizeData, 
  uploadSO, 
  uploadLOO, 
  uploadDelivery, 
  uploadStock, 
  uploadForecast, 
  uploadP3, 
  uploadStockStrip, 
  uploadStockCoil, 
  uploadMB51Prod, 
  uploadCoisProd, 
  uploadAverageOrder,
  uploadDaftarShift,
  uploadDowntime,
  uploadDownGrade,
  uploadPlanSchedule
} from '../services/uploadService';

type TabType = 'forecast' | 'so' | 'loo' | 'p3' | 'delivery' | 'stock' | 'stock_strip' | 'stock_coil' | 'mb51_prod' | 'cois_prod' | 'average_order' | 'daftar_shift' | 'downtime' | 'down_grade' | 'plan_schedule';

interface TabInfo {
  id: TabType;
  title: string;
  desc: string;
  table: string;
}

const TABS: TabInfo[] = [
  { id: 'forecast', title: 'Forecast', desc: 'Upload file Excel khusus Forecast', table: 'forecasts' },
  { id: 'so', title: 'SO', desc: 'Upload file Excel khusus Sales Order', table: 'sales_orders' },
  { id: 'loo', title: 'LOO', desc: 'Upload file Excel khusus LOO', table: 'loo_data' },
  { id: 'p3', title: 'P3', desc: 'Upload file Excel khusus P3', table: 'p3_data' },
  { id: 'delivery', title: 'Delivery', desc: 'Upload file Excel khusus Delivery', table: 'deliveries' },
  { id: 'stock', title: 'Stok', desc: 'Upload file Excel khusus Stok', table: 'stocks' },
  { id: 'stock_strip', title: 'Stock Strip', desc: 'Upload file Excel Stock Strip', table: 'stock_strip' },
  { id: 'stock_coil', title: 'Stock Coil', desc: 'Upload file Excel Stock Coil', table: 'stock_coil' },
  { id: 'mb51_prod', title: 'MB51 Prod', desc: 'Upload file Excel MB51 Prod', table: 'mb51_prod' },
  { id: 'cois_prod', title: 'Cois Prod', desc: 'Upload file Excel Cois Prod', table: 'cois_prod' },
  { id: 'average_order', title: 'Average Order', desc: 'Upload file Excel Average Order', table: 'average_order' },
  { id: 'daftar_shift', title: 'Daftar Shift', desc: 'Upload file Excel Daftar Shift', table: 'daftar_shift' },
  { id: 'downtime', title: 'Down Time', desc: 'Upload file Excel Down Time', table: 'down_time' },
  { id: 'down_grade', title: 'Down Grade', desc: 'Upload file Excel Down Grade', table: 'down_grade' },
  { id: 'plan_schedule', title: 'Plan Schedule', desc: 'Upload file Excel Plan Schedule', table: 'plan_schedule' },
];

// Refactored to use uploadService
export default function UploadData() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [lastUpdates, setLastUpdates] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, { type: 'success' | 'error', text: string }>>({});
  const [stockDate, setStockDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
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

      const normalizedData = normalizeData(data);
      let count = 0;

      switch (tabId) {
        case 'so':
          count = await uploadSO(normalizedData);
          break;
        case 'loo':
          count = await uploadLOO(normalizedData);
          break;
        case 'delivery':
          count = await uploadDelivery(normalizedData);
          break;
        case 'stock':
          count = await uploadStock(normalizedData, stockDate);
          break;
        case 'forecast':
          count = await uploadForecast(normalizedData);
          break;
        case 'p3':
          count = await uploadP3(normalizedData);
          break;
        case 'stock_strip':
          count = await uploadStockStrip(normalizedData);
          break;
        case 'stock_coil':
          count = await uploadStockCoil(normalizedData);
          break;
        case 'mb51_prod':
          count = await uploadMB51Prod(normalizedData);
          break;
        case 'cois_prod':
          count = await uploadCoisProd(normalizedData);
          break;
        case 'average_order':
          count = await uploadAverageOrder(normalizedData);
          break;
        case 'daftar_shift':
          count = await uploadDaftarShift(normalizedData);
          break;
        case 'downtime':
          count = await uploadDowntime(normalizedData);
          break;
        case 'down_grade':
          count = await uploadDownGrade(normalizedData);
          break;
        case 'plan_schedule':
          count = await uploadPlanSchedule(normalizedData);
          break;
        default:
          throw new Error('Tipe tab tidak dikenal.');
      }
      
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
                  <div className="p-2 bg-teal-50 rounded-lg">
                    <FileSpreadsheet className="w-6 h-6 text-teal-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{tab.title}</h3>
                    <p className="text-xs text-gray-500">{tab.desc}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end space-y-1">
                  {count > 0 && (
                    <div className="flex items-center space-x-1 bg-green-50 px-2 py-1 rounded text-green-700 text-xs font-medium border border-green-200">
                      <Check className="w-3 h-3" />
                      <span>{count.toLocaleString()} baris</span>
                    </div>
                  )}
                  {lastUpdate && (
                    <div className="text-[10px] text-gray-400">
                      Last update: {new Date(lastUpdate).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>

              {msg && (
                <div className={`mb-4 p-3 rounded-lg text-xs ${msg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {msg.text}
                </div>
              )}

              {tab.id === 'stock' && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Tanggal Data Stock</label>
                  <input
                    type="date"
                    value={stockDate}
                    onChange={(e) => setStockDate(e.target.value)}
                    className="w-full text-sm border border-gray-300 rounded-md shadow-sm px-3 py-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                  />
                </div>
              )}

              <div className="mt-auto pt-4 border-t border-gray-100">
                <label className={`flex items-center justify-center w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  isLoad 
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                    : 'bg-teal-600 hover:bg-teal-700 text-white shadow-sm'
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
