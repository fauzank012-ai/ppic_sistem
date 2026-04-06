import React, { useState, useMemo } from 'react';
import { ArrowLeft, Calendar } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ComposedChart,
  Bar, 
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer
} from 'recharts';

const calculateCapacityScenarios = (startDate: Date, endDate: Date, shift: number, workingDaysPerWeek: number) => {
  let normalHours = 0;
  let longHours = 0;
  let otWeekendHours = 0;
  
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    const dayOfWeek = current.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
    
    // Normal Shift
    let dayNormal = 0;
    if (workingDaysPerWeek === 5) {
      if (dayOfWeek >= 1 && dayOfWeek <= 5) dayNormal = 8 * shift;
    } else if (workingDaysPerWeek === 6) {
      if (dayOfWeek >= 1 && dayOfWeek <= 5) dayNormal = 8 * shift;
      else if (dayOfWeek === 6) dayNormal = 5 * shift;
    } else if (workingDaysPerWeek >= 7) {
      dayNormal = 8 * shift;
    }
    normalHours += dayNormal;

    // Long Shift
    let dayLong = dayNormal;
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      dayLong += 3.5 * shift;
    } else if (dayOfWeek === 6) {
      if (shift >= 1) dayLong += 3;
      if (shift >= 2) dayLong += 6;
    }
    longHours += dayLong;

    // Long Shift + OT Weekend
    let dayOT = dayLong;
    if (dayOfWeek === 0) {
      dayOT += 7;
    }
    otWeekendHours += dayOT;
    
    current.setDate(current.getDate() + 1);
  }
  
  return { normal: normalHours, long: longHours, otWeekend: otWeekendHours };
};

export default function BottleneckMachine() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<'Tubing' | 'Haven' | 'Others'>('Tubing');

  const selectedPeriod = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const handlePeriodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchParams({ periode: e.target.value });
  };

  const { data: reportData = [], isLoading: reportLoading } = useQuery({
    queryKey: ['report_view_mat_current', selectedPeriod],
    queryFn: () => fetchAllRows('report_view_mat', 'status_order,work_center_lt,work_center_st,sisa_order_kg,loo_kg,forecast_kg,sisa_order_pcs,loo_pcs,forecast_pcs,kg_per_jam_mill,pcs_per_jam_cut'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: mesinData = [], isLoading: mesinLoading } = useQuery({
    queryKey: ['master_data_mesin'],
    queryFn: () => fetchAllRows('master_data_mesin', 'work_center,jumlah_shift,hari_kerja_per_minggu,efisiensi,kategori'),
    staleTime: 10 * 60 * 1000,
  });

  const loading = reportLoading || mesinLoading;

  const aggregatedData = useMemo(() => {
    if (loading) return [];

    const today = new Date();
    const [year, month] = selectedPeriod.split('-');
    
    // Determine start and end date based on selected period
    let startOfMonth, endOfMonth;
    const isCurrentMonth = today.getFullYear() === parseInt(year, 10) && today.getMonth() === parseInt(month, 10) - 1;
    
    if (isCurrentMonth) {
      startOfMonth = today;
      endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else {
      startOfMonth = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
      endOfMonth = new Date(parseInt(year, 10), parseInt(month, 10), 0);
    }

    const mesinMap = new Map<string, any>();
    mesinData.forEach((m: any) => {
      if (m.work_center) {
        const key = m.work_center.trim().toUpperCase();
        mesinMap.set(key, { ...m, key });
      }
    });

    // Group loading by machine and process type
    const machineStats = new Map<string, { 
      lt: { loading: number, rates: number[] }, 
      st: { loading: number, rates: number[] } 
    }>();

    reportData.forEach((row: any) => {
      // LT Process
      if (row.work_center_lt) {
        const key = row.work_center_lt.trim().toUpperCase();
        if (!machineStats.has(key)) machineStats.set(key, { lt: { loading: 0, rates: [] }, st: { loading: 0, rates: [] } });
        const stats = machineStats.get(key)!;
        stats.lt.loading += (Number(row.loo_kg) || 0) + Math.max(Number(row.forecast_kg) || 0, Number(row.sisa_order_kg) || 0);
        const rate = Number(row.kg_per_jam_mill) || 0;
        if (rate > 0) stats.lt.rates.push(rate);
      }

      // ST Process
      if (row.work_center_st) {
        const key = row.work_center_st.trim().toUpperCase();
        if (!machineStats.has(key)) machineStats.set(key, { lt: { loading: 0, rates: [] }, st: { loading: 0, rates: [] } });
        const stats = machineStats.get(key)!;
        stats.st.loading += (Number(row.loo_pcs) || 0) + Math.max(Number(row.forecast_pcs) || 0, Number(row.sisa_order_pcs) || 0);
        const rate = Number(row.pcs_per_jam_cut) || 0;
        if (rate > 0) stats.st.rates.push(rate);
      }
    });

    const results: any[] = [];

    mesinMap.forEach((mesin, wcKey) => {
      const kategori = (mesin.kategori || '').trim().toUpperCase();
      let matches = false;
      if (activeCategory === 'Tubing') matches = kategori === 'TUBING';
      else if (activeCategory === 'Haven') matches = kategori === 'HAVEN';
      else matches = kategori !== 'TUBING' && kategori !== 'HAVEN';

      if (!matches) return;

      const stats = machineStats.get(wcKey);
      if (!stats) return;

      const efisiensi = Number(mesin.efisiensi) || 1.0;
      const capacityHours = calculateCapacityScenarios(startOfMonth, endOfMonth, mesin.jumlah_shift || 0, mesin.hari_kerja_per_minggu || 0).normal;

      // Calculate LT metrics
      const avgRateLT = stats.lt.rates.length > 0 ? stats.lt.rates.reduce((a, b) => a + b, 0) / stats.lt.rates.length : 0;
      const capacityLT = capacityHours * avgRateLT * efisiensi;
      const percentLT = capacityLT > 0 ? (stats.lt.loading / capacityLT) * 100 : 0;

      // Calculate ST metrics
      const avgRateST = stats.st.rates.length > 0 ? stats.st.rates.reduce((a, b) => a + b, 0) / stats.st.rates.length : 0;
      const capacityST = capacityHours * avgRateST * efisiensi;
      const percentST = capacityST > 0 ? (stats.st.loading / capacityST) * 100 : 0;

      // If either is bottleneck, add to results
      if (percentLT > 100 || percentST > 100) {
        const useLT = percentLT >= percentST;
        
        results.push({
          work_center: wcKey,
          loadingVal: useLT ? stats.lt.loading : stats.st.loading,
          capacity_normal_unit: useLT ? capacityLT : capacityST,
          loadingPercent: useLT ? percentLT : percentST,
          unit: useLT ? 'Kg' : 'Pcs'
        });
      }
    });

    return results.sort((a, b) => b.loadingPercent - a.loadingPercent);
  }, [reportData, activeCategory, mesinData, selectedPeriod, loading]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/planning')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Bottleneck Machine</h1>
        </div>
        <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-200">
          <Calendar className="w-5 h-5 text-gray-500" />
          <input 
            type="month" 
            value={selectedPeriod}
            onChange={handlePeriodChange}
            className="border-none focus:ring-0 text-sm font-medium text-gray-700 bg-transparent"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-center">
            <div className="flex bg-gray-100 p-1 rounded-full shadow-inner">
              {(['Tubing', 'Haven', 'Others'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-8 py-2 rounded-full text-sm font-bold transition-all duration-200 ${
                    activeCategory === cat
                      ? 'bg-[#00C853] text-white shadow-md'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-8 flex-1 overflow-auto">
          {loading ? (
            <div className="h-64 flex items-center justify-center">Loading...</div>
          ) : aggregatedData.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-gray-500">
              Tidak ada mesin bottleneck (&gt; 100% Loading)
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <ComposedChart data={aggregatedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="work_center" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" />
                <Tooltip 
                  formatter={(value: number, name: string, props: any) => {
                    if (name === '% Loading Normal') return [`${(value ?? 0).toFixed(2)}%`, name];
                    const unit = props.payload.unit || '';
                    return [`${value.toLocaleString('id-ID', { maximumFractionDigits: 0 })} ${unit}`, name];
                  }}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="loadingVal" name="Total Loading" fill="#F59E0B" />
                <Bar yAxisId="left" dataKey="capacity_normal_unit" name="Capacity Normal" fill="#10B981" />
                <Line yAxisId="right" type="monotone" dataKey="loadingPercent" name="% Loading Normal" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
