import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, BarChart2, FileText, ArrowUpDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, Legend } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useMaterialMaster } from '../hooks/useMaterialMaster';

export default function SalesOrder() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentPage, setCurrentPage] = useState(0);
  const [currentDetailItemPage, setCurrentDetailItemPage] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [customerViewMode, setCustomerViewMode] = useState<'chart' | 'report'>('chart');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  
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

  const periods = useMemo(() => {
    const p = new Set<string>();
    
    sos.forEach(s => {
      if (s.periode) p.add(s.periode);
    });
    
    const currentMonth = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][new Date().getMonth()];
    p.add(currentMonth);

    const result = ['All', ...Array.from(p).sort().reverse()];
    return result;
  }, [sos]);

  const loading = materialsLoading || sosLoading;

  const processedData = useMemo(() => {
    if (loading) return [];

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const [year, month] = selectedPeriode.split('-');
    const formattedPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

    const filteredSos = sos.filter(s => s.periode === formattedPeriode || s.periode?.startsWith(formattedPeriode.split('-')[0]));

    const customerMap = new Map<string, { 
      customer: string, 
      totalOrder: number,
      itemsMap: Map<string, { kode_st: string, dimensi: string, soPcs: number, soKg: number }>
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
        if (m.short_name_customer) shortNamesMap.set(custKey, m.short_name_customer);
    });

    (filteredSos || []).forEach((s: any) => {
      const custKey = normalizeCust(s.customer);
      if (!customerMap.has(custKey)) {
        customerMap.set(custKey, { customer: shortNamesMap.get(custKey) || s.customer, totalOrder: 0, itemsMap: new Map() });
      }
      const stKey = (s.kode_st || '').trim().toLowerCase();
      const weight = weightsMap.get(`${custKey}|${stKey}`) || 0;
      const soQtyKg = s.qty_order_kg || ((s.qty_order_pcs || 0) * weight);
      const soQtyPcs = (s.qty_order_pcs || 0);
      
      const custData = customerMap.get(custKey)!;
      custData.totalOrder += soQtyKg;
      
      if (!custData.itemsMap.has(stKey)) {
        custData.itemsMap.set(stKey, { kode_st: s.kode_st, dimensi: dimensiMap.get(stKey) || '-', soPcs: 0, soKg: 0 });
      }
      custData.itemsMap.get(stKey)!.soPcs += soQtyPcs;
      custData.itemsMap.get(stKey)!.soKg += soQtyKg;
    });

    return Array.from(customerMap.values())
      .filter(c => c.totalOrder > 0)
      .map(c => {
        const items = Array.from(c.itemsMap.values()).sort((a, b) => b.soKg - a.soKg);
        const totalSoPcs = items.reduce((sum, item) => sum + item.soPcs, 0);
        const totalSoKg = items.reduce((sum, item) => sum + item.soKg, 0);
        return {
          customer: c.customer,
          totalOrder: c.totalOrder,
          totalSoPcs,
          totalSoKg,
          items
        };
      })
      .sort((a, b) => b.totalOrder - a.totalOrder);
  }, [loading, materials, sos, selectedPeriode]);

  const totalPages = Math.ceil(processedData.length / itemsPerPage);
  const paginatedData = processedData.slice(currentPage * itemsPerPage, (currentPage + 1) * itemsPerPage);
  const grandTotalTon = Math.round(processedData.reduce((sum, item) => sum + item.totalOrder, 0) / 1000);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const sortedDetailItems = useMemo(() => {
    if (!selectedCustomer) return [];
    let sortableItems = [...selectedCustomer.items];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [selectedCustomer, sortConfig]);

  const totalDetailPages = selectedCustomer ? Math.ceil(sortedDetailItems.length / itemsPerPage) : 0;
  const paginatedDetailData = selectedCustomer ? sortedDetailItems.slice(currentDetailItemPage * itemsPerPage, (currentDetailItemPage + 1) * itemsPerPage) : [];

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div className="p-8 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
          <div className="space-y-1">
            <h3 className="text-2xl font-bold text-[#2D3748]">
              {selectedCustomer ? `Detail Item: ${selectedCustomer.customer}` : 'Total Sales Order per Customer'}
            </h3>
            <p className="text-sm text-gray-500">
              {selectedCustomer ? 'Total volume Sales Order (Pcs & Kg) per Item' : 'Total volume Sales Order (Kg) per Customer'}
            </p>
          </div>
          <div className="flex items-center gap-6">
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

            {!selectedCustomer && (
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider">Grand Total</p>
                <p className="text-xl font-bold text-emerald-600">{grandTotalTon.toLocaleString('id-ID')} Ton</p>
              </div>
            )}
            {selectedCustomer && (
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
                Kembali ke Grafik
              </button>
            )}
          </div>
        </div>
        <div className="p-8 flex-1 overflow-auto">
          {loading ? (
            <div className="h-64 flex items-center justify-center">Loading...</div>
          ) : selectedCustomer ? (
            <div className="flex flex-col h-full">
              {customerViewMode === 'chart' ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={paginatedDetailData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="kode_st" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip 
                      cursor={{ fill: '#f3f4f6' }} 
                      formatter={(value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                      labelFormatter={(label, payload) => {
                        const dimensi = payload?.[0]?.payload?.dimensi;
                        return (
                          <span className="flex flex-col gap-1 mb-2">
                            <span className="font-bold text-gray-900">{label}</span>
                            {dimensi && <span className="text-xs text-gray-500 font-normal">{dimensi}</span>}
                          </span>
                        );
                      }}
                    />
                    <Legend />
                    <Bar dataKey="soPcs" name="Actual SO (Pcs)" fill="#3B82F6" />
                    <Bar dataKey="soKg" name="Actual SO (Kg)" fill="#10B981" />
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
                        <th className="px-6 py-4 font-semibold cursor-pointer hover:bg-gray-100 text-right" onClick={() => handleSort('soPcs')}>
                          <div className="flex items-center justify-end gap-2">Actual SO (Pcs) <ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                        <th className="px-6 py-4 font-semibold cursor-pointer hover:bg-gray-100 text-right" onClick={() => handleSort('soKg')}>
                          <div className="flex items-center justify-end gap-2">Actual SO (Kg) <ArrowUpDown className="w-3 h-3" /></div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedDetailData.map((item: any, idx: number) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900">{item.kode_st}</td>
                          <td className="px-6 py-4 text-gray-600">{item.dimensi}</td>
                          <td className="px-6 py-4 text-right text-blue-600 font-medium">{item.soPcs.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                          <td className="px-6 py-4 text-right text-emerald-600 font-medium">{item.soKg.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-bold">
                        <td colSpan={2} className="px-6 py-4 text-right text-gray-900">Total</td>
                        <td className="px-6 py-4 text-right text-blue-600">{selectedCustomer.totalSoPcs?.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                        <td className="px-6 py-4 text-right text-emerald-600">{selectedCustomer.totalSoKg?.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
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
          ) : (
            <>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={paginatedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="customer" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => [`${value.toLocaleString('id-ID', { maximumFractionDigits: 0 })} Kg`, 'Total Order']} />
                  <Bar dataKey="totalOrder" name="Total Order (Kg)" fill="#F59E0B" onClick={(data) => {
                    setSelectedCustomer(data.payload || data);
                    setCurrentDetailItemPage(0);
                  }} cursor="pointer">
                    <LabelList 
                      dataKey="totalOrder" 
                      position="top" 
                      formatter={(value: number) => value.toLocaleString('id-ID', { maximumFractionDigits: 0 })} 
                      style={{ fontSize: '11px', fill: '#6B7280' }} 
                    />
                  </Bar>
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
