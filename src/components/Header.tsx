import { useState, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  BarChart2, 
  FileText, 
  Calendar, 
  RefreshCw 
} from 'lucide-react';
import { isSupabaseConfigured, supabase, fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { useViewMode } from '../contexts/ViewModeContext';
import { useMaterialMaster } from '../hooks/useMaterialMaster';

interface HeaderProps {
  userEmail?: string;
  userRole?: string | null;
}

export function Header({ userEmail, userRole }: HeaderProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dbStatus, setDbStatus] = useState<'connected' | 'error' | 'checking'>('checking');
  const { triggerRefresh } = useRefresh();
  const { viewMode, setViewMode } = useViewMode();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentType = searchParams.get('type') || 'tubing';

  const { data: materials = [] } = useMaterialMaster();
  const selectedCustomer = searchParams.get('customer') || 'all';

  const uniqueCustomers = useMemo(() => {
    const custs = new Set<string>();
    materials.forEach((m: any) => {
      if (m.customer) {
        custs.add(m.short_name_customer || m.customer);
      }
    });
    return Array.from(custs).sort();
  }, [materials]);

  const uniqueItems = useMemo(() => {
    const items = new Set<string>();
    materials.forEach((m: any) => {
      const custName = m.short_name_customer || m.customer;
      if (selectedCustomer === 'all' || custName === selectedCustomer) {
        if (m.kode_st) {
          items.add(m.kode_st);
        }
      }
    });
    return Array.from(items).sort();
  }, [materials, selectedCustomer]);

  const { data: categoryAchievement } = useQuery({
    queryKey: ['category-achievement', currentType, searchParams.get('periode')],
    queryFn: async () => {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const periodeParam = searchParams.get('periode') || currentMonth;
      const [year, month] = periodeParam.split('-');
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const targetPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

      const [machines, coisData, shiftData] = await Promise.all([
        fetchAllRows('master_data_mesin', 'work_center,kategori'),
        fetchAllRows('cois_prod', 'work_centre,tanggal,set_up,bongkar,machine_time,down_time', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('daftar_shift', 'work_center,tanggal,plan_working_hour', (q) => q.eq('periode', targetPeriode)),
      ]);

      const workCenters = new Set(
        (machines || [])
          .filter((m: any) => {
            const kategori = (m.kategori || '').toLowerCase();
            if (currentType === 'tubing') return kategori.includes('tubing');
            if (currentType === 'haven') return kategori.includes('haven');
            return !kategori.includes('tubing') && !kategori.includes('haven');
          })
          .map((m: any) => m.work_center.trim().toUpperCase())
      );

      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const isCurrentMonth = periodeParam === currentMonth;

      let totalActualHours = 0;
      (coisData || []).forEach((c: any) => {
        // If current month, only include until yesterday
        if (isCurrentMonth && c.tanggal >= todayStr) return;

        const wc = (c.work_centre || '').trim().toUpperCase();
        if (workCenters.has(wc)) {
          const totalTime = (Number(c.set_up) || 0) + (Number(c.bongkar) || 0) + (Number(c.machine_time) || 0) + (Number(c.down_time) || 0);
          totalActualHours += (totalTime / 60);
        }
      });

      let totalPlanHours = 0;
      (shiftData || []).forEach((s: any) => {
        // If current month, only include until yesterday
        if (isCurrentMonth && s.tanggal >= todayStr) return;

        const wc = (s.work_center || '').trim().toUpperCase();
        if (workCenters.has(wc)) {
          totalPlanHours += (Number(s.plan_working_hour) || 0);
        }
      });

      return totalPlanHours > 0 ? (totalActualHours / totalPlanHours) * 100 : 0;
    },
    enabled: location.pathname === '/plan-vs-actual-working-hour',
    staleTime: 5 * 60 * 1000,
  });

  const { data: downTimeCategories = [] } = useQuery({
    queryKey: ['down-time-categories', searchParams.get('periode')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('down_time')
        .select('down_time_kategori, periode');
      if (error) throw error;
      
      const selectedPeriod = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const [year, month] = selectedPeriod.split('-');
      const formattedPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

      const filteredData = data.filter(d => d.periode === formattedPeriode || d.periode === selectedPeriod);
      const cats = new Set(filteredData.map(d => d.down_time_kategori).filter(Boolean));
      return Array.from(cats).sort();
    },
    enabled: location.pathname === '/down-time-report',
    staleTime: 5 * 60 * 1000,
  });

  const getPageTitle = () => {
    const path = location.pathname;
    const type = searchParams.get('type');

    if (path === '/') return 'Executive Summary';
    if (path === '/delivery-monitor') {
      const view = searchParams.get('view');
      return view === 'delivery-ontime' ? 'Delivery Ontime Performance' : 'Delivery';
    }
    if (path === '/min-max-stock') return 'Availability Stock';
    if (path === '/slow-moving-stock') return 'Slow Moving Stock';
    if (path === '/dead-stock') return 'Dead Stock';
    if (path === '/excess-stock') return 'Excess Stock';
    if (path === '/production-output') return 'Production Output';
    if (path === '/production-yield') return 'Production Yield';
    if (path === '/productivity-rate') return 'Productivity Rate';
    if (path === '/roll-changing-control') return 'Roll Changing Control';
    if (path === '/speed-achievement') return 'Speed Achievement';
    if (path === '/production-control') return 'Production Control';
    if (path === '/inventory-control') return 'Inventory Control';
    if (path === '/finished-goods-stock') return 'Finished Goods Stock';
    if (path === '/nc-stock') return 'NC Stock';
    if (path === '/raw-material-stock') return 'Raw Material Stock';
    if (path === '/forecast-vs-actual') return 'Forecast vs Actual SO';
    if (path === '/forecast-accuracy') return 'Forecast Accuracy';
    if (path === '/sales-order') return 'Sales Order (SO)';
    if (path === '/backorder') return 'Backorder';
    if (path === '/demand-trend') return 'Demand Trend Analysis';
    if (path === '/report') return 'Report Regular Order';
    if (path === '/loading-vs-capacity') return 'Loading vs Capacity';
    if (path === '/material-requirement') {
      if (type === 'coil') return 'Coil Requirement';
      if (type === 'strip') return 'Strip Requirement';
      return 'Material Requirement';
    }
    if (path === '/kombinasi-sliting') return 'Kombinasi Sliting';
    if (path === '/monitoring-subcont') return 'Monitoring Subcont';
    if (path === '/daftar-shift') return 'Daftar Shift';
    if (path === '/order-monitor') return 'Order Monitor';
    if (path === '/alerts') return 'Alerts';
    if (path === '/upload') return 'Upload Data';
    if (path === '/master-data') return 'Master Data';
    if (path === '/user-management') return 'User Management';
    if (path === '/planning') return 'Planning Overview';
    if (path === '/line-utilization') return 'Line Utilization';
    if (path === '/plan-vs-actual-working-hour') return 'Plan vs Actual Working Hour';
    if (path === '/plan-vs-actual') return 'Plan vs Actual Production';
    if (path === '/down-time-report') return 'Down Time Report';
    if (path === '/down-grade-reject-report') return 'Down Grade & Reject Report';
    if (path === '/welding-downtime') return 'Welding & Down Time Performance';
    if (path === '/p3-stock') return 'P3 Vs Stock';
    if (path === '/customer-performance') return 'Customer Performance';
    if (path === '/so-vs-delivery') return 'SO vs Delivery';
    return '';
  };

  const checkConnection = async () => {
    try {
      const { error } = await supabase.from('material_master').select('id').limit(1);
      if (error) throw error;
      setDbStatus('connected');
    } catch (err) {
      console.error("Database connection error:", err);
      setDbStatus('error');
    }
  };

  useEffect(() => {
    if (isSupabaseConfigured) {
      checkConnection();
    } else {
      setDbStatus('error');
    }
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setDbStatus('checking');
    await checkConnection();
    
    // Trigger global refresh via context
    triggerRefresh();
    
    // Simulate a slight delay for visual feedback
    setTimeout(() => {
      setIsRefreshing(false);
    }, 500);
  };

  const getRoleColor = (role: string | null) => {
    switch (role) {
      case 'admin': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'ppic': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'ppiclt': return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      case 'ppicst': return 'bg-sky-100 text-sky-700 border-sky-200';
      case 'rmp': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const formatPeriode = (periode: string | null) => {
    const p = periode || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
    const [year, month] = p.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-8 shadow-sm z-10">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">{getPageTitle()}</h2>
        {location.pathname === '/plan-vs-actual-working-hour' && categoryAchievement !== null && (
          <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-100 rounded-full">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider">{currentType.charAt(0).toUpperCase() + currentType.slice(1)} Achievement</span>
            <span className="text-sm font-bold text-emerald-600">{(categoryAchievement ?? 0).toFixed(1)}%</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center pr-6 border-r border-gray-100 gap-4">
          {(['/slow-moving-stock', '/nc-stock', '/dead-stock', '/excess-stock', '/min-max-stock', '/down-time-report', '/down-grade-reject-report'].includes(location.pathname) || (location.pathname === '/delivery-monitor' && searchParams.get('view') === 'delivery-ontime')) && (
            <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1 mr-2">
              <button
                onClick={() => setViewMode('chart')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  viewMode === 'chart'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                Grafik
              </button>
              <button
                onClick={() => setViewMode('report')}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  viewMode === 'report'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Report
              </button>
            </div>
          )}

          {(location.pathname === '/' || location.pathname === '/planning' || location.pathname === '/production-output' || location.pathname === '/roll-changing-control' || location.pathname === '/production-yield' || location.pathname === '/productivity-rate' || location.pathname === '/speed-achievement' || location.pathname === '/welding-downtime' || location.pathname === '/plan-vs-actual-working-hour' || location.pathname === '/down-time-report' || location.pathname === '/down-grade-reject-report' || location.pathname === '/loading-vs-capacity' || location.pathname === '/material-requirement' || location.pathname === '/delivery-monitor' || location.pathname === '/p3-stock' || location.pathname === '/production-control') && (
            <div className="flex items-center gap-2 mr-2">
              <div className="relative flex items-center gap-3 bg-white border border-gray-200 rounded-full px-4 py-2 shadow-sm hover:border-emerald-500 transition-all cursor-pointer min-w-[160px] justify-between">
                <input
                  type="month"
                  value={searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`}
                  onChange={(e) => setSearchParams({ ...Object.fromEntries(searchParams), periode: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                />
                <span className="text-[13px] font-bold text-slate-700">
                  {formatPeriode(searchParams.get('periode'))}
                </span>
                <Calendar className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          )}

          {location.pathname === '/roll-changing-control' && (
            <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1 mr-2">
              <button
                onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), viewType: 'monthly' })}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  (searchParams.get('viewType') || 'monthly') === 'monthly'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), viewType: 'current' })}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  searchParams.get('viewType') === 'current'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                Current
              </button>
            </div>
          )}

          {location.pathname === '/down-time-report' && (
            <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1 mr-2">
              <button
                onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), category: 'All' })}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  (searchParams.get('category') || 'Down Time') === 'All'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                All
              </button>
              {downTimeCategories.map((cat: any) => (
                <button
                  key={cat}
                  onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), category: cat })}
                  className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    (searchParams.get('category') || 'Down Time').toLowerCase() === cat.toLowerCase()
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {(location.pathname === '/production-output' || location.pathname === '/production-yield' || location.pathname === '/speed-achievement' || location.pathname === '/welding-downtime' || location.pathname === '/plan-vs-actual-working-hour' || location.pathname === '/line-utilization' || location.pathname === '/loading-vs-capacity' || location.pathname === '/productivity-rate') && (
            <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1 mr-2">
              {[
                { id: 'tubing', label: 'Tubing' },
                { id: 'haven', label: 'Haven' },
                { id: 'others', label: 'Others' }
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), type: cat.id })}
                  className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    currentType === cat.id
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}

          {location.pathname === '/loading-vs-capacity' && (
            <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1 mr-2">
              <button
                onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), calcMode: 'current' })}
                className={`flex items-center gap-1 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  (searchParams.get('calcMode') || 'current') === 'current'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                <RefreshCw className="w-3 h-3" />
                Current
              </button>
              <button
                onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), calcMode: 'monthly' })}
                className={`flex items-center gap-1 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  searchParams.get('calcMode') === 'monthly'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Calendar className="w-3 h-3" />
                Monthly
              </button>
            </div>
          )}

          {(location.pathname === '/demand-trend') && (
            <div className="flex items-center gap-2 mr-2">
              <select
                value={searchParams.get('customer') || 'all'}
                onChange={(e) => setSearchParams({ ...Object.fromEntries(searchParams), customer: e.target.value, item: 'all' })}
                className="bg-white border border-gray-200 text-gray-700 text-[11px] font-bold rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
              >
                <option value="all">All Customer</option>
                {uniqueCustomers.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select
                value={searchParams.get('item') || 'all'}
                onChange={(e) => setSearchParams({ ...Object.fromEntries(searchParams), item: e.target.value })}
                className="bg-white border border-gray-200 text-gray-700 text-[11px] font-bold rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm max-w-[200px]"
              >
                <option value="all">All Item</option>
                {uniqueItems.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1">
                {[
                  { id: 'so', label: 'SO' },
                  { id: 'delivery', label: 'Delivery' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), source: cat.id })}
                    className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                      (searchParams.get('source') || 'so') === cat.id
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1">
                {[
                  { id: '6', label: '6 Bulan' },
                  { id: '12', label: '12 Bulan' }
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), range: cat.id })}
                    className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                      (searchParams.get('range') || '12') === cat.id
                        ? 'bg-emerald-500 text-white shadow-md'
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {location.pathname === '/customer-performance' && (
            <>
              <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1 mr-2">
                <button
                  onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), view: 'chart' })}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    (searchParams.get('view') || 'chart') === 'chart'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  Grafik
                </button>
                <button
                  onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), view: 'report' })}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                    searchParams.get('view') === 'report'
                      ? 'bg-emerald-500 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Report
                </button>
              </div>
            </>
          )}

          {(location.pathname === '/customer-performance' || location.pathname === '/so-vs-delivery') && (
            <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1 mr-2">
              <button
                onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), chartType: 'volume' })}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  (searchParams.get('chartType') || 'volume') === 'volume'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                Volume (Kg)
              </button>
              <button
                onClick={() => setSearchParams({ ...Object.fromEntries(searchParams), chartType: 'percentage' })}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  searchParams.get('chartType') === 'percentage'
                    ? 'bg-emerald-500 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                }`}
              >
                Persentase (%)
              </button>
            </div>
          )}

          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`flex items-center gap-3 bg-white border border-gray-100 shadow-sm px-4 py-1.5 rounded-full hover:bg-slate-50 transition-all group ${isRefreshing ? 'cursor-not-allowed opacity-80' : ''}`}
            title="Reload Database"
          >
            <RefreshCw className={`w-4 h-4 transition-all ${isRefreshing ? 'animate-spin text-emerald-500' : 'text-slate-400 group-hover:text-slate-600'}`} />
            
            <div className="relative flex items-center justify-center">
              {dbStatus === 'connected' && (
                <>
                  <div className="absolute w-4 h-4 bg-emerald-400 rounded-full animate-ping opacity-20"></div>
                  <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
                </>
              )}
              {dbStatus === 'error' && (
                <>
                  <div className="absolute w-4 h-4 bg-red-400 rounded-full animate-ping opacity-20"></div>
                  <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)]"></div>
                </>
              )}
              {dbStatus === 'checking' && (
                <div className="w-2.5 h-2.5 bg-amber-400 rounded-full animate-pulse"></div>
              )}
            </div>
          </button>
        </div>

        {/* User Info Section */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-sm font-bold text-gray-900">{userEmail}</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider ${getRoleColor(userRole)}`}>
              {userRole || 'User'}
            </span>
          </div>
          <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 font-bold border border-indigo-100">
            {userEmail?.[0].toUpperCase()}
          </div>
        </div>
      </div>
    </header>
  );
}
