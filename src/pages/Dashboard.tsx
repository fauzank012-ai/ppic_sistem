import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
// Force re-build
import { ShieldCheck, Layers, Box, BarChart3, Truck, RefreshCw, Calendar, TrendingUp, Bell, ChevronLeft, ChevronRight, X, Percent, Clock, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, LineChart, Line, LabelList, ReferenceLine } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows, supabase } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { MetricCard } from '../components/MetricCard';
import { DeliveryCard } from '../components/DeliveryCard';
import { ProductionCard } from '../components/ProductionCard';

const DashboardSkeleton = () => (
  <div className="p-4 space-y-4 bg-[#FDFBF7] min-h-screen animate-pulse">
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-32 bg-gray-200 rounded-3xl" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-18 gap-4">
      <div className="lg:row-span-2 xl:col-span-4 h-[300px] bg-gray-200 rounded-3xl" />
      <div className="xl:col-span-7 h-[300px] bg-gray-200 rounded-3xl" />
      <div className="xl:col-span-7 h-[300px] bg-gray-200 rounded-3xl" />
    </div>
  </div>
);

const CustomYieldTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isST = data.category === 'Haven';
    const unit = isST ? 'Pcs' : 'Kg';
    
    return (
      <div className="bg-white p-4 border border-gray-100 shadow-xl rounded-2xl">
        <p className="text-sm font-bold text-gray-900 mb-2">{label}</p>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#8B5CF6]" />
              <span className="text-xs text-gray-500 font-medium">Aktual Yield:</span>
            </div>
            <span className="text-xs font-black text-[#8B5CF6]">{data.yieldPercent.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#EF4444]" />
              <span className="text-xs text-gray-500 font-medium">Target Yield:</span>
            </div>
            <span className="text-xs font-black text-[#EF4444]">{data.targetYield.toFixed(1)}%</span>
          </div>
          <div className="border-t border-gray-50 my-2 pt-2 space-y-1">
            <div className="flex justify-between items-center gap-8">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Aktual (GR)</span>
              <span className="text-xs font-bold text-gray-700">{Math.round(data.grKg).toLocaleString()} {unit}</span>
            </div>
            <div className="flex justify-between items-center gap-8">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Target (GI)</span>
              <span className="text-xs font-bold text-gray-700">{Math.round(data.giKg).toLocaleString()} {unit}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

const normalizeCust = (s: string) => {
  if (!s) return '';
  let res = s.trim().toUpperCase();
  // Strip common Indonesian company prefixes at the start
  res = res.replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '');
  // Then normalize alphanumeric
  return res.replace(/[^A-Z0-9]/g, '').toLowerCase();
};

export default function Dashboard({ userRole }: { userRole?: string | null }) {
  const [searchParams] = useSearchParams();
  const [currentPageDoc, setCurrentPageDoc] = useState(0);
  const [docViewMode, setDocViewMode] = useState<'graph' | 'report'>('graph');
  const [currentPageStock, setCurrentPageStock] = useState(0);
  const [docData, setDocData] = useState<any[]>([]);
  const [stockData, setStockData] = useState<any[]>([]);
  const [drillDownData, setDrillDownData] = useState<Record<string, any[]>>({});
  const [selectedCustomer, setSelectedCustomer] = useState<{name: string, originalName: string, custKey?: string} | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isP3ModalOpen, setIsP3ModalOpen] = useState(false);
  const [isDocReportModalOpen, setIsDocReportModalOpen] = useState(false);
  const [p3Data, setP3Data] = useState<any[]>([]);
  const [dailyP3DeliveryData, setDailyP3DeliveryData] = useState<any[]>([]);
  const [p3DrillDownData, setP3DrillDownData] = useState<Record<string, any[]>>({});
  const [isP3DetailModalOpen, setIsP3DetailModalOpen] = useState(false);
  const [selectedP3Customer, setSelectedP3Customer] = useState<{name: string, originalName: string} | null>(null);
  const [p3Totals, setP3Totals] = useState({ p3: 0, delivery: 0, percent: 0 });
  const [totalDeliveryAmount, setTotalDeliveryAmount] = useState(0);
  const [isFcsModalOpen, setIsFcsModalOpen] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [availabilityByJenis, setAvailabilityByJenis] = useState<any[]>([]);
  const [isDeadStockModalOpen, setIsDeadStockModalOpen] = useState(false);
  const [selectedDeadStockType, setSelectedDeadStockType] = useState<'FG' | 'WIP' | 'WIP LT' | 'ALL'>('ALL');
  const [deadStockDetails, setDeadStockDetails] = useState<any[]>([]);
  const [fcsData, setFcsData] = useState<any[]>([]);
  const [fcsDrillDownData, setFcsDrillDownData] = useState<Record<string, any[]>>({});
  const [isFcsDetailModalOpen, setIsFcsDetailModalOpen] = useState(false);
  const [selectedFcsCustomer, setSelectedFcsCustomer] = useState<{name: string, originalName: string} | null>(null);
  const [fcsTotals, setFcsTotals] = useState({ so: 0, forecast: 0, percent: 0 });
  const [modalPage, setModalPage] = useState(0);
  const [modalViewType, setModalViewType] = useState<'total' | 'fg' | 'wip'>('total');
  const [modalDisplayMode, setModalDisplayMode] = useState<'graph' | 'report'>('graph');
  const modalItemsPerPage = 10;
  const [slowMovingStock, setSlowMovingStock] = useState({ 
    totalKg: 0, 
    count: 0,
    byJenisStock: [] as { name: string, value: number, color: string }[],
    byLokasiGudang: [] as { name: string, value: number, color: string }[],
    byUnfifo: [] as { name: string, value: number, color: string }[],
    byStatusStock: [] as { name: string, value: number, color: string }[]
  });
  const [isSlowMovingModalOpen, setIsSlowMovingModalOpen] = useState(false);
  const [slowMovingPage, setSlowMovingPage] = useState(0);
  const slowMovingItemsPerPage = 3;
  const [slowMovingByJenis, setSlowMovingByJenis] = useState<any[]>([]);
  const [deadStockComposition, setDeadStockComposition] = useState({ fgKg: 0, wipKg: 0, wipLtKg: 0, totalKg: 0 });
  const [alertsCount, setAlertsCount] = useState(0);
  const [isAlertsModalOpen, setIsAlertsModalOpen] = useState(false);
  const [alertItems, setAlertItems] = useState<any[]>([]);
  const [yieldTubingPercent, setYieldTubingPercent] = useState(0);
  const [isYieldModalOpen, setIsYieldModalOpen] = useState(false);
  const [isYieldDetailModalOpen, setIsYieldDetailModalOpen] = useState(false);
  const [isOrderDowntimeModalOpen, setIsOrderDowntimeModalOpen] = useState(false);
  const [selectedOrderNo, setSelectedOrderNo] = useState<string | null>(null);
  const [selectedDowntimeCategory, setSelectedDowntimeCategory] = useState<string>('All');
  const [isSpeedDetailModalOpen, setIsSpeedDetailModalOpen] = useState(false);
  const [selectedWorkCenter, setSelectedWorkCenter] = useState<any>(null);
  const [selectedSpeedWorkCenter, setSelectedSpeedWorkCenter] = useState<any>(null);
  const [processFilter, setProcessFilter] = useState<'LT' | 'ST'>(userRole === 'ppicst' ? 'ST' : 'LT');
  const [yieldByWorkCenterLT, setYieldByWorkCenterLT] = useState<any[]>([]);
  const [yieldByWorkCenterST, setYieldByWorkCenterST] = useState<any[]>([]);
  const [yieldCategoryFilter, setYieldCategoryFilter] = useState<'Tubing' | 'Haven' | 'Others'>('Tubing');
  const [processCategoryFilter, setProcessCategoryFilter] = useState<'Tubing' | 'Haven' | 'Others'>('Tubing');
  const [minMaxCount, setMinMaxCount] = useState(0);
  const [availabilityData, setAvailabilityData] = useState({ percent: 0, ok: 0, under: 0, over: 0, total: 0 });
  const [dashboardCalcMode, setDashboardCalcMode] = useState<'Monthly' | 'Current'>('Monthly');
  const [loadingVsCapacityLT, setLoadingVsCapacityLT] = useState({ 
    loading: 0, 
    capacity: 0, 
    percent: 0,
    scenarios: {
      normal: 0,
      long: 0,
      otWeekend: 0
    }
  });
  const [mb51MillData, setMb51MillData] = useState<any[]>([]);
  const [mesinDataState, setMesinDataState] = useState<any[]>([]);

  const slowMovingCards = useMemo(() => {
    const cards: any[] = [];
    
    // 1. Berdasarkan Jenis Stock (Static)
    cards.push({ type: 'static-jenis' });
    
    // 2. Berdasarkan Lokasi Gudang (Static)
    cards.push({ type: 'static-lokasi' });
    
    // 3. Berdasarkan Status Stock (Static) - Now based on PASM=SLOW breakdown
    cards.push({ type: 'static-status' });
    
    // 4. Berdasarkan Unfifo (Static)
    cards.push({ type: 'static-unfifo' });
    
    // 5. Dynamic items (Material Categories)
    const sortedDynamic = [...slowMovingByJenis].sort((a, b) => b.totalKg - a.totalKg);
    sortedDynamic.forEach(item => {
      cards.push({ type: 'dynamic', data: item });
    });
    
    return cards;
  }, [slowMovingByJenis]);
  const [mesinYieldData, setMesinYieldData] = useState<Map<string, number>>(new Map());
  const [processTimeLT, setProcessTimeLT] = useState<any[]>([]);
  const [processTimeST, setProcessTimeST] = useState<any[]>([]);
  const [ltWeldingDownTime, setLtWeldingDownTime] = useState({ weldingPercent: 0, downTimePercent: 0 });
  const [isWeldingModalOpen, setIsWeldingModalOpen] = useState(false);
  const [isDownTimeModalOpen, setIsDownTimeModalOpen] = useState(false);
  const [isWeldingDetailModalOpen, setIsWeldingDetailModalOpen] = useState(false);
  const [isDownTimeDetailModalOpen, setIsDownTimeDetailModalOpen] = useState(false);
  const [isProcessTimeDetailModalOpen, setIsProcessTimeDetailModalOpen] = useState(false);
  const [selectedWeldingWC, setSelectedWeldingWC] = useState<string | null>(null);
  const [selectedDownTimeWC, setSelectedDownTimeWC] = useState<string | null>(null);
  const [selectedProcessTimeWC, setSelectedProcessTimeWC] = useState<string | null>(null);
  const [coisProdData, setCoisProdData] = useState<any[]>([]);
  const [p3VsStockData, setP3VsStockData] = useState<any[]>([]);
  const [p3VsStockPage, setP3VsStockPage] = useState(0);
  const [p3VsStockMode, setP3VsStockMode] = useState<'Volume' | 'Percent'>('Volume');
  const [materialInfoMapState, setMaterialInfoMapState] = useState<Map<string, any>>(new Map());
  const [coisMapState, setCoisMapState] = useState<Map<string, any>>(new Map());
  const [isLoadingVsCapacityModalOpen, setIsLoadingVsCapacityModalOpen] = useState(false);
  const normalizeCode = (s: string) => (s || '').replace(/\s+/g, '').toLowerCase();

  const weldingDetails = useMemo(() => {
    if (!selectedWeldingWC) return [];
    return coisProdData
      .filter(row => 
        (row.work_centre || 'Unknown').trim() === selectedWeldingWC && 
        (row.proses ? row.proses.toString().trim().toUpperCase() : 'LT') === 'LT'
      )
      .map(row => {
        const materialInfo = materialInfoMapState.get(normalizeCode(row.material || ''));
        const machineTime = Number(row.machine_time) || 0;
        const downTime = Number(row.down_time) || 0;
        const setUpTime = Number(row.set_up_time) || 0;
        const bongkarTime = Number(row.bongkar_time) || 0;
        const totalTime = machineTime + downTime + setUpTime + bongkarTime;
        const weldingPercent = totalTime > 0 ? (machineTime / totalTime) * 100 : 0;
        
        return {
          ...row,
          d1: materialInfo?.d1 || '-',
          d2: materialInfo?.d2 || '-',
          dia: materialInfo?.dia || '-',
          thick: materialInfo?.thick || '-',
          gr_qty_kg: row.gr_qty_kg || 0,
          weldingPercent
        };
      })
      .sort((a, b) => a.weldingPercent - b.weldingPercent);
  }, [selectedWeldingWC, coisProdData, materialInfoMapState]);

  const downTimeDetails = useMemo(() => {
    if (!selectedDownTimeWC) return [];
    return coisProdData
      .filter(row => 
        (row.work_centre || 'Unknown').trim() === selectedDownTimeWC && 
        (row.proses ? row.proses.toString().trim().toUpperCase() : 'LT') === 'LT'
      )
      .map(row => {
        const materialInfo = materialInfoMapState.get(normalizeCode(row.material || ''));
        const machineTime = Number(row.machine_time) || 0;
        const downTime = Number(row.down_time) || 0;
        const setUpTime = Number(row.set_up_time) || 0;
        const bongkarTime = Number(row.bongkar_time) || 0;
        const totalTime = machineTime + downTime + setUpTime + bongkarTime;
        const downTimePercent = totalTime > 0 ? (downTime / totalTime) * 100 : 0;
        
        return {
          ...row,
          d1: materialInfo?.d1 || '-',
          d2: materialInfo?.d2 || '-',
          dia: materialInfo?.dia || '-',
          thick: materialInfo?.thick || '-',
          gr_qty_kg: row.gr_qty_kg || 0,
          downTimePercent
        };
      })
      .sort((a, b) => b.downTimePercent - a.downTimePercent);
  }, [selectedDownTimeWC, coisProdData, materialInfoMapState]);

  const processTimeDetails = useMemo(() => {
    if (!selectedProcessTimeWC) return [];
    
    const itemMap = new Map<string, { 
      order_no: string,
      material: string, 
      dimensi: string,
      set_up: number, 
      bongkar: number, 
      machine_time: number, 
      down_time: number 
    }>();

    coisProdData
      .filter(row => 
        (row.work_centre || 'Unknown').trim() === selectedProcessTimeWC && 
        (row.proses ? row.proses.toString().trim().toUpperCase() : 'LT') === processFilter
      )
      .forEach(row => {
        const orderNo = row.order_no || '-';
        const material = row.material || 'Unknown';
        const key = `${orderNo}|${material}`;
        if (!itemMap.has(key)) {
          const materialInfo = materialInfoMapState.get(normalizeCode(material));
          itemMap.set(key, {
            order_no: orderNo,
            material,
            dimensi: materialInfo?.dimensi || '-',
            set_up: 0,
            bongkar: 0,
            machine_time: 0,
            down_time: 0
          });
        }
        const itemData = itemMap.get(key)!;
        itemData.set_up += Number(row.set_up) || 0;
        itemData.bongkar += Number(row.bongkar) || 0;
        itemData.machine_time += Number(row.machine_time) || 0;
        itemData.down_time += Number(row.down_time) || 0;
      });

    return Array.from(itemMap.values()).map(item => {
      const total = item.set_up + item.bongkar + item.machine_time + item.down_time;
      return {
        ...item,
        setUpPercent: total > 0 ? (item.set_up / total) * 100 : 0,
        bongkarPercent: total > 0 ? (item.bongkar / total) * 100 : 0,
        machinePercent: total > 0 ? (item.machine_time / total) * 100 : 0,
        downTimePercent: total > 0 ? (item.down_time / total) * 100 : 0,
        totalTime: total
      };
    }).sort((a, b) => a.machinePercent - b.machinePercent);
  }, [selectedProcessTimeWC, coisProdData, materialInfoMapState, processFilter]);

  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(0);
  const { refreshKey } = useRefresh();
  const itemsPerPage = 10;

  // React Query for data fetching
  const { data: primaryData, isLoading: primaryLoading, refetch: refetchPrimary } = useQuery({
    queryKey: ['dashboard-primary', refreshKey, searchParams.get('periode')],
    queryFn: async () => {
      const selectedPeriode = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const [yearStr, monthStr] = selectedPeriode.split('-');
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const targetPeriode = `${monthNames[month - 1]}-${year}`;

      // Calculate 3 month periods for deliveries (current month + 2 previous months)
      const deliveryPeriods = [];
      for (let i = 0; i < 3; i++) {
        let m = month - i;
        let y = year;
        if (m <= 0) {
          m += 12;
          y -= 1;
        }
        deliveryPeriods.push(`${monthNames[m - 1]}-${y}`);
      }

      // Fetch in smaller chunks to avoid lock errors, but parallelize in batches
      const [materials] = await Promise.all([
        fetchAllRows('material_master', 'id,customer,short_name_customer,spec,kode_st,kode_lt,berat_per_pcs,dimensi,alternative_kodes_st,alternative_kodes_lt,status_order,jenis_pipa,d1,d2,dia,thick,pcs_per_jam_cut,kg_per_jam_mill,moq').catch(() => [])
      ]);
      
      const [deliveries, stoks, p3s, minMaxStock, salesOrders, forecasts, looData, reportViewMat] = await Promise.all([
        fetchAllRows('deliveries', 'customer,kode_st,qty_delivery_pcs,qty_delivery_kg,tanggal_delivery,periode', (q) => q.in('periode', deliveryPeriods)).catch(() => []),
        fetchAllRows('stocks', 'kode_material,wip_lt_pcs,wip_st_pcs,fg_st_pcs,fg_lt_pcs,wip_lt_kg,wip_st_kg,fg_st_kg,fg_lt_kg,pasm,grade,created_at,jenis_stock,lokasi_gudang,unfifo').catch(() => []),
        fetchAllRows('p3_data', 'customer,kode_st,qty_p3_pcs,qty_p3_kg,tanggal_delivery').catch(() => []),
        fetchAllRows('min_max_stock', 'kode_st,kode_lt,min_stock,max_stock,jenis').catch(() => []),
        fetchAllRows('sales_orders', 'customer,kode_st,qty_order_pcs,qty_order_kg', (q) => q.eq('periode', targetPeriode)).catch(() => []),
        fetchAllRows('forecasts', 'customer,kode_st,qty_pcs,qty_forecast_kg', (q) => q.eq('periode', targetPeriode)).catch(() => []),
        fetchAllRows('loo_data', 'customer,kode_st,sisa_loo_pcs,sisa_loo_kg,sisa_order_pcs,sisa_order_kg').catch(() => []),
        fetchAllRows('report_view_mat', '*').catch(() => [])
      ]);

      return { materials, deliveries, stoks, p3s, minMaxStock, salesOrders, forecasts, looData, reportViewMat };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: productionData, isLoading: productionLoading, refetch: refetchProduction } = useQuery({
    queryKey: ['dashboard-production', refreshKey, searchParams.get('periode')],
    queryFn: async () => {
      const selectedPeriode = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const [year, month] = selectedPeriode.split('-');
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const targetPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

      const [mesinData, mb51Mill, coisProd] = await Promise.all([
        fetchAllRows('master_data_mesin', 'work_center,jumlah_shift,hari_kerja_per_minggu,efisiensi,target_yield,kategori').catch(() => []),
        fetchAllRows('mb51_prod', 'work_centre_lt,order_no,customer,kode_lt,proses,gr_qty_pcs,gr_qty_kg,gi_qty_kg,periode,tanggal', (q) => q.eq('periode', targetPeriode)).catch(() => []),
        fetchAllRows('cois_prod', 'work_centre,tanggal,machine_time,down_time,set_up,bongkar,order_no,proses,periode', (q) => q.eq('periode', targetPeriode)).catch(() => [])
      ]);
      return { mesinData, mb51Mill, coisProd };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: downtimeData, isLoading: loadingDowntime } = useQuery({
    queryKey: ['order-downtime', selectedOrderNo, refreshKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('down_time')
        .select('*')
        .eq('order_no', (selectedOrderNo || '').trim());
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedOrderNo && isOrderDowntimeModalOpen,
  });

  useEffect(() => {
    if (primaryData) {
      let { materials, deliveries, stoks, p3s, minMaxStock, salesOrders, forecasts, looData, reportViewMat: dbReportViewMat } = primaryData;
      let { mesinData, mb51Mill, coisProd } = productionData || { mesinData: [], mb51Mill: [], coisProd: [] };

      try {
        setLoading(true);
        
        const today = new Date();
        let currentYear = today.getFullYear();
        let currentMonth = today.getMonth();
        const currentDay = today.getDate();

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        yesterday.setHours(23, 59, 59, 999);

        let latestStockDate: string | null = null;
        (stoks || []).forEach((s: any) => {
          const date = s.created_at ? s.created_at.split('T')[0] : null;
          if (date && (!latestStockDate || date > latestStockDate)) {
            latestStockDate = date;
          }
        });

        const selectedPeriode = searchParams.get('periode');
        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        
        let targetPeriode = '';
        if (selectedPeriode && selectedPeriode !== 'All') {
          const [year, month] = selectedPeriode.split('-');
          if (year && month) {
            currentYear = parseInt(year, 10);
            currentMonth = parseInt(month, 10) - 1;
            targetPeriode = `${monthNames[currentMonth]}-${currentYear}`;
          }
        } else {
          targetPeriode = `${monthNames[currentMonth]}-${currentYear}`;
        }

        // Reconstruct reportViewMat in memory to bypass broken database view
        const reportViewMat: any[] = [];
        
        const deliveryAggMap = new Map<string, number>();
        let totalDeliveryKgForTargetPeriode = 0;
        
        (deliveries || []).forEach((d: any) => {
          const cust = normalizeCust(d.customer);
          const st = normalizeCode(d.kode_st);
          const key = `${cust}|${st}`;
          deliveryAggMap.set(key, (deliveryAggMap.get(key) || 0) + (Number(d.qty_delivery_pcs) || 0));
          
          if (d.periode === targetPeriode) {
            totalDeliveryKgForTargetPeriode += Number(d.qty_delivery_kg) || 0;
          }
        });

        const stockAggMap = new Map<string, any>();
        (stoks || []).forEach((s: any) => {
          const st = normalizeCode(s.kode_material);
          if (!stockAggMap.has(st)) {
            stockAggMap.set(st, { fg_st_pcs: 0, wip_st_pcs: 0, wip_lt_pcs: 0, fg_kg: 0, wip_st_kg: 0, wip_lt_kg: 0 });
          }
          const d = stockAggMap.get(st);
          d.fg_st_pcs += Number(s.fg_st_pcs) || 0;
          d.wip_st_pcs += Number(s.wip_st_pcs) || 0;
          d.wip_lt_pcs += Number(s.wip_lt_pcs) || 0;
          d.fg_kg += Number(s.fg_st_kg) || 0;
          d.wip_st_kg += Number(s.wip_st_kg) || 0;
          d.wip_lt_kg += Number(s.wip_lt_kg) || 0;
        });

        const demandMap = new Map<string, any>();
        const addDemand = (table: any[], prefix: string) => {
          (table || []).forEach(r => {
            const cust = normalizeCust(r.customer);
            const st = normalizeCode(r.kode_st);
            const key = `${cust}|${st}`;
            if (!demandMap.has(key)) {
              demandMap.set(key, { customer: r.customer, kode_st: r.kode_st, order_pcs: 0, order_kg: 0, sisa_order_pcs: 0, sisa_order_kg: 0, forecast_pcs: 0, forecast_kg: 0, loo_pcs: 0, loo_kg: 0 });
            }
            const d = demandMap.get(key);
            if (prefix === 'so') {
              d.order_pcs += Number(r.qty_order_pcs) || 0;
              d.order_kg += Number(r.qty_order_kg) || 0;
              d.sisa_order_pcs += Number(r.sisa_order_pcs) || 0;
              d.sisa_order_kg += Number(r.sisa_order_kg) || 0;
            } else if (prefix === 'fc') {
              d.forecast_pcs += Number(r.qty_pcs) || 0;
              d.forecast_kg += Number(r.qty_forecast_kg) || 0;
            } else if (prefix === 'loo') {
              d.loo_pcs += Number(r.sisa_loo_pcs) || 0;
              d.loo_kg += Number(r.sisa_loo_kg) || 0;
            }
          });
        };
        addDemand(salesOrders, 'so');
        addDemand(forecasts, 'fc');
        addDemand(looData, 'loo');

        const allKeys = new Set<string>([...demandMap.keys(), ...deliveryAggMap.keys()]);
        
        allKeys.forEach(key => {
          const [custKey, stKey] = key.split('|');
          const demand = demandMap.get(key) || { order_pcs: 0, order_kg: 0, sisa_order_pcs: 0, sisa_order_kg: 0, forecast_pcs: 0, forecast_kg: 0, loo_pcs: 0, loo_kg: 0, customer: '', kode_st: '' };
          const delivPcs = deliveryAggMap.get(key) || 0;
          const stock = stockAggMap.get(stKey) || { fg_st_pcs: 0, wip_st_pcs: 0, wip_lt_pcs: 0, fg_kg: 0, wip_st_kg: 0, wip_lt_kg: 0 };
          
          const mat = materials.find((m: any) => normalizeCode(m.kode_st) === stKey) || {};
          
          const avgDeliveryPerDay = delivPcs / 90; // 3 months = 90 days
          const docFg = avgDeliveryPerDay > 0 ? stock.fg_st_pcs / avgDeliveryPerDay : 0;
          const docWip = avgDeliveryPerDay > 0 ? stock.wip_st_pcs / avgDeliveryPerDay : 0;
          
          reportViewMat.push({
            customer: demand.customer || mat.customer || custKey,
            normalized_customer: custKey,
            kode_st: demand.kode_st || mat.kode_st || stKey,
            normalized_kode_st: stKey,
            short_name_customer: mat.short_name_customer,
            spec: mat.spec,
            dimensi: mat.dimensi,
            status_order: mat.status_order,
            order_pcs: demand.order_pcs,
            order_kg: demand.order_kg,
            sisa_order_pcs: demand.sisa_order_pcs,
            sisa_order_kg: demand.sisa_order_kg,
            forecast_pcs: demand.forecast_pcs,
            forecast_kg: demand.forecast_kg,
            loo_pcs: demand.loo_pcs,
            loo_kg: demand.loo_kg,
            fg_st_pcs: stock.fg_st_pcs,
            wip_st_pcs: stock.wip_st_pcs,
            wip_lt_pcs: stock.wip_lt_pcs,
            fg_kg: stock.fg_kg,
            wip_st_kg: stock.wip_st_kg,
            wip_lt_kg: stock.wip_lt_kg,
            total_delivery_pcs: delivPcs,
            avg_delivery_per_day: avgDeliveryPerDay,
            doc_fg: docFg,
            doc_wip: docWip,
          });
        });

        setMinMaxCount(minMaxStock?.length || 0);

        // Loading vs Capacity LT Calculation
        if (reportViewMat && mesinData && mesinData.length > 0) {
          const startOfMonth = dashboardCalcMode === 'Monthly' 
            ? new Date(currentYear, currentMonth, 1)
            : new Date(currentYear, currentMonth, currentDay);
          const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

          const calculateCapScenarios = (startDate: Date, endDate: Date, shift: number, workingDaysPerWeek: number) => {
            let normalHours = 0;
            let longHours = 0;
            let otWeekendHours = 0;
            
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

              let dayLong = dayNormal;
              if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                dayLong += 3.5 * shift;
              } else if (dayOfWeek === 6) {
                if (shift >= 1) dayLong += 3;
                if (shift >= 2) dayLong += 6;
              }
              longHours += dayLong;

              let dayOT = dayLong;
              if (dayOfWeek === 0) {
                dayOT += 7;
              }
              otWeekendHours += dayOT;
              
              current.setDate(current.getDate() + 1);
            }
            return { normal: normalHours, long: longHours, otWeekend: otWeekendHours };
          };

          const mesinMap = new Map<string, any>();
          mesinData.forEach((mesin: any) => {
            if (mesin.work_center) {
              mesinMap.set(mesin.work_center.trim().toUpperCase(), mesin);
            }
          });

          const groupMap = new Map<string, any>();
          reportViewMat.forEach((row: any) => {
            if (row.status_order !== 'Regular Order') return;
            const workCenter = row.work_center_lt;
            if (!workCenter) return;
            const key = workCenter.trim().toUpperCase();

            if (!groupMap.has(key)) {
              let scenarios = { normal: 0, long: 0, otWeekend: 0 };
              const mesinInfo = mesinMap.get(key);
              if (mesinInfo) {
                scenarios = calculateCapScenarios(
                  startOfMonth,
                  endOfMonth,
                  mesinInfo.jumlah_shift || 0,
                  mesinInfo.hari_kerja_per_minggu || 0
                );
              }
              groupMap.set(key, {
                total_loading_kg: 0,
                scenarios,
                rates: [] as number[],
              });
            }

            const entry = groupMap.get(key);
            const sisaOrderKg = Number(row.sisa_order_kg) || 0;
            const looKg = Number(row.loo_kg) || 0;
            const forecastKg = Number(row.forecast_kg) || 0;
            
            // Monthly vs Current calculation logic
            const loadingKg = dashboardCalcMode === 'Monthly' 
              ? (looKg + Math.max(forecastKg, sisaOrderKg))
              : (currentDay <= 15 ? (looKg + Math.max(forecastKg, sisaOrderKg)) : (looKg + sisaOrderKg));
            entry.total_loading_kg += loadingKg;

            const kgPerJamMill = Number(row.kg_per_jam_mill) || 0;
            if (kgPerJamMill > 0) {
              entry.rates.push(kgPerJamMill);
            }
          });

          let totalLoading = 0;
          let totalCapNormal = 0;
          let totalCapLong = 0;
          let totalCapOT = 0;

          groupMap.forEach((entry, key) => {
            totalLoading += entry.total_loading_kg;
            const avgRate = entry.rates.length > 0 ? entry.rates.reduce((a: number, b: number) => a + b, 0) / entry.rates.length : 0;
            const mesinInfo = mesinMap.get(key);
            const efisiensi = Number(mesinInfo?.efisiensi) || 1.0;
            
            totalCapNormal += entry.scenarios.normal * avgRate * efisiensi;
            totalCapLong += entry.scenarios.long * avgRate * efisiensi;
            totalCapOT += entry.scenarios.otWeekend * avgRate * efisiensi;
          });

          const percent = totalCapNormal > 0 ? (totalLoading / totalCapNormal) * 100 : 0;
          setLoadingVsCapacityLT({ 
            loading: totalLoading, 
            capacity: totalCapNormal, 
            percent,
            scenarios: {
              normal: totalCapNormal,
              long: totalCapLong,
              otWeekend: totalCapOT
            }
          });
        }

        // Availability Stock Calculation (Aggregate from 1st of month to today)
        let totalOkItems = 0;
        let totalUnderItems = 0;
        let totalOverItems = 0;
        let totalMeasuredItems = 0;
        const jenisStats: Record<string, { ok: number, under: number, over: number, total: number }> = {
          'Regular Order': { ok: 0, under: 0, over: 0, total: 0 },
          'P. Hitam': { ok: 0, under: 0, over: 0, total: 0 },
          'P. Hitam API': { ok: 0, under: 0, over: 0, total: 0 }
        };

        if (minMaxStock && minMaxStock.length > 0) {
          // 1. Group stocks by date for the current month, and then by kode_material
          const stocksByDateAndMaterial = new Map<string, Map<string, number>>();
          const uniqueMaterials = new Set<string>();
          
          stoks.forEach((s: any) => {
            if (!s.created_at) return;
            const d = new Date(s.created_at);
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
              const dateStr = s.created_at.split('T')[0];
              if (!stocksByDateAndMaterial.has(dateStr)) stocksByDateAndMaterial.set(dateStr, new Map());
              
              const matMap = stocksByDateAndMaterial.get(dateStr)!;
              const kode = (s.kode_material || '').trim().toLowerCase();
              if (kode) uniqueMaterials.add(kode);
              
              const qty = (Number(s.fg_st_pcs) || 0) + (Number(s.fg_lt_pcs) || 0) + (Number(s.wip_st_pcs) || 0) + (Number(s.wip_lt_pcs) || 0);
              matMap.set(kode, (matMap.get(kode) || 0) + qty);
            }
          });

          // 2. Pre-compile matchers for minMaxStock
          const minMaxCompiled = minMaxStock.map((mm: any) => {
             const min = Number(mm.min_stock) || 0;
             const max = Number(mm.max_stock) || 0;
             const j = (mm.jenis || '').trim().toUpperCase();
             let targetJenis = 'Regular Order';
             if (j.includes('HITAM') && j.includes('API')) {
               targetJenis = 'P. Hitam API';
             } else if (j.includes('HITAM')) {
               targetJenis = 'P. Hitam';
             }
             
             const compileMatcher = (mCode: string) => {
                mCode = (mCode || '').trim().toLowerCase();
                if (!mCode) return null;
                if (mCode.includes('*') || j.includes('HITAM')) {
                  const escaped = mCode.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
                  const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
                  try {
                      return new RegExp(regexStr);
                  } catch (e) {
                      return null;
                  }
                }
                return mCode;
             };
             
             return {
                ...mm,
                min, max, targetJenis,
                stMatcher: compileMatcher(mm.kode_st),
                ltMatcher: compileMatcher(mm.kode_lt)
             };
          }).filter((mm: any) => mm.min > 0 || mm.max > 0);

          // 3. Pre-calculate which materials belong to which minMax entry
          const minMaxToMaterials = new Map<any, string[]>();
          minMaxCompiled.forEach((mm: any) => {
             const matchedMats: string[] = [];
             uniqueMaterials.forEach(mat => {
                const matchSt = mm.stMatcher instanceof RegExp ? mm.stMatcher.test(mat) : mm.stMatcher === mat;
                const matchLt = mm.ltMatcher instanceof RegExp ? mm.ltMatcher.test(mat) : mm.ltMatcher === mat;
                if (matchSt || matchLt) {
                   matchedMats.push(mat);
                }
             });
             minMaxToMaterials.set(mm, matchedMats);
          });

          // 4. Iterate over each date that has stock data
          stocksByDateAndMaterial.forEach((matMap) => {
            minMaxCompiled.forEach((mm: any) => {
              if (!jenisStats[mm.targetJenis]) {
                jenisStats[mm.targetJenis] = { ok: 0, under: 0, over: 0, total: 0 };
              }

              totalMeasuredItems++;
              jenisStats[mm.targetJenis].total++;

              const matchedMats = minMaxToMaterials.get(mm) || [];
              let totalQty = 0;
              matchedMats.forEach(mat => {
                 totalQty += matMap.get(mat) || 0;
              });

              if (mm.min > 0 && totalQty < mm.min) {
                totalUnderItems++;
                jenisStats[mm.targetJenis].under++;
              } else if (mm.max > 0 && totalQty > mm.max) {
                totalOverItems++;
                jenisStats[mm.targetJenis].over++;
              } else {
                totalOkItems++;
                jenisStats[mm.targetJenis].ok++;
              }
            });
          });
        }

        const order = ['Regular Order', 'P. Hitam', 'P. Hitam API'];
        setAvailabilityByJenis(Object.entries(jenisStats)
          .map(([jenis, stats]) => ({
            jenis,
            ...stats,
            percent: stats.total > 0 ? (stats.ok / stats.total) * 100 : 0
          }))
          .sort((a, b) => order.indexOf(a.jenis) - order.indexOf(b.jenis))
        );

        setAvailabilityData({
          percent: totalMeasuredItems > 0 ? (totalOkItems / totalMeasuredItems) * 100 : 0,
          ok: totalOkItems,
          under: totalUnderItems,
          over: totalOverItems,
          total: totalMeasuredItems
        });

        // P3 vs Stock Calculation - Use latest available date if today is empty
        const todayDateStr = new Date().toISOString().split('T')[0];
        
        // Find latest P3 date
        const p3Dates = (p3s || [])
          .map((p: any) => p.tanggal_delivery ? p.tanggal_delivery.split('T')[0] : '')
          .filter(Boolean);
        const latestP3Date = p3Dates.length > 0 ? p3Dates.sort().reverse()[0] : todayDateStr;

        // Find latest Stocks date
        const stockDates = (stoks || [])
          .map((s: any) => s.created_at ? s.created_at.split('T')[0] : '')
          .filter(Boolean);
        const latestStoksDate = stockDates.length > 0 ? stockDates.sort().reverse()[0] : todayDateStr;

        const normalizeCustP3 = (s: string) => {
          if (!s) return '';
          let res = s.trim().toUpperCase();
          res = res.replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '');
          return res.replace(/[^A-Z0-9]/g, '').toLowerCase();
        };

        const customerShortNames = new Map<string, string>();
        const materialWeights = new Map<string, number>();
        
        materials.forEach((m: any) => {
            const normCust = normalizeCustP3(m.customer);
            if (normCust) {
                customerShortNames.set(normCust, m.short_name_customer || m.customer);
            }
            materialWeights.set(normalizeCode(m.kode_st), m.berat_per_pcs || 0);
            if (m.kode_lt) materialWeights.set(normalizeCode(m.kode_lt), m.berat_per_pcs || 0);
        });

        const p3CustomerMatMap = new Map<string, Map<string, { p3Kg: number, stockKg: number }>>();

        // Aggregate P3 (in Kg) and track materials per customer
        (p3s || []).filter((p: any) => (p.tanggal_delivery ? p.tanggal_delivery.split('T')[0] : '') === latestP3Date).forEach((p: any) => {
          const normCust = normalizeCustP3(p.customer);
          const customer = normCust || 'Unknown';
          const matCode = normalizeCode(p.kode_st);
          const p3Kg = Number(p.qty_p3_kg) || 0;
          
          if (!p3CustomerMatMap.has(customer)) {
              p3CustomerMatMap.set(customer, new Map());
          }
          const custMap = p3CustomerMatMap.get(customer)!;
          if (!custMap.has(matCode)) {
              custMap.set(matCode, { p3Kg: 0, stockKg: 0 });
          }
          custMap.get(matCode)!.p3Kg += p3Kg;
        });

        // Aggregate Stock (in Kg) based on materials in P3 for each customer
        (stoks || []).filter((s: any) => (s.created_at ? s.created_at.split('T')[0] : '') === latestStoksDate).forEach((s: any) => {
          const matCode = normalizeCode(s.kode_material);
          const weight = materialWeights.get(matCode) || 0;
          const totalStockPcs = (Number(s.fg_st_pcs) || 0) + (Number(s.fg_lt_pcs) || 0) + (Number(s.wip_st_pcs) || 0) + (Number(s.wip_lt_pcs) || 0);
          const totalStockKg = (Number(s.fg_st_kg) || 0) + (Number(s.fg_lt_kg) || 0) + (Number(s.wip_st_kg) || 0) + (Number(s.wip_lt_kg) || 0);
          const stockKg = totalStockKg;

          // Add this stock to any customer that has this material in their P3
          p3CustomerMatMap.forEach((custMap, customer) => {
              if (custMap.has(matCode)) {
                  custMap.get(matCode)!.stockKg += stockKg;
              }
          });
        });

        const p3VsStockMap = new Map<string, { p3: number, stock: number }>();
        p3CustomerMatMap.forEach((custMap, customer) => {
            let totalP3 = 0;
            let totalStock = 0;
            custMap.forEach((data) => {
                totalP3 += data.p3Kg;
                totalStock += Math.min(data.stockKg, data.p3Kg); // Cap stock at P3 qty
            });
            p3VsStockMap.set(customer, { p3: totalP3, stock: totalStock });
        });

        const p3VsStockList = Array.from(p3VsStockMap.entries())
          .filter(([name]) => name !== 'Unknown' && name !== '')
          .map(([name, data]) => ({
            name: customerShortNames.get(name) || name.toUpperCase(),
            p3: data.p3,
            stock: data.stock
        }))
        .sort((a, b) => b.p3 - a.p3);

        setP3VsStockData(p3VsStockList);
        setP3VsStockPage(0); // Reset page on data update

        if (!materials || materials.length === 0) {
          setDocData([]);
          setLoading(false);
          return;
        }

        // 1. Build lookup maps from material_master for weights and short names
        const codeJenisMap = new Map<string, string>(); // code -> jenis
        const dimensiMap = new Map<string, string>(); // code -> dimensi
        const shortNameMap = new Map<string, string>();

        materials.forEach((m: any) => {
          const custKey = normalizeCust(m.customer);
          const stKey = normalizeCode(m.kode_st);
          const jenis = m.jenis_pipa || 'Unknown';
          const dimensi = m.dimensi || '-';
          
          codeJenisMap.set(stKey, jenis);
          dimensiMap.set(stKey, dimensi);
          
          if (m.kode_lt) {
            const ltKey = normalizeCode(m.kode_lt);
            codeJenisMap.set(ltKey, jenis);
            dimensiMap.set(ltKey, dimensi);
          }
          if (m.alternative_kodes_st) {
            m.alternative_kodes_st.split(',').forEach((alt: string) => {
              const altKey = normalizeCode(alt);
              codeJenisMap.set(altKey, jenis);
              dimensiMap.set(altKey, dimensi);
            });
          }
          if (m.alternative_kodes_lt) {
            m.alternative_kodes_lt.split(',').forEach((alt: string) => {
              const altKey = normalizeCode(alt);
              codeJenisMap.set(altKey, jenis);
              dimensiMap.set(altKey, dimensi);
            });
          }
          if (m.customer && m.short_name_customer) {
            shortNameMap.set(custKey, m.short_name_customer);
          }
        });

        // 2. Aggregate Forecast vs SO using report_view_mat
        const fcsCustomerMap = new Map<string, { customer: string, originalCustomer: string, so: number, forecast: number }>();
        const fcsDrillDownMap = new Map<string, Map<string, { kode_st: string, dimensi: string, so: number, forecast: number }>>();
        
        (reportViewMat || []).forEach((r: any) => {
          const rawCust = r.customer || 'Unknown';
          const custKey = normalizeCust(rawCust);
          if (!fcsCustomerMap.has(custKey)) {
            fcsCustomerMap.set(custKey, { customer: r.short_name_customer || rawCust, originalCustomer: rawCust, so: 0, forecast: 0 });
          }
          if (!fcsDrillDownMap.has(custKey)) {
            fcsDrillDownMap.set(custKey, new Map());
          }
          
          const soKg = Number(r.order_kg) || 0;
          const forecastKg = Number(r.forecast_kg) || 0;
          
          fcsCustomerMap.get(custKey)!.so += soKg;
          fcsCustomerMap.get(custKey)!.forecast += forecastKg;

          const stKey = normalizeCode(r.kode_st);
          const itemMap = fcsDrillDownMap.get(custKey)!;
          if (!itemMap.has(stKey)) {
            itemMap.set(stKey, { kode_st: r.kode_st, dimensi: r.dimensi || '-', so: 0, forecast: 0 });
          }
          itemMap.get(stKey)!.so += soKg;
          itemMap.get(stKey)!.forecast += forecastKg;
        });

        const finalFcsDrillDown: Record<string, any[]> = {};
        fcsDrillDownMap.forEach((itemMap, custKey) => {
          finalFcsDrillDown[custKey] = Array.from(itemMap.values())
            .filter(item => item.forecast > 0 || item.so > 0)
            .sort((a, b) => b.forecast - a.forecast);
        });
        setFcsDrillDownData(finalFcsDrillDown);

        // 3. Aggregate P3 vs Delivery independently
        const p3CustomerMap = new Map<string, { customer: string, custKey: string, p3: number, delivery: number }>();
        const p3DrillDownMap = new Map<string, Map<string, { kode_st: string, dimensi: string, p3: number, delivery: number }>>();
        
        // Calculate date range: Full current month
        (p3s || []).forEach((p: any) => {
          if (!p.tanggal_delivery) return;
          const pDate = new Date(p.tanggal_delivery);
          if (pDate.getMonth() !== currentMonth || pDate.getFullYear() !== currentYear) return;
          if (pDate > yesterday) return;

          const rawCust = p.customer || 'Unknown';
          const custKey = normalizeCust(rawCust);
          if (!p3CustomerMap.has(custKey)) {
            p3CustomerMap.set(custKey, { customer: shortNameMap.get(custKey) || rawCust, custKey, p3: 0, delivery: 0 });
          }
          if (!p3DrillDownMap.has(custKey)) {
            p3DrillDownMap.set(custKey, new Map());
          }
          const stKey = normalizeCode(p.kode_st);
          const p3Kg = Number(p.qty_p3_kg) || 0;
          p3CustomerMap.get(custKey)!.p3 += p3Kg;

          const itemMap = p3DrillDownMap.get(custKey)!;
          if (!itemMap.has(stKey)) {
            itemMap.set(stKey, { kode_st: p.kode_st, dimensi: dimensiMap.get(stKey) || '-', p3: 0, delivery: 0 });
          }
          itemMap.get(stKey)!.p3 += p3Kg;
        });

        (deliveries || []).forEach((d: any) => {
          if (!d.tanggal_delivery) return;
          const dDate = new Date(d.tanggal_delivery);
          if (dDate.getMonth() !== currentMonth || dDate.getFullYear() !== currentYear) return;
          if (dDate > yesterday) return;

          const rawCust = d.customer || 'Unknown';
          const custKey = normalizeCust(rawCust);
          if (!p3CustomerMap.has(custKey)) {
            p3CustomerMap.set(custKey, { customer: shortNameMap.get(custKey) || rawCust, custKey, p3: 0, delivery: 0 });
          }
          if (!p3DrillDownMap.has(custKey)) {
            p3DrillDownMap.set(custKey, new Map());
          }
          const stKey = normalizeCode(d.kode_st);
          const deliveryKg = Number(d.qty_delivery_kg) || 0;
          p3CustomerMap.get(custKey)!.delivery += deliveryKg;

          const itemMap = p3DrillDownMap.get(custKey)!;
          if (!itemMap.has(stKey)) {
            itemMap.set(stKey, { kode_st: d.kode_st, dimensi: dimensiMap.get(stKey) || '-', p3: 0, delivery: 0 });
          }
          itemMap.get(stKey)!.delivery += deliveryKg;
        });

        const finalP3DrillDown: Record<string, any[]> = {};
        p3DrillDownMap.forEach((itemMap, custKey) => {
          finalP3DrillDown[custKey] = Array.from(itemMap.values()).sort((a, b) => b.p3 - a.p3);
        });
        setP3DrillDownData(finalP3DrillDown);

        // Calculate report data (handled by report_view_mat)
        const customerMap = new Map<string, any>();
        const deadStockMap = new Map<string, any>();
        const drillDownMap: Record<string, any[]> = {};
        const materialAggregates: Record<string, { hasDemand: boolean, totalAvgDelivery: number, customers: Set<string>, totalSisaOrderPcs: number, totalStockST: number }> = {};
        let totalWipKg = 0;
        let totalFgKg = 0;
        let totalDeadFgKg = 0;
        let totalDeadWipKg = 0;
        let totalDeadWipLtKg = 0;

        (reportViewMat || []).forEach((r: any) => {
          const kodeST = r.kode_st || r.normalized_kode_st;
          const customer = r.customer || r.normalized_customer;
          
          if (!customer) return;

          if (!materialAggregates[kodeST]) {
            materialAggregates[kodeST] = { hasDemand: false, totalAvgDelivery: 0, customers: new Set<string>(), totalSisaOrderPcs: 0, totalStockST: 0 };
          }
          
          const orderPcs = Number(r.order_pcs) || 0;
          const forecastPcs = Number(r.forecast_pcs) || 0;
          const sisaOrderPcs = Number(r.sisa_order_pcs) || 0;
          const looPcs = Number(r.loo_pcs) || 0;
          const fgPcs = Number(r.fg_st_pcs) || 0;
          const wipSTPcs = Number(r.wip_st_pcs) || 0;
          const wipLTPcs = Number(r.wip_lt_pcs) || 0;
          const fgSTKg = Number(r.fg_kg) || 0;
          const wipSTKg = Number(r.wip_st_kg) || 0;
          const wipLTKg = Number(r.wip_lt_kg) || 0;
          const avgDeliveryPerDay = Number(r.avg_delivery_per_day) || 0;

          if (orderPcs > 0 || forecastPcs > 0 || sisaOrderPcs > 0 || looPcs > 0) {
            materialAggregates[kodeST].hasDemand = true;
          }
          materialAggregates[kodeST].customers.add(r.short_name_customer || customer);
          materialAggregates[kodeST].totalSisaOrderPcs += sisaOrderPcs;
          materialAggregates[kodeST].totalAvgDelivery += avgDeliveryPerDay;
          materialAggregates[kodeST].totalStockST += (fgPcs + wipSTPcs);

          if (orderPcs > 0 || forecastPcs > 0 || looPcs > 0) {
            totalWipKg += wipSTKg;
            totalFgKg += fgSTKg;
          } else {
            totalDeadFgKg += fgSTKg;
            totalDeadWipKg += wipSTKg;
            totalDeadWipLtKg += wipLTKg;

            if (fgSTKg > 0 || wipSTKg > 0 || wipLTKg > 0) {
              if (!deadStockMap.has(customer)) {
                deadStockMap.set(customer, {
                  customer: r.short_name_customer || customer,
                  originalCustomer: customer,
                  fgKg: 0,
                  wipKg: 0,
                  wipLtKg: 0,
                  totalKg: 0,
                  items: []
                });
              }
              const ds = deadStockMap.get(customer);
              ds.fgKg += fgSTKg;
              ds.wipKg += wipSTKg;
              ds.wipLtKg += wipLTKg;
              ds.totalKg += (fgSTKg + wipSTKg + wipLTKg);
              ds.items.push({
                kodeST: r.kode_st,
                spec: r.spec || '-',
                dimensi: r.dimensi,
                fgKg: fgSTKg,
                wipKg: wipSTKg,
                wipLtKg: wipLTKg
              });
            }
          }

          const custKey = normalizeCust(customer);
          if (!customerMap.has(custKey)) {
            customerMap.set(custKey, {
              customer: r.short_name_customer || customer,
              originalCustomer: customer,
              custKey: custKey,
              totalOrderKg: 0,
              totalFgPcs: 0,
              totalWipSTPcs: 0,
              totalAvgDeliveryPerDay: 0,
              totalFgPcsRegular: 0,
              totalWipSTPcsRegular: 0,
              totalAvgDeliveryPerDayRegular: 0,
              totalSisaOrderKg: 0,
              totalStockKg: 0,
              statusOrder: r.status_order || 'Unknown'
            });
          }

          const c = customerMap.get(custKey);
          c.totalOrderKg += Number(r.order_kg) || 0;
          c.totalFgPcs += fgPcs;
          c.totalWipSTPcs += wipSTPcs;
          c.totalAvgDeliveryPerDay += avgDeliveryPerDay;
          c.totalSisaOrderKg += Number(r.sisa_order_kg) || 0;
          c.totalStockKg += (fgSTKg + wipSTKg + wipLTKg);
          c.statusOrder = r.status_order || c.statusOrder;

          if (r.status_order === 'Regular Order') {
            c.totalFgPcsRegular += fgPcs;
            c.totalWipSTPcsRegular += wipSTPcs;
            c.totalAvgDeliveryPerDayRegular += avgDeliveryPerDay;
          }

          if (!drillDownMap[custKey]) drillDownMap[custKey] = [];
          if (r.status_order === 'Regular Order') {
            drillDownMap[custKey].push({
              kodeST: kodeST,
              dimensi: r.dimensi || r.spec || kodeST,
              docFg: Number(r.doc_fg) || 0,
              docWip: Number(r.doc_wip) || 0,
              fgPcs: fgPcs,
              wipPcs: wipSTPcs,
              avgDelivery: avgDeliveryPerDay
            });
          }
        });

        setDrillDownData(drillDownMap);

        // Calculate Slow Moving Stock (PASM = SLOW) on latest date
        let slowMovingKg = 0;
        let slowMovingCount = 0;
        const slowMovingJenisStockMap = new Map<string, number>();
        const slowMovingLokasiGudangMap = new Map<string, number>();
        const slowMovingUnfifoMap = new Map<string, number>();
        
        let smFgStKg = 0;
        let smFgLtKg = 0;
        let smWipStKg = 0;
        let smWipLtKg = 0;
        
        const slowMovingJenisMap = new Map<string, { 
          jenis: string, 
          totalKg: number, 
          count: number,
          wipLtKg: number,
          wipStKg: number,
          fgLtKg: number,
          fgStKg: number
        }>();
        
        if (latestStockDate) {
          const latestStocks = (stoks || []).filter((s: any) => (s.created_at || '').split('T')[0] === latestStockDate);
          latestStocks.forEach((s: any) => {
            if (String(s.pasm).toUpperCase() === 'SLOW') {
              const wipLtKg = (s.wip_lt_kg || 0);
              const wipStKg = (s.wip_st_kg || 0);
              const fgStKg = (s.fg_st_kg || 0);
              const fgLtKg = (s.fg_lt_kg || 0);
              const totalKg = wipLtKg + wipStKg + fgStKg + fgLtKg;
              
              if (totalKg > 0) {
                const stKey = normalizeCode(s.kode_material);
                const jenis = codeJenisMap.get(stKey) || 'Unknown';
                const kg = totalKg;
                
                slowMovingKg += kg;
                slowMovingCount++;
                
                const dbJenisStock = s.jenis_stock || 'Unknown';
                const dbLokasiGudang = s.lokasi_gudang || 'Unknown';
                const dbUnfifo = s.unfifo || 'Unknown';

                slowMovingJenisStockMap.set(dbJenisStock, (slowMovingJenisStockMap.get(dbJenisStock) || 0) + kg);
                slowMovingLokasiGudangMap.set(dbLokasiGudang, (slowMovingLokasiGudangMap.get(dbLokasiGudang) || 0) + kg);
                slowMovingUnfifoMap.set(dbUnfifo, (slowMovingUnfifoMap.get(dbUnfifo) || 0) + kg);

                smFgStKg += fgStKg;
                smFgLtKg += fgLtKg;
                smWipStKg += wipStKg;
                smWipLtKg += wipLtKg;

                if (!slowMovingJenisMap.has(jenis)) {
                  slowMovingJenisMap.set(jenis, { 
                    jenis, 
                    totalKg: 0, 
                    count: 0,
                    wipLtKg: 0,
                    wipStKg: 0,
                    fgLtKg: 0,
                    fgStKg: 0
                  });
                }
                const sj = slowMovingJenisMap.get(jenis)!;
                sj.totalKg += kg;
                sj.count++;
                sj.wipLtKg += wipLtKg;
                sj.wipStKg += wipStKg;
                sj.fgStKg += fgStKg;
                sj.fgLtKg += fgLtKg;
              }
            }
          });
        }
        
        const colors = ['#10B981', '#F59E0B', '#3B82F6', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6'];
        
        const byJenisStock = Array.from(slowMovingJenisStockMap.entries())
          .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
          .sort((a, b) => b.value - a.value);
          
        const byLokasiGudang = Array.from(slowMovingLokasiGudangMap.entries())
          .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
          .sort((a, b) => b.value - a.value);

        const byUnfifo = Array.from(slowMovingUnfifoMap.entries())
          .map(([name, value], i) => ({ name, value, color: colors[i % colors.length] }))
          .sort((a, b) => b.value - a.value);

        const byStatusStock = [
          { name: 'FG ST', value: smFgStKg, color: '#10B981' },
          { name: 'FG LT', value: smFgLtKg, color: '#3B82F6' },
          { name: 'WIP ST', value: smWipStKg, color: '#F59E0B' },
          { name: 'WIP LT', value: smWipLtKg, color: '#EF4444' }
        ].filter(d => d.value > 0);

        setSlowMovingStock({ 
          totalKg: slowMovingKg, 
          count: slowMovingCount,
          byJenisStock,
          byLokasiGudang,
          byUnfifo,
          byStatusStock
        });
        setSlowMovingByJenis(Array.from(slowMovingJenisMap.values()).sort((a, b) => b.totalKg - a.totalKg));
        
        const totalDeadKg = totalDeadFgKg + totalDeadWipKg + totalDeadWipLtKg;
        setDeadStockComposition({
          fgKg: totalDeadFgKg,
          wipKg: totalDeadWipKg,
          wipLtKg: totalDeadWipLtKg,
          totalKg: totalDeadKg
        });

        const materialInfoMap = new Map<string, any>();
        (materials || []).forEach((m: any) => {
          const info = {
            dimensi: m.dimensi || '-',
            pcs_per_jam_cut: Number(m.pcs_per_jam_cut) || 0,
            kg_per_jam_mill: Number(m.kg_per_jam_mill) || 0,
            d1: m.d1 || '-',
            d2: m.d2 || '-',
            dia: m.dia || '-',
            thick: m.thick || '-',
            moq: Number(m.moq) || 0
          };
          if (m.kode_st) materialInfoMap.set(normalizeCode(m.kode_st), info);
          if (m.kode_lt) materialInfoMap.set(normalizeCode(m.kode_lt), info);
          if (m.alternative_kodes_st) {
            m.alternative_kodes_st.split(',').forEach((alt: string) => {
              materialInfoMap.set(normalizeCode(alt), info);
            });
          }
          if (m.alternative_kodes_lt) {
            m.alternative_kodes_lt.split(',').forEach((alt: string) => {
              materialInfoMap.set(normalizeCode(alt), info);
            });
          }
        });
        setMaterialInfoMapState(materialInfoMap);

        // Calculate unique alerts
        let alertCounter = 0;
        const alertItemsData: any[] = [];
        Object.keys(materialAggregates).forEach(kodeST => {
          const agg = materialAggregates[kodeST];
          if (agg.hasDemand) {
            const totalStockST = agg.totalStockST;
            let isAlert = false;
            let docST = 0;
            
            if (agg.totalAvgDelivery > 0) {
              docST = totalStockST / agg.totalAvgDelivery;
              if (docST < 1 && agg.totalSisaOrderPcs > totalStockST) {
                isAlert = true;
              }
            } else if (agg.totalSisaOrderPcs > totalStockST) {
              isAlert = true;
              docST = 0;
            }
            
            if (isAlert) {
              alertCounter++;
              const materialInfo = materialInfoMap.get(normalizeCode(kodeST));
              alertItemsData.push({
                kode_material: kodeST,
                dimensi: materialInfo?.dimensi || '-',
                total_stock: totalStockST,
                avg_delivery: agg.totalAvgDelivery,
                doc: docST,
                customer: Array.from(agg.customers).join(', '),
                sisa_order: agg.totalSisaOrderPcs,
                konversi_st: 0
              });
            }
          }
        });
        setAlertsCount(alertCounter);
        setAlertItems(alertItemsData);

        // Calculate Yield Tubing
        let totalGrKg = 0;
        let totalGiKg = 0;
        let totalGrTubing = 0;
        let totalGiTubing = 0;
        const tubingWorkCenters = new Set(
          (mesinData || [])
            .filter((m: any) => (m.kategori || '').trim().toLowerCase() === 'tubing')
            .map((m: any) => m.work_center.trim().toUpperCase())
        );
        const havenWorkCenters = new Set(
          (mesinData || [])
            .filter((m: any) => (m.kategori || '').trim().toLowerCase() === 'haven')
            .map((m: any) => m.work_center.trim().toUpperCase())
        );
        const othersWorkCenters = new Set(
          (mesinData || [])
            .filter((m: any) => {
              const cat = (m.kategori || '').trim().toLowerCase();
              return cat !== 'tubing' && cat !== 'haven';
            })
            .map((m: any) => m.work_center.trim().toUpperCase())
        );
        const workCenterYieldMapLT = new Map<string, { grKg: number, giKg: number, grUnit: number, machineTime: number, targetUnitTotal: number, processedOrders: Set<string> }>();
        const workCenterYieldMapST = new Map<string, { grKg: number, giKg: number, grUnit: number, machineTime: number, targetUnitTotal: number, processedOrders: Set<string> }>();
        const mesinYieldMap = new Map<string, number>();
        (mesinData || []).forEach((mesin: any) => {
          if (mesin.work_center) {
            mesinYieldMap.set(mesin.work_center.trim().toUpperCase(), Number(mesin.target_yield) || 0);
          }
        });

        const coisMap = new Map<string, any>();
        (coisProd || []).forEach((c: any) => {
          if (c.order_no) {
            const orderNo = c.order_no.trim();
            if (coisMap.has(orderNo)) {
              const existing = coisMap.get(orderNo);
              coisMap.set(orderNo, {
                ...existing,
                machine_time: (Number(existing.machine_time) || 0) + (Number(c.machine_time) || 0),
                set_up: (Number(existing.set_up) || 0) + (Number(c.set_up) || 0),
                bongkar: (Number(existing.bongkar) || 0) + (Number(c.bongkar) || 0),
                down_time: (Number(existing.down_time) || 0) + (Number(c.down_time) || 0),
              });
            } else {
              coisMap.set(orderNo, { ...c });
            }
          }
        });
        setCoisMapState(coisMap);

        const mb51WithDimensi = (mb51Mill || []).map((row: any) => {
          const kode = row.kode_lt || row.kode_st || '';
          const mInfo = materialInfoMap.get(normalizeCode(kode)) || {};
          return {
            ...row,
            dimensi: mInfo.dimensi || '-',
            moq: mInfo.moq || 0
          };
        });
        const orderToInfoMap = new Map<string, { material: string, gr_qty_kg: number }>();
        (mb51Mill || []).forEach((row: any) => {
          const orderNo = (row.order_no || '').trim();
          if (orderNo) {
            const current = orderToInfoMap.get(orderNo) || { material: '', gr_qty_kg: 0 };
            orderToInfoMap.set(orderNo, {
              material: row.kode_lt || row.kode_st || current.material,
              gr_qty_kg: current.gr_qty_kg + (Number(row.gr_qty_kg) || 0)
            });
          }
        });

        const enrichedCoisProd = (coisProd || []).map((c: any) => {
          const info = orderToInfoMap.get((c.order_no || '').trim()) || { material: '', gr_qty_kg: 0 };
          return {
            ...c,
            material: c.material || info.material,
            gr_qty_kg: info.gr_qty_kg
          };
        });

        setMesinYieldData(mesinYieldMap);
        setMb51MillData(mb51WithDimensi);
        setMesinDataState(mesinData);
        setCoisProdData(enrichedCoisProd);

        (mb51WithDimensi || []).forEach((row: any) => {
          const proses = (row.proses ? row.proses.toString().trim().toUpperCase() : 'LT');
          const gr = Number(row.gr_qty_kg) || 0;
          const gi = Number(row.gi_qty_kg) || 0;
          const grPcs = Number(row.gr_qty_pcs) || 0;
          
          const wc = (row.work_centre_lt || 'Unknown').trim();
          
          if (proses === 'LT') {
            totalGrKg += gr;
            totalGiKg += gi;
          }
          
          // Filter only tubing work centers for the tubing yield calculation
          if (tubingWorkCenters.has(wc.toUpperCase())) {
            totalGrTubing += gr;
            totalGiTubing += gi;
          }

          const targetMap = proses === 'ST' ? workCenterYieldMapST : workCenterYieldMapLT;

          if (!targetMap.has(wc)) {
            targetMap.set(wc, { grKg: 0, giKg: 0, grUnit: 0, machineTime: 0, targetUnitTotal: 0, processedOrders: new Set() });
          }
          const wcData = targetMap.get(wc)!;
          wcData.grKg += gr;
          wcData.giKg += gi;

          const orderNo = (row.order_no || '').trim();
          if (orderNo && !wcData.processedOrders.has(orderNo)) {
            wcData.processedOrders.add(orderNo);
            const coisInfo = coisMap.get(orderNo) || {};
            const machineTime = Number(coisInfo.machine_time) || 0;
            wcData.machineTime += machineTime;

            const kode = row.kode_lt || row.kode_st || '';
            const mInfo = materialInfoMap.get(normalizeCode(kode)) || {};
            
            if (proses === 'ST') {
              const targetPcsPerHour = mInfo.pcs_per_jam_cut || 0;
              wcData.targetUnitTotal += (machineTime / 60) * targetPcsPerHour;
            } else {
              const targetKgPerHour = mInfo.kg_per_jam_mill || 0;
              wcData.targetUnitTotal += (machineTime / 60) * targetKgPerHour;
            }
          }

          if (proses === 'ST') {
            wcData.grUnit += grPcs;
          } else {
            wcData.grUnit += gr;
          }
        });

        const yieldPercent = totalGiTubing > 0 ? (totalGrTubing / totalGiTubing) * 100 : 0;
        setYieldTubingPercent(yieldPercent);

        const processYieldData = (map: Map<string, { grKg: number, giKg: number, grUnit: number, machineTime: number, targetUnitTotal: number, processedOrders: Set<string> }>) => {
          return Array.from(map.entries())
            .map(([wc, data]) => {
            const targetYield = mesinYieldMap.get(wc.toUpperCase()) || 0;
            const yieldPercent = data.giKg > 0 ? (data.grKg / data.giKg) * 100 : 0;
            
            // Speed Achievement = Actual Unit / Target Unit * 100
            const speedAchievement = data.targetUnitTotal > 0 ? (data.grUnit / data.targetUnitTotal) * 100 : 0;

            let category: 'Tubing' | 'Haven' | 'Others' = 'Others';
            if (tubingWorkCenters.has(wc.toUpperCase())) category = 'Tubing';
            else if (havenWorkCenters.has(wc.toUpperCase())) category = 'Haven';

            return {
              workCenter: wc,
              grKg: data.grKg,
              giKg: data.giKg,
              yieldPercent: yieldPercent,
              targetYield: targetYield,
              speedAchievement: speedAchievement,
              target100: 100,
              category
            };
          }).sort((a, b) => a.workCenter.localeCompare(b.workCenter));
        };

        setYieldByWorkCenterLT(processYieldData(workCenterYieldMapLT));
        setYieldByWorkCenterST(processYieldData(workCenterYieldMapST));

        const coisMapLT = new Map<string, { set_up: number, bongkar: number, machine_time: number, down_time: number }>();
        const coisMapST = new Map<string, { set_up: number, bongkar: number, machine_time: number, down_time: number }>();

        (coisProd || []).forEach((row: any) => {
          const proses = (row.proses ? row.proses.toString().trim().toUpperCase() : 'LT');
          const wc = (row.work_centre || 'Unknown').trim();
          const targetMap = proses === 'ST' ? coisMapST : coisMapLT;

          if (!targetMap.has(wc)) {
            targetMap.set(wc, { set_up: 0, bongkar: 0, machine_time: 0, down_time: 0 });
          }
          const data = targetMap.get(wc)!;
          data.set_up += Number(row.set_up) || 0;
          data.bongkar += Number(row.bongkar) || 0;
          data.machine_time += Number(row.machine_time) || 0;
          data.down_time += Number(row.down_time) || 0;
        });

        const processCoisData = (map: Map<string, { set_up: number, bongkar: number, machine_time: number, down_time: number }>) => {
          return Array.from(map.entries())
            .map(([wc, data]) => {
            const total = data.set_up + data.bongkar + data.machine_time + data.down_time;
            let category: 'Tubing' | 'Haven' | 'Others' = 'Others';
            if (tubingWorkCenters.has(wc.toUpperCase())) category = 'Tubing';
            else if (havenWorkCenters.has(wc.toUpperCase())) category = 'Haven';

            return {
              workCenter: wc,
              setUpPercent: total > 0 ? (data.set_up / total) * 100 : 0,
              bongkarPercent: total > 0 ? (data.bongkar / total) * 100 : 0,
              machinePercent: total > 0 ? (data.machine_time / total) * 100 : 0,
              downTimePercent: total > 0 ? (data.down_time / total) * 100 : 0,
              category
            };
          }).sort((a, b) => a.workCenter.localeCompare(b.workCenter));
        };

        setProcessTimeLT(processCoisData(coisMapLT));
        setProcessTimeST(processCoisData(coisMapST));

        // Calculate Total Welding & Down Time for LT
        let totalLtSetup = 0;
        let totalLtBongkar = 0;
        let totalLtMachine = 0;
        let totalLtDown = 0;

        coisMapLT.forEach((data) => {
          totalLtSetup += data.set_up;
          totalLtBongkar += data.bongkar;
          totalLtMachine += data.machine_time;
          totalLtDown += data.down_time;
        });

        const totalLtTime = totalLtSetup + totalLtBongkar + totalLtMachine + totalLtDown;
        setLtWeldingDownTime({
          weldingPercent: totalLtTime > 0 ? (totalLtMachine / totalLtTime) * 100 : 0,
          downTimePercent: totalLtTime > 0 ? (totalLtDown / totalLtTime) * 100 : 0
        });

        const processedData = Array.from(customerMap.values()).map(c => {
          const docFg = c.totalAvgDeliveryPerDay > 0 ? c.totalFgPcs / c.totalAvgDeliveryPerDay : 0;
          const docWip = c.totalAvgDeliveryPerDay > 0 ? c.totalWipSTPcs / c.totalAvgDeliveryPerDay : 0;
          
          const docFgRegular = c.totalAvgDeliveryPerDayRegular > 0 ? c.totalFgPcsRegular / c.totalAvgDeliveryPerDayRegular : 0;
          const docWipRegular = c.totalAvgDeliveryPerDayRegular > 0 ? c.totalWipSTPcsRegular / c.totalAvgDeliveryPerDayRegular : 0;

          return {
            customer: c.customer,
            originalCustomer: c.originalCustomer,
            custKey: c.custKey,
            totalOrderKg: c.totalOrderKg,
            docFg: docFg,
            docWip: docWip,
            docFgRegular: docFgRegular,
            docWipRegular: docWipRegular,
            totalDoc: docFg + docWip,
            totalDocRegular: docFgRegular + docWipRegular,
            sisaOrderKg: c.totalSisaOrderKg,
            stockKg: c.totalStockKg,
            statusOrder: c.statusOrder,
            hasRegularOrder: c.totalAvgDeliveryPerDayRegular > 0 || c.totalFgPcsRegular > 0 || c.totalWipSTPcsRegular > 0
          };
        }).sort((a, b) => b.totalOrderKg - a.totalOrderKg);

        const fcsList = Array.from(fcsCustomerMap.values()).filter(item => item.forecast > 0).map(item => ({
          ...item,
          custKey: normalizeCust(item.originalCustomer)
        }));
        fcsList.sort((a, b) => {
          const percentA = (a.so / a.forecast) * 100;
          const percentB = (b.so / b.forecast) * 100;
          return percentA - percentB;
        });
        
        const totalSo = fcsList.reduce((sum, item) => sum + item.so, 0);
        const totalForecast = fcsList.reduce((sum, item) => sum + item.forecast, 0);
        const totalPercent = totalForecast > 0 ? (totalSo / totalForecast) * 100 : 0;

        setFcsData(fcsList);
        const fcsTotalsVal = { so: totalSo, forecast: totalForecast, percent: totalPercent };
        setFcsTotals(fcsTotalsVal);

        const p3List = Array.from(p3CustomerMap.values()).filter(item => item.p3 > 0 || item.delivery > 0);
        p3List.sort((a, b) => b.p3 - a.p3);
        
        const totalP3 = p3List.reduce((sum, item) => sum + item.p3, 0);
        const totalDelivery = p3List.reduce((sum, item) => sum + item.delivery, 0);
        const totalP3Percent = totalP3 > 0 ? (totalDelivery / totalP3) * 100 : 0;

        setP3Data(p3List);
        setP3Totals({ p3: totalP3, delivery: totalDelivery, percent: totalP3Percent });
        
        const dailyMap = new Map<string, { p3: number, delivery: number }>();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            dailyMap.set(dateStr, { p3: 0, delivery: 0 });
        }
        (p3s || []).forEach(p => {
           if (!p.tanggal_delivery) return;
           const dateStr = p.tanggal_delivery.split('T')[0];
           if (dailyMap.has(dateStr)) {
              const d = dailyMap.get(dateStr)!;
              d.p3 += Number(p.qty_p3_kg) || 0;
           }
        });
        (deliveries || []).forEach(d => {
           if (!d.tanggal_delivery) return;
           const dateStr = d.tanggal_delivery.split('T')[0];
           if (dailyMap.has(dateStr)) {
              const dData = dailyMap.get(dateStr)!;
              dData.delivery += Number(d.qty_delivery_kg) || 0;
           }
        });
        const dailyList = Array.from(dailyMap.entries()).map(([date, data]) => ({
           date: date.split('-')[2],
           p3: data.p3,
           delivery: data.delivery,
           percent: data.p3 > 0 ? (data.delivery / data.p3) * 100 : 0
        }));
        setDailyP3DeliveryData(dailyList);
        
        setTotalDeliveryAmount(totalDeliveryKgForTargetPeriode / 1000);
        
        const docDataFiltered = (dbReportViewMat && dbReportViewMat.length > 0 ? (() => {
          const grouped = new Map<string, any>();
          const dbDrillDownMap: Record<string, any[]> = {};
          
          dbReportViewMat
            .filter(c => {
              if (!c.periode) return false;
              return c.periode.trim() === targetPeriode.trim();
            })
            .forEach(c => {
              const rawCust = c.customer || c.normalized_customer || 'Unknown';
              const custKey = normalizeCust(rawCust);
              
              if (!grouped.has(custKey)) {
                grouped.set(custKey, {
                  customer: rawCust,
                  shortNameCustomer: c.short_name_customer || rawCust,
                  custKey: custKey,
                  totalWipStPcs: 0,
                  totalFgStPcs: 0,
                  totalFgLtPcs: 0,
                  totalAvgDeliveryPerDay: 0,
                  totalOrderKg: 0,
                  statusOrder: c.status_order,
                  hasRegularOrder: false
                });
              }
              const g = grouped.get(custKey);
              g.totalWipStPcs += Number(c.wip_st_pcs) || 0;
              g.totalFgStPcs += Number(c.fg_st_pcs) || 0;
              g.totalFgLtPcs += Number(c.fg_lt_pcs) || 0;
              g.totalAvgDeliveryPerDay += Number(c.avg_delivery_per_day) || 0;
              g.totalOrderKg += Number(c.order_kg) || 0;
              
              if (c.status_order?.trim() === 'Regular Order') {
                g.hasRegularOrder = true;
                g.statusOrder = 'Regular Order'; // Ensure it's set to Regular Order if any item is
                if (!dbDrillDownMap[custKey]) dbDrillDownMap[custKey] = [];
                dbDrillDownMap[custKey].push({
                  kodeST: c.kode_st,
                  dimensi: c.dimensi || c.spec || c.kode_st,
                  docFg: Number(c.avg_delivery_per_day) > 0 ? Number(c.fg_st_pcs) / Number(c.avg_delivery_per_day) : 0,
                  docWip: Number(c.avg_delivery_per_day) > 0 ? Number(c.wip_st_pcs) / Number(c.avg_delivery_per_day) : 0,
                  fgPcs: Number(c.fg_st_pcs) || 0,
                  wipPcs: Number(c.wip_st_pcs) || 0,
                  avgDelivery: Number(c.avg_delivery_per_day) || 0
                });
              }
            });
          
          setDrillDownData(dbDrillDownMap);
          
          return Array.from(grouped.values()).map(g => ({
            customer: g.customer,
            shortNameCustomer: g.shortNameCustomer,
            custKey: g.custKey,
            kodeSt: '-',
            wipStPcs: g.totalWipStPcs,
            fgStPcs: g.totalFgStPcs,
            fgLtPcs: g.totalFgLtPcs,
            avgDeliveryPerDay: g.totalAvgDeliveryPerDay,
            statusOrder: g.statusOrder,
            docFg: g.totalAvgDeliveryPerDay > 0 ? g.totalFgStPcs / g.totalAvgDeliveryPerDay : 0,
            docWip: g.totalAvgDeliveryPerDay > 0 ? g.totalWipStPcs / g.totalAvgDeliveryPerDay : 0,
            totalDoc: g.totalAvgDeliveryPerDay > 0 ? (g.totalFgStPcs + g.totalWipStPcs) / g.totalAvgDeliveryPerDay : 0,
            totalOrderKg: g.totalOrderKg,
            hasRegularOrder: g.hasRegularOrder
          }));
        })() : processedData)
          .filter(c => c.hasRegularOrder && c.statusOrder === 'Regular Order')
          .sort((a, b) => b.totalOrderKg - a.totalOrderKg);
          
        setDocData(docDataFiltered);
        setStockData(processedData);
        
        const processedDeadStock = Array.from(deadStockMap.values());
        processedDeadStock.sort((a, b) => b.totalKg - a.totalKg);
        setDeadStockDetails(processedDeadStock);
        setLoading(false);
      } catch (error) {
        console.error('Error calculating dashboard data:', error);
        setLoading(false);
      }
    }
  }, [primaryData, productionData, dashboardCalcMode, refreshKey, searchParams]);

  if (primaryLoading && !primaryData) {
    return <DashboardSkeleton />;
  }

  
  const totalPagesDoc = Math.ceil(docData.length / itemsPerPage);
  const paginatedDocData = docData.slice(currentPageDoc * itemsPerPage, (currentPageDoc + 1) * itemsPerPage);

  const totalPagesStock = Math.ceil(stockData.length / itemsPerPage);
  const paginatedStockData = stockData.slice(currentPageStock * itemsPerPage, (currentPageStock + 1) * itemsPerPage);

  const handlePrevPageDoc = () => {
    setCurrentPageDoc(prev => Math.max(0, prev - 1));
  };

  const handleNextPageDoc = () => {
    setCurrentPageDoc(prev => Math.min(totalPagesDoc - 1, prev + 1));
  };

  const handlePrevPageStock = () => {
    setCurrentPageStock(prev => Math.max(0, prev - 1));
  };

  const handleNextPageStock = () => {
    setCurrentPageStock(prev => Math.min(totalPagesStock - 1, prev + 1));
  };

  const handleBarClick = (data: any) => {
    // Handle click from BarChart (area click with activePayload)
    if (data && data.activePayload && data.activePayload.length > 0) {
      const payload = data.activePayload[0].payload;
      // Use shortNameCustomer for name, and customer for originalName/custKey if available
      setSelectedCustomer({ 
        name: payload.shortNameCustomer || payload.customer, 
        originalName: payload.customer, 
        custKey: payload.custKey || payload.customer 
      });
      setModalPage(0);
      setIsModalOpen(true);
    } 
    // Handle direct click from Bar (data is the payload itself)
    else if (data && data.customer) {
      setSelectedCustomer({ 
        name: data.shortNameCustomer || data.customer, 
        originalName: data.customer, 
        custKey: data.custKey || data.customer 
      });
      setModalPage(0);
      setIsModalOpen(true);
    }
  };

  return (
    <div className="p-4 space-y-4 bg-[#FDFBF7] min-h-screen font-sans text-gray-900">
      {/* Top Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
        <div className="sm:col-span-2">
          <DeliveryCard 
            ontimePercent={p3Totals.percent}
            ontimeSubValue={<>{(p3Totals.delivery / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} Ton / {(p3Totals.p3 / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} Ton</>}
            totalDeliveryTon={totalDeliveryAmount}
            onClick={() => {
              setModalPage(0);
              setIsP3ModalOpen(true);
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <ProductionCard 
            totalProductionTon={(() => {
              const tubingWorkCenters = new Set((mesinDataState || []).filter((m: any) => (m.kategori || '').trim().toLowerCase() === 'tubing').map((m: any) => m.work_center.trim()));
              return (mb51MillData || []).reduce((sum: number, row: any) => {
                if (tubingWorkCenters.has((row.work_centre_lt || '').trim())) {
                  return sum + (Number(row.gr_qty_kg) || 0);
                }
                return sum;
              }, 0) / 1000;
            })()}
            yieldPercent={yieldTubingPercent}
            onClick={() => {
              setIsYieldModalOpen(true);
            }}
          />
        </div>
        <MetricCard 
          icon={ShieldCheck} 
          title="AVAILABILITY STOCK" 
          gradientClass="from-[#EA580C] to-[#F97316]"
          subValue={<>{availabilityData.ok} OK / {availabilityData.total} Items</>}
          value={
            <div className="flex items-center gap-2">
              {(availabilityData?.percent ?? 0).toFixed(1)}%
              <div className="w-4 h-1 bg-white/50 rounded-full" />
            </div>
          }
          onClick={() => {
            setModalPage(0);
            setIsAvailabilityModalOpen(true);
          }}
        />
        <MetricCard 
          icon={Layers} 
          title="SLOW MOVING STOCK" 
          gradientClass="from-[#92400E] to-[#B45309]"
          subValue={<>{slowMovingStock.count} ITEMS DETECTED</>}
          value={
            <div className="flex items-baseline gap-1">
              {Math.round(slowMovingStock.totalKg / 1000).toLocaleString()}
              <span className="text-sm font-bold opacity-70">Ton</span>
            </div>
          }
          onClick={() => {
            setModalPage(0);
            setSlowMovingPage(0);
            setIsSlowMovingModalOpen(true);
          }}
        />
        <MetricCard 
          icon={Clock} 
          title="WELDING TIME" 
          gradientClass="from-[#4F46E5] to-[#818CF8]"
          subValue={productionLoading ? <div className="h-4 w-24 bg-white/20 animate-pulse rounded" /> : "MACHINE TIME PERFORMANCE"}
          value={
            productionLoading ? (
              <div className="h-8 w-16 bg-white/20 animate-pulse rounded mt-1" />
            ) : (
              <div className="flex items-center gap-2">
                {(ltWeldingDownTime?.weldingPercent ?? 0).toFixed(1)}%
                <TrendingUp className="w-5 h-5 text-white/80" />
              </div>
            )
          }
          onClick={() => {
            setModalPage(0);
            setIsWeldingModalOpen(true);
          }}
        />
        <MetricCard 
          icon={Clock} 
          title="DOWN TIME" 
          gradientClass="from-[#D97706] to-[#F59E0B]"
          subValue={productionLoading ? <div className="h-4 w-24 bg-white/20 animate-pulse rounded" /> : "DOWN TIME PERFORMANCE"}
          value={
            productionLoading ? (
              <div className="h-8 w-16 bg-white/20 animate-pulse rounded mt-1" />
            ) : (
              <div className="flex items-center gap-2">
                {(ltWeldingDownTime?.downTimePercent ?? 0).toFixed(1)}%
                <TrendingUp className="w-5 h-5 text-white/80" />
              </div>
            )
          }
          onClick={() => {
            setModalPage(0);
            setIsDownTimeModalOpen(true);
          }}
        />
        <MetricCard 
          icon={Bell} 
          title="ALERTS" 
          gradientClass="from-[#DC2626] to-[#F87171]"
          subValue="Critical (potensi delay)"
          value={
            <div className="flex items-center gap-3">
              {alertsCount}
              <div className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-black border border-white/30">
                {alertsCount}
              </div>
            </div>
          }
          onClick={() => setIsAlertsModalOpen(true)}
        />
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 xl:grid-cols-18 gap-4">
        {/* DOC Performance */}
        <div className="lg:row-span-2 xl:col-span-4 bg-white border border-gray-100 p-5 rounded-3xl shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative overflow-hidden group flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900 mb-1 group-hover:text-[#0A5C36] transition-colors duration-300 uppercase tracking-tight">Days of Coverage</h3>
              <p className="text-xs text-gray-400 font-medium">Top customers by order volume</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handlePrevPageDoc} 
                disabled={currentPageDoc === 0}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <span className="text-xs font-medium text-gray-600">
                Page {currentPageDoc + 1} of {totalPagesDoc || 1}
              </span>
              <button 
                onClick={handleNextPageDoc} 
                disabled={currentPageDoc >= totalPagesDoc - 1}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>

          <div className="flex-1 h-[180px] overflow-y-auto">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  layout="vertical"
                  data={paginatedDocData} 
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                  onClick={handleBarClick}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                  <XAxis 
                    type="number"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6B7280', fontSize: 10 }}
                  />
                  <YAxis 
                    dataKey="shortNameCustomer" 
                    type="category"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6B7280', fontSize: 8 }}
                    width={80}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px', color: '#111827' }}
                    formatter={(value: number) => [(value ?? 0).toFixed(1), '']}
                  />
                  <Legend iconType="square" wrapperStyle={{ fontSize: '12px', color: '#6B7280', position: 'relative', marginTop: '10px' }} />
                  
                  <Bar 
                    dataKey="docFg" 
                    name="DOC FG" 
                    fill="#10B981" 
                    radius={[0, 4, 4, 0]}
                    maxBarSize={20}
                    onClick={handleBarClick}
                    className="cursor-pointer"
                  >
                    <LabelList dataKey="docFg" position="right" formatter={(val: number) => (val ?? 0).toFixed(1)} style={{ fontSize: '9px', fill: '#6B7280' }} />
                  </Bar>
                  <Bar 
                    dataKey="docWip" 
                    name="DOC WIP" 
                    fill="#3B82F6" 
                    radius={[0, 4, 4, 0]}
                    maxBarSize={20}
                    onClick={handleBarClick}
                    className="cursor-pointer"
                  >
                    <LabelList dataKey="docWip" position="right" formatter={(val: number) => (val ?? 0).toFixed(1)} style={{ fontSize: '9px', fill: '#6B7280' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* P3 vs Stock */}
        <div className="xl:col-span-7 bg-white border border-gray-100 p-5 rounded-3xl shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative overflow-hidden group">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900 mb-1 group-hover:text-[#0A5C36] transition-colors duration-300 uppercase tracking-tight">P3 vs Stock</h3>
              <p className="text-xs text-gray-400 font-medium">Perbandingan P3 dan Stock</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 p-1 rounded-xl mr-4">
                  <button 
                    onClick={() => setP3VsStockMode('Volume')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${p3VsStockMode === 'Volume' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    Volume (Kg)
                  </button>
                  <button 
                    onClick={() => setP3VsStockMode('Percent')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${p3VsStockMode === 'Percent' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    %
                  </button>
              </div>
              <button 
                onClick={() => setP3VsStockPage(prev => Math.max(0, prev - 1))}
                disabled={p3VsStockPage === 0}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <span className="text-xs font-medium text-gray-600">
                Page {p3VsStockPage + 1} of {Math.max(1, Math.ceil(p3VsStockData.length / 10))}
              </span>
              <button 
                onClick={() => setP3VsStockPage(prev => Math.min(Math.max(0, Math.ceil(p3VsStockData.length / 10) - 1), prev + 1))}
                disabled={p3VsStockPage >= Math.ceil(p3VsStockData.length / 10) - 1}
                className="p-1 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
          <div className="h-[180px]">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={p3VsStockData.slice(p3VsStockPage * 10, (p3VsStockPage + 1) * 10).map(d => p3VsStockMode === 'Percent' ? { ...d, percent: d.p3 > 0 ? (d.stock / d.p3) * 100 : 0 } : d)} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 8 }} interval={0} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6B7280', fontSize: 10 }} 
                    tickFormatter={(value) => p3VsStockMode === 'Percent' ? `${value}%` : `${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px', color: '#111827' }}
                    formatter={(value: number, name: string) => [
                      p3VsStockMode === 'Percent' ? `${(value ?? 0).toFixed(1)}%` : `${(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} Kg`, 
                      name === 'p3' ? 'P3' : (name === 'stock' ? 'Stock' : 'Stock / P3')
                    ]}
                  />
                  <Legend iconType="square" wrapperStyle={{ fontSize: '12px', color: '#6B7280', bottom: 0 }} />
                  {p3VsStockMode === 'Volume' ? (
                    <>
                      <Bar dataKey="p3" name="P3 (Kg)" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        <LabelList dataKey="p3" position="top" formatter={(val: number) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val} style={{ fontSize: '9px', fill: '#6B7280' }} />
                      </Bar>
                      <Bar dataKey="stock" name="Stock (Kg)" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40}>
                        <LabelList dataKey="stock" position="top" formatter={(val: number) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val} style={{ fontSize: '9px', fill: '#6B7280' }} />
                      </Bar>
                    </>
                  ) : (
                    <Bar dataKey="percent" name="Stock / P3 (%)" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={40}>
                      <LabelList dataKey="percent" position="top" formatter={(value: number) => `${(value ?? 0).toFixed(1)}%`} style={{ fontSize: '10px', fill: '#6B7280' }} />
                    </Bar>
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Production Yield */}
        <div className="xl:col-span-7 bg-white border border-gray-100 p-5 rounded-3xl shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative overflow-hidden group">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900 mb-1 group-hover:text-[#0A5C36] transition-colors duration-300 uppercase tracking-tight">Production Yield</h3>
              <p className="text-xs text-gray-400 font-medium">Yield per Work Center</p>
            </div>
            <div className="flex bg-gray-50 p-1 rounded-full border border-gray-100 shadow-inner">
              {(['Tubing', 'Haven', 'Others'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setYieldCategoryFilter(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
                    yieldCategoryFilter === cat
                      ? 'bg-[#00C853] text-white shadow-md scale-105'
                      : 'text-[#94A3B8] hover:text-gray-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[180px]">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart 
                  data={[...yieldByWorkCenterLT, ...yieldByWorkCenterST]
                    .filter(d => d.category === yieldCategoryFilter)
                    .sort((a, b) => a.workCenter.localeCompare(b.workCenter))
                  } 
                  margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="workCenter" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 8 }} interval={0} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} domain={[75, 100]} />
                  <Tooltip content={<CustomYieldTooltip />} />
                  <Legend verticalAlign="bottom" iconType="square" wrapperStyle={{ fontSize: '10px', color: '#6B7280', paddingTop: '10px' }} />
                  <Bar 
                    dataKey="yieldPercent" 
                    name="Aktual" 
                    fill="#8B5CF6" 
                    radius={[4, 4, 0, 0]} 
                    onClick={(data) => {
                      setSelectedWorkCenter(data);
                      setIsYieldDetailModalOpen(true);
                    }}
                    className="cursor-pointer"
                  >
                    <LabelList dataKey="yieldPercent" position="top" formatter={(val: number) => `${(val ?? 0).toFixed(1)}%`} style={{ fontSize: '9px', fill: '#6B7280' }} />
                  </Bar>
                  <Line type="monotone" dataKey="targetYield" name="Target" stroke="#EF4444" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Delivery Ontime */}
        <div className="xl:col-span-7 bg-white border border-gray-100 p-5 rounded-3xl shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative overflow-hidden group">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900 mb-1 group-hover:text-[#10B981] transition-colors duration-300 uppercase tracking-tight">Delivery Ontime</h3>
              <p className="text-xs text-gray-400 font-medium">Perbandingan volume P3 dan Delivery per Customer (Kg)</p>
            </div>
            <button 
              onClick={() => setIsP3ModalOpen(true)}
              className="text-xs font-bold text-[#10B981] hover:text-[#059669] transition-colors"
            >
              Lihat Detail
            </button>
          </div>

          <div className="h-[180px]">
            {loading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={dailyP3DeliveryData} 
                  margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <ReferenceLine y={100} stroke="#EF4444" strokeDasharray="3 3" label={{ value: 'Target 100%', position: 'insideTopRight', fill: '#EF4444', fontSize: 10 }} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6B7280', fontSize: 8 }} 
                    interval={0}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#6B7280', fontSize: 10 }}
                    tickFormatter={(value) => `${value.toFixed(0)}%`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px', color: '#111827' }}
                    formatter={(value: number) => [value.toFixed(2) + '%', '']}
                  />
                  <Legend iconType="square" wrapperStyle={{ fontSize: '12px', color: '#6B7280', bottom: 0 }} />
                  
                  <Line 
                    type="monotone"
                    dataKey="percent" 
                    name="Pencapaian (%)" 
                    stroke="#10B981" 
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Process Time */}
        <div className="xl:col-span-7 bg-white border border-gray-100 p-5 rounded-3xl shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] relative overflow-hidden group">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h3 className="text-lg font-black text-gray-900 mb-1 group-hover:text-[#0A5C36] transition-colors duration-300 uppercase tracking-tight">Process Time</h3>
              <p className="text-xs text-gray-400 font-medium">% Set up, Bongkar, Machine, Down Time</p>
            </div>
            <div className="flex bg-gray-50 p-1 rounded-full border border-gray-100 shadow-inner">
              {(['Tubing', 'Haven', 'Others'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setProcessCategoryFilter(cat)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
                    processCategoryFilter === cat
                      ? 'bg-[#00C853] text-white shadow-md scale-105'
                      : 'text-[#94A3B8] hover:text-gray-600'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <div className="h-[180px]">
            {productionLoading ? (
              <div className="w-full h-full flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={[...processTimeLT, ...processTimeST]
                    .filter(d => d.category === processCategoryFilter)
                    .sort((a, b) => a.workCenter.localeCompare(b.workCenter))
                  } 
                  margin={{ top: 20, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis dataKey="workCenter" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 8 }} interval={0} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 10 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px', color: '#111827' }} formatter={(value: number) => [(value ?? 0).toFixed(1) + '%', '']} />
                  <Legend verticalAlign="bottom" iconType="square" wrapperStyle={{ fontSize: '10px', color: '#6B7280', paddingTop: '10px' }} />
                  <Bar 
                    dataKey="setUpPercent" 
                    name="Set Up" 
                    stackId="a" 
                    fill="#F59E0B" 
                    className="cursor-pointer"
                    onClick={(data) => {
                      setSelectedProcessTimeWC(data.workCenter);
                      setIsProcessTimeDetailModalOpen(true);
                    }}
                  />
                  <Bar 
                    dataKey="bongkarPercent" 
                    name="Bongkar" 
                    stackId="a" 
                    fill="#3B82F6" 
                    className="cursor-pointer"
                    onClick={(data) => {
                      setSelectedProcessTimeWC(data.workCenter);
                      setIsProcessTimeDetailModalOpen(true);
                    }}
                  />
                  <Bar 
                    dataKey="machinePercent" 
                    name="Machine" 
                    stackId="a" 
                    fill="#10B981" 
                    className="cursor-pointer"
                    onClick={(data) => {
                      setSelectedProcessTimeWC(data.workCenter);
                      setIsProcessTimeDetailModalOpen(true);
                    }}
                  />
                  <Bar 
                    dataKey="downTimePercent" 
                    name="Down Time" 
                    stackId="a" 
                    fill="#EF4444" 
                    radius={[4, 4, 0, 0]} 
                    className="cursor-pointer"
                    onClick={(data) => {
                      setSelectedProcessTimeWC(data.workCenter);
                      setIsProcessTimeDetailModalOpen(true);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Welding Time Modal */}
      {isWeldingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">Detail Welding Time</h3>
                <p className="text-sm text-gray-500">Pencapaian Machine Time per Work Center (%)</p>
              </div>
              <button 
                onClick={() => setIsWeldingModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto px-8 pb-8">
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={processTimeLT.slice(modalPage * modalItemsPerPage, (modalPage + 1) * modalItemsPerPage)} 
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                    <XAxis 
                      dataKey="workCenter" 
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                      tick={{ fill: '#4A5568', fontSize: 10, fontWeight: 500 }}
                    />
                    <YAxis 
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                      tick={{ fill: '#A0AEC0', fontSize: 11 }}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#F7FAFC' }}
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                      formatter={(value: number) => [`${(value ?? 0).toFixed(1)}%`, 'Machine Time']}
                    />
                    <Bar 
                      dataKey="machinePercent" 
                      name="Machine Time (%)" 
                      fill="#4F46E5" 
                      radius={[4, 4, 0, 0]} 
                      barSize={40} 
                      className="cursor-pointer"
                      onClick={(data) => {
                        setSelectedWeldingWC(data.workCenter);
                        setIsWeldingDetailModalOpen(true);
                      }}
                    >
                      <LabelList 
                        dataKey="machinePercent" 
                        position="top" 
                        formatter={(value: number) => `${(value ?? 0).toFixed(1)}%`}
                        style={{ fill: '#4A5568', fontSize: 10, fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-center items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setModalPage(prev => Math.max(0, prev - 1))}
                  disabled={modalPage === 0}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-500">
                  Halaman {modalPage + 1} dari {Math.ceil(processTimeLT.length / modalItemsPerPage)}
                </span>
                <button 
                  onClick={() => setModalPage(prev => Math.min(Math.ceil(processTimeLT.length / modalItemsPerPage) - 1, prev + 1))}
                  disabled={modalPage >= Math.ceil(processTimeLT.length / modalItemsPerPage) - 1}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Down Time Modal */}
      {isDownTimeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">Detail Down Time</h3>
                <p className="text-sm text-gray-500">Pencapaian Down Time per Work Center (%)</p>
              </div>
              <button 
                onClick={() => setIsDownTimeModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto px-8 pb-8">
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={processTimeLT.slice(modalPage * modalItemsPerPage, (modalPage + 1) * modalItemsPerPage)} 
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                    <XAxis 
                      dataKey="workCenter" 
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                      tick={{ fill: '#4A5568', fontSize: 10, fontWeight: 500 }}
                    />
                    <YAxis 
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                      tick={{ fill: '#A0AEC0', fontSize: 11 }}
                      tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#F7FAFC' }}
                      contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #E5E7EB', borderRadius: '8px' }}
                      formatter={(value: number) => [`${(value ?? 0).toFixed(1)}%`, 'Down Time']}
                    />
                    <Bar 
                      dataKey="downTimePercent" 
                      name="Down Time (%)" 
                      fill="#F59E0B" 
                      radius={[4, 4, 0, 0]} 
                      barSize={40} 
                      className="cursor-pointer"
                      onClick={(data) => {
                        setSelectedDownTimeWC(data.workCenter);
                        setIsDownTimeDetailModalOpen(true);
                      }}
                    >
                      <LabelList 
                        dataKey="downTimePercent" 
                        position="top" 
                        formatter={(value: number) => `${(value ?? 0).toFixed(1)}%`}
                        style={{ fill: '#4A5568', fontSize: 10, fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-center items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setModalPage(prev => Math.max(0, prev - 1))}
                  disabled={modalPage === 0}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-500">
                  Halaman {modalPage + 1} dari {Math.ceil(processTimeLT.length / modalItemsPerPage)}
                </span>
                <button 
                  onClick={() => setModalPage(prev => Math.min(Math.ceil(processTimeLT.length / modalItemsPerPage) - 1, prev + 1))}
                  disabled={modalPage >= Math.ceil(processTimeLT.length / modalItemsPerPage) - 1}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Availability Stock Modal */}
      {isAvailabilityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 flex justify-between items-center border-b border-gray-50">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">Detail Availability Stock</h3>
                <p className="text-sm text-gray-500">Pencapaian ketersediaan stok berdasarkan jenis material</p>
              </div>
              <button 
                onClick={() => setIsAvailabilityModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {availabilityByJenis.map((item, idx) => (
                  <div key={idx} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex flex-col items-center text-center space-y-4">
                    <h4 className="text-lg font-bold text-gray-900">{item.jenis}</h4>
                    <div className="relative w-32 h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={[
                              { name: 'OK', value: item.ok },
                              { name: 'UNDER', value: item.under },
                              { name: 'OVER', value: item.over },
                            ]}
                            cx="50%"
                            cy="50%"
                            innerRadius={35}
                            outerRadius={50}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            <Cell fill="#10B981" />
                            <Cell fill="#EF4444" />
                            <Cell fill="#F59E0B" />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-black text-gray-900">{(item?.percent ?? 0).toFixed(1)}%</span>
                        <span className="text-[8px] font-bold text-gray-400 uppercase">Achievement</span>
                      </div>
                    </div>
                    <div className="w-full space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-medium">OK</span>
                        <span className="font-bold text-[#10B981]">{item.ok} Items</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-medium">UNDER</span>
                        <span className="font-bold text-[#EF4444]">{item.under} Items</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500 font-medium">OVER</span>
                        <span className="font-bold text-[#F59E0B]">{item.over} Items</span>
                      </div>
                      <div className="pt-2 border-t border-gray-200 flex justify-between text-xs">
                        <span className="text-gray-900 font-bold">TOTAL MEASURED</span>
                        <span className="font-black text-gray-900">{item.total} Items</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Drill-down Modal */}
      {isModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 border border-gray-100">
            <div className="p-8 flex justify-between items-center">
              <div className="space-y-3">
                <h3 className="text-2xl font-bold text-[#2D3748]">Detail DOC: {selectedCustomer.name}</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl w-fit">
                    <button 
                      onClick={() => setModalDisplayMode('graph')}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${modalDisplayMode === 'graph' ? 'bg-white text-[#A67C52] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      GRAFIK
                    </button>
                    <button 
                      onClick={() => setModalDisplayMode('report')}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${modalDisplayMode === 'report' ? 'bg-white text-[#A67C52] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      REPORT
                    </button>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="px-8 pb-1 flex-1 overflow-y-auto min-h-0">
              {(() => {
                const key = selectedCustomer.custKey || selectedCustomer.originalName || normalizeCust(selectedCustomer.name);
                const currentDrillDown = drillDownData[key] || drillDownData[selectedCustomer.originalName] || drillDownData[normalizeCust(selectedCustomer.name)] || [];
                
                if (currentDrillDown.length === 0) {
                  return (
                    <div className="h-[400px] flex flex-col items-center justify-center text-gray-400 space-y-4 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100">
                      <div className="p-4 bg-white rounded-full shadow-sm">
                        <X className="w-8 h-8 text-gray-300" />
                      </div>
                      <div className="text-center">
                        <p className="font-bold text-gray-600">Tidak ada data rincian</p>
                        <p className="text-xs">Data item untuk {selectedCustomer.name} tidak ditemukan pada periode ini.</p>
                      </div>
                    </div>
                  );
                }

                return (
                  <>
                    {modalDisplayMode === 'graph' ? (
                      <div className="h-[400px] w-full mb-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart 
                            data={currentDrillDown
                              .map(item => ({ 
                                ...item, 
                                totalDoc: item.docFg + item.docWip
                              }))
                              .sort((a, b) => b.totalDoc - a.totalDoc)
                              .slice(modalPage * modalItemsPerPage, (modalPage + 1) * modalItemsPerPage)
                            } 
                            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                            <XAxis 
                              dataKey="dimensi" 
                              axisLine={{ stroke: '#E2E8F0' }}
                              tickLine={false}
                              tick={{ fill: '#4A5568', fontSize: 10, fontWeight: 500 }}
                              interval={0}
                              angle={-45}
                              textAnchor="end"
                              height={80}
                            />
                            <YAxis 
                              type="number"
                              axisLine={{ stroke: '#E2E8F0' }}
                              tickLine={false}
                              tick={{ fill: '#A0AEC0', fontSize: 11 }}
                            />
                            <Tooltip 
                              cursor={{ fill: '#F7FAFC' }}
                              content={({ active, payload }) => {
                                if (active && payload && payload.length) {
                                  const data = payload[0].payload;
                                  return (
                                    <div className="bg-white p-4 border border-gray-100 rounded-xl shadow-xl text-xs space-y-2">
                                      <p className="font-bold text-gray-900 border-b border-gray-50 pb-1 mb-2">{data.dimensi}</p>
                                      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                        <span className="text-gray-500">Kode Material</span>
                                        <span className="font-bold text-gray-900 text-right">{data.kodeST}</span>
                                        
                                        <span className="text-gray-500">DOC FG</span>
                                        <span className="font-bold text-[#10B981] text-right">{(data?.docFg ?? 0).toFixed(1)}</span>
                                        
                                        <span className="text-gray-500">DOC WIP</span>
                                        <span className="font-bold text-[#3B82F6] text-right">{(data?.docWip ?? 0).toFixed(1)}</span>

                                        <span className="text-gray-900 font-bold">Total DOC</span>
                                        <span className="font-bold text-gray-900 text-right">{(data?.totalDoc ?? 0).toFixed(1)}</span>
                                        
                                        <div className="col-span-2 border-t border-gray-50 my-1"></div>

                                        <span className="text-gray-500">Stok FG (Pcs)</span>
                                        <span className="font-bold text-gray-900 text-right">{data.fgPcs.toLocaleString()}</span>

                                        <span className="text-gray-500">Stok WIP (Pcs)</span>
                                        <span className="font-bold text-gray-900 text-right">{data.wipPcs.toLocaleString()}</span>
                                        
                                        <span className="text-gray-500">Avg Dlv/Day</span>
                                        <span className="font-bold text-gray-900 text-right">{(data?.avgDelivery ?? 0).toFixed(1)}</span>
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Legend verticalAlign="top" align="right" wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 'bold' }} />
                            <Bar 
                              dataKey="docFg" 
                              name="DOC FG" 
                              fill="#10B981" 
                              radius={[4, 4, 0, 0]}
                              barSize={15}
                            >
                              <LabelList 
                                dataKey="docFg" 
                                position="top" 
                                formatter={(v: number) => v.toFixed(1)}
                                style={{ fontSize: '8px', fontWeight: 'bold', fill: '#10B981' }}
                              />
                            </Bar>
                            <Bar 
                              dataKey="docWip" 
                              name="DOC WIP" 
                              fill="#3B82F6" 
                              radius={[4, 4, 0, 0]}
                              barSize={15}
                            >
                              <LabelList 
                                dataKey="docWip" 
                                position="top" 
                                formatter={(v: number) => v.toFixed(1)}
                                style={{ fontSize: '8px', fontWeight: 'bold', fill: '#3B82F6' }}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="border border-gray-100 rounded-xl overflow-hidden mb-2">
                        <table className="w-full text-sm text-left text-gray-600">
                          <thead className="text-xs text-gray-700 uppercase bg-gray-50 font-bold">
                            <tr>
                              <th className="px-4 py-3">Item / Dimensi</th>
                              <th className="px-4 py-3">Kode ST</th>
                              <th className="px-4 py-3 text-right">WIP (Pcs)</th>
                              <th className="px-4 py-3 text-right">FG (Pcs)</th>
                              <th className="px-4 py-3 text-right">Avg Dlv/Day</th>
                              <th className="px-4 py-3 text-right">DOC FG</th>
                              <th className="px-4 py-3 text-right">DOC WIP</th>
                              <th className="px-4 py-3 text-right text-[#A67C52]">Total DOC</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {currentDrillDown
                              .sort((a, b) => (b.docFg + b.docWip) - (a.docFg + a.docWip))
                              .slice(modalPage * modalItemsPerPage, (modalPage + 1) * modalItemsPerPage)
                              .map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3 font-medium text-gray-900">{item.dimensi}</td>
                                  <td className="px-4 py-3 text-xs text-gray-500">{item.kodeST}</td>
                                  <td className="px-4 py-3 text-right">{item.wipPcs.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-right">{item.fgPcs.toLocaleString()}</td>
                                  <td className="px-4 py-3 text-right">{item.avgDelivery.toFixed(1)}</td>
                                  <td className="px-4 py-3 text-right">{item.docFg.toFixed(1)}</td>
                                  <td className="px-4 py-3 text-right">{item.docWip.toFixed(1)}</td>
                                  <td className="px-4 py-3 text-right font-bold text-[#A67C52]">{(item.docFg + item.docWip).toFixed(1)}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            
            <div className="p-6 bg-white border-t border-gray-50 flex justify-center items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setModalPage(prev => Math.max(0, prev - 1))}
                  disabled={modalPage === 0}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-500">
                  {(() => {
                    const key = selectedCustomer.custKey || selectedCustomer.originalName || normalizeCust(selectedCustomer.name);
                    const currentDrillDown = drillDownData[key] || drillDownData[selectedCustomer.originalName] || drillDownData[normalizeCust(selectedCustomer.name)] || [];
                    const totalPages = Math.ceil(currentDrillDown.length / modalItemsPerPage);
                    return `Halaman ${modalPage + 1} dari ${totalPages || 1}`;
                  })()}
                </span>
                <button 
                  onClick={() => {
                    const key = selectedCustomer.custKey || selectedCustomer.originalName || normalizeCust(selectedCustomer.name);
                    const currentDrillDown = drillDownData[key] || drillDownData[selectedCustomer.originalName] || drillDownData[normalizeCust(selectedCustomer.name)] || [];
                    const totalPages = Math.ceil(currentDrillDown.length / modalItemsPerPage);
                    if (modalPage < totalPages - 1) setModalPage(prev => prev + 1);
                  }}
                  disabled={(() => {
                    const key = selectedCustomer.custKey || selectedCustomer.originalName || normalizeCust(selectedCustomer.name);
                    const currentDrillDown = drillDownData[key] || drillDownData[selectedCustomer.originalName] || drillDownData[normalizeCust(selectedCustomer.name)] || [];
                    const totalPages = Math.ceil(currentDrillDown.length / modalItemsPerPage);
                    return modalPage >= totalPages - 1;
                  })()}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DOC Report Modal */}
      {isDocReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">Report Days of Coverage</h3>
                <p className="text-sm text-gray-500">Detail DOC per customer</p>
              </div>
              <button 
                onClick={() => setIsDocReportModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto px-8 pb-8">
              <table className="w-full text-sm text-left text-gray-600">
                <thead className="text-gray-700 uppercase bg-gray-50">
                  <tr>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Kode ST</th>
                    <th className="px-4 py-2 text-right">WIP ST (pcs)</th>
                    <th className="px-4 py-2 text-right">FG ST (pcs)</th>
                    <th className="px-4 py-2 text-right">FG LT (pcs)</th>
                    <th className="px-4 py-2 text-right">Avg Delivery/Day</th>
                    <th className="px-4 py-2 text-right">DOC FG</th>
                    <th className="px-4 py-2 text-right">DOC WIP</th>
                    <th className="px-4 py-2 text-right">Total DOC</th>
                    <th className="px-4 py-2 text-right">Order (Kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {docData.map((row, idx) => (
                    <tr key={idx} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium text-gray-900">{row.shortNameCustomer}</td>
                      <td className="px-4 py-2 text-gray-700">{row.kodeSt}</td>
                      <td className="px-4 py-2 text-right">{row.wipStPcs?.toLocaleString() || 0}</td>
                      <td className="px-4 py-2 text-right">{row.fgStPcs?.toLocaleString() || 0}</td>
                      <td className="px-4 py-2 text-right">{row.fgLtPcs?.toLocaleString() || 0}</td>
                      <td className="px-4 py-2 text-right">{row.avgDeliveryPerDay?.toLocaleString() || 0}</td>
                      <td className="px-4 py-2 text-right">{row.docFg.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right">{row.docWip.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right font-bold">{row.totalDoc.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right">{row.totalOrderKg.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      
      {/* Delivery Ontime Modal */}
      {isP3ModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">Detail Delivery Ontime</h3>
                <p className="text-sm text-gray-500">Perbandingan volume P3 dan Delivery per Customer (Kg)</p>
              </div>
              <button 
                onClick={() => setIsP3ModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto px-8 pb-8">
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={p3Data.slice(modalPage * modalItemsPerPage, (modalPage + 1) * modalItemsPerPage)} 
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                    <XAxis 
                      dataKey="customer" 
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                      tick={{ fill: '#4A5568', fontSize: 9, fontWeight: 500 }}
                      interval={0}
                    />
                    <YAxis 
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                      tick={{ fill: '#A0AEC0', fontSize: 11 }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#F7FAFC' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const p3Item = payload.find(p => p.dataKey === 'p3');
                          const deliveryItem = payload.find(p => p.dataKey === 'delivery');
                          const p3Val = p3Item?.value as number || 0;
                          const deliveryVal = deliveryItem?.value as number || 0;
                          const percent = p3Val > 0 ? (deliveryVal / p3Val) * 100 : 0;
                          
                          return (
                            <div className="bg-white p-4 border border-gray-100 rounded-xl shadow-xl text-xs space-y-2">
                              <p className="font-bold text-gray-900 border-b border-gray-50 pb-1 mb-2">{label}</p>
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                <span className="text-gray-500">P3 (Kg)</span>
                                <span className="font-bold text-gray-900 text-right">{p3Val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                
                                <span className="text-gray-500">Delivery (Kg)</span>
                                <span className="font-bold text-[#10B981] text-right">{deliveryVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                
                                <span className="text-gray-500">Pencapaian</span>
                                <span className={`font-bold text-right ${percent >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                                  {(percent ?? 0).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend verticalAlign="bottom" align="right" iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar 
                      dataKey="p3" 
                      name="P3 (Kg)" 
                      fill="#F97316" 
                      radius={[4, 4, 0, 0]} 
                      barSize={25} 
                      onClick={(data) => {
                        setSelectedP3Customer({ name: data.customer, originalName: data.custKey });
                        setIsP3DetailModalOpen(true);
                        setModalPage(0);
                      }}
                      cursor="pointer"
                    />
                    <Bar 
                      dataKey="delivery" 
                      name="Delivery (Kg)" 
                      fill="#10B981" 
                      radius={[4, 4, 0, 0]} 
                      barSize={25} 
                      onClick={(data) => {
                        setSelectedP3Customer({ name: data.customer, originalName: data.custKey });
                        setIsP3DetailModalOpen(true);
                        setModalPage(0);
                      }}
                      cursor="pointer"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="p-6 bg-white border-t border-gray-50 flex justify-center items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setModalPage(prev => Math.max(0, prev - 1))}
                  disabled={modalPage === 0}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-500">
                  Halaman {modalPage + 1} dari {Math.ceil(p3Data.length / modalItemsPerPage)}
                </span>
                <button 
                  onClick={() => setModalPage(prev => Math.min(Math.ceil(p3Data.length / modalItemsPerPage) - 1, prev + 1))}
                  disabled={modalPage >= Math.ceil(p3Data.length / modalItemsPerPage) - 1}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Detail Modal (Table View) */}
      {isP3DetailModalOpen && selectedP3Customer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border border-white/20">
            <div className="p-8 flex justify-between items-center border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-20">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <Truck className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900">{selectedP3Customer.name}</h3>
                </div>
                <p className="text-sm text-gray-500 font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  Detail Delivery On-Time per Item
                </p>
              </div>
              <button 
                onClick={() => setIsP3DetailModalOpen(false)}
                className="p-2.5 rounded-full hover:bg-gray-100 transition-all duration-200 hover:rotate-90"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto px-8 pb-8">
              <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-lg">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm">
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-12 text-center">No.</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Kode Item</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Dimensi</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">P3 (Kg)</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Delivery (Kg)</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Achievement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {(p3DrillDownData[selectedP3Customer.originalName] || []).slice(modalPage * modalItemsPerPage, (modalPage + 1) * modalItemsPerPage).map((item, idx) => {
                      const achievement = item.p3 > 0 ? (item.delivery / item.p3) * 100 : 0;
                      const rowNumber = (modalPage * modalItemsPerPage) + idx + 1;
                      return (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="px-4 py-4 text-sm text-gray-400 text-center font-mono">{rowNumber}</td>
                          <td className="px-6 py-4 text-sm font-semibold text-gray-900 group-hover:text-emerald-600 transition-colors">{item.kode_st}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{item.dimensi}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 text-right font-mono">{Math.round(item.p3).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 text-right font-mono">{Math.round(item.delivery).toLocaleString()}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-3">
                              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    achievement >= 100 ? 'bg-emerald-500' : 
                                    achievement >= 80 ? 'bg-blue-500' : 
                                    achievement >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${Math.min(achievement, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                                achievement >= 100 ? 'bg-emerald-50 text-emerald-700' : 
                                achievement >= 80 ? 'bg-blue-50 text-blue-700' : 
                                achievement >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {(achievement ?? 0).toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50/50 border-t border-gray-100 flex justify-center items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setModalPage(prev => Math.max(0, prev - 1))}
                  disabled={modalPage === 0}
                  className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <span className="text-sm font-bold text-gray-600 bg-white px-4 py-2 rounded-lg shadow-md border border-gray-100">
                  Halaman <span className="text-emerald-600">{modalPage + 1}</span> dari {Math.ceil((p3DrillDownData[selectedP3Customer.originalName] || []).length / modalItemsPerPage)}
                </span>
                <button 
                  onClick={() => setModalPage(prev => Math.min(Math.ceil((p3DrillDownData[selectedP3Customer.originalName] || []).length / modalItemsPerPage) - 1, prev + 1))}
                  disabled={modalPage >= Math.ceil((p3DrillDownData[selectedP3Customer.originalName] || []).length / modalItemsPerPage) - 1}
                  className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forecast vs SO Modal */}
      {isFcsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">Detail Forecast vs Sales Order</h3>
                <p className="text-sm text-gray-500">Perbandingan volume Forecast dan SO per Customer (Kg)</p>
              </div>
              <button 
                onClick={() => setIsFcsModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto px-8 pb-8">
              <div className="h-[500px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={fcsData.slice(modalPage * modalItemsPerPage, (modalPage + 1) * modalItemsPerPage)} 
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                    <XAxis 
                      dataKey="customer" 
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                      tick={{ fill: '#4A5568', fontSize: 9, fontWeight: 500 }}
                      interval={0}
                    />
                    <YAxis 
                      axisLine={{ stroke: '#E2E8F0' }}
                      tickLine={false}
                      tick={{ fill: '#A0AEC0', fontSize: 11 }}
                      tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      cursor={{ fill: '#F7FAFC' }}
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const forecastItem = payload.find(p => p.dataKey === 'forecast');
                          const soItem = payload.find(p => p.dataKey === 'so');
                          const forecastValue = forecastItem?.value || 0;
                          const soValue = soItem?.value || 0;
                          const achievement = forecastValue > 0 ? (soValue / forecastValue) * 100 : 0;

                          return (
                            <div className="bg-white p-4 border border-gray-100 rounded-xl shadow-xl text-xs space-y-2">
                              <p className="font-bold text-gray-900 border-b border-gray-50 pb-1 mb-2">{label}</p>
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                                <span className="text-gray-500">Forecast</span>
                                <span className="font-bold text-[#10B981] text-right">{Math.round(forecastValue).toLocaleString()} Kg</span>
                                
                                <span className="text-gray-500">Sales Order</span>
                                <span className="font-bold text-[#3B82F6] text-right">{Math.round(soValue).toLocaleString()} Kg</span>
                                
                                <span className="text-gray-500">Achievement</span>
                                <span className="font-bold text-gray-900 text-right">
                                  {(achievement ?? 0).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend verticalAlign="bottom" align="right" iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Bar 
                      dataKey="forecast" 
                      name="Forecast" 
                      fill="#10B981" 
                      radius={[4, 4, 0, 0]} 
                      onClick={(data) => {
                        setSelectedFcsCustomer({ name: data.customer, originalName: data.custKey });
                        setIsFcsDetailModalOpen(true);
                        setModalPage(0);
                      }}
                      cursor="pointer"
                    />
                    <Bar 
                      dataKey="so" 
                      name="Sales Order" 
                      fill="#3B82F6" 
                      radius={[4, 4, 0, 0]} 
                      onClick={(data) => {
                        setSelectedFcsCustomer({ name: data.customer, originalName: data.custKey });
                        setIsFcsDetailModalOpen(true);
                        setModalPage(0);
                      }}
                      cursor="pointer"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 flex justify-center items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setModalPage(prev => Math.max(0, prev - 1))}
                  disabled={modalPage === 0}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-500">
                  Halaman {modalPage + 1} dari {Math.ceil(fcsData.length / modalItemsPerPage)}
                </span>
                <button 
                  onClick={() => setModalPage(prev => Math.min(Math.ceil(fcsData.length / modalItemsPerPage) - 1, prev + 1))}
                  disabled={modalPage >= Math.ceil(fcsData.length / modalItemsPerPage) - 1}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Forecast vs SO Item Detail Modal */}
      {isFcsDetailModalOpen && selectedFcsCustomer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">Detail Item: {selectedFcsCustomer.name}</h3>
                <p className="text-sm text-gray-500">Perbandingan volume Forecast dan SO per Item (Kg)</p>
              </div>
              <button 
                onClick={() => setIsFcsDetailModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto px-8 pb-8">
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-gray-50">
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-12 text-center">No.</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Kode Item</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Dimensi</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Forecast (Kg)</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Sales Order (Kg)</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Achievement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 bg-white">
                    {(fcsDrillDownData[selectedFcsCustomer.originalName] || []).slice(modalPage * modalItemsPerPage, (modalPage + 1) * modalItemsPerPage).map((item, idx) => {
                      const achievement = item.forecast > 0 ? (item.so / item.forecast) * 100 : 0;
                      const rowNumber = (modalPage * modalItemsPerPage) + idx + 1;
                      return (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-4 text-sm text-gray-500 text-center font-mono">{rowNumber}</td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.kode_st}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{item.dimensi}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 text-right font-mono">{Math.round(item.forecast).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 text-right font-mono">{Math.round(item.so).toLocaleString()}</td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-3">
                              <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden hidden sm:block">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    achievement >= 100 ? 'bg-emerald-500' : 
                                    achievement >= 80 ? 'bg-blue-500' : 
                                    achievement >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                  }`}
                                  style={{ width: `${Math.min(achievement, 100)}%` }}
                                />
                              </div>
                              <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                                achievement >= 100 ? 'bg-emerald-50 text-emerald-700' : 
                                achievement >= 80 ? 'bg-blue-50 text-blue-700' : 
                                achievement >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {(achievement ?? 0).toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 flex justify-center items-center">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setModalPage(prev => Math.max(0, prev - 1))}
                  disabled={modalPage === 0}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <span className="text-sm font-medium text-gray-500">
                  Halaman {modalPage + 1} dari {Math.ceil((fcsDrillDownData[selectedFcsCustomer.originalName]?.length || 0) / modalItemsPerPage)}
                </span>
                <button 
                  onClick={() => setModalPage(prev => Math.min(Math.ceil((fcsDrillDownData[selectedFcsCustomer.originalName]?.length || 0) / modalItemsPerPage) - 1, prev + 1))}
                  disabled={modalPage >= Math.ceil((fcsDrillDownData[selectedFcsCustomer.originalName]?.length || 0) / modalItemsPerPage) - 1}
                  className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dead Stock Modal */}
      {isDeadStockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-100 bg-white z-20 relative rounded-t-2xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">Detail Dead Stock: {selectedDeadStockType}</h3>
                <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl w-fit">
                  {(['ALL', 'FG', 'WIP', 'WIP LT'] as const).map(type => (
                    <button 
                      key={type}
                      onClick={() => {
                        setSelectedDeadStockType(type);
                        setModalPage(0);
                      }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedDeadStockType === type ? 'bg-white text-[#A67C52] shadow-md' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => setIsDeadStockModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-8 pb-8">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-100">
                    <th className="py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">FG (Kg)</th>
                    <th className="py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">WIP (Kg)</th>
                    <th className="py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">WIP LT (Kg)</th>
                    <th className="py-4 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Total (Kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {deadStockDetails
                    .filter(ds => {
                      if (selectedDeadStockType === 'ALL') return ds.totalKg > 0;
                      if (selectedDeadStockType === 'FG') return ds.fgKg > 0;
                      if (selectedDeadStockType === 'WIP') return ds.wipKg > 0;
                      if (selectedDeadStockType === 'WIP LT') return ds.wipLtKg > 0;
                      return false;
                    })
                    .slice(modalPage * modalItemsPerPage, (modalPage + 1) * modalItemsPerPage)
                    .map((ds, idx) => (
                      <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-4 text-sm font-medium text-gray-900">{ds.customer}</td>
                        <td className="py-4 px-4 text-sm text-gray-600 text-right">{ds.fgKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-4 text-sm text-gray-600 text-right">{ds.wipKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-4 text-sm text-gray-600 text-right">{ds.wipLtKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="py-4 px-4 text-sm font-bold text-indigo-600 text-right">{ds.totalKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t border-gray-100 flex justify-between items-center bg-gray-50">
              <div className="text-xs text-gray-500 font-medium">
                Showing {modalPage * modalItemsPerPage + 1} to {Math.min((modalPage + 1) * modalItemsPerPage, deadStockDetails.length)} of {deadStockDetails.length} customers
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setModalPage(prev => Math.max(0, prev - 1))}
                  disabled={modalPage === 0}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold hover:bg-white disabled:opacity-50 transition-all shadow-sm"
                >
                  Previous
                </button>
                <button 
                  onClick={() => setModalPage(prev => prev + 1)}
                  disabled={(modalPage + 1) * modalItemsPerPage >= deadStockDetails.length}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-bold hover:bg-white disabled:opacity-50 transition-all shadow-sm"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Slow Moving Stock Modal */}
      {isSlowMovingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#F8FAFC] rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-100 bg-white z-20 relative rounded-t-3xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">Detail Slow Moving Stock</h3>
                <p className="text-sm text-gray-500 font-medium">Berdasarkan Jenis Material (PASM = SLOW)</p>
              </div>
              <button 
                onClick={() => setIsSlowMovingModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 h-full">
                {(() => {
                  const paginatedCards = slowMovingCards.slice(slowMovingPage * slowMovingItemsPerPage, (slowMovingPage + 1) * slowMovingItemsPerPage);

                  return paginatedCards.map((card, idx) => {
                    if (card.type === 'static-jenis') {
                      return (
                        <div key="static-jenis" className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center transition-all hover:shadow-xl h-full">
                          <div className="h-14 flex items-center justify-center mb-4 w-full">
                            <h4 className="text-lg font-bold text-[#2D3748] text-center leading-tight">Berdasarkan Jenis Stock</h4>
                          </div>
                          <div className="relative w-48 h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={slowMovingStock.byJenisStock}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={2}
                                  dataKey="value"
                                  stroke="none"
                                >
                                  {slowMovingStock.byJenisStock.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: number) => `${value.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg`}
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-xl font-black text-[#2D3748] leading-none">
                                {Math.round(slowMovingStock.totalKg / 1000).toLocaleString()}
                                Ton
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Total</span>
                            </div>
                          </div>
                          <div className="mt-6 w-full space-y-3">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-500 font-medium">Total Weight</span>
                              <span className="font-bold text-[#2D3748]">{Math.round(slowMovingStock.totalKg / 1000).toLocaleString()} Ton</span>
                            </div>
                            <div className="pt-4 grid grid-cols-2 gap-2">
                              {slowMovingStock.byJenisStock.map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></div>
                                  <span className="text-[10px] font-bold text-gray-600 uppercase truncate" title={d.name}>{d.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    if (card.type === 'static-lokasi') {
                      return (
                        <div key="static-lokasi" className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center transition-all hover:shadow-xl h-full">
                          <div className="h-14 flex items-center justify-center mb-4 w-full">
                            <h4 className="text-lg font-bold text-[#2D3748] text-center leading-tight">Berdasarkan Lokasi Gudang</h4>
                          </div>
                          <div className="relative w-48 h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={slowMovingStock.byLokasiGudang}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={2}
                                  dataKey="value"
                                  stroke="none"
                                >
                                  {slowMovingStock.byLokasiGudang.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: number) => `${value.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg`}
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-xl font-black text-[#2D3748] leading-none">
                                {Math.round(slowMovingStock.totalKg / 1000).toLocaleString()}
                                Ton
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Total</span>
                            </div>
                          </div>
                          <div className="mt-6 w-full space-y-3">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-500 font-medium">Total Weight</span>
                              <span className="font-bold text-[#2D3748]">{Math.round(slowMovingStock.totalKg / 1000).toLocaleString()} Ton</span>
                            </div>
                            <div className="pt-4 grid grid-cols-2 gap-2">
                              {slowMovingStock.byLokasiGudang.map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></div>
                                  <span className="text-[10px] font-bold text-gray-600 uppercase truncate" title={d.name}>{d.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (card.type === 'static-status') {
                      return (
                        <div key="static-status" className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center transition-all hover:shadow-xl h-full">
                          <div className="h-14 flex items-center justify-center mb-4 w-full">
                            <h4 className="text-lg font-bold text-[#2D3748] text-center leading-tight">Berdasarkan Status Stock</h4>
                          </div>
                          <div className="relative w-48 h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={slowMovingStock.byStatusStock}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={2}
                                  dataKey="value"
                                  stroke="none"
                                >
                                  {slowMovingStock.byStatusStock.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: number) => `${value.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg`}
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-xl font-black text-[#2D3748] leading-none">
                                {Math.round(slowMovingStock.totalKg / 1000).toLocaleString()}
                                Ton
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Total</span>
                            </div>
                          </div>
                          <div className="mt-6 w-full space-y-3">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-500 font-medium">Total Weight</span>
                              <span className="font-bold text-[#2D3748]">{Math.round(slowMovingStock.totalKg / 1000).toLocaleString()} Ton</span>
                            </div>
                            <div className="pt-4 grid grid-cols-2 gap-2">
                              {slowMovingStock.byStatusStock.map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></div>
                                  <span className="text-[10px] font-bold text-gray-600 uppercase truncate" title={d.name}>{d.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (card.type === 'static-unfifo') {
                      return (
                        <div key="static-unfifo" className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center transition-all hover:shadow-xl h-full">
                          <div className="h-14 flex items-center justify-center mb-4 w-full">
                            <h4 className="text-lg font-bold text-[#2D3748] text-center leading-tight">Berdasarkan Unfifo</h4>
                          </div>
                          <div className="relative w-48 h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={slowMovingStock.byUnfifo}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={2}
                                  dataKey="value"
                                  stroke="none"
                                >
                                  {slowMovingStock.byUnfifo.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: number) => `${value.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg`}
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-xl font-black text-[#2D3748] leading-none">
                                {Math.round(slowMovingStock.totalKg / 1000).toLocaleString()}
                                Ton
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Total</span>
                            </div>
                          </div>
                          <div className="mt-6 w-full space-y-3">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-500 font-medium">Total Weight</span>
                              <span className="font-bold text-[#2D3748]">{Math.round(slowMovingStock.totalKg / 1000).toLocaleString()} Ton</span>
                            </div>
                            <div className="pt-4 grid grid-cols-2 gap-2">
                              {slowMovingStock.byUnfifo.map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></div>
                                  <span className="text-[10px] font-bold text-gray-600 uppercase truncate" title={d.name}>{d.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    if (card.type === 'dynamic') {
                      const item = card.data;
                      const chartData = [
                        { name: 'FG ST', value: item.fgStKg, color: '#10B981' },
                        { name: 'FG LT', value: item.fgLtKg, color: '#3B82F6' },
                        { name: 'WIP ST', value: item.wipStKg, color: '#F59E0B' },
                        { name: 'WIP LT', value: item.wipLtKg, color: '#EF4444' },
                      ].filter(d => d.value > 0);

                      return (
                        <div key={`dynamic-${idx}`} className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 flex flex-col items-center transition-all hover:shadow-xl h-full">
                          <div className="h-14 flex items-center justify-center mb-4 w-full">
                            <h4 className="text-lg font-bold text-[#2D3748] text-center leading-tight">
                              {item.jenis}
                            </h4>
                          </div>
                          
                          <div className="relative w-48 h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={chartData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={80}
                                  paddingAngle={2}
                                  dataKey="value"
                                  stroke="none"
                                >
                                  {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip 
                                  formatter={(value: number) => `${value.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg`}
                                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-xl font-black text-[#2D3748] leading-none text-center">
                                {Math.round(item.totalKg >= 1000 ? item.totalKg / 1000 : item.totalKg).toLocaleString()}
                                {item.totalKg >= 1000 ? 't' : 'kg'}
                              </span>
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Slow Moving</span>
                            </div>
                          </div>

                          <div className="mt-6 w-full space-y-3">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-500 font-medium">Total Weight</span>
                              <span className="font-bold text-[#2D3748]">{Math.round(item.totalKg).toLocaleString()} Kg</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-500 font-medium">Total Items</span>
                              <span className="font-bold text-[#2D3748]">{item.count.toLocaleString()} Items</span>
                            </div>
                            
                            <div className="pt-4 grid grid-cols-2 gap-2">
                              {chartData.map((d, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }}></div>
                                  <span className="text-[10px] font-bold text-gray-600 uppercase truncate" title={d.name}>{d.name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  });
                })()}
              </div>
            </div>

            <div className="p-8 border-t border-gray-100 flex justify-between items-center bg-white">
              <div className="flex flex-col">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Grand Total Slow Moving</span>
                <span className="text-xl font-black text-[#F59E0B]">{Math.round(slowMovingStock.totalKg / 1000).toLocaleString()} Ton</span>
              </div>
              
              {/* Pagination Controls */}
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setSlowMovingPage(prev => Math.max(0, prev - 1))}
                  disabled={slowMovingPage === 0}
                  className="p-3 rounded-2xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-600" />
                </button>
                <span className="text-sm font-bold text-gray-500 bg-gray-50 px-4 py-2 rounded-xl">
                  Halaman {slowMovingPage + 1} dari {Math.ceil(slowMovingCards.length / slowMovingItemsPerPage)}
                </span>
                <button 
                  onClick={() => setSlowMovingPage(prev => Math.min(Math.ceil(slowMovingCards.length / slowMovingItemsPerPage) - 1, prev + 1))}
                  disabled={slowMovingPage >= Math.ceil(slowMovingCards.length / slowMovingItemsPerPage) - 1}
                  className="p-3 rounded-2xl border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                >
                  <ChevronRight className="w-6 h-6 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Yield Tubing Modal */}
      {isYieldModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#FDFBF7] rounded-[40px] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/20 flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#8B5CF6] flex items-center justify-center text-white shadow-lg shadow-purple-200">
                  <Percent className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#2D3748] tracking-tight">Detail Yield Tubing</h3>
                  <p className="text-sm font-medium text-gray-500 mt-1">Persentase GR / GI berdasarkan Work Center</p>
                </div>
              </div>
              <button 
                onClick={() => setIsYieldModalOpen(false)}
                className="p-3 hover:bg-gray-100 rounded-full transition-all active:scale-90 text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 bg-gradient-to-b from-transparent to-gray-50/50">
              <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-hidden p-6">
                <div className="h-[400px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={(processFilter === 'LT' ? yieldByWorkCenterLT : yieldByWorkCenterST).filter(d => d.category === (processFilter === 'LT' ? 'Tubing' : 'Haven'))}
                      margin={{ top: 20, right: 30, left: 0, bottom: 40 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                      <XAxis 
                        dataKey="workCenter" 
                        angle={0} 
                        textAnchor="middle" 
                        height={30} 
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                        axisLine={{ stroke: '#D1D5DB' }}
                        tickLine={false}
                      />
                      <YAxis 
                        yAxisId="left"
                        domain={[75, 'auto']}
                        tickFormatter={(value) => `${value}%`}
                        tick={{ fontSize: 12, fill: '#6B7280' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-100">
                                <p className="font-bold text-gray-800 mb-2">{label}</p>
                                <div className="space-y-1 text-sm">
                                  <p className="text-emerald-600"><span className="font-medium">GR:</span> {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(data.grKg)} Kg</p>
                                  <p className="text-amber-600"><span className="font-medium">GI:</span> {new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(data.giKg)} Kg</p>
                                  <p className="text-purple-600"><span className="font-medium">Yield Aktual:</span> {(data?.yieldPercent ?? 0).toFixed(2)}%</p>
                                  <p className="text-red-500"><span className="font-medium">Target Yield:</span> {data.targetYield > 0 ? `${data.targetYield}%` : '-'}</p>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '20px' }} />
                      <Bar 
                        yAxisId="left"
                        dataKey="yieldPercent" 
                        name="Yield Aktual" 
                        fill="#8B5CF6" 
                        radius={[4, 4, 0, 0]} 
                        barSize={40}
                        onClick={(data) => {
                          setSelectedWorkCenter(data);
                          setIsYieldDetailModalOpen(true);
                        }}
                        className="cursor-pointer"
                      />
                      <Line 
                        yAxisId="left"
                        type="monotone" 
                        dataKey="targetYield" 
                        name="Target Yield" 
                        stroke="#EF4444" 
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#EF4444', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6 }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Yield Tubing Detail Modal */}
      {isSpeedDetailModalOpen && selectedSpeedWorkCenter && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-10">
              <div>
                <h3 className="text-2xl font-black text-[#2D3748] tracking-tight">Detail Speed Achievement - {selectedSpeedWorkCenter.workCenter}</h3>
                <p className="text-sm font-medium text-gray-500 mt-1">Pencapaian speed per item pada mesin ini (Urut Terendah)</p>
              </div>
              <button 
                onClick={() => setIsSpeedDetailModalOpen(false)}
                className="p-3 hover:bg-gray-100 rounded-full transition-all active:scale-90 text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1 h-[500px]">
              <table className="w-full text-[11px] text-left text-gray-500">
                <thead className="text-[10px] text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-md">
                  <tr>
                    <th className="px-6 py-4">Kode Material</th>
                    <th className="px-6 py-4">Dimensi</th>
                    <th className="px-6 py-4">Order No</th>
                    <th className="px-6 py-4">Actual ({processFilter === 'ST' ? 'Pcs' : 'Kg'})</th>
                    <th className="px-6 py-4">Target ({processFilter === 'ST' ? 'Pcs' : 'Kg'})</th>
                    <th className="px-6 py-4">Machine Time (Min)</th>
                    <th className="px-6 py-4">Achievement (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {mb51MillData
                    .filter((row: any) => {
                      const proses = (row.proses ? row.proses.toString().trim().toUpperCase() : 'LT');
                      const wc = (row.work_centre_lt || 'Unknown').trim();
                      return proses === processFilter && wc === selectedSpeedWorkCenter.workCenter;
                    })
                    .map((row: any) => {
                      const coisInfo = coisMapState.get((row.order_no || '').trim()) || {};
                      const machineTime = Number(coisInfo.machine_time) || 0;
                      const kode = row.kode_lt || row.kode_st || '';
                      const mInfo = materialInfoMapState.get(normalizeCode(kode)) || {};
                      
                      let actual = 0;
                      let targetPerHour = 0;
                      
                      if (processFilter === 'ST') {
                        actual = Number(row.gr_qty_pcs) || 0;
                        targetPerHour = mInfo.pcs_per_jam_cut || 0;
                      } else {
                        actual = Number(row.gr_qty_kg) || 0;
                        targetPerHour = mInfo.kg_per_jam_mill || 0;
                      }
                      
                      const targetTotal = (machineTime / 60) * targetPerHour;
                      const achievement = targetTotal > 0 ? (actual / targetTotal) * 100 : 0;
                      
                      return {
                        ...row,
                        machineTime,
                        actual,
                        targetTotal,
                        achievement
                      };
                    })
                    .sort((a, b) => a.achievement - b.achievement)
                    .map((row: any, index: number) => (
                      <tr key={index} className="bg-white border-b hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900">{row.kode_st || row.kode_lt || '-'}</td>
                        <td className="px-6 py-4">{row.dimensi || '-'}</td>
                        <td className="px-6 py-4">{row.order_no || '-'}</td>
                        <td className="px-6 py-4">{new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(row.actual)}</td>
                        <td className="px-6 py-4">{new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(row.targetTotal)}</td>
                        <td className="px-6 py-4">{new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(row.machineTime)}</td>
                        <td className={`px-6 py-4 font-bold ${row.achievement < 100 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {(row?.achievement ?? 0).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            
          </div>
        </div>
      )}

      {isYieldDetailModalOpen && selectedWorkCenter && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-10">
              <div>
                <h3 className="text-2xl font-black text-[#2D3748] tracking-tight">Detail Yield No OK - {selectedWorkCenter.workCenter}</h3>
                <p className="text-sm font-medium text-gray-500 mt-1">Item dengan status yield tidak OK pada mesin ini</p>
              </div>
              <button 
                onClick={() => setIsYieldDetailModalOpen(false)}
                className="p-3 hover:bg-gray-100 rounded-full transition-all active:scale-90 text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-0 overflow-y-auto flex-1 h-[500px]">
              <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10 shadow-md">
                  <tr>
                    <th className="px-6 py-4">Order No</th>
                    <th className="px-6 py-4">Kode Material</th>
                    <th className="px-6 py-4">Dimensi</th>
                    <th className="px-6 py-4">GI (Kg)</th>
                    <th className="px-6 py-4">GR (Kg)</th>
                    <th className="px-6 py-4">GR (Pcs)</th>
                    <th className="px-6 py-4">MOQ</th>
                    <th className="px-6 py-4">Yield (%)</th>
                    <th className="px-6 py-4">Target (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {mb51MillData
                    .filter((row: any) => {
                      const proses = (row.proses ? row.proses.toString().trim().toUpperCase() : 'LT');
                      const wc = (row.work_centre_lt || 'Unknown').trim();
                      return proses === processFilter && 
                             wc === selectedWorkCenter.workCenter &&
                             (Number(row.gi_qty_kg || 0) > 0 ? (Number(row.gr_qty_kg || 0) / Number(row.gi_qty_kg || 0) * 100) : 0) < (mesinYieldData.get(selectedWorkCenter.workCenter.toUpperCase()) || 0);
                    })
                    .sort((a, b) => {
                      const yieldA = Number(a.gi_qty_kg || 0) > 0 ? (Number(a.gr_qty_kg || 0) / Number(a.gi_qty_kg || 0) * 100) : 0;
                      const yieldB = Number(b.gi_qty_kg || 0) > 0 ? (Number(b.gr_qty_kg || 0) / Number(b.gi_qty_kg || 0) * 100) : 0;
                      return yieldA - yieldB;
                    })
                    .map((row: any, index: number) => {
                      const yieldPercent = Number(row.gi_qty_kg || 0) > 0 ? (Number(row.gr_qty_kg || 0) / Number(row.gi_qty_kg || 0) * 100) : 0;
                      return (
                        <tr 
                          key={index} 
                          className="bg-white border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => {
                            if (row.order_no) {
                              setSelectedOrderNo(row.order_no);
                              setIsOrderDowntimeModalOpen(true);
                            }
                          }}
                        >
                          <td className="px-6 py-4 font-medium text-gray-900">{row.order_no || '-'}</td>
                          <td className="px-6 py-4 font-medium text-gray-900">{row.kode_st || row.kode_lt || '-'}</td>
                          <td className="px-6 py-4">{row.dimensi || '-'}</td>
                          <td className="px-6 py-4">{new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(row.gi_qty_kg || 0))}</td>
                          <td className="px-6 py-4">{new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(row.gr_qty_kg || 0))}</td>
                          <td className="px-6 py-4">{new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(row.gr_qty_pcs || 0))}</td>
                          <td className="px-6 py-4">{new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Number(row.moq || 0))}</td>
                          <td className="px-6 py-4 text-red-600 font-bold">{(yieldPercent ?? 0).toFixed(2)}%</td>
                          <td className="px-6 py-4">{mesinYieldData.get(selectedWorkCenter.workCenter.toUpperCase()) || 0}%</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
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

      {/* Loading vs Capacity LT Modal */}
      {isLoadingVsCapacityModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#FDFBF7] rounded-[40px] w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl border border-white/20 flex flex-col animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-white/50 backdrop-blur-md sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#3B82F6] flex items-center justify-center text-white shadow-lg shadow-blue-200">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#2D3748] tracking-tight">Loading vs Capacity Tubing</h3>
                  <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-0.5">Proses LT ({dashboardCalcMode} Analysis)</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button 
                    onClick={() => setDashboardCalcMode('Monthly')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${dashboardCalcMode === 'Monthly' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    MONTHLY
                  </button>
                  <button 
                    onClick={() => setDashboardCalcMode('Current')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${dashboardCalcMode === 'Current' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    CURRENT
                  </button>
                </div>
                <button 
                  onClick={() => setIsLoadingVsCapacityModalOpen(false)}
                  className="p-3 hover:bg-gray-100 rounded-2xl transition-all active:scale-90 group"
                >
                  <X className="w-6 h-6 text-gray-400 group-hover:text-gray-600" />
                </button>
              </div>
            </div>

            <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Normal Shift */}
                <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 flex flex-col transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Normal Shift</span>
                    <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                      <Calendar className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-3xl font-black text-[#2D3748]">
                      {((loadingVsCapacityLT.loading / (loadingVsCapacityLT.scenarios.normal || 1)) * 100).toFixed(1)}%
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                          style={{ width: `${Math.min(100, (loadingVsCapacityLT.loading / (loadingVsCapacityLT.scenarios.normal || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <span>Loading</span>
                      <span className="text-gray-600">{loadingVsCapacityLT.loading.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <span>Capacity</span>
                      <span className="text-gray-600">{loadingVsCapacityLT.scenarios.normal.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg</span>
                    </div>
                  </div>
                </div>

                {/* Long Shift */}
                <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 flex flex-col transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Long Shift</span>
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-3xl font-black text-[#2D3748]">
                      {((loadingVsCapacityLT.loading / (loadingVsCapacityLT.scenarios.long || 1)) * 100).toFixed(1)}%
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-indigo-500 rounded-full transition-all duration-1000" 
                          style={{ width: `${Math.min(100, (loadingVsCapacityLT.loading / (loadingVsCapacityLT.scenarios.long || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <span>Loading</span>
                      <span className="text-gray-600">{loadingVsCapacityLT.loading.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <span>Capacity</span>
                      <span className="text-gray-600">{loadingVsCapacityLT.scenarios.long.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg</span>
                    </div>
                  </div>
                </div>

                {/* Long Shift + OT Weekend */}
                <div className="bg-white p-6 rounded-3xl shadow-lg border border-gray-100 flex flex-col transition-all hover:shadow-xl hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-xs font-black text-gray-400 uppercase tracking-widest">Long Shift + OT</span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-3xl font-black text-[#2D3748]">
                      {((loadingVsCapacityLT.loading / (loadingVsCapacityLT.scenarios.otWeekend || 1)) * 100).toFixed(1)}%
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-1000" 
                          style={{ width: `${Math.min(100, (loadingVsCapacityLT.loading / (loadingVsCapacityLT.scenarios.otWeekend || 1)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-6 space-y-2">
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <span>Loading</span>
                      <span className="text-gray-600">{loadingVsCapacityLT.loading.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg</span>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-gray-400">
                      <span>Capacity</span>
                      <span className="text-gray-600">{loadingVsCapacityLT.scenarios.otWeekend.toLocaleString(undefined, {maximumFractionDigits: 0})} Kg</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-6 bg-blue-50 rounded-[32px] border border-blue-100">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 flex-shrink-0">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-blue-900 uppercase tracking-wider">Analisis Kapasitas</h4>
                    <p className="text-sm text-blue-700 mt-1 leading-relaxed">
                      Data di atas menunjukkan persentase pembebanan (Loading) terhadap tiga skenario kapasitas yang berbeda. 
                      Gunakan informasi ini untuk menentukan apakah diperlukan penambahan shift atau lembur akhir pekan guna memenuhi target produksi bulan ini.
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Welding Detail Modal */}
      {isWeldingDetailModalOpen && selectedWeldingWC && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-100 bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#2D3748] tracking-tight">Detail Item: {selectedWeldingWC}</h3>
                  <p className="text-sm font-medium text-gray-500 mt-1">Daftar item produksi pada work center ini</p>
                </div>
              </div>
              <button 
                onClick={() => setIsWeldingDetailModalOpen(false)}
                className="p-3 hover:bg-gray-100 rounded-full transition-all active:scale-90 text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 p-8 bg-gray-50/30 overflow-hidden flex flex-col">
              <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-auto flex-1">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="z-10">
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">No</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Order No</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Material</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">D1</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">D2</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Dia</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Thick</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">GR (Kg)</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Machine Time</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">% Welding Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {weldingDetails.map((row, idx) => (
                      <tr 
                        key={idx} 
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => {
                          if (row.order_no && row.order_no !== '-') {
                            setSelectedOrderNo(row.order_no);
                            setIsOrderDowntimeModalOpen(true);
                          }
                        }}
                      >
                        <td className="p-4 text-sm text-gray-600">{idx + 1}</td>
                        <td className="p-4 text-sm font-bold text-gray-700">{row.order_no || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.material || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.d1 || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.d2 || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.dia || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.thick || '-'}</td>
                        <td className="p-4 text-sm font-bold text-emerald-600 text-right">{Math.round(Number(row.gr_qty_kg) || 0).toLocaleString()}</td>
                        <td className="p-4 text-sm font-bold text-indigo-600 text-right">{(Number(row.machine_time) || 0).toFixed(1)}</td>
                        <td className="p-4 text-sm font-bold text-blue-600 text-right">{(row.weldingPercent || 0).toFixed(2)}%</td>
                      </tr>
                    ))}
                    {weldingDetails.length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-12 text-center text-gray-400 font-medium">Tidak ada data detail untuk work center ini</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Down Time Detail Modal */}
      {isDownTimeDetailModalOpen && selectedDownTimeWC && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-100 bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-200">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#2D3748] tracking-tight">Detail Down Time: {selectedDownTimeWC}</h3>
                  <p className="text-sm font-medium text-gray-500 mt-1">Daftar item produksi pada work center ini</p>
                </div>
              </div>
              <button 
                onClick={() => setIsDownTimeDetailModalOpen(false)}
                className="p-3 hover:bg-gray-100 rounded-full transition-all active:scale-90 text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 p-8 bg-gray-50/30 overflow-hidden flex flex-col">
              <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-auto flex-1">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="z-10">
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">No</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Order No</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Material</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">D1</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">D2</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Dia</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Thick</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">GR (Kg)</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Down Time</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">% Down Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {downTimeDetails.map((row, idx) => (
                      <tr 
                        key={idx} 
                        className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                        onClick={() => {
                          if (row.order_no && row.order_no !== '-') {
                            setSelectedOrderNo(row.order_no);
                            setIsOrderDowntimeModalOpen(true);
                          }
                        }}
                      >
                        <td className="p-4 text-sm text-gray-600">{idx + 1}</td>
                        <td className="p-4 text-sm font-bold text-gray-700">{row.order_no || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.material || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.d1 || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.d2 || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.dia || '-'}</td>
                        <td className="p-4 text-sm text-gray-600">{row.thick || '-'}</td>
                        <td className="p-4 text-sm font-bold text-emerald-600 text-right">{Math.round(Number(row.gr_qty_kg) || 0).toLocaleString()}</td>
                        <td className="p-4 text-sm font-bold text-amber-600 text-right">{(Number(row.down_time) || 0).toFixed(1)}</td>
                        <td className="p-4 text-sm font-bold text-blue-600 text-right">{(row.downTimePercent || 0).toFixed(2)}%</td>
                      </tr>
                    ))}
                    {downTimeDetails.length === 0 && (
                      <tr>
                        <td colSpan={10} className="p-12 text-center text-gray-400 font-medium">Tidak ada data detail untuk work center ini</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        </div>
      )}
      {/* Process Time Detail Modal */}
      {isProcessTimeDetailModalOpen && selectedProcessTimeWC && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-100 bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#2D3748] tracking-tight">Detail Process Time: {selectedProcessTimeWC}</h3>
                  <p className="text-sm font-medium text-gray-500 mt-1">Breakdown process time per item</p>
                </div>
              </div>
              <button 
                onClick={() => setIsProcessTimeDetailModalOpen(false)}
                className="p-3 hover:bg-gray-100 rounded-full transition-all active:scale-90 text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 p-8 bg-gray-50/30 overflow-hidden flex flex-col">
              <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-auto flex-1">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="z-10">
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">No</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Order No</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Material</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Dimensi</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">% Set Up</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">% Bongkar</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">% Machine</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">% Down Time</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Total Time (Min)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {processTimeDetails.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-4 text-[11px] text-gray-600">{idx + 1}</td>
                        <td className="p-4 text-[11px] font-bold text-gray-700">{row.order_no}</td>
                        <td className="p-4 text-[11px] font-bold text-gray-700">{row.material}</td>
                        <td className="p-4 text-[11px] text-gray-600">{row.dimensi}</td>
                        <td className="p-4 text-[11px] font-bold text-amber-600 text-right">{(row?.setUpPercent ?? 0).toFixed(1)}%</td>
                        <td className="p-4 text-[11px] font-bold text-blue-600 text-right">{(row?.bongkarPercent ?? 0).toFixed(1)}%</td>
                        <td className="p-4 text-[11px] font-bold text-emerald-600 text-right">{(row?.machinePercent ?? 0).toFixed(1)}%</td>
                        <td className="p-4 text-[11px] font-bold text-rose-600 text-right">{(row?.downTimePercent ?? 0).toFixed(1)}%</td>
                        <td className="p-4 text-[11px] font-bold text-gray-900 text-right">{row.totalTime.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      </tr>
                    ))}
                    {processTimeDetails.length === 0 && (
                      <tr>
                        <td colSpan={9} className="p-12 text-center text-gray-400 font-medium">Tidak ada data detail untuk work center ini</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        </div>
      )}
      {/* Alerts Detail Modal */}
      {isAlertsModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-8 flex justify-between items-center border-b border-gray-100 bg-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-200">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-[#2D3748] tracking-tight">Detail Alerts: Critical (Potensi Delay)</h3>
                  <p className="text-sm font-medium text-gray-500 mt-1">Item dengan DOC (WIP+FG) &lt; 1 hari</p>
                </div>
              </div>
              <button 
                onClick={() => setIsAlertsModalOpen(false)}
                className="p-3 hover:bg-gray-100 rounded-full transition-all active:scale-90 text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 p-8 bg-gray-50/30 overflow-hidden flex flex-col">
              <div className="bg-white rounded-3xl shadow-lg border border-gray-100 overflow-auto flex-1">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead>
                    <tr className="z-10">
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">No</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Customer</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Kode Material</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm whitespace-nowrap">Dimensi</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Sisa Order (Pcs)</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Konversi ST (Pcs)</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">WIP ST (Pcs)</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">FG ST (Pcs)</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Total Stock (Pcs)</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">Avg Delivery/Day</th>
                      <th className="sticky top-0 p-4 text-[10px] font-black text-gray-400 uppercase tracking-wider text-right border-b border-gray-100 bg-gray-50/95 backdrop-blur-sm">DOC (Days)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {alertItems.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-4 text-[11px] text-gray-600">{idx + 1}</td>
                        <td className="p-4 text-[11px] font-bold text-gray-700">{row.customer}</td>
                        <td className="p-4 text-[11px] font-bold text-gray-700">{row.kode_material}</td>
                        <td className="p-4 text-[11px] text-gray-600 whitespace-nowrap">{row.dimensi}</td>
                        <td className="p-4 text-[11px] font-bold text-gray-900 text-right">{Math.round(row.sisa_order).toLocaleString()}</td>
                        <td className="p-4 text-[11px] font-bold text-indigo-600 text-right">{Math.round(row.konversi_st).toLocaleString()}</td>
                        <td className="p-4 text-[11px] font-bold text-amber-600 text-right">{Math.round(row.wip_st).toLocaleString()}</td>
                        <td className="p-4 text-[11px] font-bold text-blue-600 text-right">{Math.round(row.fg_st).toLocaleString()}</td>
                        <td className="p-4 text-[11px] font-bold text-emerald-600 text-right">{Math.round(row.total_stock).toLocaleString()}</td>
                        <td className="p-4 text-[11px] font-bold text-gray-700 text-right">{Math.round(row.avg_delivery).toLocaleString()}</td>
                        <td className="p-4 text-[11px] font-bold text-rose-600 text-right">{(row?.doc ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {alertItems.length === 0 && (
                      <tr>
                        <td colSpan={11} className="p-12 text-center text-gray-400 font-medium">Tidak ada item dalam kategori alert</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
