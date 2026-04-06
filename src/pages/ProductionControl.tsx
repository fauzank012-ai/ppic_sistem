import React, { useMemo } from 'react';
// Force Vite recompile
import { Calendar, Settings, Activity, Gauge, Clock, AlertTriangle, FileText, BarChart2, Target, Loader2, Scissors, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

interface ControlSectionProps {
  title: string;
  items: { label: string, icon: React.ReactNode, to?: string, value?: React.ReactNode }[];
}

const ControlSection: React.FC<ControlSectionProps> = ({ title, items }) => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col h-full">
    <h2 className="text-lg font-bold text-gray-900 mb-6">{title}</h2>
    <div className="flex flex-col gap-4 flex-1">
      {items.map((item, idx) => {
        const content = (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-emerald-50 transition-colors cursor-pointer group">
            <div className="flex items-center">
              <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm mr-3 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                {item.icon}
              </div>
              <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-900">{item.label}</span>
            </div>
            {item.value && (
              <div className="text-sm font-bold text-emerald-600 bg-emerald-100/50 px-2 py-1 rounded-md">
                {item.value}
              </div>
            )}
          </div>
        );
        return item.to ? <Link key={idx} to={item.to}>{content}</Link> : <div key={idx}>{content}</div>;
      })}
    </div>
  </div>
);

const normalizeCode = (code: string | undefined | null) => {
  if (!code) return '';
  return code.toString().trim().toUpperCase();
};

export default function ProductionControl() {
  const { refreshKey } = useRefresh();
  const [searchParams] = useSearchParams();
  const periodeParam = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [selectedYear, selectedMonth] = periodeParam.split('-').map(Number);
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const targetPeriode = `${monthNames[selectedMonth - 1]}-${selectedYear}`;

  const { data: prodControlData, isLoading: loading } = useQuery({
    queryKey: ['production-control-data', refreshKey, periodeParam],
    queryFn: async () => {
      const [machines, prodData, materials, coisData, shiftData, downGradeData] = await Promise.all([
        fetchAllRows('master_data_mesin', 'work_center,kategori,target_roll_change,target_yield'),
        fetchAllRows('mb51_prod', 'work_centre_lt,gr_qty_kg,gi_qty_kg,proses,kode_lt,order_no,gr_qty_pcs,tanggal', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('material_master', 'kode_lt,kode_st,pcs_per_jam_cut,kg_per_jam_mill'),
        fetchAllRows('cois_prod', 'tanggal,work_centre,order_no,bongkar,machine_time,down_time,set_up'),
        fetchAllRows('daftar_shift', 'work_center,tanggal,plan_working_hour'),
        fetchAllRows('down_grade', 'qty_dg_kg,qty_reject_kg,work_center', (q) => q.eq('periode', targetPeriode))
      ]);
      return { machines, prodData, materials, coisData, shiftData, downGradeData };
    },
    staleTime: 5 * 60 * 1000,
  });

  const stats = useMemo(() => {
    if (!prodControlData) return {
      rollChangePercent: 0,
      yieldPercent: 0,
      speedPercent: 0,
      weldingPercent: 0,
      planVsActualPercent: 0
    };

    const { machines, prodData, materials, coisData, shiftData, downGradeData } = prodControlData;

    // Get Tubing work centers
    const tubingWorkCenters = new Set(
      (machines || [])
        .filter((m: any) => (m.kategori || '').toLowerCase().includes('tubing'))
        .map((m: any) => m.work_center.trim().toUpperCase())
    );

    // Filter datasets by selected month/year
    const filteredProdData = prodData || [];

    const filteredCoisData = (coisData || []).filter((c: any) => {
      const d = new Date(c.tanggal);
      return d.getMonth() === selectedMonth - 1 && d.getFullYear() === selectedYear;
    });

    const filteredShiftData = (shiftData || []).filter((s: any) => {
      const d = new Date(s.tanggal);
      return d.getMonth() === selectedMonth - 1 && d.getFullYear() === selectedYear;
    });

    let totalTargetRollChange = 0;
    (machines || []).forEach((m: any) => {
      const wc = (m.work_center || '').trim().toUpperCase();
      if (tubingWorkCenters.has(wc)) {
        totalTargetRollChange += Number(m.target_roll_change) || 0;
      }
    });

    let totalActualRollChange = 0;
    const actualRollChanges = new Map();
    filteredCoisData.forEach((c: any) => {
      const wc = (c.work_centre || '').trim().toUpperCase();
      const orderNo = (c.order_no || '').trim();
      const bongkar = Number(c.bongkar) || 0;
      if (tubingWorkCenters.has(wc) && orderNo && bongkar > 0) {
        if (!actualRollChanges.has(wc)) {
          actualRollChanges.set(wc, new Set());
        }
        actualRollChanges.get(wc).add(orderNo);
      }
    });

    actualRollChanges.forEach((orders) => {
      totalActualRollChange += orders.size;
    });

    const rollChangePercent = totalTargetRollChange > 0 ? (totalActualRollChange / totalTargetRollChange) * 100 : 0;

    // Calculate Production Yield (Tubing only)
    let totalGr = 0;
    let totalGi = 0;
    filteredProdData.forEach((row: any) => {
      const wc = (row.work_centre_lt || '').trim().toUpperCase();
      if (tubingWorkCenters.has(wc)) {
        totalGr += Number(row.gr_qty_kg) || 0;
        totalGi += Number(row.gi_qty_kg) || 0;
      }
    });
    const yieldPercent = totalGi > 0 ? (totalGr / totalGi) * 100 : 0;

    // Calculate Speed Achievement (Tubing only)
    const materialMap = new Map();
    (materials || []).forEach((m: any) => {
      if (m.kode_lt) materialMap.set(normalizeCode(m.kode_lt), m);
      if (m.kode_st) materialMap.set(normalizeCode(m.kode_st), m);
    });

    const coisMap = new Map();
    filteredCoisData.forEach((c: any) => {
      const orderNo = (c.order_no || '').trim();
      if (orderNo) {
        if (!coisMap.has(orderNo)) {
          coisMap.set(orderNo, 0);
        }
        coisMap.set(orderNo, coisMap.get(orderNo) + (Number(c.machine_time) || 0));
      }
    });

    const prodByOrder = new Map();
    filteredProdData.forEach((row: any) => {
      const orderNo = (row.order_no || '').trim();
      if (!orderNo) return;
      
      const wc = (row.work_centre_lt || '').trim().toUpperCase();
      if (!tubingWorkCenters.has(wc)) return;

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

    let totalActual = 0;
    let totalTarget = 0;
    
    prodByOrder.forEach((orderData, orderNo) => {
      const { proses, kode, grKg, grPcs } = orderData;
      const mInfo = materialMap.get(normalizeCode(kode)) || {};
      const machineTime = coisMap.get(orderNo) || 0;

      if (proses === 'ST') {
        totalActual += grPcs;
        const targetPcsPerHour = Number(mInfo.pcs_per_jam_cut) || 0;
        totalTarget += (machineTime / 60) * targetPcsPerHour;
      } else {
        totalActual += grKg;
        const targetKgPerHour = Number(mInfo.kg_per_jam_mill) || 0;
        totalTarget += (machineTime / 60) * targetKgPerHour;
      }
    });
    const speedPercent = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;

    // Calculate Welding & Down Time Performance (Tubing only)
    let totalMachineTime = 0;
    let totalAllTime = 0;
    filteredCoisData.forEach((c: any) => {
      const wc = (c.work_centre || '').trim().toUpperCase();
      if (tubingWorkCenters.has(wc)) {
        const mt = Number(c.machine_time) || 0;
        const dt = Number(c.down_time) || 0;
        const st = Number(c.set_up) || 0;
        const bt = Number(c.bongkar) || 0;
        totalMachineTime += mt;
        totalAllTime += (mt + dt + st + bt);
      }
    });
    const weldingPercent = totalAllTime > 0 ? (totalMachineTime / totalAllTime) * 100 : 0;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const isCurrentMonth = periodeParam === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Calculate Plan vs Actual Working Hour (Tubing only)
    let totalActualHours = 0;
    filteredCoisData.forEach((c: any) => {
      // If current month, only include until yesterday
      if (isCurrentMonth && c.tanggal >= todayStr) return;

      const wc = (c.work_centre || '').trim().toUpperCase();
      if (tubingWorkCenters.has(wc)) {
        const totalTime = (Number(c.set_up) || 0) + (Number(c.bongkar) || 0) + (Number(c.machine_time) || 0) + (Number(c.down_time) || 0);
        totalActualHours += (totalTime / 60);
      }
    });

    let totalPlanHours = 0;
    filteredShiftData.forEach((s: any) => {
      // If current month, only include until yesterday
      if (isCurrentMonth && s.tanggal >= todayStr) return;

      const wc = (s.work_center || '').trim().toUpperCase();
      if (tubingWorkCenters.has(wc)) {
        totalPlanHours += (Number(s.plan_working_hour) || 0);
      }
    });
    const planVsActualPercent = totalPlanHours > 0 ? (totalActualHours / totalPlanHours) * 100 : 0;

    // Calculate Productivity Rate (Tubing only)
    let totalTubingProductionKg = 0;
    filteredProdData.forEach((row: any) => {
      const wc = (row.work_centre_lt || '').trim().toUpperCase();
      if (tubingWorkCenters.has(wc)) {
        totalTubingProductionKg += Number(row.gr_qty_kg) || 0;
      }
    });

    let totalTubingTimeMinutes = 0;
    filteredCoisData.forEach((c: any) => {
      const wc = (c.work_centre || '').trim().toUpperCase();
      if (tubingWorkCenters.has(wc)) {
        totalTubingTimeMinutes += (Number(c.set_up) || 0) + (Number(c.bongkar) || 0) + (Number(c.machine_time) || 0) + (Number(c.down_time) || 0);
      }
    });

    const totalTubingHours = totalTubingTimeMinutes / 60;
    const productivityTubing = totalTubingHours > 0 ? (totalTubingProductionKg / 1000) / totalTubingHours : 0;
    
    // Calculate Down Grade & Reject Metric (Tubing only)
    let totalDgRejectKg = 0;
    (downGradeData || []).forEach((row: any) => {
      const wc = (row.work_center || '').trim().toUpperCase();
      if (tubingWorkCenters.has(wc)) {
        totalDgRejectKg += (Number(row.qty_dg_kg) || 0) + (Number(row.qty_reject_kg) || 0);
      }
    });

    let totalGiToDate = 0;
    filteredProdData.forEach((row: any) => {
      const wc = (row.work_centre_lt || '').trim().toUpperCase();
      if (tubingWorkCenters.has(wc)) {
        // If current month, only include until yesterday
        if (isCurrentMonth && row.tanggal >= todayStr) return;
        totalGiToDate += Number(row.gi_qty_kg) || 0;
      }
    });

    const dgRejectPercent = totalGiToDate > 0 ? (totalDgRejectKg / totalGiToDate) * 100 : 0;

    return {
      rollChangePercent,
      yieldPercent,
      speedPercent,
      weldingPercent,
      planVsActualPercent,
      productivityTubing,
      dgRejectPercent
    };
  }, [prodControlData]);

  const { rollChangePercent, yieldPercent, speedPercent, weldingPercent, planVsActualPercent, productivityTubing, dgRejectPercent } = stats;

  const sections = [
    {
      title: 'Production Schedule',
      items: [
        { label: 'Production Schedule Tubing', icon: <Calendar className="w-4 h-4" /> },
        { label: 'Plan vs Act Prod', icon: <Calendar className="w-4 h-4" />, to: '/plan-vs-actual' },
        { 
          label: 'Roll Changing Control', 
          icon: <Settings className="w-4 h-4" />,
          to: '/roll-changing-control',
          value: loading ? <Loader2 className="w-3 h-3 animate-spin" /> : `${rollChangePercent?.toFixed(1) ?? '0.0'}%`
        },
      ]
    },
    {
      title: 'Machine Performance',
      items: [
        { 
          label: 'Production Yield', 
          icon: <Activity className="w-4 h-4" />, 
          to: '/production-yield',
          value: loading ? <Loader2 className="w-3 h-3 animate-spin" /> : `${yieldPercent?.toFixed(2) ?? '0.00'}%`
        },
        { 
          label: 'Productivity Rate', 
          icon: <Activity className="w-4 h-4" />,
          to: '/productivity-rate',
          value: loading ? <Loader2 className="w-3 h-3 animate-spin" /> : `${productivityTubing?.toFixed(2) ?? '0.00'} Ton/Jam`
        },
        { 
          label: 'Speed Achievement', 
          icon: <Gauge className="w-4 h-4" />, 
          to: '/speed-achievement',
          value: loading ? <Loader2 className="w-3 h-3 animate-spin" /> : `${speedPercent?.toFixed(2) ?? '0.00'}%`
        },
        { 
          label: 'Welding & Down Time Performance', 
          icon: <Clock className="w-4 h-4" />, 
          to: '/welding-downtime',
          value: loading ? <Loader2 className="w-3 h-3 animate-spin" /> : `${weldingPercent?.toFixed(2) ?? '0.00'}%`
        },
        { 
          label: 'Plan vs Actual Working Hour', 
          icon: <Target className="w-4 h-4" />, 
          to: '/plan-vs-actual-working-hour',
          value: loading ? <Loader2 className="w-3 h-3 animate-spin" /> : `${planVsActualPercent?.toFixed(1) ?? '0.0'}%`
        },
      ]
    },
    {
      title: 'Production Report',
      items: [
        { label: 'Production Report', icon: <FileText className="w-4 h-4" />, to: '/production-output' },
        { label: 'Downtime Report', icon: <BarChart2 className="w-4 h-4" />, to: '/down-time-report' },
        { 
          label: 'Down Grade & Reject Report', 
          icon: <AlertTriangle className="w-4 h-4" />, 
          to: '/down-grade-reject-report',
          value: loading ? <Loader2 className="w-3 h-3 animate-spin" /> : `${dgRejectPercent?.toFixed(2) ?? '0.00'}%`
        },
      ]
    },
    {
      title: 'Kombinasi Sliting',
      items: [
        { label: 'Kombinasi Sliting', icon: <Scissors className="w-4 h-4" />, to: '/kombinasi-sliting' },
      ]
    },
    {
      title: 'Monitoring Subcont',
      items: [
        { label: 'Monitoring Subcont', icon: <Users className="w-4 h-4" />, to: '/monitoring-subcont' },
      ]
    },
    {
      title: 'Daftar Shift',
      items: [
        { label: 'Daftar Shift', icon: <Clock className="w-4 h-4" />, to: '/daftar-shift' },
      ]
    }
  ];

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sections.map((section, idx) => (
          <ControlSection key={idx} title={section.title} items={section.items} />
        ))}
      </div>
    </div>
  );
}
