import { useEffect, useState, useMemo } from 'react';
import { fetchAllRows } from '../lib/supabase';
import { RefreshCw, BarChart2, Table as TableIcon, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import { useViewMode } from '../contexts/ViewModeContext';

export default function NcStock() {
  const [data, setData] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { viewMode } = useViewMode();

  const materialMap = useMemo(() => {
    const map = new Map();
    materials.forEach(m => {
      const info = { 
        dimensi: m.dimensi, 
        berat_per_pcs: m.berat_per_pcs, 
        kode_st: m.kode_st,
        konversi: parseFloat(m.konversi_lt_ke_st) || 0
      };
      if (m.kode_st) map.set(m.kode_st, info);
      if (m.kode_lt) map.set(m.kode_lt, info);
    });
    return map;
  }, [materials]);

  const processedData = useMemo(() => {
    const dateSet = new Set<string>();
    const materialGroups = new Map<string, any>();

    data.filter(item => item.grade === 'C' || item.grade === 'E').forEach(item => {
      const dateObj = new Date(item.created_at);
      const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      dateSet.add(dateKey);
      
      const materialInfo = materialMap.get(item.kode_material);
      const beratPerPcs = parseFloat(materialInfo?.berat_per_pcs) || 0;
      const konversi = materialInfo?.konversi || 0;
      const dimensi = item.dimensi || materialInfo?.dimensi || '-';
      
      const wip_lt_kg = item.wip_lt_kg || 0;
      const wip_st_kg = item.wip_st_kg || 0;
      const fg_lt_kg = item.fg_lt_kg || 0;
      const fg_st_kg = item.fg_st_kg || 0;
      
      const total_kg = wip_st_kg + fg_st_kg + wip_lt_kg + fg_lt_kg;
      
      if (!materialGroups.has(item.kode_material)) {
        materialGroups.set(item.kode_material, {
          kode_material: item.kode_material,
          dimensi: dimensi,
          totalsByDate: {}
        });
      }

      const group = materialGroups.get(item.kode_material);
      group.totalsByDate[dateKey] = (group.totalsByDate[dateKey] || 0) + total_kg;
    });
    
    const sortedDates = Array.from(dateSet).sort();
    const formattedDates = sortedDates.map(key => {
      const d = new Date(key);
      return {
        key,
        label: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
      };
    });

    const rows = Array.from(materialGroups.values()).sort((a, b) => a.kode_material.localeCompare(b.kode_material));

    const grandTotals: Record<string, number> = {};
    sortedDates.forEach(date => {
      grandTotals[date] = rows.reduce((sum, row) => sum + (row.totalsByDate[date] || 0), 0);
    });

    return { dates: formattedDates, rows, grandTotals };
  }, [data, materialMap]);

  const chartData = useMemo(() => {
    const dateMap = new Map<string, any>();

    data.filter(item => item.grade === 'C' || item.grade === 'E').forEach(item => {
      const dateObj = new Date(item.created_at);
      const dateKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      
      const materialInfo = materialMap.get(item.kode_material);
      const beratPerPcs = parseFloat(materialInfo?.berat_per_pcs) || 0;
      const konversi = materialInfo?.konversi || 0;
      
      const wip_lt_kg = item.wip_lt_kg || 0;
      const wip_st_kg = item.wip_st_kg || 0;
      const fg_lt_kg = item.fg_lt_kg || 0;
      const fg_st_kg = item.fg_st_kg || 0;

      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, {
          date: dateKey,
          label: dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
          'WIP LT': 0,
          'WIP ST': 0,
          'FG LT': 0,
          'FG ST': 0
        });
      }

      const entry = dateMap.get(dateKey)!;
      entry['WIP LT'] += wip_lt_kg;
      entry['WIP ST'] += wip_st_kg;
      entry['FG LT'] += fg_lt_kg;
      entry['FG ST'] += fg_st_kg;
    });

    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, materialMap]);

  const summaryChartsData = useMemo(() => {
    if (data.length === 0) return null;

    // Find the latest date in stocks
    let latestDate: Date | null = null;
    data.forEach(s => {
      if (s.created_at) {
        const d = new Date(s.created_at);
        if (!latestDate || d > latestDate) latestDate = d;
      }
    });

    if (!latestDate) return null;

    const targetDay = latestDate.getDate();
    const targetMonth = latestDate.getMonth();
    const targetYear = latestDate.getFullYear();

    let totalWeightKg = 0;
    let totalItems = 0;
    const typeMap = new Map<string, number>();
    const locationMap = new Map<string, number>();
    const statusMap = {
      'WIP ST': 0,
      'WIP LT': 0,
      'FG ST': 0,
      'FG LT': 0
    };

    data.filter(item => item.grade === 'C' || item.grade === 'E').forEach(s => {
      if (!s.created_at) return;
      const d = new Date(s.created_at);
      if (d.getDate() === targetDay && 
          d.getMonth() === targetMonth && 
          d.getFullYear() === targetYear) {
        
        const info = materialMap.get(s.kode_material);
        const beratPerPcs = info?.berat_per_pcs || 0;
        const konversi = info?.konversi || 0;

        const wip_st_kg = s.wip_st_kg || 0;
        const wip_lt_kg = s.wip_lt_kg || 0;
        const fg_st_kg = s.fg_st_kg || 0;
        const fg_lt_kg = s.fg_lt_kg || 0;

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
  }, [data, materialMap]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [stocks, materials] = await Promise.all([
          fetchAllRows('stocks', 'kode_material,wip_lt_pcs,wip_st_pcs,fg_lt_pcs,fg_st_pcs,wip_st_kg,wip_lt_kg,fg_st_kg,fg_lt_kg,grade,created_at,jenis_stock,lokasi_gudang,dimensi').catch(() => []),
          fetchAllRows('material_master', 'kode_st,kode_lt,berat_per_pcs,dimensi,konversi_lt_ke_st').catch(() => [])
        ]);
        setData(stocks);
        setMaterials(materials);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 h-full flex flex-col">
      <div className="flex justify-end items-center mb-4">
        <div className="flex items-center gap-2">
          {viewMode === 'report' && (
            <button
              onClick={() => {}}
              className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0">
        {viewMode === 'chart' ? (
          <div className="p-3 flex-1 min-h-0 overflow-y-auto">
            {summaryChartsData && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                {/* Card 1: Berdasarkan Jenis Stock */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center">
                  <h3 className="text-sm font-bold text-[#2D3748] mb-3">Berdasarkan Jenis Stock</h3>
                  <div className="w-full h-[150px] mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={summaryChartsData.byType} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                          {summaryChartsData.byType.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-medium">Total Weight</span>
                      <span className="text-[#2D3748] font-bold">{Math.round(summaryChartsData.totalWeightTon).toLocaleString()} Ton</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {summaryChartsData.byType.map((item, i) => (
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
                      <BarChart data={summaryChartsData.byLocation} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                          {summaryChartsData.byLocation.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full space-y-4">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-medium">Total Weight</span>
                      <span className="text-[#2D3748] font-bold">{Math.round(summaryChartsData.totalWeightTon).toLocaleString()} Ton</span>
                    </div>
                    <div className="grid grid-flow-col grid-rows-3 gap-x-4 gap-y-1 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-gray-200">
                      {summaryChartsData.byLocation.map((item, i) => (
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
                      <BarChart data={summaryChartsData.byStatus} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
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
                          {summaryChartsData.byStatus.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="w-full space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-medium">Total Weight</span>
                      <span className="text-[#2D3748] font-bold">{Math.round(summaryChartsData.totalWeightKg).toLocaleString()} Kg</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-medium">Total Items</span>
                      <span className="text-[#2D3748] font-bold">{summaryChartsData.totalItems.toLocaleString()} Items</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 pt-1">
                      {summaryChartsData.byStatus.map((item, i) => (
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

            <div className="h-[250px]">
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
                    <Line type="monotone" dataKey="WIP LT" stroke="#0d9488" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="WIP ST" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="FG LT" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="FG ST" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Tidak ada data NC Stock untuk ditampilkan grafiknya.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="min-w-full divide-y divide-gray-200 relative">
              <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50">NO</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50">Kode Material</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50 border-r border-gray-200">Dimensi</th>
                  {processedData.dates.map(d => (
                    <th key={d.key} className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50">
                      {d.label} (Kg)
                    </th>
                  ))}
                  {processedData.dates.length === 0 && (
                    <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider bg-gray-50">
                      Tanggal
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedData.rows.length > 0 ? (
                  processedData.rows.map((row, idx) => (
                    <tr key={row.kode_material} className="hover:bg-gray-50">
                      <td className="px-4 py-2 whitespace-nowrap text-[11px] text-gray-900">{idx + 1}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-[11px] text-gray-900 font-medium">{row.kode_material}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-[11px] text-gray-500 border-r border-gray-200">{row.dimensi}</td>
                      {processedData.dates.map(d => {
                        const val = row.totalsByDate[d.key] || 0;
                        return (
                          <td key={d.key} className="px-4 py-2 whitespace-nowrap text-[11px] text-gray-900 text-right">
                            {val > 0 ? val.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '-'}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3 + processedData.dates.length} className="px-4 py-8 text-center text-gray-500 text-sm">
                      Tidak ada data NC Stock (Grade C atau E)
                    </td>
                  </tr>
                )}
              </tbody>
              {processedData.rows.length > 0 && (
                <tfoot className="bg-gray-50 font-bold sticky bottom-0 z-10 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 whitespace-nowrap text-[11px] text-gray-900 text-right uppercase bg-gray-50 border-r border-gray-200">
                      Grand Total (Kg)
                    </td>
                    {processedData.dates.map(d => (
                      <td key={d.key} className="px-4 py-3 whitespace-nowrap text-[11px] text-gray-900 text-right bg-gray-50">
                        {processedData.grandTotals[d.key].toLocaleString('id-ID', { maximumFractionDigits: 0 })}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
