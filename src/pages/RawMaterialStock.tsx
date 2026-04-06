import React, { useState, useMemo } from 'react';
import { Download, Search, ArrowUpDown, ArrowUp, ArrowDown, Box, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { fetchAllRows } from '../lib/supabase';
import { useQuery } from '@tanstack/react-query';

export default function RawMaterialStock() {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialType = (queryParams.get('type') === 'strip' ? 'Strip' : 'Coil');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter] = useState<'Coil' | 'Strip'>(initialType);
  const [specFilter, setSpecFilter] = useState<string>('all');
  const [thickFilter, setThickFilter] = useState<string>('all');
  const [widthFilter, setWidthFilter] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['raw_material_stock'],
    queryFn: async () => {
      const [stripData, coilData, materials, sos, loos, forecasts, masterCoils] = await Promise.all([
          fetchAllRows('stock_strip', 'spec_strip,tebal_strip,lebar_strip,qty_kg,kode_material_strip'),
          fetchAllRows('stock_coil', 'spec,tebal_coil,lebar_coil,qty_kg,kode_material_coil'),
          fetchAllRows('material_master', 'kode_st,kode_lt,kode_strip,alternative_kodes_st,alternative_kodes_lt,alternative_kode_strip,berat_per_pcs,lebar_strip,spec_strip,alternative_spec_strip'),
          fetchAllRows('sales_orders', 'kode_st,qty_order_pcs,qty_order_kg'),
          fetchAllRows('loo_data', 'kode_st,sisa_loo_pcs,sisa_order_pcs,sisa_loo_kg,sisa_order_kg'),
          fetchAllRows('forecasts', 'kode_st,qty_pcs,qty_forecast_kg'),
          fetchAllRows('master_data_coil', 'kode_material_strip,kode_material_coil,alternative_kode_material_coil')
        ]);

        const currentDay = new Date().getDate();

        const soMap = new Map<string, { pcs: number, kg: number }>();
        (sos || []).forEach((s: any) => {
          const kode = (s.kode_st || '').trim().toLowerCase();
          if (kode) {
            const current = soMap.get(kode) || { pcs: 0, kg: 0 };
            current.pcs += (s.qty_order_pcs || 0);
            current.kg += (s.qty_order_kg || 0);
            soMap.set(kode, current);
          }
        });

        const looMap = new Map<string, { sisa_loo_pcs: number, sisa_order_pcs: number, sisa_loo_kg: number, sisa_order_kg: number }>();
        (loos || []).forEach((l: any) => {
          const kode = (l.kode_st || '').trim().toLowerCase();
          if (kode) {
            const current = looMap.get(kode) || { sisa_loo_pcs: 0, sisa_order_pcs: 0, sisa_loo_kg: 0, sisa_order_kg: 0 };
            current.sisa_loo_pcs += (l.sisa_loo_pcs || 0);
            current.sisa_order_pcs += (l.sisa_order_pcs || 0);
            current.sisa_loo_kg += (l.sisa_loo_kg || 0);
            current.sisa_order_kg += (l.sisa_order_kg || 0);
            looMap.set(kode, current);
          }
        });

        const forecastMap = new Map<string, { pcs: number, kg: number }>();
        (forecasts || []).forEach((f: any) => {
          const kode = (f.kode_st || '').trim().toLowerCase();
          if (kode) {
            const current = forecastMap.get(kode) || { pcs: 0, kg: 0 };
            current.pcs += (f.qty_pcs || 0);
            current.kg += (f.qty_forecast_kg || 0);
            forecastMap.set(kode, current);
          }
        });

        const groupMap = new Map<string, any>();

        const addToGroup = (type: string, spec: string, tebal: number, lebar: number, qty: number, kode_material: string) => {
          const key = `${type}|${spec}|${tebal}|${lebar}|${kode_material}`;
          if (!groupMap.has(key)) {
            groupMap.set(key, {
              type,
              spec,
              tebal,
              lebar,
              qty_kg: 0,
              kode_material
            });
          }
          groupMap.get(key).qty_kg += qty;
        };

        (stripData || []).forEach(row => {
          addToGroup(
            'Strip',
            row.spec_strip || '',
            Number(row.tebal_strip) || 0,
            Number(row.lebar_strip) || 0,
            Number(row.qty_kg) || 0,
            row.kode_material_strip || ''
          );
        });

        (coilData || []).forEach(row => {
          addToGroup(
            'Coil',
            row.spec || '',
            Number(row.tebal_coil) || 0,
            Number(row.lebar_coil) || 0,
            Number(row.qty_kg) || 0,
            row.kode_material_coil || ''
          );
        });

        const combinedData = Array.from(groupMap.values()).map(row => {
          const relatedMaterials = (materials || []).filter((m: any) => {
            const rowCode = (row.kode_material || '').trim().toLowerCase();
            if (!rowCode) return false;
            
            if (row.type === 'Strip') {
              const kStrip = (m.kode_strip || '').trim().toLowerCase();
              const altStrips = (m.alternative_kode_strip || '').split(',').map((s: string) => s.trim().toLowerCase());
              return kStrip === rowCode || altStrips.includes(rowCode);
            } else {
              // Find strips that use this coil
              const relatedStrips = (masterCoils || []).filter((c: any) => {
                const kCoil = (c.kode_material_coil || '').trim().toLowerCase();
                const altCoils = (c.alternative_kode_material_coil || '').split(',').map((s: string) => s.trim().toLowerCase());
                return kCoil === rowCode || altCoils.includes(rowCode);
              }).map((c: any) => (c.kode_material_strip || '').trim().toLowerCase());

              const kStrip = (m.kode_strip || '').trim().toLowerCase();
              const altStrips = (m.alternative_kode_strip || '').split(',').map((s: string) => s.trim().toLowerCase());
              
              return relatedStrips.includes(kStrip) || altStrips.some((s: string) => relatedStrips.includes(s));
            }
          });
          
          let requirement = 0;
          if (relatedMaterials.length > 0) {
            relatedMaterials.forEach((material: any) => {
              const matKodeSt = (material.kode_st || '').trim().toLowerCase();
              if (!matKodeSt) return;

              const weight = material.berat_per_pcs || 1;
              
              const soInfo = soMap.get(matKodeSt) || { pcs: 0, kg: 0 };
              const orderKg = soInfo.kg || (soInfo.pcs * weight);
              
              const looInfo = looMap.get(matKodeSt) || { sisa_loo_pcs: 0, sisa_order_pcs: 0, sisa_loo_kg: 0, sisa_order_kg: 0 };
              const looKg = looInfo.sisa_loo_kg || (looInfo.sisa_loo_pcs * weight);
              const sisaOrderKg = looInfo.sisa_order_kg || (looInfo.sisa_order_pcs * weight);

              const forecastInfo = forecastMap.get(matKodeSt) || { pcs: 0, kg: 0 };
              const forecastKg = forecastInfo.kg || (forecastInfo.pcs * weight);

              requirement += sisaOrderKg + looKg + forecastKg;
            });
          }

          return {
            ...row,
            requirement,
            free_stock: row.qty_kg - requirement
          };
        });

        return combinedData;
    },
    staleTime: 5 * 60 * 1000,
  });

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') direction = 'desc';
      else if (sortConfig.direction === 'desc') direction = null;
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key || !sortConfig.direction) return <ArrowUpDown className="w-3 h-3 ml-1 text-gray-400" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-emerald-600" /> : <ArrowDown className="w-3 h-3 ml-1 text-emerald-600" />;
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  };

  const formatQty = (num: number) => {
    return num.toLocaleString('id-ID', { maximumFractionDigits: 2 });
  };

  const filteredData = useMemo(() => {
    let result = data;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(row => 
        row.spec.toLowerCase().includes(term) ||
        row.type.toLowerCase().includes(term) ||
        row.tebal.toString().includes(term) ||
        row.lebar.toString().includes(term)
      );
    }

    if (typeFilter) result = result.filter(row => row.type === typeFilter);
    if (specFilter !== 'all') result = result.filter(row => row.spec === specFilter);
    if (thickFilter !== 'all') result = result.filter(row => row.tebal.toString() === thickFilter);
    if (widthFilter !== 'all') result = result.filter(row => row.lebar.toString() === widthFilter);

    if (sortConfig.key && sortConfig.direction) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }

    return result;
  }, [data, searchTerm, typeFilter, specFilter, thickFilter, widthFilter, sortConfig]);

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, typeFilter, specFilter, thickFilter, widthFilter, sortConfig]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const availableSpecs = Array.from(new Set(data.filter(d => 
    d.type === typeFilter && 
    (thickFilter === 'all' || String(d.tebal) === thickFilter) &&
    (widthFilter === 'all' || String(d.lebar) === widthFilter)
  ).map(d => String(d.spec)))).filter(Boolean).sort();

  const availableThicks = Array.from(new Set(data.filter(d => 
    d.type === typeFilter && 
    (specFilter === 'all' || String(d.spec) === specFilter) &&
    (widthFilter === 'all' || String(d.lebar) === widthFilter)
  ).map(d => Number(d.tebal)))).sort((a: any, b: any) => a - b);

  const availableWidths = Array.from(new Set(data.filter(d => 
    d.type === typeFilter && 
    (specFilter === 'all' || String(d.spec) === specFilter) &&
    (thickFilter === 'all' || String(d.tebal) === thickFilter)
  ).map(d => Number(d.lebar)))).sort((a: any, b: any) => a - b);

  const totalQty = filteredData.reduce((sum, row) => sum + row.qty_kg, 0);
  const totalRequirement = filteredData.reduce((sum, row) => sum + row.requirement, 0);
  const totalFreeStock = filteredData.reduce((sum, row) => sum + row.free_stock, 0);

  const handleExport = async () => {
    const xlsx = await import('xlsx');
    const ws = xlsx.utils.json_to_sheet(filteredData.map(row => ({
      'Kode Material': row.kode_material || '',
      'Spec': row.spec,
      'Tebal (mm)': row.tebal,
      'Lebar (mm)': row.lebar,
      'Qty (Kg)': row.qty_kg,
      'Requirement (Kg)': row.requirement,
      'Free Stock (Kg)': row.free_stock
    })));
    
    xlsx.utils.sheet_add_json(ws, [{
      'Kode Material': '',
      'Spec': 'Total',
      'Tebal (mm)': '',
      'Lebar (mm)': '',
      'Qty (Kg)': totalQty,
      'Requirement (Kg)': totalRequirement,
      'Free Stock (Kg)': totalFreeStock
    }], { skipHeader: true, origin: -1 });

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Raw Material Stock');
    xlsx.writeFile(wb, `raw_material_stock_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-180px)]">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          <button
            onClick={handleExport}
            className="flex items-center px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Excel
          </button>

          {(searchTerm || specFilter !== 'all' || thickFilter !== 'all' || widthFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSpecFilter('all');
                setThickFilter('all');
                setWidthFilter('all');
              }}
              className="flex items-center px-3 py-2 text-sm text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 mr-1" />
              Clear Filters
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-500">
              Loading data...
            </div>
          ) : (
            <table className="w-full text-[11px] text-left">
              <thead className="text-[10px] text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 font-semibold text-gray-600 w-16 text-center align-top">No</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 align-top">Kode Material</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 align-top">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('spec')}>
                        Spec {getSortIcon('spec')}
                      </div>
                      <select
                        value={specFilter}
                        onChange={(e) => setSpecFilter(e.target.value)}
                        className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-normal w-full max-w-[150px]"
                      >
                        <option value="all">All Specs</option>
                        {availableSpecs.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 align-top">
                    <div className="flex flex-col gap-2 items-end">
                      <div className="flex items-center cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('tebal')}>
                        Tebal (mm) {getSortIcon('tebal')}
                      </div>
                      <select
                        value={thickFilter}
                        onChange={(e) => setThickFilter(e.target.value)}
                        className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-normal w-full max-w-[120px]"
                      >
                        <option value="all">All Thicknesses</option>
                        {availableThicks.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 align-top">
                    <div className="flex flex-col gap-2 items-end">
                      <div className="flex items-center cursor-pointer hover:text-emerald-600 transition-colors" onClick={() => handleSort('lebar')}>
                        Lebar (mm) {getSortIcon('lebar')}
                      </div>
                      <select
                        value={widthFilter}
                        onChange={(e) => setWidthFilter(e.target.value)}
                        className="px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-emerald-500 font-normal w-full max-w-[120px]"
                      >
                        <option value="all">All Widths</option>
                        {availableWidths.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors text-right align-top" onClick={() => handleSort('qty_kg')}>
                    <div className="flex items-center justify-end">Qty (Ton) {getSortIcon('qty_kg')}</div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors text-right align-top" onClick={() => handleSort('requirement')}>
                    <div className="flex items-center justify-end">Requirement (Ton) {getSortIcon('requirement')}</div>
                  </th>
                  <th className="px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors text-right align-top" onClick={() => handleSort('free_stock')}>
                    <div className="flex items-center justify-end">Free Stock (Ton) {getSortIcon('free_stock')}</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedData.length > 0 ? (
                  paginatedData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="px-4 py-2 text-center text-gray-500">{(currentPage - 1) * itemsPerPage + idx + 1}</td>
                      <td className="px-4 py-2 text-gray-600">{row.kode_material}</td>
                      <td className="px-4 py-2 text-gray-600">{row.spec}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNumber(row.tebal)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatNumber(row.lebar)}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">{formatQty(row.qty_kg)}</td>
                      <td className="px-4 py-2 text-right font-medium text-indigo-600">{formatQty(row.requirement)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${row.free_stock < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatQty(row.free_stock)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      Tidak ada data yang ditemukan
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot className="bg-gray-50 font-bold sticky bottom-0 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-right text-gray-900">Total:</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatQty(totalQty)}</td>
                  <td className="px-4 py-3 text-right text-indigo-600">{formatQty(totalRequirement)}</td>
                  <td className={`px-4 py-3 text-right ${totalFreeStock < 0 ? 'text-red-600' : 'text-emerald-600'}`}>{formatQty(totalFreeStock)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Pagination Controls */}
        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="text-sm text-gray-500">
              Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredData.length)}</span> of <span className="font-medium">{filteredData.length}</span> results
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm text-gray-700 font-medium px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded-md border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
