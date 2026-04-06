import React, { useMemo, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { BarChart3, TrendingUp, Target, ShoppingCart, AlertTriangle, Gauge, Zap, Activity, Scissors, Layers, CircleDot, LineChart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useMaterialMaster } from '../hooks/useMaterialMaster';

interface PlanningSectionProps {
  title: string;
  items: { label: string, icon: React.ReactNode, to?: string, onClick?: () => void, metric?: React.ReactNode }[];
}

const PlanningSection: React.FC<PlanningSectionProps> = ({ title, items }) => {
  const [searchParams] = useSearchParams();
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <h2 className="text-lg font-bold text-gray-900 mb-4">{title}</h2>
      <div className="space-y-3">
        {items.map((item, idx) => {
          const Content = (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl hover:bg-emerald-50 transition-colors cursor-pointer group">
              <div className="flex items-center">
                <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm mr-3 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  {item.icon}
                </div>
                <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-900">{item.label}</span>
              </div>
              {item.metric && (
                <div className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-md">
                  {item.metric}
                </div>
              )}
            </div>
          );

          const queryString = searchParams.toString();
          const toPath = item.to ? (queryString ? `${item.to}?${queryString}` : item.to) : undefined;

          return toPath ? (
            <Link key={idx} to={toPath} className="block">
              {Content}
            </Link>
          ) : (
            <div key={idx} onClick={item.onClick}>{Content}</div>
          );
        })}
      </div>
    </div>
  );
};

export default function Planning() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedPeriode = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const { data: materials = [], isLoading: materialsLoading } = useMaterialMaster();
  
  const { data: sos = [], isLoading: sosLoading } = useQuery({
    queryKey: ['sales_orders', 'all'],
    queryFn: () => fetchAllRows('sales_orders', 'customer,kode_st,qty_order_kg,periode').catch(() => fetchAllRows('sales_orders', 'customer,kode_st,qty_order_kg')),
    staleTime: 5 * 60 * 1000,
  });

  const { data: looData = [], isLoading: looLoading } = useQuery({
    queryKey: ['loo_data', 'all'],
    queryFn: () => fetchAllRows('loo_data', 'customer,kode_st,sisa_loo_kg,sisa_order_kg').catch(() => fetchAllRows('loo_data', 'customer,kode_st,sisa_loo_kg,sisa_order_kg')),
    staleTime: 5 * 60 * 1000,
  });

  const { data: forecasts = [], isLoading: forecastsLoading } = useQuery({
    queryKey: ['forecasts'],
    queryFn: () => fetchAllRows('forecasts', 'customer,kode_st,qty_forecast_kg,periode').catch(() => fetchAllRows('forecasts', 'customer,kode_st,qty_forecast_kg')),
    staleTime: 5 * 60 * 1000,
  });

  const { data: reportViewMat = [], isLoading: reportLoading } = useQuery({
    queryKey: ['report_view_mat_summary', selectedPeriode],
    queryFn: () => {
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const [year, month] = selectedPeriode.split('-');
      const formattedPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;
      return fetchAllRows('report_view_mat', 'status_order,work_center_lt,work_center_st,order_kg,sisa_order_kg,loo_kg,forecast_kg,sisa_order_pcs,loo_pcs,forecast_pcs,kg_per_jam_mill,pcs_per_jam_cut', (q) => q.eq('periode', formattedPeriode));
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: mesinData = [], isLoading: mesinLoading } = useQuery({
    queryKey: ['master_data_mesin_summary'],
    queryFn: () => fetchAllRows('master_data_mesin', 'work_center,jumlah_shift,hari_kerja_per_minggu,efisiensi,kategori'),
    staleTime: 5 * 60 * 1000,
  });

  const { data: coisData = [], isLoading: coisLoading } = useQuery({
    queryKey: ['cois_prod_summary'],
    queryFn: () => {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      return fetchAllRows('cois_prod', 'tanggal,work_centre,set_up,bongkar,machine_time,down_time', (q) => q.gte('tanggal', startOfMonth));
    },
    staleTime: 5 * 60 * 1000,
  });

  const loading = materialsLoading || sosLoading || forecastsLoading || looLoading || reportLoading || mesinLoading || coisLoading;

  const metrics = useMemo(() => {
    if (loading) return { varianceTon: 0, accuracy: 0, totalSoTon: 0, totalBackorderTon: 0, ltLoadCapacity: 0, tubingUtilization: 0, bottleneckCount: 0 };

    const normalizeCust = (s: string) => (s || '').trim().toUpperCase().replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '').replace(/[^A-Z0-9]/g, '');
    const weightsMap = new Map<string, number>();
    materials.forEach((m: any) => {
      const custKey = normalizeCust(m.customer);
      const stKey = (m.kode_st || '').trim().toLowerCase();
      weightsMap.set(`${custKey}|${stKey}`, m.berat_per_pcs || 0);
    });

    const customerMap = new Map<string, { forecast: number, so: number }>();
    let totalSoKg = 0;
    let totalBackorderKg = 0;

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const [year, month] = selectedPeriode.split('-');
    const currentMonthName = monthNames[parseInt(month, 10) - 1];
    const currentYear = parseInt(year, 10);
    const currentPeriode = `${currentMonthName}-${currentYear}`;

    forecasts.forEach((f: any) => {
      if (f.periode === currentPeriode || f.periode?.startsWith(currentMonthName)) {
        const custKey = normalizeCust(f.customer);
        const stKey = (f.kode_st || '').trim().toLowerCase();
        const weight = weightsMap.get(`${custKey}|${stKey}`) || 0;
        const forecastQtyKg = f.qty_forecast_kg || ((f.qty_pcs || 0) * weight);
        
        if (!customerMap.has(custKey)) customerMap.set(custKey, { forecast: 0, so: 0 });
        customerMap.get(custKey)!.forecast += forecastQtyKg;
      }
    });

    sos.forEach((s: any) => {
      if (s.periode === currentPeriode || s.periode?.startsWith(currentMonthName)) {
        const custKey = normalizeCust(s.customer);
        const stKey = (s.kode_st || '').trim().toLowerCase();
        const weight = weightsMap.get(`${custKey}|${stKey}`) || 0;
        const soQtyKg = s.qty_order_kg || ((s.qty_order_pcs || 0) * weight);
        
        if (!customerMap.has(custKey)) customerMap.set(custKey, { forecast: 0, so: 0 });
        customerMap.get(custKey)!.so += soQtyKg;

        totalSoKg += soQtyKg;
      }
    });

    looData.forEach((l: any) => {
      // If looData has periode, filter by it. If not, assume it's current.
      if (!l.periode || l.periode === currentPeriode || l.periode?.startsWith(currentMonthName)) {
        totalBackorderKg += (l.sisa_loo_kg || 0) + (l.sisa_order_kg || 0);
      }
    });

    let grandTotalForecast = 0;
    let grandTotalSo = 0;

    Array.from(customerMap.values()).forEach(c => {
      if (c.forecast > 0) {
        grandTotalForecast += c.forecast;
        grandTotalSo += c.so;
      }
    });

    const varianceTon = Math.round((grandTotalSo - grandTotalForecast) / 1000);
    const accuracy = grandTotalForecast > 0
      ? Math.max(0, (1 - Math.abs(grandTotalSo - grandTotalForecast) / grandTotalForecast)) * 100
      : 0;
    const totalSoTon = Math.round(totalSoKg / 1000);
    const totalBackorderTon = Math.round(totalBackorderKg / 1000);

    // Calculate LT Load vs Capacity
    const calculateCapacityHours = (startDate: Date, endDate: Date, shift: number, workingDaysPerWeek: number) => {
      let normalHours = 0;
      const current = new Date(startDate);
      current.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      while (current <= end) {
        const dayOfWeek = current.getDay();
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
        current.setDate(current.getDate() + 1);
      }
      return normalHours;
    };

    const today = new Date();
    const isCurrentMonth = today.getFullYear() === currentYear && today.getMonth() === parseInt(month, 10) - 1;
    const currentDay = isCurrentMonth ? today.getDate() : new Date(currentYear, parseInt(month, 10), 0).getDate();
    
    const startOfMonth = new Date(currentYear, parseInt(month, 10) - 1, 1);
    const endOfMonth = new Date(currentYear, parseInt(month, 10), 0);

    const mesinMap = new Map<string, any>();
    mesinData.forEach((m: any) => {
      if (m.work_center) mesinMap.set(m.work_center.trim().toUpperCase(), m);
    });

    // Calculate Tubing Load vs Capacity (Monthly Mode)
    const calcStartDate = startOfMonth;
    const calcEndDate = endOfMonth;

    const machineStats = new Map<string, { 
      lt: { loading: number, rates: number[] }, 
      st: { loading: number, rates: number[] } 
    }>();

    reportViewMat.forEach((row: any) => {
      // LT Process
      if (row.work_center_lt) {
        const key = row.work_center_lt.trim().toUpperCase();
        if (!machineStats.has(key)) machineStats.set(key, { lt: { loading: 0, rates: [] }, st: { loading: 0, rates: [] } });
        const stats = machineStats.get(key)!;
        
        const sisa = Number(row.sisa_order_kg) || 0;
        const loo = Number(row.loo_kg) || 0;
        const forecast = Number(row.forecast_kg) || 0;
        
        const loading = loo + Math.max(forecast, sisa);
        stats.lt.loading += loading;
        
        const rate = Number(row.kg_per_jam_mill) || 0;
        if (rate > 0) stats.lt.rates.push(rate);
      }

      // ST Process
      if (row.work_center_st) {
        const key = row.work_center_st.trim().toUpperCase();
        if (!machineStats.has(key)) machineStats.set(key, { lt: { loading: 0, rates: [] }, st: { loading: 0, rates: [] } });
        const stats = machineStats.get(key)!;
        
        const sisa = Number(row.sisa_order_pcs) || 0;
        const loo = Number(row.loo_pcs) || 0;
        const forecast = Number(row.forecast_pcs) || 0;
        
        const loading = loo + Math.max(forecast, sisa);
        stats.st.loading += loading;
        
        const rate = Number(row.pcs_per_jam_cut) || 0;
        if (rate > 0) stats.st.rates.push(rate);
      }
    });

    let totalTubingLoading = 0;
    let totalTubingCapacity = 0;
    let bottleneckCount = 0;

    mesinMap.forEach((mesin, wcKey) => {
      const kategori = (mesin.kategori || '').trim().toUpperCase();
      if (kategori !== 'TUBING') return;

      const stats = machineStats.get(wcKey);
      if (!stats) return;

      const efisiensi = Number(mesin.efisiensi) || 1.0;
      const capacityHours = calculateCapacityHours(calcStartDate, calcEndDate, mesin.jumlah_shift || 0, mesin.hari_kerja_per_minggu || 0);

      const hasLT = stats.lt.rates.length > 0 || stats.lt.loading > 0;
      const hasST = stats.st.rates.length > 0 || stats.st.loading > 0;
      
      let useLT = true; // Prefer LT for Tubing
      if (!hasLT && !hasST) return;
      if (useLT && !hasLT) useLT = false;
      if (!useLT && !hasST) useLT = true;

      const s = useLT ? stats.lt : stats.st;
      const avgRate = s.rates.length > 0 ? s.rates.reduce((a, b) => a + b, 0) / s.rates.length : 0;

      const machineLoading = s.loading;
      const machineCapacity = capacityHours * avgRate * efisiensi;

      totalTubingLoading += machineLoading;
      totalTubingCapacity += machineCapacity;

      if (machineCapacity > 0 && (machineLoading / machineCapacity) * 100 > 100) {
        bottleneckCount++;
      }
    });

    const tubingLoadCapacity = totalTubingCapacity > 0 ? (totalTubingLoading / totalTubingCapacity) * 100 : 0;

    // Calculate Tubing Line Utilization (Monthly)
    const monthsSet = new Set<string>();
    coisData.forEach((row: any) => {
      if (row.tanggal) {
        const d = new Date(row.tanggal);
        if (!isNaN(d.getTime())) {
          monthsSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
        }
      }
    });

    if (monthsSet.size === 0) {
      const d = new Date();
      monthsSet.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    }

    let totalJamTersedia = 0;
    monthsSet.forEach(monthStr => {
      const [year, month] = monthStr.split('-').map(Number);
      const daysInMonth = new Date(year, month, 0).getDate();
      const baseHours = daysInMonth * 24;
      const rollChangeHours = (daysInMonth / 7) * 5;
      const preventiveHours = 8;
      const holidayHours = month === 3 ? (10 * 24) : 0;
      totalJamTersedia += (baseHours - rollChangeHours - preventiveHours - holidayHours);
    });

    const tubingWcs = new Set<string>();
    mesinData.forEach((m: any) => {
      if ((m.kategori || '').trim().toUpperCase() === 'TUBING') {
        tubingWcs.add((m.work_center || '').trim().toUpperCase());
      }
    });

    const tubingMinutesMap = new Map<string, number>();
    coisData.forEach((row: any) => {
      const wc = (row.work_centre || '').trim().toUpperCase();
      if (tubingWcs.has(wc)) {
        const mins = (Number(row.bongkar) || 0) + (Number(row.set_up) || 0) + (Number(row.machine_time) || 0) + (Number(row.down_time) || 0);
        tubingMinutesMap.set(wc, (tubingMinutesMap.get(wc) || 0) + mins);
      }
    });

    let totalTubingUtilization = 0;
    if (tubingWcs.size > 0 && totalJamTersedia > 0) {
      let sumUtilization = 0;
      tubingWcs.forEach(wc => {
        const mins = tubingMinutesMap.get(wc) || 0;
        const hours = mins / 60;
        sumUtilization += (hours / totalJamTersedia) * 100;
      });
      totalTubingUtilization = sumUtilization / tubingWcs.size;
    }

    return { varianceTon, accuracy, totalSoTon, totalBackorderTon, tubingLoadCapacity, tubingUtilization: totalTubingUtilization, bottleneckCount };
  }, [loading, materials, sos, forecasts, looData, reportViewMat, mesinData, coisData, selectedPeriode]);

  const sections = [
    {
      title: 'Demand Planning',
      items: [
        { 
          label: 'Forecast vs Actual', 
          icon: <BarChart3 className="w-4 h-4" />, 
          to: '/forecast-vs-actual',
          metric: loading ? '...' : `${metrics.varianceTon > 0 ? '+' : ''}${metrics.varianceTon.toLocaleString('id-ID')} Ton`
        },
        { 
          label: 'Forecast Accuracy', 
          icon: <Target className="w-4 h-4" />, 
          to: '/forecast-accuracy',
          metric: loading ? '...' : `${metrics.accuracy.toFixed(1)}%`
        },
        { 
          label: 'Forecast Analysis', 
          icon: <LineChart className="w-4 h-4" />, 
          to: '/forecast-analysis'
        },
      ]
    },
    {
      title: 'Sales & Order Management',
      items: [
        { 
          label: 'Sales Order (SO)', 
          icon: <ShoppingCart className="w-4 h-4" />, 
          to: '/sales-order',
          metric: loading ? '...' : `${metrics.totalSoTon.toLocaleString('id-ID')} Ton`
        },
        { 
          label: 'Backorder', 
          icon: <AlertTriangle className="w-4 h-4" />, 
          to: '/backorder',
          metric: loading ? '...' : `${metrics.totalBackorderTon.toLocaleString('id-ID')} Ton`
        },
        { 
          label: 'Order & Delivery Trend', 
          icon: <TrendingUp className="w-4 h-4" />,
          to: '/demand-trend'
        },
      ]
    },
    {
      title: 'Capacity Planning',
      items: [
        { 
          label: 'Load vs Capacity', 
          icon: <Gauge className="w-4 h-4" />, 
          to: '/loading-vs-capacity',
          metric: loading ? '...' : `${metrics.tubingLoadCapacity.toFixed(1)}%`
        },
        { 
          label: 'Bottleneck Machine', 
          icon: <Zap className="w-4 h-4" />, 
          to: '/bottleneck-machine',
          metric: loading ? '...' : `${metrics.bottleneckCount} Mesin`
        },
        { 
          label: 'Line Utilization', 
          icon: <Activity className="w-4 h-4" />, 
          to: '/line-utilization',
          metric: loading ? '...' : `${metrics.tubingUtilization.toFixed(1)}%`
        },
      ]
    },
    {
      title: 'Material Requirement',
      items: [
        { label: 'Strip Requirement', icon: <Layers className="w-4 h-4" />, to: '/material-requirement?type=strip' },
        { label: 'Coil Requirement', icon: <CircleDot className="w-4 h-4" />, to: '/material-requirement?type=coil' }
      ]
    }
  ];

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sections.map((section, idx) => (
          <PlanningSection key={idx} title={section.title} items={section.items} />
        ))}
      </div>
    </div>
  );
}
