import React, { useState, useMemo } from 'react';
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
  Cell,
  ReferenceLine
} from 'recharts';
import { Activity, Loader2, X, Clock } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

interface MachineData {
  work_center: string;
  kategori: string;
  target_yield: number;
}

interface ProductionData {
  work_centre_lt: string;
  gr_qty_pcs: number;
  gi_qty_kg: number;
  kode_lt?: string;
  order_no?: string;
  customer?: string;
}

interface MaterialData {
  kode_lt?: string;
  kode_st?: string;
  alternative_kodes_lt?: string;
  alternative_kodes_st?: string;
  dimensi?: string;
}

interface DowntimeData {
  id: number;
  order_no: string;
  work_center: string;
  down_time: string;
  down_time_kategori: string;
  pic_down_time: string;
  keterangan_down_time: string;
  durasi_down_time: number;
}

interface DownGradeData {
  id: number;
  order_no: string;
  work_center: string;
  problem: string;
  keterangan: string;
  qty_dg_pcs: number;
  qty_dg_kg: number;
  qty_reject_mtr: number;
  qty_reject_kg: number;
}

interface ChartData {
  name: string;
  yield: number;
  target: number;
  achievement: number;
}

export default function ProductionYield() {
  const { refreshKey } = useRefresh();
  const [searchParams] = useSearchParams();
  const currentType = searchParams.get('type') || 'tubing';
  const periodeParam = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [year, month] = periodeParam.split('-');
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const targetPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;
  
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null);
  const [isDowntimeModalOpen, setIsDowntimeModalOpen] = useState(false);
  const [reportType, setReportType] = useState<'downtime' | 'downgrade'>('downtime');
  const [chartViewMode, setChartViewMode] = useState<'yield' | 'achievement'>('yield');

  const { data: yieldData, isLoading: loading } = useQuery({
    queryKey: ['production-yield-data', refreshKey, periodeParam],
    queryFn: async () => {
      const [machinesData, prodData, materialsData] = await Promise.all([
        fetchAllRows('master_data_mesin', 'work_center,kategori,target_yield'),
        fetchAllRows('mb51_prod', 'tanggal,work_centre_lt,order_no,customer,kode_lt,proses,gr_qty_pcs,gr_qty_kg,gi_qty_kg', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('material_master', 'kode_lt,kode_st,alternative_kodes_lt,alternative_kodes_st,dimensi')
      ]);
      return { 
        machines: machinesData || [], 
        production: prodData || [], 
        materials: materialsData || [] 
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredProduction = useMemo(() => {
    return yieldData?.production || [];
  }, [yieldData?.production]);

  const { data: downtimeData, isLoading: loadingDowntime } = useQuery({
    queryKey: ['order-downtime', selectedOrderNo, refreshKey],
    queryFn: async () => {
      if (!selectedOrderNo) return [];
      const data = await fetchAllRows('down_time', '*', (q) => q.eq('order_no', selectedOrderNo));
      return (data || []) as DowntimeData[];
    },
    enabled: !!selectedOrderNo && isDowntimeModalOpen && reportType === 'downtime',
  });

  const { data: downgradeData, isLoading: loadingDowngrade } = useQuery({
    queryKey: ['order-downgrade', selectedOrderNo, refreshKey],
    queryFn: async () => {
      if (!selectedOrderNo) return [];
      const data = await fetchAllRows('down_grade', '*', (q) => q.eq('order_no', selectedOrderNo));
      return (data || []) as DownGradeData[];
    },
    enabled: !!selectedOrderNo && isDowntimeModalOpen && reportType === 'downgrade',
  });

  const { machines = [], production = [], materials = [] } = yieldData || {};

  const processedData = useMemo(() => {
    // Group production by work center
    const prodByMachine = filteredProduction.reduce((acc, curr) => {
      const wc = (curr.work_centre_lt || '').trim().toUpperCase();
      if (!acc[wc]) {
        acc[wc] = { gr: 0, gi: 0 };
      }
      acc[wc].gr += Number(curr.gr_qty_kg) || 0;
      acc[wc].gi += Number(curr.gi_qty_kg) || 0;
      return acc;
    }, {} as Record<string, { gr: number, gi: number }>);

    // Map to chart data and categorize
    const tubing: ChartData[] = [];
    const haven: ChartData[] = [];
    const others: ChartData[] = [];

    const totals = {
      tubing: { gr: 0, gi: 0, targetSum: 0, count: 0 },
      haven: { gr: 0, gi: 0, targetSum: 0, count: 0 },
      others: { gr: 0, gi: 0, targetSum: 0, count: 0 }
    };

    machines.forEach(m => {
      const wc = m.work_center.trim().toUpperCase();
      const prod = prodByMachine[wc] || { gr: 0, gi: 0 };
      
      const yieldVal = prod.gi > 0 ? (prod.gr / prod.gi) * 100 : 0;
      const target = m.target_yield || 0;
      const achievement = target > 0 ? (yieldVal / target) * 100 : 0;

      const dataItem: ChartData = {
        name: m.work_center,
        yield: Number((yieldVal ?? 0).toFixed(2)),
        target: target,
        achievement: Number((achievement ?? 0).toFixed(2))
      };

      const kategori = (m.kategori || '').toLowerCase();
      let cat: 'tubing' | 'haven' | 'others' = 'others';
      if (kategori.includes('tubing')) {
        tubing.push(dataItem);
        cat = 'tubing';
      } else if (kategori.includes('haven')) {
        haven.push(dataItem);
        cat = 'haven';
      } else {
        others.push(dataItem);
        cat = 'others';
      }

      totals[cat].gr += prod.gr;
      totals[cat].gi += prod.gi;
      totals[cat].targetSum += target;
      totals[cat].count += 1;
    });

    const calcTotal = (catData: { gr: number, gi: number, targetSum: number, count: number }): ChartData => {
      const yieldVal = catData.gi > 0 ? (catData.gr / catData.gi) * 100 : 0;
      const target = catData.count > 0 ? catData.targetSum / catData.count : 0;
      const achievement = target > 0 ? (yieldVal / target) * 100 : 0;
      return {
        name: 'TOTAL PENCAPAIAN',
        yield: Number((yieldVal ?? 0).toFixed(2)),
        target: Number((target ?? 0).toFixed(2)),
        achievement: Number((achievement ?? 0).toFixed(2))
      };
    };

    return { 
      tubing, 
      haven, 
      others,
      totals: {
        tubing: calcTotal(totals.tubing),
        haven: calcTotal(totals.haven),
        others: calcTotal(totals.others)
      }
    };
  }, [machines, filteredProduction]);

  const handleBarClick = (data: any) => {
    if (data && data.name) {
      setSelectedMachine(data.name);
      setIsModalOpen(true);
    }
  };

  const getMachineDetails = () => {
    if (!selectedMachine) return [];
    
    const machineTarget = machines.find(m => m.work_center.trim().toUpperCase() === selectedMachine.trim().toUpperCase())?.target_yield || 0;

    const materialMap = new Map<string, string>();
    materials.forEach(m => {
      const dimensi = m.dimensi || '-';
      if (m.kode_lt) materialMap.set(m.kode_lt.trim().toUpperCase(), dimensi);
      if (m.kode_st) materialMap.set(m.kode_st.trim().toUpperCase(), dimensi);
      if (m.alternative_kodes_lt) {
        m.alternative_kodes_lt.split(',').forEach(alt => {
          materialMap.set(alt.trim().toUpperCase(), dimensi);
        });
      }
      if (m.alternative_kodes_st) {
        m.alternative_kodes_st.split(',').forEach(alt => {
          materialMap.set(alt.trim().toUpperCase(), dimensi);
        });
      }
    });

    const itemsMap = new Map<string, {
      kode_lt: string;
      order_no: string;
      customer: string;
      gr: number;
      gi: number;
    }>();

    filteredProduction.forEach(p => {
      const wc = (p.work_centre_lt || '').trim().toUpperCase();
      if (wc === selectedMachine.trim().toUpperCase()) {
        const key = p.order_no || '-';
        if (!itemsMap.has(key)) {
          itemsMap.set(key, {
            kode_lt: p.kode_lt || '-',
            order_no: p.order_no || '-',
            customer: p.customer || '-',
            gr: 0,
            gi: 0
          });
        }
        const item = itemsMap.get(key)!;
        item.gr += Number(p.gr_qty_kg) || 0;
        item.gi += Number(p.gi_qty_kg) || 0;
      }
    });

    const details = Array.from(itemsMap.values()).map(item => {
      const yieldVal = item.gi > 0 ? (item.gr / item.gi) * 100 : 0;
      const achievement = machineTarget > 0 ? (yieldVal / machineTarget) * 100 : 0;
      const dimensi = materialMap.get(item.kode_lt.toUpperCase()) || '-';
      return {
        ...item,
        dimensi,
        yield: yieldVal,
        achievement
      };
    });

    // Sort by lowest achievement
    return details.sort((a, b) => a.achievement - b.achievement);
  };

  const totalGiForOrder = useMemo(() => {
    if (!selectedOrderNo) return 0;
    return filteredProduction
      .filter(p => p.order_no === selectedOrderNo)
      .reduce((sum, p) => sum + (Number(p.gi_qty_kg) || 0), 0);
  }, [filteredProduction, selectedOrderNo]);

  const renderChart = (title: string, data: ChartData[], totalData: ChartData) => {
    const isAchievement = chartViewMode === 'achievement';
    const allValues = data.length > 0 ? data.flatMap(d => isAchievement ? [d.achievement, 100] : [d.yield, d.target]) : [75, 100];
    const nonZeroValues = allValues.filter(v => v > 0);
    const minVal = nonZeroValues.length > 0 
      ? Math.max(0, Math.floor(Math.min(...nonZeroValues) - 5))
      : 0;
    const maxVal = Math.ceil(Math.max(...allValues) + 5);

    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600" />
            {title}
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-50 rounded-full shadow-inner border border-gray-100 p-1">
              <button
                onClick={() => setChartViewMode('yield')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  chartViewMode === 'yield'
                    ? 'bg-white text-emerald-600 shadow-sm border border-gray-200'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                Target & Actual Yield
              </button>
              <button
                onClick={() => setChartViewMode('achievement')}
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                  chartViewMode === 'achievement'
                    ? 'bg-white text-emerald-600 shadow-sm border border-gray-200'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                % Pencapaian Yield
              </button>
            </div>
            <div className="text-sm text-gray-500 font-medium bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
              Total Mesin: {data.length}
            </div>
          </div>
        </div>
        
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                interval={0} 
                height={60}
                tick={{ fontSize: 11, fontWeight: 500, fill: '#64748b' }}
              />
              <YAxis 
                domain={[minVal, maxVal]}
                allowDataOverflow={true}
                tick={{ fontSize: 11, fill: '#64748b' }}
                label={{ value: isAchievement ? 'Achievement (%)' : 'Yield (%)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748b' } }}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                cursor={{ fill: '#f8fafc' }}
                formatter={(value: number) => [`${value.toFixed(1)}%`, isAchievement ? 'Achievement' : 'Yield']}
              />
              <Legend 
                verticalAlign="top" 
                align="right" 
                wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }}
                payload={isAchievement ? [
                  { value: 'Achievement (OK)', type: 'rect', id: 'achv-ok', color: '#3b82f6' },
                  { value: 'Achievement (NOT OK)', type: 'rect', id: 'achv-not-ok', color: '#f59e0b' },
                  { value: 'Target (100%)', type: 'line', id: 'target', color: '#ef4444' }
                ] : [
                  { value: 'Actual Yield (OK)', type: 'rect', id: 'yield-ok', color: '#10b981' },
                  { value: 'Actual Yield (NOT OK)', type: 'rect', id: 'yield-not-ok', color: '#f59e0b' },
                  { value: 'Target Yield', type: 'line', id: 'target', color: '#ef4444' }
                ]}
              />
              <Bar 
                dataKey={isAchievement ? "achievement" : "yield"} 
                name={isAchievement ? "Achievement" : "Actual Yield"} 
                radius={[4, 4, 0, 0]}
                barSize={30}
                onClick={handleBarClick}
                cursor="pointer"
                label={{ position: 'top', fontSize: 10, fill: '#64748b', formatter: (v: number) => `${v.toFixed(1)}%` }}
              >
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={isAchievement 
                      ? (entry.achievement >= 100 ? '#3b82f6' : '#f59e0b')
                      : (entry.yield >= entry.target ? '#10b981' : '#f59e0b')} 
                  />
                ))}
              </Bar>
              {isAchievement ? (
                <ReferenceLine y={100} stroke="#ef4444" strokeWidth={2} strokeDasharray="3 3" />
              ) : (
                <Line 
                  type="monotone" 
                  dataKey="target" 
                  name="Target Yield" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#ef4444' }}
                  activeDot={{ r: 6 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-2 mb-2">
          {/* Total Card */}
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 shadow-sm">
            <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">{totalData.name}</div>
            <div className="flex items-end justify-between">
              <div className="text-sm font-bold text-blue-700">
                {totalData.yield}%
              </div>
              <div className="text-[10px] text-blue-400 font-medium">T: {totalData.target}%</div>
            </div>
            <div className="mt-2 h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
              <div 
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${Math.min(totalData.achievement, 100)}%` }}
              ></div>
            </div>
          </div>

          {/* Machine Cards */}
          {data.map((m, idx) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">{m.name}</div>
              <div className="flex items-end justify-between">
                <div className={`text-sm font-bold ${m.yield >= m.target ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {m.yield}%
                </div>
                <div className="text-[10px] text-gray-400">T: {m.target}%</div>
              </div>
              <div className="mt-2 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${m.yield >= m.target ? 'bg-emerald-500' : 'bg-amber-500'}`}
                  style={{ width: `${Math.min(m.achievement, 100)}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
          <p className="text-emerald-800 font-medium">Memuat Data Yield...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="max-w-7xl mx-auto">
        {currentType === 'tubing' && renderChart('Tubing Machines', processedData.tubing, processedData.totals.tubing)}
        {currentType === 'haven' && renderChart('Haven Machines', processedData.haven, processedData.totals.haven)}
        {currentType === 'others' && renderChart('Other Machines', processedData.others, processedData.totals.others)}
      </div>

      {/* Detail Modal */}
      {isModalOpen && selectedMachine && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-100 bg-white">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Detail Item - {selectedMachine}</h2>
                <p className="text-gray-500 mt-1">Daftar item diurutkan berdasarkan pencapaian terendah. Klik baris untuk melihat detail down time.</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-8 bg-gray-50/50">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm shadow-sm">
                      <tr className="border-b border-gray-100">
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Order No</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Kode LT</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Dimensi</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">GR (Kg)</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">GI (Kg)</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Yield (%)</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Achievement (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {getMachineDetails().map((row, idx) => (
                        <tr 
                          key={idx} 
                          className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedOrderNo(row.order_no);
                            setIsDowntimeModalOpen(true);
                          }}
                        >
                          <td className="p-4 text-[11px] font-medium text-gray-900">{row.order_no}</td>
                          <td className="p-4 text-[11px] text-gray-600">{row.kode_lt}</td>
                          <td className="p-4 text-[11px] text-gray-600">{row.dimensi}</td>
                          <td className="p-4 text-[11px] text-gray-600">{row.customer}</td>
                          <td className="p-4 text-[11px] text-gray-600 text-right">{row.gr.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="p-4 text-[11px] text-gray-600 text-right">{row.gi.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="p-4 text-[11px] font-bold text-gray-900 text-right">{(row?.yield ?? 0).toFixed(2)}%</td>
                          <td className={`p-4 text-[11px] font-bold text-right ${row.achievement >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {(row?.achievement ?? 0).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                      {getMachineDetails().length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-12 text-center text-gray-400 font-medium text-[11px]">Tidak ada data detail untuk mesin ini</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Downtime Detail Modal */}
      {isDowntimeModalOpen && selectedOrderNo && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 flex justify-between items-center border-b border-gray-100 bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-50 rounded-lg">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 tracking-tight">Detail - {selectedOrderNo}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">Rincian untuk nomor order ini</p>
                </div>
              </div>
              <div className="flex bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setReportType('downtime')}
                  className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${reportType === 'downtime' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Down Time
                </button>
                <button
                  onClick={() => setReportType('downgrade')}
                  className={`px-4 py-2 text-xs font-bold rounded-md transition-all ${reportType === 'downgrade' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Down Grade
                </button>
              </div>
              <button 
                onClick={() => setIsDowntimeModalOpen(false)}
                className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
              {loadingDowntime || loadingDowngrade ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-4" />
                  <p className="text-amber-800 font-medium text-sm">Memuat Data {reportType === 'downtime' ? 'Down Time' : 'Down Grade'}...</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative">
                  <div className="overflow-auto max-h-[50vh]">
                    {reportType === 'downtime' ? (
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm shadow-sm">
                          <tr className="border-b border-gray-100">
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Kategori</th>
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Down Time</th>
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Durasi (Min)</th>
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">PIC</th>
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {downtimeData && downtimeData.length > 0 ? (
                            downtimeData.map((row) => (
                              <tr key={row.id} className="hover:bg-amber-50/30 transition-colors">
                                <td className="p-3 text-[11px] text-gray-600">{row.down_time_kategori}</td>
                                <td className="p-3 text-[11px] font-medium text-gray-900">{row.down_time}</td>
                                <td className="p-3 text-[11px] text-gray-600 text-right font-mono">{row.durasi_down_time}</td>
                                <td className="p-3 text-[11px] text-gray-600">{row.pic_down_time}</td>
                                <td className="p-3 text-[11px] text-gray-600 italic">{row.keterangan_down_time || '-'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={5} className="p-12 text-center text-gray-400 font-medium text-[11px]">Tidak ada data down time untuk nomor order ini</td>
                            </tr>
                          )}
                        </tbody>
                        {downtimeData && downtimeData.length > 0 && (
                          <tfoot className="bg-gray-50 font-bold">
                            <tr>
                              <td colSpan={2} className="p-3 text-[11px] text-gray-900 text-right">TOTAL DURASI:</td>
                              <td className="p-3 text-[11px] text-amber-600 text-right font-mono">
                                {downtimeData.reduce((sum, d) => sum + (Number(d.durasi_down_time) || 0), 0).toLocaleString()}
                              </td>
                              <td colSpan={2}></td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm shadow-sm">
                          <tr className="border-b border-gray-100">
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Problem</th>
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Keterangan</th>
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Qty DG (Pcs)</th>
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Qty DG (Kg)</th>
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Reject (Mtr)</th>
                            <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Reject (Kg)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {downgradeData && downgradeData.length > 0 ? (
                            downgradeData.map((row) => (
                              <tr key={row.id} className="hover:bg-amber-50/30 transition-colors">
                                <td className="p-3 text-[11px] text-gray-600">{row.problem}</td>
                                <td className="p-3 text-[11px] text-gray-600">{row.keterangan || '-'}</td>
                                <td className="p-3 text-[11px] text-gray-600 text-right font-mono">{row.qty_dg_pcs}</td>
                                <td className="p-3 text-[11px] text-gray-600 text-right font-mono">{row.qty_dg_kg}</td>
                                <td className="p-3 text-[11px] text-gray-600 text-right font-mono">{row.qty_reject_mtr}</td>
                                <td className="p-3 text-[11px] text-gray-600 text-right font-mono">{row.qty_reject_kg}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="p-12 text-center text-gray-400 font-medium text-[11px]">Tidak ada data down grade untuk nomor order ini</td>
                            </tr>
                          )}
                        </tbody>
                        {downgradeData && downgradeData.length > 0 && (
                          <tfoot className="bg-gray-50 font-bold">
                            <tr>
                              <td colSpan={2} className="p-3 text-[11px] text-gray-900 text-right">TOTAL:</td>
                              <td className="p-3 text-[11px] text-amber-600 text-right font-mono">
                                {downgradeData.reduce((sum, d) => sum + (Number(d.qty_dg_pcs) || 0), 0).toLocaleString()}
                              </td>
                              <td className="p-3 text-[11px] text-amber-600 text-right font-mono">
                                {downgradeData.reduce((sum, d) => sum + (Number(d.qty_dg_kg) || 0), 0).toLocaleString()}
                              </td>
                              <td className="p-3 text-[11px] text-amber-600 text-right font-mono">
                                {downgradeData.reduce((sum, d) => sum + (Number(d.qty_reject_mtr) || 0), 0).toLocaleString()}
                              </td>
                              <td className="p-3 text-[11px] text-amber-600 text-right font-mono">
                                {downgradeData.reduce((sum, d) => sum + (Number(d.qty_reject_kg) || 0), 0).toLocaleString()}
                              </td>
                            </tr>
                            <tr>
                              <td colSpan={3} className="p-3 text-[11px] text-gray-900 text-right">% of GI:</td>
                              <td className="p-3 text-[11px] text-amber-600 text-right font-mono">
                                {totalGiForOrder > 0 ? ((downgradeData.reduce((sum, d) => sum + (Number(d.qty_dg_kg) || 0), 0) / totalGiForOrder) * 100).toFixed(2) + '%' : '0%'}
                              </td>
                              <td className="p-3 text-[11px] text-gray-900 text-right"></td>
                              <td className="p-3 text-[11px] text-amber-600 text-right font-mono">
                                {totalGiForOrder > 0 ? ((downgradeData.reduce((sum, d) => sum + (Number(d.qty_reject_kg) || 0), 0) / totalGiForOrder) * 100).toFixed(2) + '%' : '0%'}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setIsDowntimeModalOpen(false)}
                className="px-6 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
