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
  Cell,
  LabelList,
  ReferenceLine
} from 'recharts';
import { Activity, Loader2, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

interface MachineData {
  work_center: string;
  kategori: string;
}

interface ProductionData {
  work_centre_lt: string;
  gr_qty_kg: number;
  gr_qty_pcs: number;
  tanggal: string;
  order_no: string;
  proses: string;
  kode_lt: string;
}

interface CoisData {
  work_centre: string;
  set_up: number;
  bongkar: number;
  machine_time: number;
  down_time: number;
  tanggal: string;
  order_no: string;
}

interface MaterialData {
  kode_lt: string;
  kode_st: string;
  pcs_per_jam_cut: number;
  kg_per_jam_mill: number;
}

interface ChartData {
  name: string;
  productivity: number;
}

export default function ProductivityRate() {
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

  const { data: productivityData, isLoading: loading } = useQuery({
    queryKey: ['productivity-rate-data', refreshKey, periodeParam],
    queryFn: async () => {
      const [machinesData, mb51Data, coisData, materialsData] = await Promise.all([
        fetchAllRows('master_data_mesin', 'work_center,kategori'),
        fetchAllRows('mb51_prod', 'work_centre_lt,gr_qty_kg,gr_qty_pcs,tanggal,order_no,proses,kode_lt', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('cois_prod', 'work_centre,set_up,bongkar,machine_time,down_time,tanggal,order_no', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('material_master', 'kode_lt,kode_st,pcs_per_jam_cut,kg_per_jam_mill')
      ]);
      return { 
        machines: (machinesData || []) as MachineData[], 
        mb51: (mb51Data || []) as ProductionData[], 
        cois: (coisData || []) as CoisData[],
        materials: (materialsData || []) as MaterialData[]
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { machines = [], mb51 = [], cois = [], materials = [] } = productivityData || {};

  const filteredMb51 = useMemo(() => {
    return mb51;
  }, [mb51]);

  const filteredCois = useMemo(() => {
    return cois;
  }, [cois]);

  const processedData = useMemo(() => {
    const tubing: ChartData[] = [];
    const haven: ChartData[] = [];
    const others: ChartData[] = [];

    machines.forEach(m => {
      // Calculate productivity
      const machineMb51 = filteredMb51.filter(d => d.work_centre_lt === m.work_center);
      const machineCois = filteredCois.filter(d => d.work_centre === m.work_center);

      const totalQtyKg = machineMb51.reduce((sum, d) => sum + (d.gr_qty_kg || 0), 0);
      const totalTime = machineCois.reduce((sum, d) => 
        sum + (d.set_up || 0) + (d.bongkar || 0) + (d.machine_time || 0) + (d.down_time || 0), 0);

      // Convert to Ton/Jam
      // Qty: KG to Ton (/1000)
      // Time: Minutes to Hour (/60)
      const productivity = totalTime > 0 
        ? (totalQtyKg / 1000) / (totalTime / 60)
        : 0;

      const dataItem: ChartData = {
        name: m.work_center,
        productivity: parseFloat(productivity.toFixed(2))
      };

      const kategori = (m.kategori || '').toLowerCase();
      if (kategori.includes('tubing')) {
        tubing.push(dataItem);
      } else if (kategori.includes('haven')) {
        haven.push(dataItem);
      } else {
        others.push(dataItem);
      }
    });

    return { tubing, haven, others };
  }, [machines, filteredMb51, filteredCois]);

  const selectedMachineData = useMemo(() => {
    if (!selectedMachine) return null;

    const machineMb51 = filteredMb51.filter(d => d.work_centre_lt === selectedMachine);
    const machineCois = filteredCois.filter(d => d.work_centre === selectedMachine);

    const totalQtyKg = machineMb51.reduce((sum, d) => sum + (d.gr_qty_kg || 0), 0);
    const setupTime = machineCois.reduce((sum, d) => sum + (d.set_up || 0), 0);
    const bongkarTime = machineCois.reduce((sum, d) => sum + (d.bongkar || 0), 0);
    const machineTime = machineCois.reduce((sum, d) => sum + (d.machine_time || 0), 0);
    const downTime = machineCois.reduce((sum, d) => sum + (d.down_time || 0), 0);
    
    const totalTimeMinutes = setupTime + bongkarTime + machineTime + downTime;
    
    const productivity = totalTimeMinutes > 0 
      ? (totalQtyKg / 1000) / (totalTimeMinutes / 60)
      : 0;
      
    const achievement = (productivity / 1.54) * 100;

    const setupPercent = totalTimeMinutes > 0 ? (setupTime / totalTimeMinutes) * 100 : 0;
    const bongkarPercent = totalTimeMinutes > 0 ? (bongkarTime / totalTimeMinutes) * 100 : 0;
    const machinePercent = totalTimeMinutes > 0 ? (machineTime / totalTimeMinutes) * 100 : 0;
    const downPercent = totalTimeMinutes > 0 ? (downTime / totalTimeMinutes) * 100 : 0;

    // Speed Achievement Calculation
    const normalizeCode = (code: string | undefined | null) => {
      if (!code) return '';
      return code.toString().trim().toUpperCase();
    };

    const materialMap = new Map();
    materials.forEach((m) => {
      if (m.kode_lt) materialMap.set(normalizeCode(m.kode_lt), m);
      if (m.kode_st) materialMap.set(normalizeCode(m.kode_st), m);
    });

    const orderCoisMap = new Map();
    machineCois.forEach((c) => {
      const orderNo = (c.order_no || '').trim();
      if (orderNo) {
        orderCoisMap.set(orderNo, (orderCoisMap.get(orderNo) || 0) + (Number(c.machine_time) || 0));
      }
    });

    const prodByOrder = new Map();
    machineMb51.forEach((row) => {
      const orderNo = (row.order_no || '').trim();
      if (!orderNo) return;
      
      const proses = (row.proses ? row.proses.toString().trim().toUpperCase() : 'LT');
      const kode = row.kode_lt || row.kode_st || '';
      const grKg = Number(row.gr_qty_kg) || 0;
      const grPcs = Number(row.gr_qty_pcs) || 0;

      if (!prodByOrder.has(orderNo)) {
        prodByOrder.set(orderNo, { proses, kode, grKg: 0, grPcs: 0 });
      }
      const orderData = prodByOrder.get(orderNo);
      orderData.grKg += grKg;
      orderData.grPcs += grPcs;
    });

    let totalActualSpeed = 0;
    let totalTargetSpeed = 0;
    
    prodByOrder.forEach((orderData, orderNo) => {
      const { proses, kode, grKg, grPcs } = orderData;
      const mInfo = materialMap.get(normalizeCode(kode)) || {};
      const machineTimeForOrder = orderCoisMap.get(orderNo) || 0;

      if (proses === 'ST') {
        totalActualSpeed += grPcs;
        const targetPcsPerHour = Number(mInfo.pcs_per_jam_cut) || 0;
        totalTargetSpeed += (machineTimeForOrder / 60) * targetPcsPerHour;
      } else {
        totalActualSpeed += grKg;
        const targetKgPerHour = Number(mInfo.kg_per_jam_mill) || 0;
        totalTargetSpeed += (machineTimeForOrder / 60) * targetKgPerHour;
      }
    });

    const speedAchievement = totalTargetSpeed > 0 ? (totalActualSpeed / totalTargetSpeed) * 100 : 0;

    return {
      totalQtyKg,
      setupTime,
      bongkarTime,
      machineTime,
      downTime,
      setupPercent,
      bongkarPercent,
      machinePercent,
      downPercent,
      totalTimeMinutes,
      productivity,
      achievement,
      speedAchievement
    };
  }, [selectedMachine, filteredMb51, filteredCois, materials]);

  const handleBarClick = (data: any) => {
    if (data && data.name) {
      setSelectedMachine(data.name);
      setIsModalOpen(true);
    }
  };

  const renderChart = (title: string, data: ChartData[], categoryMachines: MachineData[]) => {
    // Calculate totals only for machines in this category
    const categoryWorkCenters = categoryMachines.map(m => m.work_center);
    
    const totalQtyKg = filteredMb51
      .filter(d => categoryWorkCenters.includes(d.work_centre_lt))
      .reduce((sum, d) => sum + (d.gr_qty_kg || 0), 0);
      
    const totalTime = filteredCois
      .filter(d => categoryWorkCenters.includes(d.work_centre))
      .reduce((sum, d) => 
        sum + (d.set_up || 0) + (d.bongkar || 0) + (d.machine_time || 0) + (d.down_time || 0), 0);
    
    const totalProductivity = totalTime > 0 
      ? (totalQtyKg / 1000) / (totalTime / 60)
      : 0;
    const totalAchievement = (totalProductivity / 1.54) * 100;

    return (
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-8">
        <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Activity className="w-5 h-5 text-emerald-600" />
          {title}
        </h3>
        
        <div className="h-[350px] w-full mb-8">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis 
                dataKey="name" 
                interval={0} 
                height={50}
                tick={{ fontSize: 11, fontWeight: 500, fill: '#64748b' }}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: '#64748b' }}
                label={{ value: 'Productivity (Ton/Jam)', angle: -90, position: 'insideLeft', style: { fontSize: 11, fill: '#64748b' } }}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
              />
              <Bar 
                dataKey="productivity" 
                name="Productivity Rate" 
                radius={[4, 4, 0, 0]}
                barSize={30}
                onClick={handleBarClick}
                cursor="pointer"
                fill="#10b981"
              >
                <LabelList dataKey="productivity" position="top" formatter={(value: number) => value.toFixed(2)} style={{ fontSize: '10px' }} />
              </Bar>
              <ReferenceLine y={1.54} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Target: 1.54', position: 'right', fill: '#ef4444', fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Achievement Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {/* Total Card */}
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
            <div className="text-xs font-bold text-blue-600 mb-1">TOTAL PENCAPAIAN</div>
            <div className="flex justify-between items-end mb-2">
              <div className="text-xl font-bold text-blue-600">{totalAchievement.toFixed(1)}%</div>
              <div className="text-xs text-blue-500">{totalProductivity.toFixed(2)} Ton/Jam</div>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-1.5">
              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(totalAchievement, 100)}%` }}></div>
            </div>
          </div>

          {/* Machine Cards */}
          {data.map((item) => {
            const achievement = (item.productivity / 1.54) * 100;
            return (
              <div key={item.name} className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <div className="text-xs font-bold text-gray-500 mb-1">{item.name}</div>
                <div className="flex justify-between items-end mb-2">
                  <div className="text-xl font-bold text-orange-500">{achievement.toFixed(1)}%</div>
                  <div className="text-xs text-gray-400">T: 100%</div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(achievement, 100)}%` }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center">
          <Loader2 className="w-10 h-10 text-emerald-600 animate-spin mb-4" />
          <p className="text-emerald-800 font-medium">Memuat Data Produktivitas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="max-w-7xl mx-auto">
        {currentType === 'tubing' && renderChart('Tubing Machines Productivity', processedData.tubing, machines.filter(m => (m.kategori || '').toLowerCase().includes('tubing')))}
        {currentType === 'haven' && renderChart('Haven Machines Productivity', processedData.haven, machines.filter(m => (m.kategori || '').toLowerCase().includes('haven')))}
        {currentType === 'others' && renderChart('Other Machines Productivity', processedData.others, machines.filter(m => !(m.kategori || '').toLowerCase().includes('tubing') && !(m.kategori || '').toLowerCase().includes('haven')))}
      </div>

      {isModalOpen && selectedMachine && selectedMachineData && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg p-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">Detail - {selectedMachine}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 hover:bg-gray-200 transition-colors rounded-full text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Main Metrics */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                  <div className="text-xs font-bold text-emerald-600 mb-1">Productivity Rate</div>
                  <div className="text-xl font-black text-emerald-700">
                    {selectedMachineData.productivity.toFixed(2)} <span className="text-xs font-bold text-emerald-600">Ton/Jam</span>
                  </div>
                </div>
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <div className="text-xs font-bold text-blue-600 mb-1">Achievement</div>
                  <div className="text-xl font-black text-blue-700">
                    {selectedMachineData.achievement.toFixed(1)} <span className="text-xs font-bold text-blue-600">%</span>
                  </div>
                </div>
                <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                  <div className="text-xs font-bold text-orange-600 mb-1">Avg % Speed</div>
                  <div className="text-xl font-black text-orange-700">
                    {selectedMachineData.speedAchievement.toFixed(1)} <span className="text-xs font-bold text-orange-600">%</span>
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-4">
                <h3 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2">Komponen Perhitungan</h3>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 font-medium">Total Output</span>
                  <span className="text-sm font-bold text-gray-900">{(selectedMachineData.totalQtyKg / 1000).toFixed(2)} Ton</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600 font-medium">Total Waktu</span>
                  <span className="text-sm font-bold text-gray-900">{(selectedMachineData.totalTimeMinutes / 60).toFixed(2)} Jam</span>
                </div>

                <div className="pt-2 border-t border-gray-200 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Machine Time</span>
                    <span className="font-semibold text-gray-700">{selectedMachineData.machinePercent.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Set Up</span>
                    <span className="font-semibold text-gray-700">{selectedMachineData.setupPercent.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Bongkar</span>
                    <span className="font-semibold text-gray-700">{selectedMachineData.bongkarPercent.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-gray-500">Down Time</span>
                    <span className="font-semibold text-gray-700">{selectedMachineData.downPercent.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
