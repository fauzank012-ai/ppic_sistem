import { useState, useMemo } from 'react';
import { fetchAllRows } from '../lib/supabase';
import { RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

export default function FinishedGoodsStock() {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['finished_goods_stock_data'],
    queryFn: async () => {
      // Fetch only necessary columns
      return await fetchAllRows('view_finished_goods_stock', 'kode_material,dimensi,fg_lt_pcs,fg_st_pcs,fg_lt_kg,fg_st_kg,total_so_kg,total_sisa_order_kg,total_sisa_loo_kg,total_forecast_kg');
    },
    staleTime: 5 * 60 * 1000,
  });

  const processedData = useMemo(() => {
    const currentDay = new Date().getDate();
    
    return data.map(item => {
      const fg_lt_pcs = item.fg_lt_pcs || 0;
      const fg_st_pcs = item.fg_st_pcs || 0;
      const fg_lt_kg = item.fg_lt_kg || 0;
      const fg_st_kg = item.fg_st_kg || 0;
      
      const requirement_kg = (item.total_sisa_order_kg || 0) + (item.total_sisa_loo_kg || 0) + (currentDay <= 15 ? Math.max(0, (item.total_forecast_kg || 0) - (item.total_so_kg || 0)) : 0);
      
      const free_stock_kg = Math.max(0, fg_lt_kg + fg_st_kg - requirement_kg);
      
      return {
        ...item,
        fg_lt_pcs,
        fg_st_pcs,
        fg_lt_kg,
        fg_st_kg,
        free_stock_kg,
        dimensi: item.dimensi || '-'
      };
    }).filter(item => 
      item.fg_lt_pcs !== 0 || item.fg_lt_kg !== 0 || item.fg_st_pcs !== 0 || item.fg_st_kg !== 0 || item.free_stock_kg !== 0
    );
  }, [data]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return processedData;
    return [...processedData].sort((a, b) => {
      const aVal = a[sortConfig.key as keyof typeof a];
      const bVal = b[sortConfig.key as keyof typeof b];
      if (aVal === bVal) return 0;
      const comparison = aVal < bVal ? -1 : 1;
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [processedData, sortConfig]);

  const paginatedData = useMemo(() => {
    return sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [sortedData, currentPage]);

  const totals = useMemo(() => {
    return processedData.reduce((acc, item) => ({
      fg_lt_pcs: acc.fg_lt_pcs + (item.fg_lt_pcs || 0),
      fg_lt_kg: acc.fg_lt_kg + (item.fg_lt_kg || 0),
      fg_st_pcs: acc.fg_st_pcs + (item.fg_st_pcs || 0),
      fg_st_kg: acc.fg_st_kg + (item.fg_st_kg || 0),
      free_stock_kg: acc.free_stock_kg + (item.free_stock_kg || 0),
    }), { fg_lt_pcs: 0, fg_lt_kg: 0, fg_st_pcs: 0, fg_st_kg: 0, free_stock_kg: 0 });
  }, [processedData]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
    setCurrentPage(1);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><RefreshCw className="w-8 h-8 text-teal-600 animate-spin" /></div>;

  return (
    <div className="p-4 bg-gray-50 h-full flex flex-col">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col">
        <div className="overflow-auto flex-1">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {['NO', 'Kode Material', 'Dimensi', 'FG LT (PCS)', 'FG LT (Kg)', 'FG ST (PCS)', 'FG ST (KG)', 'Free Stock (KG)'].map((header, i) => (
                  <th key={header} className="px-4 py-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => i > 0 && handleSort(['kode_material', 'dimensi', 'fg_lt_pcs', 'fg_lt_kg', 'fg_st_pcs', 'fg_st_kg', 'free_stock_kg'][i-1])}>
                    {header} {i > 0 && <ArrowUpDown className="w-3 h-3 ml-1 inline-block opacity-50" />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedData.map((item, index) => (
                <tr key={item.kode_material}>
                  <td className="px-4 py-2 text-[11px]">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                  <td className="px-4 py-2 text-[11px]">{item.kode_material}</td>
                  <td className="px-4 py-2 text-[11px]">{item.dimensi}</td>
                  <td className="px-4 py-2 text-[11px] text-right">{item.fg_lt_pcs.toLocaleString()}</td>
                  <td className="px-4 py-2 text-[11px] text-right">{item.fg_lt_kg.toLocaleString()}</td>
                  <td className="px-4 py-2 text-[11px] text-right">{item.fg_st_pcs.toLocaleString()}</td>
                  <td className="px-4 py-2 text-[11px] text-right">{item.fg_st_kg.toLocaleString()}</td>
                  <td className="px-4 py-2 text-[11px] text-right font-medium">{item.free_stock_kg.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-bold sticky bottom-0">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-[11px] text-right uppercase">Grand Total</td>
                <td className="px-4 py-3 text-[11px] text-right">{totals.fg_lt_pcs.toLocaleString()}</td>
                <td className="px-4 py-3 text-[11px] text-right">{totals.fg_lt_kg.toLocaleString()}</td>
                <td className="px-4 py-3 text-[11px] text-right">{totals.fg_st_pcs.toLocaleString()}</td>
                <td className="px-4 py-3 text-[11px] text-right">{totals.fg_st_kg.toLocaleString()}</td>
                <td className="px-4 py-3 text-[11px] text-right">{totals.free_stock_kg.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
