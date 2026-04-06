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
  Cell
} from 'recharts';
import { Gauge, Loader2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

interface MachineData {
  work_center: string;
  kategori: string;
}

interface ProductionData {
  work_centre: string;
  gr_qty_kg: number;
  gi_qty_kg: number;
  gr_qty_pcs: number;
  kode_lt?: string;
  kode_st?: string;
  order_no?: string;
  customer?: string;
  proses?: string;
}

interface MaterialData {
  kode_lt?: string;
  kode_st?: string;
  alternative_kodes_lt?: string;
  alternative_kodes_st?: string;
  dimensi?: string;
  kg_per_jam_mill?: number;
  pcs_per_jam_cut?: number;
}

interface CoisData {
  order_no: string;
  machine_time: number;
}

interface ChartData {
  name: string;
  speed: number;
  target: number;
  achievement: number;
}

const normalizeCode = (code: string | undefined | null) => {
  if (!code) return '';
  return code.toString().trim().toUpperCase();
};

export default function SpeedAchievement() {
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

  const { data: speedData, isLoading: loading } = useQuery({
    queryKey: ['speed-achievement-data', refreshKey, periodeParam],
    queryFn: async () => {
      const [machinesData, prodData, materialsData, coisData] = await Promise.all([
        fetchAllRows('master_data_mesin', 'work_center,kategori'),
        fetchAllRows('mb51_prod', 'work_centre_lt,gr_qty_kg,gi_qty_kg,gr_qty_pcs,kode_lt,order_no,customer,proses,tanggal', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('material_master', 'kode_lt,kode_st,alternative_kodes_lt,alternative_kodes_st,dimensi,kg_per_jam_mill,pcs_per_jam_cut'),
        fetchAllRows('cois_prod', 'order_no,machine_time,tanggal', (q) => q.eq('periode', targetPeriode))
      ]);
      return { 
        machines: machinesData || [], 
        production: prodData || [], 
        materials: materialsData || [], 
        cois: coisData || [] 
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { machines = [], production = [], materials = [], cois = [] } = speedData || {};

  const filteredProduction = useMemo(() => {
    return production;
  }, [production]);

  const filteredCois = useMemo(() => {
    return cois;
  }, [cois]);

  const processedData = useMemo(() => {
    const coisMap = new Map<string, number>();
    filteredCois.forEach(c => {
      if (c.order_no) {
        const orderNo = c.order_no.trim();
        const current = coisMap.get(orderNo) || 0;
        coisMap.set(orderNo, current + (Number(c.machine_time) || 0));
      }
    });

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

    const prodByOrder = new Map<string, { wc: string, proses: string, grKg: number, grPcs: number, kode: string }>();

    filteredProduction.forEach(row => {
      const orderNo = (row.order_no || '').trim();
      if (!orderNo) return;
      
      const wc = (row.work_centre_lt || '').trim().toUpperCase();
      const proses = (row.proses ? row.proses.toString().trim().toUpperCase() : 'LT');
      const grKg = Number(row.gr_qty_kg) || 0;
      const grPcs = Number(row.gr_qty_pcs) || 0;
      const kode = row.kode_lt || row.kode_st || '';

      if (!prodByOrder.has(orderNo)) {
        prodByOrder.set(orderNo, { wc, proses, grKg: 0, grPcs: 0, kode });
      }
      const orderData = prodByOrder.get(orderNo)!;
      orderData.grKg += grKg;
      orderData.grPcs += grPcs;
    });

    const prodByMachine = new Map<string, { grUnit: number, targetUnitTotal: number }>();

    prodByOrder.forEach((orderData, orderNo) => {
      const { wc, proses, grKg, grPcs, kode } = orderData;
      if (!wc) return;

      if (!prodByMachine.has(wc)) {
        prodByMachine.set(wc, { grUnit: 0, targetUnitTotal: 0 });
      }
      const wcData = prodByMachine.get(wc)!;

      const machineTime = coisMap.get(orderNo) || 0;
      const mInfo = materialInfoMap.get(normalizeCode(kode)) || {};
      
      if (proses === 'ST') {
        wcData.grUnit += grPcs;
        const targetPcsPerHour = Number(mInfo.pcs_per_jam_cut) || 0;
        wcData.targetUnitTotal += (machineTime / 60) * targetPcsPerHour;
      } else {
        wcData.grUnit += grKg;
        const targetKgPerHour = Number(mInfo.kg_per_jam_mill) || 0;
        wcData.targetUnitTotal += (machineTime / 60) * targetKgPerHour;
      }
    });

    const tubing: ChartData[] = [];
    const haven: ChartData[] = [];
    const others: ChartData[] = [];

    const totals = {
      tubing: { grUnit: 0, targetUnitTotal: 0, count: 0 },
      haven: { grUnit: 0, targetUnitTotal: 0, count: 0 },
      others: { grUnit: 0, targetUnitTotal: 0, count: 0 }
    };

    machines.forEach(m => {
      const wc = m.work_center.trim().toUpperCase();
      const prod = prodByMachine.get(wc) || { grUnit: 0, targetUnitTotal: 0 };
      
      const speedAchievement = prod.targetUnitTotal > 0 ? (prod.grUnit / prod.targetUnitTotal) * 100 : 0;
      const target = 100; // Speed target is always 100%

      const dataItem: ChartData = {
        name: m.work_center,
        speed: Number((speedAchievement ?? 0).toFixed(2)),
        target: target,
        achievement: Number((speedAchievement ?? 0).toFixed(2))
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

      totals[cat].grUnit += prod.grUnit;
      totals[cat].targetUnitTotal += prod.targetUnitTotal;
      totals[cat].count += 1;
    });

    const calcTotal = (catData: { grUnit: number, targetUnitTotal: number, count: number }): ChartData => {
      const speedAchievement = catData.targetUnitTotal > 0 ? (catData.grUnit / catData.targetUnitTotal) * 100 : 0;
      const target = 100;
      return {
        name: 'TOTAL PENCAPAIAN',
        speed: Number((speedAchievement ?? 0).toFixed(2)),
        target: target,
        achievement: Number((speedAchievement ?? 0).toFixed(2))
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
  }, [machines, filteredProduction, materials, filteredCois]);

  const handleBarClick = (data: any) => {
    if (data && data.name) {
      setSelectedMachine(data.name);
      setIsModalOpen(true);
    }
  };

  const getMachineDetails = () => {
    if (!selectedMachine) return [];
    
    const coisMap = new Map<string, number>();
    filteredCois.forEach(c => {
      if (c.order_no) {
        const orderNo = c.order_no.trim();
        const current = coisMap.get(orderNo) || 0;
        coisMap.set(orderNo, current + (Number(c.machine_time) || 0));
      }
    });

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

    const itemsMap = new Map<string, {
      kode_lt: string;
      order_no: string;
      customer: string;
      grUnit: number;
      targetUnitTotal: number;
      dimensi: string;
      unitLabel: string;
    }>();

    filteredProduction.forEach(p => {
      const wc = (p.work_centre_lt || '').trim().toUpperCase();
      if (wc === selectedMachine.trim().toUpperCase()) {
        const key = `${p.kode_lt || p.kode_st || ''}-${p.order_no || ''}`;
        const proses = (p.proses ? p.proses.toString().trim().toUpperCase() : 'LT');
        const kode = p.kode_lt || p.kode_st || '';
        const mInfo = materialInfoMap.get(normalizeCode(kode)) || {};
        
        if (!itemsMap.has(key)) {
          const orderNo = (p.order_no || '').trim();
          const machineTime = coisMap.get(orderNo) || 0;
          let targetUnitTotal = 0;
          
          if (proses === 'ST') {
            const targetPcsPerHour = Number(mInfo.pcs_per_jam_cut) || 0;
            targetUnitTotal = (machineTime / 60) * targetPcsPerHour;
          } else {
            const targetKgPerHour = Number(mInfo.kg_per_jam_mill) || 0;
            targetUnitTotal = (machineTime / 60) * targetKgPerHour;
          }

          itemsMap.set(key, {
            kode_lt: kode || '-',
            order_no: p.order_no || '-',
            customer: p.customer || '-',
            grUnit: 0,
            targetUnitTotal: targetUnitTotal,
            dimensi: mInfo.dimensi || '-',
            unitLabel: proses === 'ST' ? 'Pcs' : 'Kg'
          });
        }
        const item = itemsMap.get(key)!;

        if (proses === 'ST') {
          item.grUnit += Number(p.gr_qty_pcs) || 0;
        } else {
          item.grUnit += Number(p.gr_qty_kg) || 0;
        }
      }
    });

    const details = Array.from(itemsMap.values()).map(item => {
      const speedAchievement = item.targetUnitTotal > 0 ? (item.grUnit / item.targetUnitTotal) * 100 : 0;
      return {
        ...item,
        speed: speedAchievement,
        achievement: speedAchievement
      };
    });

    // Sort by lowest achievement
    return details.sort((a, b) => a.achievement - b.achievement);
  };

  const renderChart = (title: string, data: ChartData[], totalData: ChartData) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Gauge className="w-5 h-5 text-emerald-600" />
          {title}
        </h3>
        <div className="text-sm text-gray-500 font-medium">
          Total Mesin: {data.length}
        </div>
      </div>
      
      <div className="h-[350px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
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
              domain={[75, 'auto']}
              allowDataOverflow={true}
              tick={{ fontSize: 11, fill: '#64748b' }}
              label={{ value: 'Speed (%)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748b' } }}
            />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              cursor={{ fill: '#f8fafc' }}
            />
            <Legend 
              verticalAlign="top" 
              align="right" 
              wrapperStyle={{ paddingBottom: '20px', fontSize: '12px' }}
              payload={[
                { value: 'Actual Speed (OK)', type: 'rect', id: 'speed-ok', color: '#10b981' },
                { value: 'Actual Speed (NOT OK)', type: 'rect', id: 'speed-not-ok', color: '#f59e0b' },
                { value: 'Target Speed', type: 'line', id: 'target', color: '#ef4444' }
              ]}
            />
            <Bar 
              dataKey="speed" 
              name="Actual Speed" 
              radius={[4, 4, 0, 0]}
              barSize={30}
              onClick={handleBarClick}
              cursor="pointer"
              label={{ position: 'top', fontSize: 10, fill: '#64748b', formatter: (v: number) => `${v}%` }}
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.speed >= entry.target ? '#10b981' : '#f59e0b'} 
                />
              ))}
            </Bar>
            <Line 
              type="monotone" 
              dataKey="target" 
              name="Target Speed" 
              stroke="#ef4444" 
              strokeWidth={2}
              dot={{ r: 4, fill: '#ef4444' }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-6 mb-4">
        {/* Total Card */}
        <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 shadow-sm">
          <div className="text-[10px] font-bold text-blue-600 uppercase mb-1">{totalData.name}</div>
          <div className="flex items-end justify-between">
            <div className="text-sm font-bold text-blue-700">
              {totalData.speed}%
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
              <div className={`text-sm font-bold ${m.speed >= m.target ? 'text-emerald-600' : 'text-amber-600'}`}>
                {m.speed}%
              </div>
              <div className="text-[10px] text-gray-400">T: {m.target}%</div>
            </div>
            <div className="mt-2 h-1 w-full bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${m.speed >= m.target ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(m.achievement, 100)}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
          <p className="text-emerald-800 font-medium">Memuat Data Speed...</p>
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
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Kode Item</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Dimensi</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actual Unit</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Target Unit</th>
                        <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Speed (%)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {getMachineDetails().map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                          <td className="p-4 text-[11px] font-medium text-gray-900">{row.order_no}</td>
                          <td className="p-4 text-[11px] text-gray-600">{row.kode_lt}</td>
                          <td className="p-4 text-[11px] text-gray-600">{row.dimensi}</td>
                          <td className="p-4 text-[11px] text-gray-600">{row.customer}</td>
                          <td className="p-4 text-[11px] text-gray-600 text-right">{row.grUnit.toLocaleString(undefined, { maximumFractionDigits: 0 })} {row.unitLabel}</td>
                          <td className="p-4 text-[11px] text-gray-600 text-right">{row.targetUnitTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} {row.unitLabel}</td>
                          <td className={`p-4 text-[11px] font-bold text-right ${row.achievement >= 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                            {(row?.achievement ?? 0).toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                      {getMachineDetails().length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-12 text-center text-gray-400 font-medium text-[11px]">Tidak ada data detail untuk mesin ini</td>
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
    </div>
  );
}
