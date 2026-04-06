import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { useSearchParams } from 'react-router-dom';
import { 
  ComposedChart, 
  Line, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine,
  LabelList
} from 'recharts';
import { Calendar, Loader2, X } from 'lucide-react';

export default function PlanVsActualProd() {
  const { refreshKey } = useRefresh();
  const [searchParams] = useSearchParams();
  
  const currentType = (searchParams.get('type') || 'tubing') as 'tubing' | 'haven' | 'others';
  const periodeParam = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalViewMode, setModalViewMode] = useState<'kg' | 'percent'>('kg');

  const { targetPeriode, selectedMonth, selectedYear } = useMemo(() => {
    const [year, month] = periodeParam.split('-').map(Number);
    const monthNames = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return {
      targetPeriode: `${monthNames[month - 1]}-${year}`,
      selectedMonth: month,
      selectedYear: year
    };
  }, [periodeParam]);

  const { data, isLoading } = useQuery({
    queryKey: ['plan-vs-actual-prod', refreshKey, periodeParam],
    queryFn: async () => {
      const [planData, actualData, machineData, materialData] = await Promise.all([
        fetchAllRows('plan_schedule', 'tanggal_produksi,qty_kg,work_center,kode_material'),
        fetchAllRows('mb51_prod', 'tanggal,gr_qty_kg,work_centre_lt', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('master_data_mesin', 'work_center,kategori'),
        fetchAllRows('material_master', 'kode_lt,work_center_lt')
      ]);
      return { 
        plan: planData || [], 
        actual: actualData || [],
        machines: machineData || [],
        materials: materialData || []
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { isMachineMatch, materialMap } = useMemo(() => {
    const map = new Map<string, string>();
    if (data?.materials) {
      data.materials.forEach((m: any) => {
        if (m.kode_lt && m.work_center_lt) {
          map.set(m.kode_lt.trim().toUpperCase(), m.work_center_lt.trim().toUpperCase());
        }
      });
    }

    const matchFn = (wc: string) => {
      if (!wc) return false;
      const machineInfo = data?.machines?.find((m: any) => (m.work_center || '').trim().toUpperCase() === wc.trim().toUpperCase());
      const kategori = (machineInfo?.kategori || '').toLowerCase();
      
      if (currentType === 'tubing') {
        return kategori.includes('tubing');
      } else if (currentType === 'haven') {
        return kategori.includes('haven');
      } else {
        return !kategori.includes('tubing') && !kategori.includes('haven');
      }
    };

    return { isMachineMatch: matchFn, materialMap: map };
  }, [data, currentType]);

  const chartData = useMemo(() => {
    if (!data || !selectedMonth || !selectedYear) return [];

    const dateMap = new Map<string, { plan: number; actual: number }>();

    // Initialize all days in the selected month
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      dateMap.set(dateStr, { plan: 0, actual: 0 });
    }

    data.plan.forEach((p: any) => {
      if (!p.tanggal_produksi) return;
      
      let wc = (p.work_center || '').trim().toUpperCase();
      if (!wc && p.kode_material) {
        wc = materialMap.get(p.kode_material.trim().toUpperCase()) || '';
      }
      
      if (!isMachineMatch(wc)) return;
      
      let dateOnly = '';
      let year = 0;
      let month = 0;
      
      if (p.tanggal_produksi.includes('T')) {
        dateOnly = p.tanggal_produksi.split('T')[0];
      } else if (p.tanggal_produksi.includes(' ')) {
        dateOnly = p.tanggal_produksi.split(' ')[0];
      } else {
        dateOnly = p.tanggal_produksi;
      }
      
      const dateParts = dateOnly.split(/[-/]/);
      if (dateParts.length === 3) {
        if (dateParts[0].length === 4) {
          year = parseInt(dateParts[0], 10);
          month = parseInt(dateParts[1], 10);
          dateOnly = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
        } else if (dateParts[2].length === 4) {
          year = parseInt(dateParts[2], 10);
          month = parseInt(dateParts[1], 10);
          dateOnly = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        }
      }
      
      if (month === selectedMonth && year === selectedYear) {
        const current = dateMap.get(dateOnly) || { plan: 0, actual: 0 };
        const qty = typeof p.qty_kg === 'string' ? parseFloat(p.qty_kg.replace(/,/g, '')) : Number(p.qty_kg);
        current.plan += isNaN(qty) ? 0 : qty;
        dateMap.set(dateOnly, current);
      }
    });

    data.actual.forEach((a: any) => {
      if (!a.tanggal) return;
      if (!isMachineMatch(a.work_centre_lt)) return;
      
      let dateOnly = '';
      let year = 0;
      let month = 0;
      
      if (a.tanggal.includes('T')) {
        dateOnly = a.tanggal.split('T')[0];
      } else if (a.tanggal.includes(' ')) {
        dateOnly = a.tanggal.split(' ')[0];
      } else {
        dateOnly = a.tanggal;
      }
      
      const dateParts = dateOnly.split(/[-/]/);
      if (dateParts.length === 3) {
        if (dateParts[0].length === 4) {
          year = parseInt(dateParts[0], 10);
          month = parseInt(dateParts[1], 10);
          dateOnly = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
        } else if (dateParts[2].length === 4) {
          year = parseInt(dateParts[2], 10);
          month = parseInt(dateParts[1], 10);
          dateOnly = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        }
      }
      
      if (month === selectedMonth && year === selectedYear) {
        const current = dateMap.get(dateOnly) || { plan: 0, actual: 0 };
        const qty = typeof a.gr_qty_kg === 'string' ? parseFloat(a.gr_qty_kg.replace(/,/g, '')) : Number(a.gr_qty_kg);
        current.actual += isNaN(qty) ? 0 : qty;
        dateMap.set(dateOnly, current);
      }
    });

    // Sort dates
    const sortedDates = Array.from(dateMap.keys()).sort();

    return sortedDates.map(dateStr => {
      const parts = dateStr.split('-');
      const formattedDate = `${parseInt(parts[2], 10)}/${parseInt(parts[1], 10)}`;
      const vals = dateMap.get(dateStr)!;
      const percentage = vals.plan > 0 ? (vals.actual / vals.plan) * 100 : 0;

      return {
        date: formattedDate,
        fullDate: dateStr,
        plan: Math.round(vals.plan),
        actual: Math.round(vals.actual),
        percentage: Math.round(percentage)
      };
    });
  }, [data, selectedMonth, selectedYear, currentType, materialMap, isMachineMatch]);

  const totals = useMemo(() => {
    if (!chartData.length) return { plan: 0, actual: 0, achievement: 0 };
    
    const totalPlan = chartData.reduce((sum, item) => sum + item.plan, 0);
    const totalActual = chartData.reduce((sum, item) => sum + item.actual, 0);
    const achievement = totalPlan > 0 ? (totalActual / totalPlan) * 100 : 0;

    return {
      plan: totalPlan,
      actual: totalActual,
      achievement
    };
  }, [chartData]);

  const modalChartData = useMemo(() => {
    if (!selectedDate || !data) return [];

    const wcMap = new Map<string, { plan: number; actual: number }>();

    data.plan.forEach((p: any) => {
      if (!p.tanggal_produksi) return;
      
      let wc = (p.work_center || '').trim().toUpperCase();
      if (!wc && p.kode_material) {
        wc = materialMap.get(p.kode_material.trim().toUpperCase()) || '';
      }
      
      if (!isMachineMatch(wc)) return;

      let dateOnly = '';
      if (p.tanggal_produksi.includes('T')) {
        dateOnly = p.tanggal_produksi.split('T')[0];
      } else if (p.tanggal_produksi.includes(' ')) {
        dateOnly = p.tanggal_produksi.split(' ')[0];
      } else {
        dateOnly = p.tanggal_produksi;
      }

      const dateParts = dateOnly.split(/[-/]/);
      if (dateParts.length === 3) {
        if (dateParts[0].length === 4) {
          dateOnly = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
        } else if (dateParts[2].length === 4) {
          dateOnly = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        }
      }

      if (dateOnly === selectedDate) {
        const current = wcMap.get(wc) || { plan: 0, actual: 0 };
        const qty = typeof p.qty_kg === 'string' ? parseFloat(p.qty_kg.replace(/,/g, '')) : Number(p.qty_kg);
        current.plan += isNaN(qty) ? 0 : qty;
        wcMap.set(wc, current);
      }
    });

    data.actual.forEach((a: any) => {
      if (!a.tanggal) return;
      const wc = (a.work_centre_lt || '').trim().toUpperCase();
      if (!isMachineMatch(wc)) return;

      let dateOnly = '';
      if (a.tanggal.includes('T')) {
        dateOnly = a.tanggal.split('T')[0];
      } else if (a.tanggal.includes(' ')) {
        dateOnly = a.tanggal.split(' ')[0];
      } else {
        dateOnly = a.tanggal;
      }

      const dateParts = dateOnly.split(/[-/]/);
      if (dateParts.length === 3) {
        if (dateParts[0].length === 4) {
          dateOnly = `${dateParts[0]}-${dateParts[1].padStart(2, '0')}-${dateParts[2].padStart(2, '0')}`;
        } else if (dateParts[2].length === 4) {
          dateOnly = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        }
      }

      if (dateOnly === selectedDate) {
        const current = wcMap.get(wc) || { plan: 0, actual: 0 };
        const qty = typeof a.gr_qty_kg === 'string' ? parseFloat(a.gr_qty_kg.replace(/,/g, '')) : Number(a.gr_qty_kg);
        current.actual += isNaN(qty) ? 0 : qty;
        wcMap.set(wc, current);
      }
    });

    const sortedWc = Array.from(wcMap.keys()).sort();
    return sortedWc.map(wc => {
      const vals = wcMap.get(wc)!;
      const percentage = vals.plan > 0 ? (vals.actual / vals.plan) * 100 : 0;
      return {
        workCenter: wc,
        plan: vals.plan,
        actual: vals.actual,
        percentage: Math.round(percentage)
      };
    });
  }, [data, selectedDate, isMachineMatch, materialMap]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID').format(num);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800 mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center space-x-2 text-sm">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-gray-600">{entry.name}:</span>
              <span className="font-medium text-gray-900">
                {entry.name.includes('%') 
                  ? `${entry.value}%`
                  : formatNumber(entry.value)}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-[#FDFBF7] min-h-screen">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Total Plan (KG)</p>
          <p className="text-3xl font-bold text-gray-900">{formatNumber(totals.plan)}</p>
        </div>
        
        <div className="bg-white rounded-xl border border-teal-500 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Total Actual (KG)</p>
          <p className="text-3xl font-bold text-teal-600">{formatNumber(totals.actual)}</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-2">Achievement Rate</p>
          <div className="flex items-baseline space-x-2">
            <p className="text-3xl font-bold text-blue-600">{totals.achievement.toFixed(1)}%</p>
            <p className="text-sm text-gray-500">target 100%</p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex items-center space-x-3 mb-6">
          <div className="p-2 bg-blue-50 rounded-lg">
            <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Daily Performance</h2>
            <p className="text-sm text-gray-500">Trend harian Plan vs Actual (Kg)</p>
          </div>
        </div>

        <div className="h-[400px] w-full mt-8">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart 
              data={chartData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis 
                dataKey="date" 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 12 }}
                dy={10}
              />
              <YAxis 
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 12 }}
                tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6B7280', fontSize: 12 }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                verticalAlign="top" 
                align="right"
                iconType="circle"
                wrapperStyle={{ paddingBottom: '20px' }}
              />
              
              <Bar 
                yAxisId="right"
                dataKey="percentage" 
                name="Percentage" 
                fill="#E5E7EB" 
                radius={[4, 4, 0, 0]}
                barSize={20}
                opacity={0.6}
                onClick={(data) => setSelectedDate(data.fullDate)}
                style={{ cursor: 'pointer' }}
              >
                <LabelList dataKey="percentage" position="top" formatter={(val: number) => `${val}%`} style={{ fontSize: '10px', fill: '#64748B' }} />
              </Bar>
              
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="actual" 
                name="Actual" 
                stroke="#10B981" 
                strokeWidth={3}
                dot={{ r: 4, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6 }}
                onClick={(data) => setSelectedDate(data.fullDate)}
                style={{ cursor: 'pointer' }}
              >
                <LabelList dataKey="actual" position="top" formatter={(val: number) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val} style={{ fontSize: '10px', fill: '#10B981', fontWeight: 'bold' }} />
              </Line>
              
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="plan" 
                name="Plan" 
                stroke="#F97316" 
                strokeWidth={3}
                dot={{ r: 4, fill: '#F97316', strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6 }}
                onClick={(data) => setSelectedDate(data.fullDate)}
                style={{ cursor: 'pointer' }}
              >
                <LabelList dataKey="plan" position="top" formatter={(val: number) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val} style={{ fontSize: '10px', fill: '#F97316', fontWeight: 'bold' }} />
              </Line>

              <ReferenceLine 
                yAxisId="right"
                y={100} 
                stroke="#EF4444" 
                strokeDasharray="3 3" 
                label={{ position: 'right', value: 'Target 100%', fill: '#EF4444', fontSize: 12 }} 
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Modal for detailed chart */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Detail Produksi per Mesin</h3>
                <p className="text-sm text-gray-500">Tanggal: {selectedDate}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setModalViewMode('kg')}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${modalViewMode === 'kg' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                  >
                    KG
                  </button>
                  <button
                    onClick={() => setModalViewMode('percent')}
                    className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${modalViewMode === 'percent' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                  >
                    %
                  </button>
                </div>
                <button 
                  onClick={() => setSelectedDate(null)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>
            
            <div className="p-6">
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={modalChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis 
                      dataKey="workCenter" 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      dy={10}
                    />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6B7280', fontSize: 12 }}
                      tickFormatter={(value) => modalViewMode === 'percent' ? `${value}%` : formatNumber(value)}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      verticalAlign="top" 
                      height={36}
                      iconType="circle"
                      wrapperStyle={{ fontSize: '12px', color: '#374151' }}
                    />
                    
                    {modalViewMode === 'kg' ? (
                      <>
                        <Bar 
                          dataKey="plan" 
                          name="Plan (Kg)" 
                          fill="#F97316" 
                          radius={[4, 4, 0, 0]} 
                          barSize={30}
                        />
                        <Bar 
                          dataKey="actual" 
                          name="Actual (Kg)" 
                          fill="#10B981" 
                          radius={[4, 4, 0, 0]} 
                          barSize={30}
                        />
                      </>
                    ) : (
                      <Bar 
                        dataKey="percentage" 
                        name="Achievement (%)" 
                        fill="#3B82F6" 
                        radius={[4, 4, 0, 0]} 
                        barSize={40}
                        label={{ position: 'top', fill: '#3B82F6', fontSize: 12, formatter: (value: number) => `${value}%` }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
