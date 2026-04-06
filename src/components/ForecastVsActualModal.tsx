import React, { useState, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useMaterialMaster } from '../hooks/useMaterialMaster';

interface ForecastVsActualModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ForecastVsActualModal({ isOpen, onClose }: ForecastVsActualModalProps) {
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const itemsPerPage = 10;

  const { data: materials = [], isLoading: materialsLoading } = useMaterialMaster();
  
  const { data: sos = [], isLoading: sosLoading } = useQuery({
    queryKey: ['sales_orders'],
    queryFn: () => fetchAllRows('sales_orders', 'customer,kode_st,qty_order_pcs'),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const { data: forecasts = [], isLoading: forecastsLoading } = useQuery({
    queryKey: ['forecasts'],
    queryFn: () => fetchAllRows('forecasts', 'customer,kode_st,qty_pcs'),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const loading = materialsLoading || sosLoading || forecastsLoading;

  const processedData = useMemo(() => {
    if (!isOpen || loading) return [];

    const customerMap = new Map<string, { 
      customer: string, 
      so: number, 
      forecast: number,
      itemsMap: Map<string, { kode_st: string, dimensi: string, so: number, forecast: number }>
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

    (forecasts || []).forEach((f: any) => {
      const custKey = normalizeCust(f.customer);
      if (!customerMap.has(custKey)) {
        customerMap.set(custKey, { customer: shortNamesMap.get(custKey) || f.customer, so: 0, forecast: 0, itemsMap: new Map() });
      }
      const stKey = (f.kode_st || '').trim().toLowerCase();
      const weight = weightsMap.get(`${custKey}|${stKey}`) || 0;
      const forecastQtyKg = (f.qty_pcs || 0) * weight;
      const forecastQtyPcs = (f.qty_pcs || 0);
      
      const custData = customerMap.get(custKey)!;
      custData.forecast += forecastQtyKg;
      
      if (!custData.itemsMap.has(stKey)) {
        custData.itemsMap.set(stKey, { kode_st: f.kode_st, dimensi: dimensiMap.get(stKey) || '-', so: 0, forecast: 0 });
      }
      custData.itemsMap.get(stKey)!.forecast += forecastQtyPcs;
    });

    (sos || []).forEach((s: any) => {
      const custKey = normalizeCust(s.customer);
      if (!customerMap.has(custKey)) {
        customerMap.set(custKey, { customer: shortNamesMap.get(custKey) || s.customer, so: 0, forecast: 0, itemsMap: new Map() });
      }
      const stKey = (s.kode_st || '').trim().toLowerCase();
      const weight = weightsMap.get(`${custKey}|${stKey}`) || 0;
      const soQtyKg = (s.qty_order_pcs || 0) * weight;
      const soQtyPcs = (s.qty_order_pcs || 0);
      
      const custData = customerMap.get(custKey)!;
      custData.so += soQtyKg;
      
      if (!custData.itemsMap.has(stKey)) {
        custData.itemsMap.set(stKey, { kode_st: s.kode_st, dimensi: dimensiMap.get(stKey) || '-', so: 0, forecast: 0 });
      }
      custData.itemsMap.get(stKey)!.so += soQtyPcs;
    });

    return Array.from(customerMap.values())
      .filter(c => c.forecast > 0)
      .map(c => {
        const items = Array.from(c.itemsMap.values()).sort((a, b) => b.forecast - a.forecast);
        const totalForecastPcs = items.reduce((sum, item) => sum + item.forecast, 0);
        const totalSoPcs = items.reduce((sum, item) => sum + item.so, 0);
        return {
          customer: c.customer,
          so: c.so,
          forecast: c.forecast,
          totalForecastPcs,
          totalSoPcs,
          items
        };
      })
      .sort((a, b) => b.forecast - a.forecast);
  }, [isOpen, loading, materials, sos, forecasts]);

  const handleClose = () => {
    setSelectedCustomer(null);
    setCurrentPage(0);
    onClose();
  };

  if (!isOpen) return null;

  const totalPages = Math.ceil(processedData.length / itemsPerPage);
  const paginatedData = processedData.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        <div className="p-8 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-[#2D3748]">
              {selectedCustomer ? `Detail Item: ${selectedCustomer.customer}` : 'Forecast vs Actual (SO) per Customer'}
            </h3>
            <p className="text-sm text-gray-500">
              {selectedCustomer ? 'Perbandingan volume Forecast dan SO per Item (Pcs)' : 'Perbandingan volume Forecast dan SO per Customer (Kg)'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {selectedCustomer && (
              <button 
                onClick={() => setSelectedCustomer(null)} 
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Kembali ke Grafik
              </button>
            )}
            <button onClick={handleClose} className="p-2 rounded-full hover:bg-gray-100 transition-colors">
              <X className="w-6 h-6 text-gray-400" />
            </button>
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
                    <th className="px-6 py-4 font-semibold text-right">Variance (Pcs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedCustomer.items.map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900">{item.kode_st}</td>
                      <td className="px-6 py-4 text-gray-600">{item.dimensi}</td>
                      <td className="px-6 py-4 text-right text-emerald-600 font-medium">{item.forecast.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-4 text-right text-blue-600 font-medium">{item.so.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                      <td className={`px-6 py-4 text-right font-medium ${item.so - item.forecast > 0 ? 'text-emerald-600' : item.so - item.forecast < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {(item.so - item.forecast).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan={2} className="px-6 py-4 text-right text-gray-900">Total</td>
                    <td className="px-6 py-4 text-right text-emerald-600">{selectedCustomer.totalForecastPcs?.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                    <td className="px-6 py-4 text-right text-blue-600">{selectedCustomer.totalSoPcs?.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                    <td className={`px-6 py-4 text-right ${selectedCustomer.totalSoPcs - selectedCustomer.totalForecastPcs > 0 ? 'text-emerald-600' : selectedCustomer.totalSoPcs - selectedCustomer.totalForecastPcs < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {(selectedCustomer.totalSoPcs - selectedCustomer.totalForecastPcs).toLocaleString('id-ID', { maximumFractionDigits: 2 })}
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
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip cursor={{ fill: '#f3f4f6' }} />
                  <Legend />
                  <Bar dataKey="forecast" name="Forecast (Kg)" fill="#10B981" onClick={(data) => setSelectedCustomer(data.payload || data)} cursor="pointer" />
                  <Bar dataKey="so" name="Actual SO (Kg)" fill="#3B82F6" onClick={(data) => setSelectedCustomer(data.payload || data)} cursor="pointer" />
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
