import { useEffect, useState, useMemo } from 'react';
import { BarChart2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
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

export default function LoadingVsCapacity({ userRole }: { userRole?: string | null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = (searchParams.get('type') || 'tubing').toLowerCase();
  const calcMode = (searchParams.get('calcMode') || 'current') as 'monthly' | 'current';
  const [data, setData] = useState<any[]>([]);
  const [mesinData, setMesinData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const selectedPeriod = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  
  const { refreshKey } = useRefresh();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const [year, month] = selectedPeriod.split('-');
        const formattedPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;
        
        const [result, mesinResult] = await Promise.all([
          fetchAllRows('report_view_mat', 'periode,status_order,work_center_lt,work_center_st,order_kg,sisa_order_kg,loo_kg,forecast_kg,order_pcs,sisa_order_pcs,loo_pcs,forecast_pcs,kg_per_jam_mill,pcs_per_jam_cut', (q) => q.eq('periode', formattedPeriode)),
          fetchAllRows('master_data_mesin', 'work_center,kategori,jumlah_shift,hari_kerja_per_minggu,efisiensi')
        ]);

        setData(result || []);
        setMesinData(mesinResult || []);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [refreshKey, selectedPeriod]);

  const aggregatedData = useMemo(() => {
    const today = new Date();
    const [selectedYear, selectedMonth] = selectedPeriod.split('-').map(Number);
    
    const isCurrentMonth = today.getFullYear() === selectedYear && today.getMonth() + 1 === selectedMonth;
    const isPastMonth = selectedYear < today.getFullYear() || (selectedYear === today.getFullYear() && selectedMonth < today.getMonth() + 1);
    
    let currentDay = today.getDate();
    if (!isCurrentMonth) {
      currentDay = isPastMonth ? 31 : 1;
    }

    const startOfMonth = new Date(selectedYear, selectedMonth - 1, 1);
    const endOfMonth = new Date(selectedYear, selectedMonth, 0);

    const calcStartDate = calcMode === 'monthly' ? startOfMonth : (isCurrentMonth ? today : startOfMonth);
    const calcEndDate = endOfMonth;

    const mesinMap = new Map<string, any>();
    mesinData.forEach(mesin => {
      if (mesin.work_center) {
        const key = mesin.work_center.trim().toUpperCase();
        mesinMap.set(key, { ...mesin, key });
      }
    });

    // Group loading by machine and process type
    const machineStats = new Map<string, { 
      lt: { order: number, sisa: number, loo: number, forecast: number, loading: number, rates: number[] }, 
      st: { order: number, sisa: number, loo: number, forecast: number, loading: number, rates: number[] } 
    }>();

    data.forEach((row) => {
      // LT Process
      if (row.work_center_lt) {
        const key = row.work_center_lt.trim().toUpperCase();
        if (!machineStats.has(key)) machineStats.set(key, { 
          lt: { order: 0, sisa: 0, loo: 0, forecast: 0, loading: 0, rates: [] }, 
          st: { order: 0, sisa: 0, loo: 0, forecast: 0, loading: 0, rates: [] } 
        });
        const stats = machineStats.get(key)!;
        const order = Number(row.order_kg) || 0;
        const sisa = Number(row.sisa_order_kg) || 0;
        const loo = Number(row.loo_kg) || 0;
        const forecast = Number(row.forecast_kg) || 0;
        
        stats.lt.order += order;
        stats.lt.sisa += sisa;
        stats.lt.loo += loo;
        stats.lt.forecast += forecast;
        
        let loading = 0;
        if (calcMode === 'monthly') {
          loading = loo + Math.max(forecast, sisa);
        } else {
          loading = currentDay <= 15 ? (loo + Math.max(forecast, sisa)) : (loo + sisa);
        }
        stats.lt.loading += loading;
        
        const rate = Number(row.kg_per_jam_mill) || 0;
        if (rate > 0) stats.lt.rates.push(rate);
      }

      // ST Process
      if (row.work_center_st) {
        const key = row.work_center_st.trim().toUpperCase();
        if (!machineStats.has(key)) machineStats.set(key, { 
          lt: { order: 0, sisa: 0, loo: 0, forecast: 0, loading: 0, rates: [] }, 
          st: { order: 0, sisa: 0, loo: 0, forecast: 0, loading: 0, rates: [] } 
        });
        const stats = machineStats.get(key)!;
        const order = Number(row.order_pcs) || 0;
        const sisa = Number(row.sisa_order_pcs) || 0;
        const loo = Number(row.loo_pcs) || 0;
        const forecast = Number(row.forecast_pcs) || 0;
        
        stats.st.order += order;
        stats.st.sisa += sisa;
        stats.st.loo += loo;
        stats.st.forecast += forecast;
        
        let loading = 0;
        if (calcMode === 'monthly') {
          loading = loo + Math.max(forecast, sisa);
        } else {
          loading = currentDay <= 15 ? (loo + Math.max(forecast, sisa)) : (loo + sisa);
        }
        stats.st.loading += loading;
        
        const rate = Number(row.pcs_per_jam_cut) || 0;
        if (rate > 0) stats.st.rates.push(rate);
      }
    });

    const results: any[] = [];

    mesinMap.forEach((mesin, wcKey) => {
      const kategori = (mesin.kategori || '').trim().toUpperCase();
      let matches = false;
      if (activeCategory === 'tubing') matches = kategori === 'TUBING';
      else if (activeCategory === 'haven') matches = kategori === 'HAVEN';
      else matches = kategori !== 'TUBING' && kategori !== 'HAVEN';

      if (!matches) return;

      const stats = machineStats.get(wcKey);
      if (!stats) return;

      const efisiensi = Number(mesin.efisiensi) || 1.0;
      const capacityScenarios = calculateCapacityScenarios(calcStartDate, calcEndDate, mesin.jumlah_shift || 0, mesin.hari_kerja_per_minggu || 0);

      // Decide whether to show LT or ST for this machine
      // Prefer LT for Tubing, ST for Haven
      const hasLT = stats.lt.rates.length > 0 || stats.lt.loading > 0;
      const hasST = stats.st.rates.length > 0 || stats.st.loading > 0;
      
      let useLT = true;
      if (activeCategory === 'haven') useLT = false;
      else if (activeCategory === 'tubing') useLT = true;
      else useLT = hasLT; // For Others, prefer LT if available

      if (!hasLT && !hasST) return;
      if (useLT && !hasLT) useLT = false;
      if (!useLT && !hasST) useLT = true;

      const s = useLT ? stats.lt : stats.st;
      const avgRate = s.rates.length > 0 ? s.rates.reduce((a, b) => a + b, 0) / s.rates.length : 0;

      results.push({
        work_center: wcKey,
        kategori: mesin.kategori || '-',
        forecast: s.forecast,
        qty_order: s.order,
        sisa_order: s.sisa,
        loo: s.loo,
        total_loading: s.loading,
        capacity_normal_unit: capacityScenarios.normal * avgRate * efisiensi,
        capacity_long_unit: capacityScenarios.long * avgRate * efisiensi,
        capacity_ot_unit: capacityScenarios.otWeekend * avgRate * efisiensi,
        unit: useLT ? 'Kg' : 'Pcs'
      });
    });

    return results.sort((a, b) => a.work_center.localeCompare(b.work_center));
  }, [data, activeCategory, mesinData, calcMode]);

  const totals = useMemo(() => {
    return aggregatedData.reduce(
      (acc, row) => {
        acc.forecast += row.forecast;
        acc.qty_order += row.qty_order;
        acc.sisa_order += row.sisa_order;
        acc.loo += row.loo;
        acc.total_loading += row.total_loading;
        acc.capacity_normal_unit += row.capacity_normal_unit;
        acc.capacity_long_unit += row.capacity_long_unit;
        acc.capacity_ot_unit += row.capacity_ot_unit;
        return acc;
      },
      { 
        forecast: 0, qty_order: 0, sisa_order: 0, loo: 0, total_loading: 0,
        capacity_normal_unit: 0, capacity_long_unit: 0, capacity_ot_unit: 0
      }
    );
  }, [aggregatedData]);

  const formatNumber = (num: number, isPercent: boolean = false) => {
    return num.toLocaleString('id-ID', { 
      minimumFractionDigits: isPercent ? 2 : 0, 
      maximumFractionDigits: isPercent ? 2 : 0 
    });
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#FDFBF7]">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-[#0A5C36] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600 font-medium">Loading Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#FDFBF7] overflow-hidden">
      <div className="p-6 flex-1 overflow-hidden flex flex-col pt-0">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-auto p-4">
            {/* Chart Section */}
            <div className="h-80 w-full mb-8 bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-[#0A5C36]" />
                Loading vs Capacity Visualization ({aggregatedData[0]?.unit || ''})
              </h3>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={aggregatedData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis 
                    dataKey="work_center" 
                    interval={0}
                    tick={{ fontSize: 10, fill: '#666' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#666' }}
                    tickFormatter={(value) => formatNumber(value)}
                  />
                  <Tooltip 
                    contentStyle={{ fontSize: '12px', borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: number) => [formatNumber(value), '']}
                  />
                  <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                  <Bar 
                    name="Total Loading" 
                    dataKey="total_loading" 
                    fill="#0A5C36" 
                    radius={[4, 4, 0, 0]} 
                  />
                  <Line 
                    type="monotone"
                    name="Capacity Normal" 
                    dataKey="capacity_normal_unit" 
                    stroke="#38bdf8" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line 
                    type="monotone"
                    name="Capacity Long" 
                    dataKey="capacity_long_unit" 
                    stroke="#fbbf24" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                  <Line 
                    type="monotone"
                    name="Capacity Long + OT" 
                    dataKey="capacity_ot_unit" 
                    stroke="#f472b6" 
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <table className="w-full text-[11px] text-left border-collapse border border-gray-200">
              <thead className="text-[11px] text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-200 text-center">No</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-200 text-center">Work Center</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-200 text-center">Forecast ({aggregatedData[0]?.unit || ''})</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-200 text-center">Order ({aggregatedData[0]?.unit || ''})</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-200 text-center">Sisa Order ({aggregatedData[0]?.unit || ''})</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-200 text-center">LOO ({aggregatedData[0]?.unit || ''})</th>
                  <th rowSpan={2} className="px-2 py-2 border border-gray-200 text-center">Total Loading ({aggregatedData[0]?.unit || ''})</th>
                  <th colSpan={6} className="px-2 py-2 border border-gray-200 text-center">CAPACITY ({aggregatedData[0]?.unit || ''})</th>
                </tr>
                <tr>
                  <th className="px-2 py-2 border border-gray-200 text-center">Normal Shift</th>
                  <th className="px-2 py-2 border border-gray-200 text-center">%</th>
                  <th className="px-2 py-2 border border-gray-200 text-center">Long Shift</th>
                  <th className="px-2 py-2 border border-gray-200 text-center">%</th>
                  <th className="px-2 py-2 border border-gray-200 text-center">Long Shift + OT</th>
                  <th className="px-2 py-2 border border-gray-200 text-center">%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {aggregatedData.length > 0 ? (
                  aggregatedData.map((row, index) => {
                    const loadingVal = row.total_loading;
                    const pNormal = row.capacity_normal_unit > 0 ? (loadingVal / row.capacity_normal_unit) * 100 : 0;
                    const pLong = row.capacity_long_unit > 0 ? (loadingVal / row.capacity_long_unit) * 100 : 0;
                    const pOT = row.capacity_ot_unit > 0 ? (loadingVal / row.capacity_ot_unit) * 100 : 0;
                    
                    return (
                      <tr key={row.work_center} className="bg-white hover:bg-gray-50 transition-colors">
                        <td className="px-2 py-1.5 border border-gray-200 text-center">{index + 1}</td>
                        <td className="px-2 py-1.5 border border-gray-200 font-medium text-gray-900">{row.work_center}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-right">{formatNumber(row.forecast)}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-right">{formatNumber(row.qty_order)}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-right">{formatNumber(row.sisa_order)}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-right">{formatNumber(row.loo)}</td>
                        <td className="px-2 py-1.5 border border-gray-200 text-right font-semibold text-[#0A5C36]">{formatNumber(loadingVal)}</td>
                        
                        <td className="px-2 py-1.5 border border-gray-200 text-right text-gray-600">{formatNumber(row.capacity_normal_unit)}</td>
                        <td className={`px-2 py-1.5 border border-gray-200 text-right font-bold ${pNormal > 100 ? 'text-red-600' : 'text-blue-600'}`}>
                          {formatNumber(pNormal, true)}%
                        </td>
                        
                        <td className="px-2 py-1.5 border border-gray-200 text-right text-gray-600">{formatNumber(row.capacity_long_unit)}</td>
                        <td className={`px-2 py-1.5 border border-gray-200 text-right font-bold ${pLong > 100 ? 'text-red-600' : 'text-blue-600'}`}>
                          {formatNumber(pLong, true)}%
                        </td>
                        
                        <td className="px-2 py-1.5 border border-gray-200 text-right text-gray-600">{formatNumber(row.capacity_ot_unit)}</td>
                        <td className={`px-2 py-1.5 border border-gray-200 text-right font-bold ${pOT > 100 ? 'text-red-600' : 'text-blue-600'}`}>
                          {formatNumber(pOT, true)}%
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-gray-500">
                      Tidak ada data untuk kategori {activeCategory}
                    </td>
                  </tr>
                )}
              </tbody>
              {aggregatedData.length > 0 && (
                <tfoot className="bg-gray-50 font-bold sticky bottom-0 shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
                  <tr>
                    <td colSpan={2} className="px-2 py-2 border border-gray-200 text-right">TOTAL</td>
                    <td className="px-2 py-2 border border-gray-200 text-right">{formatNumber(totals.forecast)}</td>
                    <td className="px-2 py-2 border border-gray-200 text-right">{formatNumber(totals.qty_order)}</td>
                    <td className="px-2 py-2 border border-gray-200 text-right">{formatNumber(totals.sisa_order)}</td>
                    <td className="px-2 py-2 border border-gray-200 text-right">{formatNumber(totals.loo)}</td>
                    <td className="px-2 py-2 border border-gray-200 text-right text-[#0A5C36]">{formatNumber(totals.total_loading)}</td>
                    
                    <td className="px-2 py-2 border border-gray-200 text-right text-gray-700">{formatNumber(totals.capacity_normal_unit)}</td>
                    {(() => {
                      const totalLoadingVal = totals.total_loading;
                      const p = totals.capacity_normal_unit > 0 ? (totalLoadingVal / totals.capacity_normal_unit) * 100 : 0;
                      return <td className={`px-2 py-2 border border-gray-200 text-right ${p > 100 ? 'text-red-600' : 'text-blue-600'}`}>{formatNumber(p, true)}%</td>;
                    })()}
                    
                    <td className="px-2 py-2 border border-gray-200 text-right text-gray-700">{formatNumber(totals.capacity_long_unit)}</td>
                    {(() => {
                      const totalLoadingVal = totals.total_loading;
                      const p = totals.capacity_long_unit > 0 ? (totalLoadingVal / totals.capacity_long_unit) * 100 : 0;
                      return <td className={`px-2 py-2 border border-gray-200 text-right ${p > 100 ? 'text-red-600' : 'text-blue-600'}`}>{formatNumber(p, true)}%</td>;
                    })()}
                    
                    <td className="px-2 py-2 border border-gray-200 text-right text-gray-700">{formatNumber(totals.capacity_ot_unit)}</td>
                    {(() => {
                      const totalLoadingVal = totals.total_loading;
                      const p = totals.capacity_ot_unit > 0 ? (totalLoadingVal / totals.capacity_ot_unit) * 100 : 0;
                      return <td className={`px-2 py-2 border border-gray-200 text-right ${p > 100 ? 'text-red-600' : 'text-blue-600'}`}>{formatNumber(p, true)}%</td>;
                    })()}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
