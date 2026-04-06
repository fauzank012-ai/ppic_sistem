import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search, X, ArrowUpDown, ArrowUp, ArrowDown, Layers, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie } from 'recharts';
import { useViewMode } from '../contexts/ViewModeContext';

export default function MinMaxStock() {
  const { refreshKey } = useRefresh();
  const { viewMode } = useViewMode();

  const { data: rawData, isLoading: loading } = useQuery({
    queryKey: ['min-max-stock-data', refreshKey],
    queryFn: async () => {
      const [minMaxData, stocksData, materialsData] = await Promise.all([
        fetchAllRows('min_max_stock', 'id,jenis,class,customer,kode_st,kode_lt,min_stock,max_stock'),
        fetchAllRows('stocks', 'kode_material,fg_st_pcs,fg_lt_pcs,wip_st_pcs,wip_lt_pcs,created_at,jenis_stock,lokasi_gudang'),
        fetchAllRows('material_master', 'kode_st,kode_lt,alternative_kodes_st,alternative_kodes_lt,berat_per_pcs,konversi_lt_ke_st,dimensi')
      ]);
      return { minMaxData, stocksData, materialsData };
    },
    staleTime: 5 * 60 * 1000,
  });

  const data = rawData?.minMaxData || [];
  const stocks = rawData?.stocksData || [];
  const materials = rawData?.materialsData || [];

  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });
  const [jenisFilter, setJenisFilter] = useState<string>('ALL');
  const [classFilter, setClassFilter] = useState<string>('ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const normalize = useCallback((s: string) => (s || '').replace(/\s+/g, '').toLowerCase(), []);
  const normalizeCust = useCallback((s: string) => {
    if (!s) return '';
    let res = s.trim().toUpperCase();
    res = res.replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '');
    return res.replace(/[^A-Z0-9]/g, '').toLowerCase();
  }, []);

  const materialMap = useMemo(() => {
    const map = new Map<string, any>();
    
    materials.forEach(m => {
      const info = {
        weight: Number(m.berat_per_pcs) || 0,
        konversi: Number(m.konversi_lt_ke_st) || 0,
        dimensi: m.dimensi || '-'
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
  }, [materials, normalize]);

  const columns = useMemo(() => {
    if (data.length === 0) return [];
    const keys = new Set<string>();
    data.slice(0, 10).forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== 'id' && key !== 'created_at' && key !== 'updated_at' && key !== 'jenis' && key !== 'class') {
          keys.add(key);
        }
      });
    });
    
    let cols = Array.from(keys).map(key => ({
      id: key,
      label: key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    }));

    if (jenisFilter === 'P. Hitam' || jenisFilter === 'P.Hitam API') {
      cols = cols.filter(col => {
        const lowerId = col.id.toLowerCase();
        return lowerId !== 'customer' && lowerId !== 'kode_lt' && lowerId !== 'kodelt';
      });

      cols = cols.map(col => {
        const lowerId = col.id.toLowerCase();
        if (lowerId === 'kode_st' || lowerId === 'kodest') {
          return { ...col, label: 'Kode Material' };
        }
        return col;
      });
    }

    return cols;
  }, [data, jenisFilter]);

  const uniqueJenis = useMemo(() => {
    const vals = new Set<string>();
    data.forEach(item => {
      if (item.jenis) vals.add(item.jenis);
    });
    return Array.from(vals).sort();
  }, [data]);

  const uniqueClass = useMemo(() => {
    const vals = new Set<string>();
    data.forEach(item => {
      if (item.class) vals.add(item.class);
    });
    return Array.from(vals).sort();
  }, [data]);

  const uniqueCustomers = useMemo(() => {
    const vals = new Set<string>();
    data.forEach(item => {
      if (item.customer) vals.add(item.customer);
    });
    return Array.from(vals).sort();
  }, [data]);

  const isMatch = useCallback((sCode: string, mCode: string, isPHitam: boolean) => {
    if (!sCode || !mCode) return false;

    if (mCode.includes('*') || isPHitam) {
      const escaped = mCode.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
      try {
          return new RegExp(regexStr).test(sCode);
      } catch (e) {
          return false;
      }
    }
    return sCode === mCode;
  }, []);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key, direction });
  };

  const dateColumns = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
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

  const stocksByDayAndCode = useMemo(() => {
    const dayMap = new Map<number, Map<string, any[]>>();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    stocks.forEach(s => {
      if (!s.created_at || !s.kode_material) return;
      const d = new Date(s.created_at);
      if (d.getMonth() === month && d.getFullYear() === year) {
        const day = d.getDate();
        if (!dayMap.has(day)) dayMap.set(day, new Map());
        const codeMap = dayMap.get(day)!;
        const code = normalize(s.kode_material);
        if (!codeMap.has(code)) codeMap.set(code, []);
        codeMap.get(code)!.push(s);
      }
    });
    return dayMap;
  }, [stocks, normalize]);

  const matchedStocksMap = useMemo(() => {
    const map = new Map<string, Map<number, any[]>>();
    
    data.forEach(row => {
      const rowKey = `${row.id}`;
      const rowDayMap = new Map<number, any[]>();
      
      const j = (row.jenis || '').trim().toUpperCase();
      const stPattern = (row.kode_st || '').includes('*');
      const ltPattern = (row.kode_lt || '').includes('*');
      const isPHitam = j.includes('HITAM');
      
      const stKey = normalize(row.kode_st);
      const ltKey = normalize(row.kode_lt);

      dateColumns.forEach(date => {
        const day = date.day;
        const dayStocksCodeMap = stocksByDayAndCode.get(day);
        if (!dayStocksCodeMap) return;

        let matched: any[] = [];
        if (!stPattern && !ltPattern && !isPHitam) {
          const stStocks = dayStocksCodeMap.get(stKey) || [];
          const ltStocks = dayStocksCodeMap.get(ltKey) || [];
          matched = [...stStocks, ...ltStocks];
        } else {
          // Fallback to slower matching for patterns
          for (const [sCode, sList] of dayStocksCodeMap.entries()) {
            if (isMatch(sCode, stKey, isPHitam) || isMatch(sCode, ltKey, isPHitam)) {
              matched.push(...sList);
            }
          }
        }
        if (matched.length > 0) {
          rowDayMap.set(day, matched);
        }
      });
      map.set(rowKey, rowDayMap);
    });
    return map;
  }, [data, dateColumns, stocksByDayAndCode, normalize, isMatch]);

  const getMatchedStocks = useCallback((row: any, day: number) => {
    return matchedStocksMap.get(`${row.id}`)?.get(day) || [];
  }, [matchedStocksMap]);

  const dataWithStatus = useMemo(() => {
    if (data.length === 0) return [];
    
    let latestDay = -1;
    dateColumns.forEach(d => {
      if (d.day > latestDay) latestDay = d.day;
    });

    return data.map(item => {
      let status = '';
      const matchedStocks = getMatchedStocks(item, latestDay);

      if (matchedStocks.length > 0) {
        const totalStock = matchedStocks.reduce((sum, s) => 
          sum + (s.fg_st_pcs || 0) + (s.fg_lt_pcs || 0) + (s.wip_st_pcs || 0) + (s.wip_lt_pcs || 0), 0
        );
        const min = Number(item.min_stock) || 0;
        const max = Number(item.max_stock) || 0;
        if (min > 0 && totalStock < min) status = 'UNDER';
        else if (max > 0 && totalStock > max) status = 'OVER';
        else if (min > 0 || max > 0) status = 'OK';
      }
      return { ...item, _todayStatus: status };
    });
  }, [data, dateColumns, getMatchedStocks]);

  const filteredAndSortedData = useMemo(() => {
    let result = [...dataWithStatus];

    if (jenisFilter !== 'ALL') result = result.filter(item => item.jenis === jenisFilter);
    if (classFilter !== 'ALL') result = result.filter(item => item.class === classFilter);
    if (customerFilter !== 'ALL') result = result.filter(item => item.customer === customerFilter);
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'BLANK') {
        result = result.filter(item => !item._todayStatus || item._todayStatus === '');
      } else {
        result = result.filter(item => (item._todayStatus || '') === statusFilter);
      }
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(item => 
        Object.values(item).some(val => String(val).toLowerCase().includes(lowerSearch))
      );
    }

    if (sortConfig.key && sortConfig.direction) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal === bVal) return 0;
        const isAsc = sortConfig.direction === 'asc';
        if (aVal === null || aVal === undefined) return isAsc ? 1 : -1;
        if (bVal === null || bVal === undefined) return isAsc ? -1 : 1;
        return aVal < bVal ? (isAsc ? -1 : 1) : (isAsc ? 1 : -1);
      });
    }
    return result;
  }, [dataWithStatus, searchTerm, sortConfig, jenisFilter, classFilter, customerFilter, statusFilter]);

  const totalPages = Math.ceil(filteredAndSortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredAndSortedData.slice(start, start + pageSize);
  }, [filteredAndSortedData, page, pageSize]);

  const { columnsBefore, columnsAfter } = useMemo(() => {
    const maxStockIndex = columns.findIndex(c => c.id.toLowerCase().includes('max') && (c.id.toLowerCase().includes('stock') || c.id.toLowerCase().includes('stok')));
    const splitIndex = maxStockIndex !== -1 ? maxStockIndex + 1 : columns.length;
    return {
      columnsBefore: columns.slice(0, splitIndex),
      columnsAfter: columns.slice(splitIndex)
    };
  }, [columns]);

  const exportToExcel = async () => {
    const xlsx = await import('xlsx');
    const exportData = filteredAndSortedData.map(row => {
      const newRow: any = {};
      columnsBefore.forEach(col => { newRow[col.label] = row[col.id]; });
      dateColumns.forEach(date => {
        const sameDayStocks = getMatchedStocks(row, date.day);
        let stockVal = '';
        let status = '';
        if (sameDayStocks.length > 0) {
          const totalStock = sameDayStocks.reduce((sum, s) => sum + (s.fg_st_pcs || 0) + (s.fg_lt_pcs || 0) + (s.wip_st_pcs || 0) + (s.wip_lt_pcs || 0), 0);
          if (totalStock > 0) {
            stockVal = totalStock;
            const min = Number(row.min_stock) || 0;
            const max = Number(row.max_stock) || 0;
            if (min > 0 && totalStock < min) status = 'UNDER';
            else if (max > 0 && totalStock > max) status = 'OVER';
            else if (min > 0 || max > 0) status = 'OK';
          }
        }
        newRow[`${date.label} Stok`] = stockVal;
        newRow[`${date.label} Status`] = status;
      });
      columnsAfter.forEach(col => { newRow[col.label] = row[col.id]; });
      return newRow;
    });
    const ws = xlsx.utils.json_to_sheet(exportData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Min Max Stock');
    xlsx.writeFile(wb, 'Min_Max_Stock.xlsx');
  };

  const lineChartData = useMemo(() => {
    return dateColumns.map(date => {
      let okCount = 0;
      let underCount = 0;
      let overCount = 0;
      let totalCount = 0;

      data.forEach(item => {
        const matchedStocks = getMatchedStocks(item, date.day);
        if (matchedStocks.length > 0) {
          const totalStock = matchedStocks.reduce((sum, s) => 
            sum + (s.fg_st_pcs || 0) + (s.fg_lt_pcs || 0) + (s.wip_st_pcs || 0) + (s.wip_lt_pcs || 0), 0
          );
          const min = Number(item.min_stock) || 0;
          const max = Number(item.max_stock) || 0;
          
          if (min > 0 || max > 0) {
            totalCount++;
            if (min > 0 && totalStock < min) underCount++;
            else if (max > 0 && totalStock > max) overCount++;
            else okCount++;
          }
        }
      });

      return {
        date: date.label,
        'OK (%)': totalCount > 0 ? Math.round((okCount / totalCount) * 100) : 0,
        'UNDER (%)': totalCount > 0 ? Math.round((underCount / totalCount) * 100) : 0,
        'OVER (%)': totalCount > 0 ? Math.round((overCount / totalCount) * 100) : 0,
      };
    });
  }, [data, dateColumns, getMatchedStocks]);

  const summaryChartsData = useMemo(() => {
    if (data.length === 0 || stocks.length === 0) return null;

    let latestDay = -1;
    dateColumns.forEach(d => {
      if (d.day > latestDay) latestDay = d.day;
    });

    if (latestDay === -1) return null;

    const stats = {
      'Regular Order': { ok: 0, under: 0, over: 0, total: 0 },
      'P. Hitam': { ok: 0, under: 0, over: 0, total: 0 },
      'P. Hitam API': { ok: 0, under: 0, over: 0, total: 0 }
    };

    data.forEach(item => {
      const matchedStocks = getMatchedStocks(item, latestDay);

      const totalStock = matchedStocks.reduce((sum, s) => 
        sum + (s.fg_st_pcs || 0) + (s.fg_lt_pcs || 0) + (s.wip_st_pcs || 0) + (s.wip_lt_pcs || 0), 0
      );
      
      const min = Number(item.min_stock) || 0;
      const max = Number(item.max_stock) || 0;
      
      if (min > 0 || max > 0) {
        let category: 'Regular Order' | 'P. Hitam' | 'P. Hitam API' = 'Regular Order';
        const j = (item.jenis || '').trim().toUpperCase();
        if (j.includes('HITAM') && j.includes('API')) category = 'P. Hitam API';
        else if (j.includes('HITAM')) category = 'P. Hitam';
        else category = 'Regular Order';

        stats[category].total++;
        if (min > 0 && totalStock < min) stats[category].under++;
        else if (max > 0 && totalStock > max) stats[category].over++;
        else stats[category].ok++;
      }
    });

    const formatData = (cat: 'Regular Order' | 'P. Hitam' | 'P. Hitam API') => {
      const s = stats[cat];
      const achievement = s.total > 0 ? ((s.ok / s.total) * 100).toFixed(1) : '0.0';
      return {
        title: cat,
        achievement,
        ok: s.ok,
        under: s.under,
        over: s.over,
        total: s.total,
        chartData: [
          { name: 'OK', value: s.ok, color: '#10B981' },
          { name: 'UNDER', value: s.under, color: '#EF4444' },
          { name: 'OVER', value: s.over, color: '#F59E0B' }
        ].filter(d => d.value > 0)
      };
    };

    return {
      regular: formatData('Regular Order'),
      pHitam: formatData('P. Hitam'),
      pHitamApi: formatData('P. Hitam API')
    };
  }, [data, dateColumns, getMatchedStocks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FDFBF7]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin" />
          <p className="text-emerald-900 font-medium animate-pulse">Loading Min Max Stock...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-2 flex flex-col h-full bg-[#FDFBF7]">
      {viewMode === 'chart' && summaryChartsData && (
        <div className="mb-6 space-y-6">
          {/* Summary Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[summaryChartsData.regular, summaryChartsData.pHitam, summaryChartsData.pHitamApi].map((catData, idx) => (
              <div key={idx} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center relative">
                <h3 className="text-lg font-bold text-[#2D3748] mb-2">{catData.title}</h3>
                <div className="relative w-full h-[170px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={catData.chartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {catData.chartData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-[#2D3748]">{catData.achievement}%</span>
                    <span className="text-[10px] text-gray-400 uppercase font-semibold tracking-wider">Achievement</span>
                  </div>
                </div>
                
                <div className="w-full mt-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-medium">OK</span>
                    <span className="text-sm font-bold text-[#10B981]">{catData.ok} Items</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-medium">UNDER</span>
                    <span className="text-sm font-bold text-[#EF4444]">{catData.under} Items</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-500 font-medium">OVER</span>
                    <span className="text-sm font-bold text-[#F59E0B]">{catData.over} Items</span>
                  </div>
                  <div className="pt-3 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-sm font-bold text-[#2D3748] uppercase">Total Measured</span>
                    <span className="text-sm font-bold text-[#2D3748]">{catData.total} Items</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Line Chart: Progress Pencapaian Status */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold text-[#2D3748] mb-6">Progress Pencapaian Status Stock (%)</h3>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94A3B8', fontSize: 12 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94A3B8', fontSize: 12 }}
                    domain={[0, 100]}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}
                    formatter={(value: number) => [`${value}%`]}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                  <Line 
                    type="monotone" 
                    dataKey="OK (%)" 
                    stroke="#10B981" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="UNDER (%)" 
                    stroke="#EF4444" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#EF4444', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="OVER (%)" 
                    stroke="#F59E0B" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#F59E0B', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'report' && (
        <>
          <div className="flex justify-end items-center mb-4">
            <div className="flex items-center space-x-4">
              {uniqueJenis.length > 0 && (
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-600">Jenis:</span>
                  <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
                    <button
                      onClick={() => { setJenisFilter('ALL'); setPage(1); }}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${jenisFilter === 'ALL' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Semua
                    </button>
                    {uniqueJenis.map(j => (
                      <button
                        key={j}
                        onClick={() => { setJenisFilter(j); setPage(1); }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${jenisFilter === j ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                      >
                        {j}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-600">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                >
                  <option value="ALL">Semua Status</option>
                  <option value="OK">OK</option>
                  <option value="UNDER">UNDER</option>
                  <option value="OVER">OVER</option>
                  <option value="BLANK">BLANK</option>
                </select>
              </div>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="pl-9 pr-8 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                />
                {searchTerm && (
                  <button onClick={() => { setSearchTerm(''); setPage(1); }} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                onClick={exportToExcel}
                className="flex items-center space-x-2 bg-[#10B981] text-white px-3 py-1.5 rounded-lg hover:bg-[#059669] transition-colors text-sm font-medium"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
            </div>
          </div>

          <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th rowSpan={2} className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-12 border-b border-gray-200 text-xs align-middle">No</th>
                    {columnsBefore.map((col) => {
                      const isCustomer = col.id.toLowerCase() === 'customer';
                      return (
                        <th 
                          key={col.id} 
                          rowSpan={2}
                          className="px-2 py-2 font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-200 text-xs align-middle"
                          onClick={() => handleSort(col.id)}
                        >
                          <div className="flex flex-col space-y-1">
                            <div className="flex items-center space-x-1">
                              <span>{col.label}</span>
                              <span className="text-gray-400 flex-shrink-0">
                                {sortConfig.key === col.id ? (
                                  sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                                )}
                              </span>
                            </div>
                            {isCustomer && (
                              <select
                                value={customerFilter}
                                onChange={(e) => { e.stopPropagation(); setCustomerFilter(e.target.value); setPage(1); }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full bg-white border border-gray-300 rounded px-1 py-0.5 text-[10px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              >
                                <option value="ALL">Filter Cust</option>
                                {uniqueCustomers.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            )}
                          </div>
                        </th>
                      );
                    })}
                    {dateColumns.map(date => {
                      const isToday = date.day === new Date().getDate();
                      return (
                        <th key={date.id} colSpan={2} className={`px-2 py-2 text-center font-semibold whitespace-nowrap border-b border-l border-gray-200 text-xs ${isToday ? 'bg-blue-600 text-white' : 'text-gray-600'}`}>
                          {date.label}
                        </th>
                      );
                    })}
                    {columnsAfter.map((col) => (
                      <th 
                        key={col.id} 
                        rowSpan={2}
                        className="px-2 py-2 font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors border-b border-gray-200 text-xs align-middle"
                        onClick={() => handleSort(col.id)}
                      >
                        <div className="flex items-center space-x-1">
                          <span>{col.label}</span>
                          <span className="text-gray-400 flex-shrink-0">
                            {sortConfig.key === col.id ? (
                              sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                            ) : (
                              <ArrowUpDown className="w-3 h-3 opacity-50" />
                            )}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {dateColumns.map(date => {
                      const isToday = date.day === new Date().getDate();
                      return (
                        <React.Fragment key={`${date.id}_sub`}>
                          <th className={`px-2 py-1 text-center font-semibold whitespace-nowrap border-b border-l border-gray-200 text-xs ${isToday ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'}`}>Stok</th>
                          <th className={`px-2 py-1 text-center font-semibold whitespace-nowrap border-b border-l border-gray-200 text-xs ${isToday ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-600'}`}>
                            <div className="flex flex-col items-center space-y-1">
                              <span>Status</span>
                              {isToday && (
                                <select
                                  value={statusFilter}
                                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                                  className="bg-white border border-gray-300 rounded px-1 py-0.5 text-[10px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-700"
                                >
                                  <option value="ALL">All</option>
                                  <option value="OK">OK</option>
                                  <option value="UNDER">UNDER</option>
                                  <option value="OVER">OVER</option>
                                  <option value="BLANK">BLANK</option>
                                </select>
                              )}
                            </div>
                          </th>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedData.length > 0 ? (
                    paginatedData.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50 transition-colors">
                        <td className="px-2 py-1.5 whitespace-nowrap text-center text-gray-500 font-medium text-xs">{(page - 1) * pageSize + index + 1}</td>
                        {columnsBefore.map(col => {
                          const val = row[col.id];
                          const lowerId = col.id.toLowerCase();
                          const isCode = lowerId.includes('kode') || lowerId.includes('id') || lowerId.includes('customer') || lowerId.includes('spec') || lowerId.includes('dimensi') || lowerId.includes('jenis') || lowerId.includes('class') || lowerId.includes('work_center');
                          let displayVal = val === null || val === undefined || val === '' ? '-' : val;
                          let isNumeric = false;
                          if (!isCode && val !== null && val !== undefined && val !== '') {
                            if (typeof val === 'number') {
                              displayVal = Math.round(val).toLocaleString('en-US');
                              isNumeric = true;
                            } else if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
                              if (lowerId.includes('min') || lowerId.includes('max') || lowerId.includes('stock') || lowerId.includes('stok') || lowerId.includes('qty') || lowerId.includes('balance') || lowerId.includes('d1') || lowerId.includes('d2') || lowerId.includes('dia') || lowerId.includes('thick') || lowerId.includes('length')) {
                                displayVal = Math.round(Number(val)).toLocaleString('en-US');
                                isNumeric = true;
                              }
                            }
                          }
                          return (
                            <td key={col.id} className={`px-2 py-1.5 whitespace-nowrap text-gray-600 text-xs ${isNumeric ? 'text-right' : 'text-left'}`}>
                              {displayVal}
                            </td>
                          );
                        })}
                        {dateColumns.map(date => {
                          const sameDayStocks = getMatchedStocks(row, date.day);
                          let stockVal = '-';
                          let status = '';
                          if (sameDayStocks.length > 0) {
                            const totalStock = sameDayStocks.reduce((sum, s) => sum + (s.fg_st_pcs || 0) + (s.fg_lt_pcs || 0) + (s.wip_st_pcs || 0) + (s.wip_lt_pcs || 0), 0);
                            if (totalStock > 0) {
                              stockVal = totalStock.toLocaleString();
                              const min = Number(row.min_stock) || 0;
                              const max = Number(row.max_stock) || 0;
                              if (min > 0 && totalStock < min) status = 'UNDER';
                              else if (max > 0 && totalStock > max) status = 'OVER';
                              else if (min > 0 || max > 0) status = 'OK';
                            }
                          }
                          const isToday = date.day === new Date().getDate();
                          return (
                            <React.Fragment key={`${date.id}_data`}>
                              <td className={`px-2 py-1.5 whitespace-nowrap text-center text-xs border-l border-gray-100 ${isToday ? 'bg-blue-50 font-bold text-blue-700' : 'text-gray-600'}`}>
                                {stockVal}
                              </td>
                              <td className={`px-2 py-1.5 whitespace-nowrap text-center text-xs border-l border-gray-100 ${isToday ? 'bg-blue-50' : 'text-gray-600'}`}>
                                <span className={`font-bold ${status === 'UNDER' ? 'text-red-600' : status === 'OVER' ? 'text-orange-600' : status === 'OK' ? 'text-green-600' : ''}`}>
                                  {status}
                                </span>
                              </td>
                            </React.Fragment>
                          );
                        })}
                        {columnsAfter.map(col => {
                          const val = row[col.id];
                          const lowerId = col.id.toLowerCase();
                          const isCode = lowerId.includes('kode') || lowerId.includes('id') || lowerId.includes('customer') || lowerId.includes('spec') || lowerId.includes('dimensi') || lowerId.includes('jenis') || lowerId.includes('class') || lowerId.includes('work_center');
                          let displayVal = val === null || val === undefined || val === '' ? '-' : val;
                          let isNumeric = false;
                          if (!isCode && val !== null && val !== undefined && val !== '') {
                            if (typeof val === 'number') {
                              displayVal = Math.round(val).toLocaleString('en-US');
                              isNumeric = true;
                            } else if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
                              if (lowerId.includes('min') || lowerId.includes('max') || lowerId.includes('stock') || lowerId.includes('stok') || lowerId.includes('qty') || lowerId.includes('balance') || lowerId.includes('d1') || lowerId.includes('d2') || lowerId.includes('dia') || lowerId.includes('thick') || lowerId.includes('length')) {
                                displayVal = Math.round(Number(val)).toLocaleString('en-US');
                                isNumeric = true;
                              }
                            }
                          }
                          return (
                            <td key={col.id} className={`px-2 py-1.5 whitespace-nowrap text-gray-600 text-xs ${isNumeric ? 'text-right' : 'text-left'}`}>
                              {displayVal}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={columns.length + (dateColumns.length * 2) + 1} className="px-4 py-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <p className="text-gray-500 font-medium text-sm">
                            {data.length === 0 ? (
                              <>
                                No data available in Min Max Stock master table.
                                <br />
                                <Link to="/master-data" className="text-indigo-600 hover:underline mt-2 inline-block">
                                  Go to Master Data to upload limits
                                </Link>
                              </>
                            ) : 'No data matches your current filters.'}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="p-3 border-t bg-gray-50 text-[10px] text-gray-500 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <span>Menampilkan {paginatedData.length} dari {filteredAndSortedData.length} baris</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">Baris per halaman:</span>
                  <select 
                    value={pageSize} 
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                    className="bg-transparent border-none focus:ring-0 cursor-pointer"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
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
          </div>
        </>
      )}
    </div>
  );
}
