import { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Download, ChevronLeft, ChevronRight, Filter, RefreshCw, BarChart3 } from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ComposedChart, Line 
} from 'recharts';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

export default function OrderMonitor() {
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [modalPage, setModalPage] = useState(1);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const itemsPerPage = 10;
  const { refreshKey } = useRefresh();

  const targetPercentage = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    
    const getWorkingDays = (startDate: Date, endDate: Date) => {
      let count = 0;
      const curDate = new Date(startDate.getTime());
      while (curDate <= endDate) {
        const dayOfWeek = curDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        
        // Libur lebaran di bulan Maret (Bulan ke-2 di JS Date)
        const isHoliday = curDate.getMonth() === 2 && [18, 20, 23, 24].includes(curDate.getDate());
        
        if (!isWeekend && !isHoliday) {
          count++;
        }
        
        curDate.setDate(curDate.getDate() + 1);
      }
      return count;
    };

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    
    const totalWorkingDays = getWorkingDays(firstDayOfMonth, lastDayOfMonth);
    const workingDaysPassed = getWorkingDays(firstDayOfMonth, now);
    
    if (totalWorkingDays === 0) return 0;
    return (workingDaysPassed / totalWorkingDays) * 100;
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [fData, soData, dData, mData] = await Promise.all([
        fetchAllRows('forecasts', 'customer,kode_st,qty_forecast_kg').catch(() => fetchAllRows('forecasts', 'customer,kode_st,qty_forecast_kg')),
        fetchAllRows('sales_orders', 'customer,kode_st,qty_order_kg').catch(() => fetchAllRows('sales_orders', 'customer,kode_st,qty_order_kg')),
        fetchAllRows('deliveries', 'customer,kode_st,qty_delivery_pcs,qty_delivery_kg'),
        fetchAllRows('material_master', 'customer,short_name_customer,kode_st,kode_lt,berat_per_pcs,dimensi,alternative_kodes_st,alternative_kodes_lt')
      ]);

      if (fData) setForecasts(fData);
      if (soData) setSalesOrders(soData);
      if (dData) setDeliveries(dData);
      if (mData) setMaterials(mData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshKey]);

  const { customerData, itemData } = useMemo(() => {
    if (!materials.length) return { customerData: [], itemData: [] };

    const normalizeCust = (s: string) => {
      if (!s) return '';
      let res = s.trim().toUpperCase();
      res = res.replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '');
      return res.replace(/[^A-Z0-9]/g, '').toLowerCase();
    };
    const weightsMap = new Map<string, number>();
    const shortNameMap = new Map<string, string>();
    const dimensiMap = new Map<string, string>();
    
    materials.forEach((m: any) => {
      const custKey = normalizeCust(m.customer);
      const stKey = (m.kode_st || '').trim().toLowerCase();
      const key = `${custKey}|${stKey}`;
      weightsMap.set(key, m.berat_per_pcs || 0);
      dimensiMap.set(key, m.dimensi || '');
      
      if (m.kode_lt) {
        const ltKey = `${custKey}|${m.kode_lt.trim().toLowerCase()}`;
        weightsMap.set(ltKey, m.berat_per_pcs || 0);
        dimensiMap.set(ltKey, m.dimensi || '');
      }
      if (m.alternative_kodes_st) {
        m.alternative_kodes_st.split(',').forEach((alt: string) => {
          const altKey = `${custKey}|${alt.trim().toLowerCase()}`;
          weightsMap.set(altKey, m.berat_per_pcs || 0);
          dimensiMap.set(altKey, m.dimensi || '');
        });
      }
      if (m.alternative_kodes_lt) {
        m.alternative_kodes_lt.split(',').forEach((alt: string) => {
          const altKey = `${custKey}|${alt.trim().toLowerCase()}`;
          weightsMap.set(altKey, m.berat_per_pcs || 0);
          dimensiMap.set(altKey, m.dimensi || '');
        });
      }
      if (m.customer && m.short_name_customer) {
        shortNameMap.set(custKey, m.short_name_customer);
      }
    });

    const customerMap = new Map<string, { customer: string, forecast: number, so: number, delivery: number }>();
    const itemMap = new Map<string, { item: string, dimensi: string, forecast: number, so: number, delivery: number }>();

    // Process Forecasts
    forecasts.forEach(f => {
      const rawCust = f.customer || 'Unknown';
      const custKey = normalizeCust(rawCust);
      const stKey = (f.kode_st || '').trim().toLowerCase();
      const key = `${custKey}|${stKey}`;
      const weight = weightsMap.get(key) || 0;
      const kg = f.qty_forecast_kg || ((f.qty_pcs || 0) * weight);

      const shortName = shortNameMap.get(custKey) || rawCust;
      if (!customerMap.has(custKey)) {
        customerMap.set(custKey, { customer: shortName, forecast: 0, so: 0, delivery: 0 });
      }
      customerMap.get(custKey)!.forecast += kg;

      if (selectedCustomer && (shortName === selectedCustomer || rawCust === selectedCustomer)) {
        if (!itemMap.has(stKey)) {
          itemMap.set(stKey, {
            item: f.kode_st || 'Unknown',
            dimensi: dimensiMap.get(key) || f.kode_st || 'Unknown',
            forecast: 0,
            so: 0,
            delivery: 0
          });
        }
        itemMap.get(stKey)!.forecast += kg;
      }
    });

    // Process SO
    salesOrders.forEach(so => {
      const rawCust = so.customer || 'Unknown';
      const custKey = normalizeCust(rawCust);
      const stKey = (so.kode_st || '').trim().toLowerCase();
      const key = `${custKey}|${stKey}`;
      const weight = weightsMap.get(key) || 0;
      const kg = so.qty_order_kg || ((so.qty_order_pcs || 0) * weight);

      const shortName = shortNameMap.get(custKey) || rawCust;
      if (!customerMap.has(custKey)) {
        customerMap.set(custKey, { customer: shortName, forecast: 0, so: 0, delivery: 0 });
      }
      customerMap.get(custKey)!.so += kg;

      if (selectedCustomer && (shortName === selectedCustomer || rawCust === selectedCustomer)) {
        if (!itemMap.has(stKey)) {
          itemMap.set(stKey, {
            item: so.kode_st || 'Unknown',
            dimensi: dimensiMap.get(key) || so.kode_st || 'Unknown',
            forecast: 0,
            so: 0,
            delivery: 0
          });
        }
        itemMap.get(stKey)!.so += kg;
      }
    });

    // Process Deliveries
    deliveries.forEach(d => {
      const rawCust = d.customer || 'Unknown';
      const custKey = normalizeCust(rawCust);
      const stKey = (d.kode_st || '').trim().toLowerCase();
      const key = `${custKey}|${stKey}`;
      const weight = weightsMap.get(key) || 0;
      const kg = (d.qty_delivery_kg || 0);

      const shortName = shortNameMap.get(custKey) || rawCust;
      if (!customerMap.has(custKey)) {
        customerMap.set(custKey, { customer: shortName, forecast: 0, so: 0, delivery: 0 });
      }
      customerMap.get(custKey)!.delivery += kg;

      if (selectedCustomer && (shortName === selectedCustomer || rawCust === selectedCustomer)) {
        if (!itemMap.has(stKey)) {
          itemMap.set(stKey, {
            item: d.kode_st || 'Unknown',
            dimensi: dimensiMap.get(key) || d.kode_st || 'Unknown',
            forecast: 0,
            so: 0,
            delivery: 0
          });
        }
        itemMap.get(stKey)!.delivery += kg;
      }
    });

    return {
      customerData: Array.from(customerMap.values()).sort((a, b) => b.forecast - a.forecast),
      itemData: Array.from(itemMap.values()).sort((a, b) => b.forecast - a.forecast)
    };
  }, [forecasts, salesOrders, deliveries, materials, selectedCustomer]);

  useEffect(() => {
    setModalPage(1);
  }, [selectedCustomer]);

  const totalPages = Math.ceil(customerData.length / itemsPerPage);
  const paginatedData = customerData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const totalModalPages = Math.ceil(itemData.length / itemsPerPage);
  const paginatedItemData = itemData.slice((modalPage - 1) * itemsPerPage, modalPage * itemsPerPage);

  const handleExport = async () => {
    const xlsx = await import('xlsx');
    const ws = xlsx.utils.json_to_sheet(customerData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, "Monitoring Order");
    xlsx.writeFile(wb, "Monitoring_Order_Data.xlsx");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FDFBF7]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-[#0A5C36] animate-spin" />
          <p className="text-gray-500 font-medium">Memuat data monitor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-8 py-4 space-y-3 bg-[#FDFBF7] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold text-sm shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export Data
          </button>
          <button 
            onClick={fetchData}
            className="p-2 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Chart Section */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <BarChart3 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Customer Order Performance</h3>
              <p className="text-xs text-gray-500">Perbandingan Forecast vs SO vs Delivery (Kg)</p>
            </div>
          </div>

          {/* Pagination Controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium mr-2">
              Halaman {currentPage} dari {totalPages || 1}
            </span>
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={paginatedData} 
              margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
              <XAxis 
                dataKey="customer" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                interval={0}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(val: number, name: string) => [`${val.toLocaleString()} Kg`, name]}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
              <Bar dataKey="forecast" name="Forecast" fill="#94A3B8" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="so" name="Sales Order" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={20} />
              <Bar dataKey="delivery" name="Delivery" fill="#10B981" radius={[4, 4, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Second Chart Section: SO vs Delivery Achievement */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">SO vs Delivery Achievement</h3>
            <p className="text-xs text-gray-500">Persentase Realisasi Delivery terhadap Sales Order per Customer (%)</p>
          </div>
        </div>
        
        <div className="h-[340px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart 
              data={paginatedData.map(d => ({
                ...d,
                achievement: d.so > 0 ? (d.delivery / d.so) * 100 : 0,
                target: targetPercentage
              }))} 
              margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
              onClick={(data) => {
                if (data && data.activeLabel) {
                  setSelectedCustomer(data.activeLabel);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
              <XAxis 
                dataKey="customer" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                interval={0}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                unit="%"
                domain={[0, 100]}
              />
              <Tooltip 
                formatter={(val: number, name: string) => {
                  const lowerName = name.toLowerCase();
                  if (lowerName === 'achievement') return [`${(val ?? 0).toFixed(1)}%`, 'Achievement'];
                  if (lowerName === 'target') return [`${(val ?? 0).toFixed(1)}%`, 'Target'];
                  return [`${(val ?? 0).toFixed(1)}%`, name];
                }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
              <Bar dataKey="achievement" name="Achievement" fill="#10B981" radius={[4, 4, 0, 0]} barSize={30} className="cursor-pointer">
                {paginatedData.map((entry, index) => {
                  const achievement = entry.so > 0 ? (entry.delivery / entry.so) * 100 : 0;
                  return <Cell key={`cell-${index}`} fill={achievement >= targetPercentage ? '#10B981' : achievement >= targetPercentage * 0.8 ? '#F59E0B' : '#EF4444'} />;
                })}
              </Bar>
              <Line type="monotone" dataKey="target" name="Target" stroke="#3B82F6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-50 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Detail Achievement: {selectedCustomer}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Persentase Realisasi Delivery terhadap Sales Order per Item (%)
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedCustomer(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto">
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart 
                    data={paginatedItemData.map(d => ({
                      ...d,
                      achievement: d.so > 0 ? (d.delivery / d.so) * 100 : 0,
                      target: targetPercentage
                    }))} 
                    margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                    <XAxis 
                      dataKey="dimensi" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      unit="%"
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      formatter={(val: number, name: string) => {
                        const lowerName = name.toLowerCase();
                        if (lowerName === 'achievement') return [`${(val ?? 0).toFixed(1)}%`, 'Achievement'];
                        if (lowerName === 'target') return [`${(val ?? 0).toFixed(1)}%`, 'Target'];
                        return [`${(val ?? 0).toFixed(1)}%`, name];
                      }}
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                    <Bar dataKey="achievement" name="Achievement" fill="#10B981" radius={[4, 4, 0, 0]} barSize={30}>
                      {paginatedItemData.map((entry, index) => {
                        const achievement = entry.so > 0 ? (entry.delivery / entry.so) * 100 : 0;
                        return <Cell key={`cell-${index}`} fill={achievement >= targetPercentage ? '#10B981' : achievement >= targetPercentage * 0.8 ? '#F59E0B' : '#EF4444'} />;
                      })}
                    </Bar>
                    <Line type="monotone" dataKey="target" name="Target" stroke="#3B82F6" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              
              {/* Modal Pagination Controls */}
              {totalModalPages > 1 && (
                <div className="flex justify-center items-center gap-3 mt-6">
                  <button
                    onClick={() => setModalPage(p => Math.max(1, p - 1))}
                    disabled={modalPage === 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <span className="text-sm text-gray-600 font-medium bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">
                    Halaman {modalPage} dari {totalModalPages}
                  </span>
                  <button
                    onClick={() => setModalPage(p => Math.min(totalModalPages, p + 1))}
                    disabled={modalPage === totalModalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
