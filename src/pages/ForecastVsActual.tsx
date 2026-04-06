import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, BarChart2, FileText, ArrowUpDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useMaterialMaster } from '../hooks/useMaterialMaster';
import { useViewMode } from '../contexts/ViewModeContext';

export default function ForecastVsActual() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(0);
  const [currentDetailItemPage, setCurrentDetailItemPage] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerViewMode, setCustomerViewMode] = useState<'chart' | 'report'>('chart');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  
  const selectedPeriode = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  
  const setSelectedPeriode = (newPeriode: string) => {
    setSearchParams({ ...Object.fromEntries(searchParams), periode: newPeriode });
  };
  const { viewMode, setViewMode } = useViewMode();
  const itemsPerPage = 10;

  const { data: materials = [], isLoading: materialsLoading } = useMaterialMaster();
  
  const { data: sos = [], isLoading: sosLoading } = useQuery({
    queryKey: ['sales_orders', 'all'],
    queryFn: () => fetchAllRows('sales_orders', '*'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: forecasts = [], isLoading: forecastsLoading } = useQuery({
    queryKey: ['forecasts', 'all'],
    queryFn: () => fetchAllRows('forecasts', '*'),
    staleTime: 5 * 60 * 1000,
  });

  const periods = useMemo(() => {
    const p = new Set<string>();
    
    sos.forEach(s => {
      if (s.periode) p.add(s.periode);
    });
    forecasts.forEach(f => {
      if (f.periode) p.add(f.periode);
    });
    
    const currentMonth = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][new Date().getMonth()];
    p.add(currentMonth);

    const result = ['All', ...Array.from(p).sort().reverse()];
    return result;
  }, [sos, forecasts]);

  const loading = materialsLoading || sosLoading || forecastsLoading;

  const processedData = useMemo(() => {
    if (loading) return [];

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const [year, month] = selectedPeriode.split('-');
    const formattedPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

    const filteredSos = sos.filter(s => s.periode === formattedPeriode || s.periode?.startsWith(formattedPeriode.split('-')[0]));
    const filteredForecasts = forecasts.filter(f => f.periode === formattedPeriode || f.periode?.startsWith(formattedPeriode.split('-')[0]));

    const customerMap = new Map<string, { 
      customer: string, 
      so: number, 
      forecast: number,
      itemsMap: Map<string, { kode_st: string, dimensi: string, so: number, forecast: number, soKg: number, forecastKg: number }>
    }>();

    // Helper to normalize customer names
    const normalizeCust = (s: string) => (s || '').trim().toUpperCase().replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '').replace(/[^A-Z0-9]/g, '');

    // Helper to get weight and short name
    const weightsMap = new Map<string, number>();
    const shortNamesMap = new Map<string, string>();
    const dimensiMap = new Map<string, string>();
    materials.forEach((m: any) => {
        const custKey = normalizeCust(m.customer);
        const stKey = (m.kode_st || '').trim().toLowerCase();
        weightsMap.set(`${custKey}|${stKey}`, m.berat_per_pcs || 0);
        dimensiMap.set(stKey, m.dimensi || m.description || m.nama_barang || '');
        if (m.short_name_customer) {
            shortNamesMap.set(custKey, m.short_name_customer);
        }
    });

    (filteredForecasts || []).forEach((f: any) => {
      const custKey = normalizeCust(f.customer);
      if (!customerMap.has(custKey)) {
        customerMap.set(custKey, { customer: shortNamesMap.get(custKey) || f.customer, so: 0, forecast: 0, itemsMap: new Map() });
      }
      const stKey = (f.kode_st || '').trim().toLowerCase();
      const weight = weightsMap.get(`${custKey}|${stKey}`) || 0;
      const forecastQtyKg = f.qty_forecast_kg || ((f.qty_pcs || 0) * weight);
      const forecastQtyPcs = (f.qty_pcs || 0);
      
      const custData = customerMap.get(custKey)!;
      custData.forecast += forecastQtyKg;
      
      if (!custData.itemsMap.has(stKey)) {
        custData.itemsMap.set(stKey, { kode_st: f.kode_st, dimensi: dimensiMap.get(stKey) || '-', so: 0, forecast: 0, soKg: 0, forecastKg: 0 });
      }
      custData.itemsMap.get(stKey)!.forecast += forecastQtyPcs;
      custData.itemsMap.get(stKey)!.forecastKg += forecastQtyKg;
    });

    (filteredSos || []).forEach((s: any) => {
      const custKey = normalizeCust(s.customer);
      if (!customerMap.has(custKey)) {
        customerMap.set(custKey, { customer: shortNamesMap.get(custKey) || s.customer, so: 0, forecast: 0, itemsMap: new Map() });
      }
      const stKey = (s.kode_st || '').trim().toLowerCase();
      const weight = weightsMap.get(`${custKey}|${stKey}`) || 0;
      const soQtyKg = s.qty_order_kg || ((s.qty_order_pcs || 0) * weight);
      const soQtyPcs = (s.qty_order_pcs || 0);
      
      const custData = customerMap.get(custKey)!;
      custData.so += soQtyKg;
      
      if (!custData.itemsMap.has(stKey)) {
        custData.itemsMap.set(stKey, { kode_st: s.kode_st, dimensi: dimensiMap.get(stKey) || '-', so: 0, forecast: 0, soKg: 0, forecastKg: 0 });
      }
      custData.itemsMap.get(stKey)!.so += soQtyPcs;
      custData.itemsMap.get(stKey)!.soKg += soQtyKg;
    });

    return Array.from(customerMap.values())
      .filter(c => c.forecast > 0 || c.so > 0)
      .map(c => {
        const items = Array.from(c.itemsMap.values()).sort((a, b) => b.forecast - a.forecast);
        const totalForecastPcs = items.reduce((sum, item) => sum + item.forecast, 0);
        const totalSoPcs = items.reduce((sum, item) => sum + item.so, 0);
        const totalForecastKg = items.reduce((sum, item) => sum + item.forecastKg, 0);
        const totalSoKg = items.reduce((sum, item) => sum + item.soKg, 0);
        return {
          customer: c.customer,
          so: c.so,
          forecast: c.forecast,
          totalForecastPcs,
          totalSoPcs,
          totalForecastKg,
          totalSoKg,
          items
        };
      })
      .sort((a, b) => b.forecast - a.forecast);
  }, [loading, materials, sos, forecasts, selectedPeriode]);

  const totalPages = Math.ceil(processedData.length / itemsPerPage);
  const paginatedData = processedData.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);

  const sortedItems = useMemo(() => {
    if (!selectedCustomer) return [];
    let sortableItems = [...selectedCustomer.items];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        
        if (sortConfig.key === 'variancePcs') {
          aValue = a.so - a.forecast;
          bValue = b.so - b.forecast;
        } else if (sortConfig.key === 'varianceKg') {
          aValue = a.soKg - a.forecastKg;
          bValue = b.soKg - b.forecastKg;
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [selectedCustomer, sortConfig]);

  const totalDetailPages = selectedCustomer ? Math.ceil(sortedItems.length / itemsPerPage) : 0;
  const paginatedDetailData = selectedCustomer ? sortedItems.slice(currentDetailItemPage * itemsPerPage, (currentDetailItemPage + 1) * itemsPerPage) : [];

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex justify-between items-center mb-8">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-[#2D3748]">
              {selectedCustomer ? `Detail Item: ${selectedCustomer.customer}` : 'Forecast vs Actual (SO) per Customer'}
            </h3>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2 bg-white border border-gray-300 rounded-lg px-3 py-1.5 shadow-sm">
              <input
                type="month"
                value={selectedPeriode}
                onChange={(e) => {
                  setSelectedPeriode(e.target.value);
                  setCurrentPage(0);
                }}
                className="text-sm border-none focus:ring-0 p-0 text-gray-700 font-medium bg-transparent"
              />
            </div>

            {!selectedCustomer ? (
              <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1">
                <button
                  onClick={() => setViewMode('chart')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    viewMode === 'chart'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  Grafik
                </button>
                <button
                  onClick={() => setViewMode('report')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    viewMode === 'report'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Report
                </button>
              </div>
            ) : (
              <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1">
                <button
                  onClick={() => setCustomerViewMode('chart')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    customerViewMode === 'chart'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  Grafik
                </button>
                <button
                  onClick={() => setCustomerViewMode('report')}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    customerViewMode === 'report'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Report
                </button>
              </div>
            )}
            
            {selectedCustomer && (
              <button 
                onClick={() => {
                  setSelectedCustomer(null);
                  setCurrentDetailItemPage(0);
                }} 
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Kembali ke Daftar
              </button>
            )}
          </div>
        </div>
        
        {loading ? (
          <div className="h-64 flex items-center justify-center">Loading...</div>
        ) : selectedCustomer ? (
          <div className="flex flex-col h-full">
            {customerViewMode === 'chart' ? (
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={paginatedDetailData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="kode_st" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip 
                    cursor={{ fill: '#f3f4f6' }} 
                    formatter={(value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                  />
                  <Legend />
                  <Bar dataKey="forecast" name="Forecast (Pcs)" fill="#10B981" />
                  <Bar dataKey="so" name="Actual SO (Pcs)" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-4 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('kode_st')}>
                        <div className="flex items-center gap-2">Kode ST <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-6 py-4 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('dimensi')}>
                        <div className="flex items-center gap-2">Dimensi <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-6 py-4 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('forecast')}>
                        <div className="flex items-center justify-end gap-2">Forecast (Pcs) <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-6 py-4 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('forecastKg')}>
                        <div className="flex items-center justify-end gap-2">Forecast (Kg) <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-6 py-4 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('so')}>
                        <div className="flex items-center justify-end gap-2">Actual SO (Pcs) <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-6 py-4 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('soKg')}>
                        <div className="flex items-center justify-end gap-2">Actual SO (Kg) <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-6 py-4 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('variancePcs')}>
                        <div className="flex items-center justify-end gap-2">Variance (Pcs) <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-6 py-4 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('varianceKg')}>
                        <div className="flex items-center justify-end gap-2">Variance (Kg) <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedDetailData.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{item.kode_st}</td>
                        <td className="px-6 py-4 text-gray-600">{item.dimensi}</td>
                        <td className="px-6 py-4 text-right text-emerald-600 font-medium">{item.forecast.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right text-emerald-600 font-medium">{item.forecastKg.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                        <td className="px-6 py-4 text-right text-blue-600 font-medium">{item.so.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right text-blue-600 font-medium">{item.soKg.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                        <td className={`px-6 py-4 text-right font-medium ${item.so - item.forecast > 0 ? 'text-emerald-600' : item.so - item.forecast < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {(item.so - item.forecast).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                        </td>
                        <td className={`px-6 py-4 text-right font-medium ${item.soKg - item.forecastKg > 0 ? 'text-emerald-600' : item.soKg - item.forecastKg < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {(item.soKg - item.forecastKg).toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td colSpan={2} className="px-6 py-4 text-right text-gray-900">Total</td>
                      <td className="px-6 py-4 text-right text-emerald-600">{selectedCustomer.totalForecastPcs?.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right text-emerald-600">{selectedCustomer.totalForecastKg?.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                      <td className="px-6 py-4 text-right text-blue-600">{selectedCustomer.totalSoPcs?.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right text-blue-600">{selectedCustomer.totalSoKg?.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                      <td className={`px-6 py-4 text-right ${selectedCustomer.totalSoPcs - selectedCustomer.totalForecastPcs > 0 ? 'text-emerald-600' : selectedCustomer.totalSoPcs - selectedCustomer.totalForecastPcs < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {(selectedCustomer.totalSoPcs - selectedCustomer.totalForecastPcs).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                      </td>
                      <td className={`px-6 py-4 text-right ${selectedCustomer.totalSoKg - selectedCustomer.totalForecastKg > 0 ? 'text-emerald-600' : selectedCustomer.totalSoKg - selectedCustomer.totalForecastKg < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {(selectedCustomer.totalSoKg - selectedCustomer.totalForecastKg).toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            
            {totalDetailPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-6">
                <button 
                  onClick={() => setCurrentDetailItemPage(p => Math.max(0, p - 1))}
                  disabled={currentDetailItemPage === 0}
                  className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <span className="text-sm font-medium text-gray-600">
                  Halaman {currentDetailItemPage + 1} dari {totalDetailPages}
                </span>
                <button 
                  onClick={() => setCurrentDetailItemPage(p => Math.min(totalDetailPages - 1, p + 1))}
                  disabled={currentDetailItemPage === totalDetailPages - 1}
                  className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            )}
          </div>
        ) : viewMode === 'chart' ? (
          <>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={paginatedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="customer" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip 
                  cursor={{ fill: '#f3f4f6' }} 
                  formatter={(value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                />
                <Legend />
                <Bar dataKey="forecast" name="Forecast (Kg)" fill="#10B981" onClick={(data) => {
                  setSelectedCustomer(data.payload || data);
                  setCurrentDetailItemPage(0);
                }} cursor="pointer" />
                <Bar dataKey="so" name="Actual SO (Kg)" fill="#3B82F6" onClick={(data) => {
                  setSelectedCustomer(data.payload || data);
                  setCurrentDetailItemPage(0);
                }} cursor="pointer" />
              </BarChart>
            </ResponsiveContainer>
            
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-4 mt-6">
                <button 
                  onClick={() => {
                    setCurrentPage(p => Math.max(0, p - 1));
                    setSelectedCustomer(null);
                  }}
                  disabled={currentPage === 0}
                  className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <span className="text-sm font-medium text-gray-600">
                  Halaman {currentPage + 1} dari {totalPages}
                </span>
                <button 
                  onClick={() => {
                    setCurrentPage(p => Math.min(totalPages - 1, p + 1));
                    setSelectedCustomer(null);
                  }}
                  disabled={currentPage === totalPages - 1}
                  className="p-2 rounded-full hover:bg-gray-100 disabled:opacity-50 transition-colors"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Customer</th>
                  <th className="px-6 py-4 font-semibold text-right">Forecast (Kg)</th>
                  <th className="px-6 py-4 font-semibold text-right">Actual SO (Kg)</th>
                  <th className="px-6 py-4 font-semibold text-right">Variance (Kg)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {processedData.map((c, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{c.customer}</td>
                    <td className="px-6 py-4 text-right text-emerald-600 font-medium">{c.forecast.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-right text-blue-600 font-medium">{c.so.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                    <td className={`px-6 py-4 text-right font-medium ${c.so - c.forecast > 0 ? 'text-emerald-600' : c.so - c.forecast < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                      {(c.so - c.forecast).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
