import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { Clock, Loader2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

interface MachineData {
  work_center: string;
  kategori: string;
}

interface CoisData {
  order_no: string;
  work_centre: string;
  machine_time: number;
  down_time: number;
  set_up: number;
  bongkar: number;
  proses?: string;
}

interface ChartData {
  name: string;
  machinePercent: number;
  downTimePercent: number;
  machineTime: number;
  downTime: number;
  totalTime: number;
}

interface Mb51Data {
  order_no: string;
  kode_lt: string;
}

interface MaterialData {
  kode_lt: string;
  kode_st: string;
  alternative_kodes_lt: string;
  alternative_kodes_st: string;
  dimensi: string;
}

export default function WeldingDownTimePerformance() {
  const { refreshKey } = useRefresh();
  const [searchParams] = useSearchParams();
  const currentType = searchParams.get('type') || 'tubing';

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const periodeParam = searchParams.get('periode') || currentMonth;
  const [year, month] = periodeParam.split('-');
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const targetPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null);
  const [isOrderDowntimeModalOpen, setIsOrderDowntimeModalOpen] = useState(false);
  const [selectedDowntimeCategory, setSelectedDowntimeCategory] = useState<string>('All');

  const { data: downtimeData, isLoading: loadingDowntime } = useQuery({
    queryKey: ['order-downtime-details', selectedOrderNo, refreshKey],
    queryFn: async () => {
      if (!selectedOrderNo) return [];
      return fetchAllRows('down_time', 'id,down_time_kategori,down_time,durasi_down_time,pic_down_time,keterangan_down_time', (q) => 
        q.eq('order_no', selectedOrderNo).gt('durasi_down_time', 0)
      );
    },
    enabled: !!selectedOrderNo && isOrderDowntimeModalOpen
  });

  const { data: performanceData, isLoading: loading } = useQuery({
    queryKey: ['welding-down-time-performance-data', refreshKey, periodeParam],
    queryFn: async () => {
      const [machinesData, coisData, mb51Data, materialsData] = await Promise.all([
        fetchAllRows('master_data_mesin', 'work_center,kategori'),
        fetchAllRows('cois_prod', 'work_centre,order_no,machine_time,down_time,set_up,bongkar,tanggal', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('mb51_prod', 'order_no,kode_lt,tanggal', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('material_master', 'kode_lt,kode_st,alternative_kodes_lt,alternative_kodes_st,dimensi')
      ]);
      return { 
        machines: machinesData || [], 
        cois: coisData || [], 
        mb51: mb51Data || [], 
        materials: materialsData || [] 
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { machines = [], cois = [], mb51 = [], materials = [] } = performanceData || {};

  const filteredCois = useMemo(() => {
    return cois;
  }, [cois]);

  const filteredMb51 = useMemo(() => {
    return mb51;
  }, [mb51]);

  const processedData = useMemo(() => {
    // Group cois by work center
    const coisByMachine = filteredCois.reduce((acc, curr) => {
      const wc = (curr.work_centre || '').trim().toUpperCase();
      if (!acc[wc]) {
        acc[wc] = { machine_time: 0, down_time: 0, set_up: 0, bongkar: 0 };
      }
      acc[wc].machine_time += Number(curr.machine_time) || 0;
      acc[wc].down_time += Number(curr.down_time) || 0;
      acc[wc].set_up += Number(curr.set_up) || 0;
      acc[wc].bongkar += Number(curr.bongkar) || 0;
      return acc;
    }, {} as Record<string, { machine_time: number, down_time: number, set_up: number, bongkar: number }>);

    const tubing: ChartData[] = [];
    const haven: ChartData[] = [];
    const others: ChartData[] = [];

    const totals = {
      tubing: { machineTime: 0, downTime: 0, totalTime: 0, count: 0 },
      haven: { machineTime: 0, downTime: 0, totalTime: 0, count: 0 },
      others: { machineTime: 0, downTime: 0, totalTime: 0, count: 0 }
    };

    machines.forEach(m => {
      const wc = m.work_center.trim().toUpperCase();
      const data = coisByMachine[wc] || { machine_time: 0, down_time: 0, set_up: 0, bongkar: 0 };
      
      const totalTime = data.machine_time + data.down_time + data.set_up + data.bongkar;
      const machinePercent = totalTime > 0 ? (data.machine_time / totalTime) * 100 : 0;
      const downTimePercent = totalTime > 0 ? (data.down_time / totalTime) * 100 : 0;

      const chartItem: ChartData = {
        name: wc,
        machinePercent: Number((machinePercent ?? 0).toFixed(2)),
        downTimePercent: Number((downTimePercent ?? 0).toFixed(2)),
        machineTime: data.machine_time,
        downTime: data.down_time,
        totalTime
      };

      const category = (m.kategori || '').trim().toLowerCase();
      if (category.includes('tubing')) {
        tubing.push(chartItem);
        totals.tubing.machineTime += data.machine_time;
        totals.tubing.downTime += data.down_time;
        totals.tubing.totalTime += totalTime;
        totals.tubing.count++;
      } else if (category.includes('haven')) {
        haven.push(chartItem);
        totals.haven.machineTime += data.machine_time;
        totals.haven.downTime += data.down_time;
        totals.haven.totalTime += totalTime;
        totals.haven.count++;
      } else {
        others.push(chartItem);
        totals.others.machineTime += data.machine_time;
        totals.others.downTime += data.down_time;
        totals.others.totalTime += totalTime;
        totals.others.count++;
      }
    });

    const calculateTotal = (group: typeof totals.tubing, name: string): ChartData => {
      const machinePercent = group.totalTime > 0 ? (group.machineTime / group.totalTime) * 100 : 0;
      const downTimePercent = group.totalTime > 0 ? (group.downTime / group.totalTime) * 100 : 0;
      return {
        name,
        machinePercent: Number((machinePercent ?? 0).toFixed(2)),
        downTimePercent: Number((downTimePercent ?? 0).toFixed(2)),
        machineTime: group.machineTime,
        downTime: group.downTime,
        totalTime: group.totalTime
      };
    };

    return {
      tubing: tubing.sort((a, b) => a.name.localeCompare(b.name)),
      haven: haven.sort((a, b) => a.name.localeCompare(b.name)),
      others: others.sort((a, b) => a.name.localeCompare(b.name)),
      totals: {
        tubing: calculateTotal(totals.tubing, 'TOTAL TUBING'),
        haven: calculateTotal(totals.haven, 'TOTAL HAVEN'),
        others: calculateTotal(totals.others, 'TOTAL OTHERS')
      }
    };
  }, [machines, filteredCois]);

  const handleBarClick = (data: any) => {
    if (data && data.name) {
      setSelectedMachine(data.name);
      setIsModalOpen(true);
    }
  };

  const getMachineDetails = () => {
    if (!selectedMachine) return [];
    
    const normalizeCode = (code: string) => {
      if (!code) return '';
      return code.replace(/[\s-]/g, '').toUpperCase();
    };

    const materialInfoMap = new Map<string, MaterialData>();
    materials.forEach(m => {
      if (m.kode_lt) materialInfoMap.set(normalizeCode(m.kode_lt), m);
      if (m.kode_st) materialInfoMap.set(normalizeCode(m.kode_st), m);
      if (m.alternative_kodes_lt) {
        m.alternative_kodes_lt.split(',').forEach(alt => {
          materialInfoMap.set(normalizeCode(alt), m);
        });
      }
      if (m.alternative_kodes_st) {
        m.alternative_kodes_st.split(',').forEach(alt => {
          materialInfoMap.set(normalizeCode(alt), m);
        });
      }
    });

    const orderToKodeMap = new Map<string, string>();
    filteredMb51.forEach(row => {
      const orderNo = (row.order_no || '').trim();
      if (orderNo) {
        orderToKodeMap.set(orderNo, row.kode_lt || '');
      }
    });

    const itemsMap = new Map<string, {
      order_no: string;
      kode_material: string;
      dimensi: string;
      machine_time: number;
      down_time: number;
      set_up: number;
      bongkar: number;
    }>();

    filteredCois.forEach(c => {
      const wc = (c.work_centre || '').trim().toUpperCase();
      if (wc === selectedMachine.trim().toUpperCase()) {
        const orderNo = (c.order_no || '').trim();
        if (!itemsMap.has(orderNo)) {
          const kode = orderToKodeMap.get(orderNo) || '-';
          const mInfo = materialInfoMap.get(normalizeCode(kode));
          itemsMap.set(orderNo, {
            order_no: orderNo || '-',
            kode_material: kode,
            dimensi: mInfo?.dimensi || '-',
            machine_time: 0,
            down_time: 0,
            set_up: 0,
            bongkar: 0
          });
        }
        const item = itemsMap.get(orderNo)!;
        item.machine_time += Number(c.machine_time) || 0;
        item.down_time += Number(c.down_time) || 0;
        item.set_up += Number(c.set_up) || 0;
        item.bongkar += Number(c.bongkar) || 0;
      }
    });

    const details = Array.from(itemsMap.values()).map(item => {
      const totalTime = item.machine_time + item.down_time + item.set_up + item.bongkar;
      const machinePercent = totalTime > 0 ? (item.machine_time / totalTime) * 100 : 0;
      const downTimePercent = totalTime > 0 ? (item.down_time / totalTime) * 100 : 0;
      
      return {
        ...item,
        totalTime,
        machinePercent,
        downTimePercent
      };
    });

    // Sort by lowest machine percent
    return details.sort((a, b) => a.machinePercent - b.machinePercent);
  };

  const renderChart = (title: string, data: ChartData[], totalData: ChartData, machineTimeLabel: string) => {
    const allValues = data.flatMap(d => [d.machinePercent, d.downTimePercent]);
    const nonZeroValues = allValues.filter(v => v > 0);
    const minVal = nonZeroValues.length > 0 
      ? Math.max(0, Math.floor(Math.min(...nonZeroValues) - 5))
      : 0;
    const maxVal = Math.min(100, Math.ceil(Math.max(...allValues) + 5));

    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-blue-600" />
            {title}
          </h3>
          <div className="text-sm text-gray-500 font-medium">
            Total Mesin: {data.length}
          </div>
        </div>
        
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                angle={0} 
                textAnchor="middle" 
                interval={0} 
                height={40}
                tick={{ fontSize: 11, fontWeight: 500, fill: '#64748b' }}
              />
              <YAxis 
                domain={[minVal, maxVal]}
                allowDataOverflow={true}
                tick={{ fontSize: 11, fill: '#64748b' }}
                label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748b' } }}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                cursor={{ fill: '#f8fafc' }}
                formatter={(value: number, name: string) => [`${value}%`, name === 'machinePercent' ? machineTimeLabel : '% Down Time']}
              />
              <Legend 
                verticalAlign="top" 
                align="right" 
                wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }}
                payload={[
                  { value: `% ${machineTimeLabel}`, type: 'rect', id: 'machine-time', color: '#3b82f6' },
                  { value: '% Down Time', type: 'rect', id: 'down-time', color: '#ef4444' }
                ]}
              />
              <Bar 
                dataKey="machinePercent" 
                name="machinePercent" 
                fill="#3b82f6"
                radius={[4, 4, 0, 0]}
                barSize={30}
                onClick={handleBarClick}
                cursor="pointer"
                label={{ position: 'top', fontSize: 10, fill: '#64748b', formatter: (v: number) => `${v}%` }}
              />
              <Bar 
                dataKey="downTimePercent" 
                name="downTimePercent" 
                fill="#ef4444"
                radius={[4, 4, 0, 0]}
                barSize={30}
                onClick={handleBarClick}
                cursor="pointer"
                label={{ position: 'top', fontSize: 10, fill: '#64748b', formatter: (v: number) => `${v}%` }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-6 mb-4">
          {/* Total Card */}
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 shadow-sm">
            <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">{totalData.name}</div>
            <div className="flex items-end justify-between">
              <div className="text-sm font-bold text-blue-700">
                {totalData.machinePercent}%
              </div>
              <div className="text-[10px] text-blue-400 font-medium">DT: {totalData.downTimePercent}%</div>
            </div>
            <div className="mt-2 h-1.5 w-full bg-blue-100 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-blue-500"
                style={{ width: `${totalData.machinePercent}%` }}
              ></div>
              <div 
                className="h-full bg-blue-300"
                style={{ width: `${totalData.downTimePercent}%` }}
              ></div>
            </div>
          </div>

          {/* Machine Cards */}
          {data.map((m, idx) => (
            <div key={idx} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="text-[10px] font-bold text-gray-500 uppercase mb-1">{m.name}</div>
              <div className="flex items-end justify-between">
                <div className="text-sm font-bold text-blue-600">
                  {m.machinePercent}%
                </div>
                <div className="text-[10px] text-red-500">DT: {m.downTimePercent}%</div>
              </div>
              <div className="mt-2 h-1 w-full bg-gray-200 rounded-full overflow-hidden flex">
                <div 
                  className="h-full bg-blue-500"
                  style={{ width: `${m.machinePercent}%` }}
                ></div>
                <div 
                  className="h-full bg-red-500"
                  style={{ width: `${m.downTimePercent}%` }}
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
          <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
          <p className="text-blue-800 font-medium">Memuat Data Performance...</p>
        </div>
      </div>
    );
  }

  const getMachineTimeLabel = () => {
    if (currentType === 'tubing') return 'Welding Time';
    return 'Cutting Time';
  };

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="max-w-7xl mx-auto">
        {currentType === 'tubing' && renderChart('Tubing Machines', processedData.tubing, processedData.totals.tubing, 'Welding Time')}
        {currentType === 'haven' && renderChart('Haven Machines', processedData.haven, processedData.totals.haven, 'Cutting Time')}
        {currentType === 'others' && renderChart('Other Machines', processedData.others, processedData.totals.others, 'Cutting Time')}
      </div>

      {/* Detail Modal */}
      {isModalOpen && selectedMachine && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-100 bg-white">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Detail Item - {selectedMachine}</h2>
                <p className="text-gray-500 mt-1">Daftar item diurutkan berdasarkan pencapaian terendah</p>
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
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Kode Material</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Dimensi</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">{getMachineTimeLabel()} (Menit)</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Down Time (Menit)</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Set Up (Menit)</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Bongkar (Menit)</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Total Time (Menit)</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">% {getMachineTimeLabel()}</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">% Down Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {getMachineDetails().map((row, idx) => (
                        <tr 
                          key={idx} 
                          className="hover:bg-blue-50/30 transition-colors cursor-pointer"
                          onClick={() => {
                            if (row.order_no && row.order_no !== '-') {
                              setSelectedOrderNo(row.order_no);
                              setIsOrderDowntimeModalOpen(true);
                            }
                          }}
                        >
                          <td className="p-4 text-[11px] font-medium text-gray-900">{row.order_no}</td>
                          <td className="p-4 text-[11px] text-gray-600">{row.kode_material}</td>
                          <td className="p-4 text-[11px] text-gray-600">{row.dimensi}</td>
                          <td className="p-4 text-[11px] text-gray-600 text-right">{row.machine_time.toLocaleString()}</td>
                          <td className="p-4 text-[11px] text-gray-600 text-right">{row.down_time.toLocaleString()}</td>
                          <td className="p-4 text-[11px] text-gray-600 text-right">{row.set_up.toLocaleString()}</td>
                          <td className="p-4 text-[11px] text-gray-600 text-right">{row.bongkar.toLocaleString()}</td>
                          <td className="p-4 text-[11px] font-bold text-gray-900 text-right">{row.totalTime.toLocaleString()}</td>
                          <td className="p-4 text-[11px] font-bold text-blue-600 text-right">{(row.machinePercent ?? 0).toFixed(2)}%</td>
                          <td className="p-4 text-[11px] font-bold text-red-500 text-right">{(row.downTimePercent ?? 0).toFixed(2)}%</td>
                        </tr>
                      ))}
                      {getMachineDetails().length === 0 && (
                        <tr>
                          <td colSpan={10} className="p-12 text-center text-gray-400 font-medium text-[11px]">Tidak ada data detail untuk mesin ini</td>
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

      {/* Order Downtime Detail Modal */}
      {isOrderDowntimeModalOpen && selectedOrderNo && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 bg-white">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <Clock className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 tracking-tight">Detail Down Time - {selectedOrderNo}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Rincian waktu henti untuk nomor order ini</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setIsOrderDowntimeModalOpen(false);
                    setSelectedDowntimeCategory('All');
                  }}
                  className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-500 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Category Selection Buttons */}
              {!loadingDowntime && downtimeData && downtimeData.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  <button
                    onClick={() => setSelectedDowntimeCategory('All')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                      selectedDowntimeCategory === 'All'
                        ? 'bg-amber-600 text-white shadow-md shadow-amber-100'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    All Categories
                  </button>
                  {Array.from(new Set(downtimeData.map((d: any) => d.down_time_kategori).filter(Boolean))).map((cat: any) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedDowntimeCategory(cat)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                        selectedDowntimeCategory === cat
                          ? 'bg-amber-600 text-white shadow-md shadow-amber-100'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex-1 overflow-auto p-6 bg-gray-50/50">
              {loadingDowntime ? (
                <div className="flex flex-col items-center justify-center h-64">
                  <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-4" />
                  <p className="text-amber-800 font-medium text-sm">Memuat Data Down Time...</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden relative">
                  <div className="overflow-auto max-h-[50vh]">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm shadow-sm">
                        <tr className="border-b border-gray-100">
                          <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Down Time</th>
                          <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Durasi (Min)</th>
                          <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">PIC</th>
                          <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {downtimeData && downtimeData.length > 0 ? (
                          downtimeData
                            .filter((row: any) => selectedDowntimeCategory === 'All' || row.down_time_kategori === selectedDowntimeCategory)
                            .sort((a: any, b: any) => (b.durasi_down_time || 0) - (a.durasi_down_time || 0))
                            .map((row: any) => (
                              <tr key={row.id} className="hover:bg-amber-50/30 transition-colors">
                                <td className="p-3 text-[11px] font-medium text-gray-900">{row.down_time}</td>
                                <td className="p-3 text-[11px] text-gray-600 text-right font-mono">{row.durasi_down_time}</td>
                                <td className="p-3 text-[11px] text-gray-600">{row.pic_down_time}</td>
                                <td className="p-3 text-[11px] text-gray-600 italic">{row.keterangan_down_time || '-'}</td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-gray-400 font-medium text-[11px]">Tidak ada data down time untuk order ini</td>
                          </tr>
                        )}
                        {downtimeData && downtimeData.length > 0 && downtimeData.filter((row: any) => selectedDowntimeCategory === 'All' || row.down_time_kategori === selectedDowntimeCategory).length === 0 && (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-gray-400 font-medium text-[11px]">Tidak ada data untuk kategori ini</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-white flex justify-end">
              <button
                onClick={() => {
                  setIsOrderDowntimeModalOpen(false);
                  setSelectedDowntimeCategory('All');
                }}
                className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-bold rounded-xl transition-colors"
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
