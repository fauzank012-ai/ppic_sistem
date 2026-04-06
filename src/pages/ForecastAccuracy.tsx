import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useMaterialMaster } from '../hooks/useMaterialMaster';

export default function ForecastAccuracy() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  
  const selectedPeriode = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  
  const setSelectedPeriode = (newPeriode: string) => {
    setSearchParams({ ...Object.fromEntries(searchParams), periode: newPeriode });
  };
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
      itemsMap: Map<string, { kode_st: string, dimensi: string, so: number, forecast: number }>
    }>();
    const normalizeCust = (s: string) => (s || '').trim().toUpperCase().replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '').replace(/[^A-Z0-9]/g, '');

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
        custData.itemsMap.set(stKey, { kode_st: f.kode_st, dimensi: dimensiMap.get(stKey) || '-', so: 0, forecast: 0 });
      }
      custData.itemsMap.get(stKey)!.forecast += forecastQtyPcs;
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
        custData.itemsMap.set(stKey, { kode_st: s.kode_st, dimensi: dimensiMap.get(stKey) || '-', so: 0, forecast: 0 });
      }
      custData.itemsMap.get(stKey)!.so += soQtyPcs;
    });

    const accuracyData = Array.from(customerMap.values())
      .filter(c => c.forecast > 0)
      .map(c => {
        const items = Array.from(c.itemsMap.values()).sort((a, b) => b.forecast - a.forecast);
        const totalForecastPcs = items.reduce((sum, item) => sum + item.forecast, 0);
        const totalSoPcs = items.reduce((sum, item) => sum + item.so, 0);
        return {
          customer: c.customer,
          accuracy: c.forecast > 0 ? (c.so / c.forecast) * 100 : 0,
          totalForecastPcs,
          totalSoPcs,
          items: items.map(item => ({
            ...item,
            accuracy: item.forecast > 0 ? (item.so / item.forecast) * 100 : 0
          }))
        };
      })
      .sort((a, b) => b.accuracy - a.accuracy);

    return accuracyData;
  }, [loading, materials, sos, forecasts, selectedPeriode]);

  const totalPages = Math.ceil(processedData.length / itemsPerPage);
  const paginatedData = processedData.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div className="p-8 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-[#2D3748]">
              {selectedCustomer ? `Detail Item: ${selectedCustomer.customer}` : 'Forecast Accuracy (% SO vs Forecast)'}
            </h3>
            <p className="text-sm text-gray-500">
              {selectedCustomer ? 'Persentase realisasi SO terhadap Forecast per Item' : 'Persentase realisasi SO terhadap Forecast per Customer'}
            </p>
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

            {selectedCustomer && (
              <button 
                onClick={() => setSelectedCustomer(null)} 
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Kembali ke Grafik
              </button>
            )}
          </div>
        </div>
        <div className="p-8 flex-1 overflow-auto">
          {loading ? (
            <div className="h-64 flex items-center justify-center">Loading...</div>
          ) : selectedCustomer ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Kode ST</th>
                    <th className="px-6 py-4 font-semibold">Dimensi</th>
                    <th className="px-6 py-4 font-semibold text-right">Forecast (Pcs)</th>
                    <th className="px-6 py-4 font-semibold text-right">Actual SO (Pcs)</th>
                    <th className="px-6 py-4 font-semibold text-right">Accuracy (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedCustomer.items.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{item.kode_st}</td>
                      <td className="px-6 py-4 text-gray-600">{item.dimensi}</td>
                      <td className="px-6 py-4 text-right text-emerald-600 font-medium">{item.forecast.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right text-blue-600 font-medium">{item.so.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                      <td className={`px-6 py-4 text-right font-medium ${item.accuracy >= 100 ? 'text-emerald-600' : item.accuracy >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {item.accuracy.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={2} className="px-6 py-4 text-right text-gray-900">Total</td>
                    <td className="px-6 py-4 text-right text-emerald-600">{selectedCustomer.totalForecastPcs?.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-right text-blue-600">{selectedCustomer.totalSoPcs?.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                    <td className={`px-6 py-4 text-right ${selectedCustomer.accuracy >= 100 ? 'text-emerald-600' : selectedCustomer.accuracy >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {selectedCustomer.accuracy?.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={paginatedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="customer" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <Tooltip formatter={(value: number) => [`${(value ?? 0).toFixed(2)}%`, 'Accuracy']} />
                  <Legend />
                  <Bar dataKey="accuracy" name="Accuracy (%)" fill="#8B5CF6" onClick={(data) => setSelectedCustomer(data.payload || data)} cursor="pointer" />
                  <ReferenceLine y={100} stroke="red" strokeDasharray="3 3" />
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
          )}
        </div>
      </div>
    </div>
  );
}
