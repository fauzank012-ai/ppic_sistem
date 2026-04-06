import { useEffect, useState, useMemo } from 'react';
import { Search, Download, Layers, ArrowUpDown, ArrowUp, ArrowDown, BarChart2, Table as TableIcon } from 'lucide-react';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { useViewMode } from '../contexts/ViewModeContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

export default function SlowMovingStock() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const { viewMode } = useViewMode();
  const { refreshKey } = useRefresh();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [stocksData, materialsData] = await Promise.all([
          fetchAllRows('stocks', 'kode_material,wip_st_pcs,wip_lt_pcs,fg_st_pcs,fg_lt_pcs,wip_st_kg,wip_lt_kg,fg_st_kg,fg_lt_kg,pasm,jenis_stock,lokasi_gudang,created_at').catch(() => []),
          fetchAllRows('material_master', 'kode_st,kode_lt,berat_per_pcs,dimensi,konversi_lt_ke_st,alternative_kodes_st,alternative_kodes_lt').catch(() => [])
        ]);
        setStocks(stocksData);
        setMaterials(materialsData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [refreshKey]);

  const materialMap = useMemo(() => {
    const map = new Map<string, { weight: number; dimensi: string; konversi: number }>();
    const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();

    materials.forEach(m => {
      const info = {
        weight: m.berat_per_pcs || 0,
        dimensi: m.dimensi || '-',
        konversi: m.konversi_lt_ke_st || 0
      };
      
      if (m.kode_st) map.set(normalize(m.kode_st), info);
      if (m.kode_lt) map.set(normalize(m.kode_lt), info);
      
      if (m.alternative_kodes_st) {
        m.alternative_kodes_st.split(',').forEach((alt: string) => {
          if (alt.trim()) map.set(normalize(alt), info);
        });
      }
      if (m.alternative_kodes_lt) {
        m.alternative_kodes_lt.split(',').forEach((alt: string) => {
          if (alt.trim()) map.set(normalize(alt), info);
        });
      }
    });
    return map;
  }, [materials]);

  const donutChartsData = useMemo(() => {
    if (stocks.length === 0) return null;

    // Find the latest date in stocks
    let latestDate: Date | null = null;
    stocks.forEach(s => {
      if (s.created_at) {
        const d = new Date(s.created_at);
        if (!latestDate || d > latestDate) latestDate = d;
      }
    });

    if (!latestDate) return null;

    const targetDay = latestDate.getDate();
    const targetMonth = latestDate.getMonth();
    const targetYear = latestDate.getFullYear();
    const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();

    const typeMap = new Map<string, number>();
    const locationMap = new Map<string, number>();
    const statusMap = {
      'WIP ST': 0,
      'WIP LT': 0,
      'FG ST': 0,
      'FG LT': 0
    };

    let totalWeightKg = 0;
    let totalItems = 0;

    stocks.forEach(s => {
      if (!s.created_at) return;
      const d = new Date(s.created_at);
      if (d.getDate() === targetDay && 
          d.getMonth() === targetMonth && 
          d.getFullYear() === targetYear &&
          String(s.pasm).toUpperCase() === 'SLOW') {
        
        const info = materialMap.get(normalize(s.kode_material));
        const beratPerPcs = info?.weight || 0;
        const konversi = info?.konversi || 0;

        const wip_st_kg = (s.wip_st_pcs || 0) * beratPerPcs;
        const wip_lt_kg = (s.wip_lt_pcs || 0) * konversi * beratPerPcs;
        const fg_st_kg = (s.fg_st_pcs || 0) * beratPerPcs;
        const fg_lt_kg = (s.fg_lt_pcs || 0) * konversi * beratPerPcs;

        const totalKg = wip_st_kg + wip_lt_kg + fg_st_kg + fg_lt_kg;
        if (totalKg <= 0) return;

        totalWeightKg += totalKg;
        totalItems++;

        // By Type
        const type = s.jenis_stock || 'Unknown';
        typeMap.set(type, (typeMap.get(type) || 0) + totalKg / 1000);

        // By Location
        const loc = s.lokasi_gudang || 'Unknown';
        locationMap.set(loc, (locationMap.get(loc) || 0) + totalKg / 1000);

        // By Status
        statusMap['WIP ST'] += wip_st_kg;
        statusMap['WIP LT'] += wip_lt_kg;
        statusMap['FG ST'] += fg_st_kg;
        statusMap['FG LT'] += fg_lt_kg;
      }
    });

    const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

    return {
      totalWeightKg,
      totalWeightTon: totalWeightKg / 1000,
      totalItems,
      byType: Array.from(typeMap.entries()).map(([name, value], index) => ({ 
        name, 
        value, 
        color: COLORS[index % COLORS.length] 
      })),
      byLocation: Array.from(locationMap.entries()).map(([name, value], index) => ({ 
        name, 
        value, 
        color: COLORS[index % COLORS.length] 
      })),
      byStatus: [
        { name: 'WIP ST', value: statusMap['WIP ST'], color: '#F59E0B' },
        { name: 'WIP LT', value: statusMap['WIP LT'], color: '#EF4444' },
        { name: 'FG ST', value: statusMap['FG ST'], color: '#10B981' },
        { name: 'FG LT', value: statusMap['FG LT'], color: '#3B82F6' }
      ].filter(d => d.value > 0)
    };
  }, [stocks, materialMap]);

  const dateColumns = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Find days that have stock data
    const daysWithData = new Set<number>();
    stocks.forEach(s => {
      if (s.created_at) {
        const d = new Date(s.created_at);
        if (d.getMonth() === month && d.getFullYear() === year) {
          daysWithData.add(d.getDate());
        }
      }
    });

    const dates = [];
    for (let i = 1; i <= daysInMonth; i++) {
      if (!daysWithData.has(i)) continue;

      const date = new Date(year, month, i);
      const formattedDate = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      dates.push({
        id: `date_${i}`,
        label: formattedDate.replace(' ', '-'),
        day: i
      });
    }
    return dates;
  }, [stocks]);

  // Optimization: Group stocks by material and day for O(1) lookup
  const stocksGrouped = useMemo(() => {
    const map = new Map<string, any[]>();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();

    stocks.forEach(s => {
      if (!s.created_at || !s.kode_material) return;
      const d = new Date(s.created_at);
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        const key = `${normalize(s.kode_material)}_${day}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(s);
      }
    });
    return map;
  }, [stocks]);

  const uniqueSlowMaterials = useMemo(() => {
    // Get materials that are SLOW in the latest stock data
    const slowMaterialsMap = new Map<string, string>(); // Map kode -> jenis_stock
    
    // Find the latest date in stocks
    let latestDate: Date | null = null;
    stocks.forEach(s => {
      if (s.created_at) {
        const d = new Date(s.created_at);
        if (!latestDate || d > latestDate) latestDate = d;
      }
    });
    
    if (latestDate) {
      const targetDay = latestDate.getDate();
      const targetMonth = latestDate.getMonth();
      const targetYear = latestDate.getFullYear();
      const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();

      stocks.forEach(s => {
        if (!s.created_at) return;
        const d = new Date(s.created_at);
        if (d.getDate() === targetDay && 
            d.getMonth() === targetMonth && 
            d.getFullYear() === targetYear &&
            String(s.pasm).toUpperCase() === 'SLOW') {
          
          const totalPcs = (s.wip_lt_pcs || 0) + (s.wip_st_pcs || 0) + (s.fg_st_pcs || 0) + (s.fg_lt_pcs || 0);
          if (totalPcs > 0) {
            slowMaterialsMap.set(normalize(s.kode_material), s.jenis_stock || '-');
          }
        }
      });
    }

    return Array.from(slowMaterialsMap.entries()).map(([kode, jenis]) => {
      const info = materialMap.get(kode) || { weight: 0, dimensi: '-', konversi: 0 };
      return {
        kode_material: kode.toUpperCase(),
        dimensi: info.dimensi,
        jenis: jenis,
        weight: info.weight,
        konversi: info.konversi
      };
    });
  }, [stocks, materialMap]);

  const chartData = useMemo(() => {
    const dateMap = new Map<string, any>();

    stocks.filter(s => String(s.pasm).toUpperCase() === 'SLOW').forEach(item => {
      if (!item.created_at) return;
      const dateObj = new Date(item.created_at);
      const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      
      const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();
      const materialInfo = materialMap.get(normalize(item.kode_material));
      const beratPerPcs = materialInfo?.weight || 0;
      const konversi = materialInfo?.konversi || 0;
      
      const total_kg = (item.wip_st_kg || 0) + (item.fg_st_kg || 0) + (item.wip_lt_kg || 0) + (item.fg_lt_kg || 0);

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          date: dateKey,
          label: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
          'Total (Kg)': 0
        });
      }

      const entry = dateMap.get(dateKey)!;
      entry['Total (Kg)'] += total_kg;
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [stocks, materialMap]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedData = useMemo(() => {
    let result = [...uniqueSlowMaterials];

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(item => 
        item.kode_material.toLowerCase().includes(lowerSearch) ||
        item.dimensi.toLowerCase().includes(lowerSearch) ||
        item.jenis.toLowerCase().includes(lowerSearch)
      );
    }

    if (sortConfig.key && sortConfig.direction) {
      result.sort((a: any, b: any) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal === bVal) return 0;
        const isAsc = sortConfig.direction === 'asc';
        return aVal < bVal ? (isAsc ? -1 : 1) : (isAsc ? 1 : -1);
      });
    }

    return result;
  }, [uniqueSlowMaterials, searchTerm, sortConfig]);

  const totalPages = Math.ceil(filteredAndSortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSortedData.slice(start, start + pageSize);
  }, [filteredAndSortedData, page, pageSize]);

  const handleExport = async () => {
    const xlsx = await import('xlsx');
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const exportData = filteredAndSortedData.map(row => {
      const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();
      const newRow: any = {
        'Jenis': row.jenis,
        'Kode Material': row.kode_material,
        'Dimensi': row.dimensi
      };

      dateColumns.forEach(date => {
        const key = `${normalize(row.kode_material)}_${date.day}`;
        const sameDayStocks = (stocksGrouped.get(key) || []).filter(s => String(s.pasm).toUpperCase() === 'SLOW');

        if (sameDayStocks.length > 0) {
          const totalKg = sameDayStocks.reduce((sum, s) => 
            sum + (s.wip_st_kg || 0) + (s.fg_st_kg || 0) + (s.wip_lt_kg || 0) + (s.fg_lt_kg || 0), 0
          );
          newRow[date.label] = totalKg;
        } else {
          newRow[date.label] = 0;
        }
      });

      return newRow;
    });

    const ws = xlsx.utils.json_to_sheet(exportData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Slow Moving Stock');
    xlsx.writeFile(wb, 'Slow_Moving_Stock.xlsx');
  };

  return (
    <div className="px-4 py-2 flex flex-col h-full bg-[#FDFBF7]">
      <div className="flex justify-end items-center mb-4">
        <div className="flex items-center gap-3">
          {viewMode === 'report' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cari material..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-1.5 bg-white border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all w-64"
                />
              </div>
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {viewMode === 'chart' ? (
          <div className="p-3 flex-1 min-h-0 overflow-y-auto">
            {donutChartsData && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                {/* Card 1: Berdasarkan Jenis Stock */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
                  <h3 className="text-sm font-bold text-[#2D3748] mb-3">Berdasarkan Jenis Stock</h3>
                  <div className="w-full h-[150px] mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={donutChartsData.byType} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 10 }}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 10 }}
                        />
                        <Tooltip 
                          cursor={{ fill: '#F8FAFC' }}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {donutChartsData.byType.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-medium">Total Weight</span>
                      <span className="text-[#2D3748] font-bold">{Math.round(donutChartsData.totalWeightTon).toLocaleString()} Ton</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {donutChartsData.byType.map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-[10px] font-bold text-gray-500 uppercase truncate">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card 2: Berdasarkan Lokasi Gudang */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
                  <h3 className="text-sm font-bold text-[#2D3748] mb-3">Berdasarkan Lokasi Gudang</h3>
                  <div className="w-full h-[150px] mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={donutChartsData.byLocation} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 10 }}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 10 }}
                        />
                        <Tooltip 
                          cursor={{ fill: '#F8FAFC' }}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {donutChartsData.byLocation.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-medium">Total Weight</span>
                      <span className="text-[#2D3748] font-bold">{Math.round(donutChartsData.totalWeightTon).toLocaleString()} Ton</span>
                    </div>
                    <div className="grid grid-flow-col grid-rows-3 gap-x-4 gap-y-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-200">
                      {donutChartsData.byLocation.map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-[10px] font-bold text-gray-500 uppercase truncate">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card 3: Berdasarkan Status Stock */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
                  <h3 className="text-sm font-bold text-[#2D3748] mb-3">Berdasarkan Status Stock</h3>
                  <div className="w-full h-[150px] mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={donutChartsData.byStatus} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis 
                          dataKey="name" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 10 }}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 10 }}
                        />
                        <Tooltip 
                          cursor={{ fill: '#F8FAFC' }}
                          contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                        />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {donutChartsData.byStatus.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-medium">Total Weight</span>
                      <span className="text-[#2D3748] font-bold">{Math.round(donutChartsData.totalWeightKg).toLocaleString()} Kg</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-medium">Total Items</span>
                      <span className="text-[#2D3748] font-bold">{donutChartsData.totalItems.toLocaleString()} Items</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
                      {donutChartsData.byStatus.map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                          <span className="text-[10px] font-bold text-gray-500 uppercase truncate">{item.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="h-[150px]">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis 
                      dataKey="label" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 11 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      tickFormatter={(value) => value.toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                      dx={-10}
                    />
                    <Tooltip 
                      formatter={(value: number) => [value.toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' Kg', '']}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    <Line type="monotone" dataKey="Total (Kg)" stroke="#0d9488" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Tidak ada data Slow Moving Stock untuk ditampilkan grafiknya.
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-12 border-b border-gray-200">No</th>
                    <th 
                      className="px-2 py-2 font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-200"
                      onClick={() => handleSort('jenis')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Jenis</span>
                        {sortConfig.key === 'jenis' ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-600" /> : <ArrowDown className="w-3 h-3 text-teal-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-2 py-2 font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-200"
                      onClick={() => handleSort('kode_material')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Kode Material</span>
                        {sortConfig.key === 'kode_material' ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-600" /> : <ArrowDown className="w-3 h-3 text-teal-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </div>
                    </th>
                    <th 
                      className="px-2 py-2 font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-200"
                      onClick={() => handleSort('dimensi')}
                    >
                      <div className="flex items-center space-x-1">
                        <span>Dimensi</span>
                        {sortConfig.key === 'dimensi' ? (
                          sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-teal-600" /> : <ArrowDown className="w-3 h-3 text-teal-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 opacity-50" />
                        )}
                      </div>
                    </th>
                    {dateColumns.map(date => {
                      const today = new Date().getDate();
                      const isToday = date.day === today;
                      return (
                        <th key={date.id} className={`px-2 py-2 text-center font-semibold whitespace-nowrap border-b border-l border-gray-200 ${isToday ? 'bg-teal-600 text-white' : 'text-gray-600'}`}>
                          {date.label}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr>
                      <td colSpan={dateColumns.length + 4} className="px-2 py-8 text-center text-gray-500">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                          Memuat data...
                        </div>
                      </td>
                    </tr>
                  ) : paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={dateColumns.length + 4} className="px-2 py-8 text-center text-gray-500">
                        Tidak ada data ditemukan dengan status PASM = SLOW
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-2 py-1.5 whitespace-nowrap text-center text-gray-500 font-medium">{(page - 1) * pageSize + idx + 1}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{row.jenis}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-gray-900 font-medium">{row.kode_material}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-gray-600">{row.dimensi}</td>
                        {dateColumns.map(date => {
                          const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();
                          const key = `${normalize(row.kode_material)}_${date.day}`;
                          const sameDayStocks = (stocksGrouped.get(key) || []).filter(s => String(s.pasm).toUpperCase() === 'SLOW');

                          let totalKg = 0;
                          if (sameDayStocks.length > 0) {
                            const totalPcsST = sameDayStocks.reduce((sum, s) => 
                              sum + (s.wip_st_pcs || 0) + (s.fg_st_pcs || 0) + (((s.wip_lt_pcs || 0) + (s.fg_lt_pcs || 0)) * row.konversi), 0
                            );
                            totalKg = totalPcsST * row.weight;
                          }

                          return (
                            <td key={date.id} className={`px-2 py-1.5 whitespace-nowrap text-right border-l border-gray-100 ${date.day === new Date().getDate() ? 'bg-teal-50 font-bold text-teal-700' : 'text-gray-600'}`}>
                              {totalKg > 0 ? Math.round(totalKg).toLocaleString() : '-'}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
                {!loading && filteredAndSortedData.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
                    <tr className="bg-teal-700 text-white font-bold">
                      <td colSpan={4} className="px-2 py-2 text-center border-t border-teal-600">GRAND TOTAL (KG)</td>
                      {dateColumns.map(date => {
                        const normalize = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();
                        const totalForDay = filteredAndSortedData.reduce((sum, row) => {
                          const key = `${normalize(row.kode_material)}_${date.day}`;
                          const sameDayStocks = (stocksGrouped.get(key) || []).filter(s => String(s.pasm).toUpperCase() === 'SLOW');

                          if (sameDayStocks.length > 0) {
                            const totalKg = sameDayStocks.reduce((acc, s) => 
                              acc + (s.wip_st_kg || 0) + (s.fg_st_kg || 0) + (s.wip_lt_kg || 0) + (s.fg_lt_kg || 0), 0
                            );
                            return sum + totalKg;
                          }
                          return sum;
                        }, 0);

                        return (
                          <td key={date.id} className="px-2 py-2 text-right border-t border-l border-teal-600">
                            {totalForDay > 0 ? Math.round(totalForDay).toLocaleString() : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <div className="p-3 border-t bg-gray-50 text-[10px] text-gray-500 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <span>Menampilkan {paginatedData.length} dari {filteredAndSortedData.length} material SLOW</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Baris per halaman:</span>
                  <select 
                    value={pageSize} 
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="bg-transparent border-none focus:ring-0 cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 border rounded hover:bg-white disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="font-medium">Halaman {page} dari {totalPages || 1}</span>
                <button 
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages || totalPages === 0}
                  className="px-2 py-1 border rounded hover:bg-white disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
