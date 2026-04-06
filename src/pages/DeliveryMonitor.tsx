import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Truck, Filter, RefreshCw, BarChart3, TrendingUp, ArrowLeft, DollarSign, Clock, ArrowRightLeft, AlertTriangle, Box, X, ChevronLeft, ChevronRight, FileText, PieChart } from 'lucide-react';
import { 
  Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ComposedChart, LabelList, ReferenceLine 
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows, supabase } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { useViewMode } from '../contexts/ViewModeContext';

const CustomXAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const date = new Date(payload.value);
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = day === 0 || day === 6;
  const color = isWeekend ? '#EF4444' : '#94A3B8'; // Red for weekend, gray otherwise
  
  return (
    <text x={x} y={y + 10} textAnchor="middle" fill={color} fontSize={10}>
      {`${date.getDate()}/${date.getMonth() + 1}`}
    </text>
  );
};

export default function DeliveryMonitor() {
  const { refreshKey } = useRefresh();

  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ['delivery-monitor-data', refreshKey],
    queryFn: async () => {
      const [p3s, dels, mats, stocks] = await Promise.all([
        fetchAllRows('p3_data', 'customer,kode_st,qty_p3_pcs,qty_p3_kg,tanggal_delivery'),
        fetchAllRows('deliveries', 'customer,kode_st,qty_delivery_pcs,qty_delivery_kg,tanggal_delivery'),
        fetchAllRows('material_master', 'customer,short_name_customer,kode_st,kode_lt,berat_per_pcs,dimensi,alternative_kodes_st'),
        fetchAllRows('stocks', 'created_at,kode_material,wip_st_kg,wip_lt_kg,fg_st_kg,fg_lt_kg')
      ]);
      return { p3s: p3s || [], dels: dels || [], mats: mats || [], stocks: stocks || [] };
    },
    staleTime: 5 * 60 * 1000,
  });

  const p3Data = rawData?.p3s || [];
  const deliveryData = rawData?.dels || [];
  const materials = rawData?.mats || [];
  const stocks = rawData?.stocks || [];

  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCustomerForDate, setSelectedCustomerForDate] = useState<string | null>(null);
  const [isDateCustomerDetailModalOpen, setIsDateCustomerDetailModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [modalPage, setModalPage] = useState(0);
  const [deliveryPage, setDeliveryPage] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const view = searchParams.get('view') || 'dashboard';
  const { viewMode: subView } = useViewMode();
  const [chartType, setChartType] = useState<'volume' | 'percentage'>('volume');
  const [modalChartType, setModalChartType] = useState<'volume' | 'percentage'>('volume');
  const [modalSubView, setModalSubView] = useState<'chart' | 'report'>('chart');
  const [modalViewMode, setModalViewMode] = useState<'daily' | 'item'>('daily');
  const [isCustomerDetailModalOpen, setIsCustomerDetailModalOpen] = useState(false);
  const itemsPerPageCustomer = 15;
  const itemsPerPageModal = 10;

  const normalizeCust = useCallback((s: string) => {
    if (!s) return '';
    let res = s.trim().toUpperCase();
    res = res.replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '');
    return res.replace(/[^A-Z0-9]/g, '').toLowerCase();
  }, []);

  const normalizeCode = useCallback((s: string) => (s || '').replace(/\s+/g, '').toLowerCase(), []);

  // Process data for charts
  const { dailyData, customerData, itemData, dailyCustomerDetails, totals, customerDailyData } = useMemo(() => {
    if (!materials.length) return { 
      dailyData: [], 
      customerData: [], 
      itemData: [], 
      dailyCustomerDetails: new Map(),
      totals: { p3: 0, delivery: 0 },
      customerDailyData: []
    };

    // Weight lookup maps
    const weightsMap = new Map<string, number>();
    const codeWeightsMap = new Map<string, number>();
    const shortNameMap = new Map<string, string>();
    const dimensiMap = new Map<string, string>();
    const codeDimensiMap = new Map<string, string>();

    materials.forEach((m: any) => {
      const custKey = normalizeCust(m.customer);
      const stKey = normalizeCode(m.kode_st);
      const weight = m.berat_per_pcs || 0;
      const dimensi = m.dimensi || '';
      
      const key = `${custKey}|${stKey}`;
      weightsMap.set(key, weight);
      dimensiMap.set(key, dimensi);
      codeWeightsMap.set(stKey, weight);
      codeDimensiMap.set(stKey, dimensi);
      
      if (m.short_name_customer) {
        shortNameMap.set(custKey, m.short_name_customer);
      }

      if (m.kode_lt) {
        const ltKey = normalizeCode(m.kode_lt);
        weightsMap.set(`${custKey}|${ltKey}`, weight);
        codeWeightsMap.set(ltKey, weight);
      }
      if (m.alternative_kodes_st) {
        m.alternative_kodes_st.split(',').forEach((alt: string) => {
          const altKey = normalizeCode(alt);
          weightsMap.set(`${custKey}|${altKey}`, weight);
          codeWeightsMap.set(altKey, weight);
        });
      }
    });

    const dailyMap = new Map<string, any>();
    const customerDailyMap = new Map<string, any>();
    const customerMap = new Map<string, any>();
    const itemMap = new Map<string, any>();
    const dailyCustomerMap = new Map<string, Map<string, any>>();
    
    let totalP3 = 0;
    let totalDelivery = 0;

    const now = new Date();
    const periodeParam = searchParams.get('periode') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [yearStr, monthStr] = periodeParam.split('-');
    const selectedYear = parseInt(yearStr, 10);
    const selectedMonth = parseInt(monthStr, 10) - 1;

    const startDate = new Date(selectedYear, selectedMonth, 1);
    const endDate = new Date(selectedYear, selectedMonth + 1, 0);
    endDate.setHours(23, 59, 59, 999);

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    yesterday.setHours(23, 59, 59, 999);

    // Pre-fill dailyMap with all dates of the month
    const daysInMonth = endDate.getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(selectedYear, selectedMonth, i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dailyMap.set(dateStr, { date: dateStr, p3: 0, delivery: 0 });
      customerDailyMap.set(dateStr, { date: dateStr, p3: 0, delivery: 0 });
    }

    const normSelected = selectedCustomer ? normalizeCust(selectedCustomer) : null;

    p3Data.forEach((p: any) => {
      const rawDate = p.tanggal_delivery;
      if (!rawDate) return;
      
      const dDate = new Date(rawDate);
      if (dDate < startDate || dDate > endDate) return;

      const dateStr = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`;

      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { date: dateStr, p3: 0, delivery: 0 });
      }

      const rawCust = p.customer || 'Unknown';
      const custKey = normalizeCust(rawCust);
      const stKey = normalizeCode(p.kode_st);
      const key = `${custKey}|${stKey}`;
      const kg = (p.qty_p3_kg || 0);

      dailyMap.get(dateStr)!.p3 += kg;
      
      if (dDate <= yesterday) {
        totalP3 += kg;

        if (!dailyCustomerMap.has(dateStr)) {
          dailyCustomerMap.set(dateStr, new Map());
        }
        const shortName = shortNameMap.get(custKey) || rawCust;
        if (!dailyCustomerMap.get(dateStr)!.has(custKey)) {
          dailyCustomerMap.get(dateStr)!.set(custKey, { customer: shortName, p3: 0, delivery: 0, items: new Map<string, any>() });
        }
        const custData = dailyCustomerMap.get(dateStr)!.get(custKey)!;
        custData.p3 += kg;

        if (!custData.items.has(stKey)) {
          custData.items.set(stKey, { item: p.kode_st || 'Unknown', dimensi: dimensiMap.get(key) || codeDimensiMap.get(stKey) || 'Unknown', p3: 0, delivery: 0 });
        }
        custData.items.get(stKey)!.p3 += kg;

        if (!customerMap.has(custKey)) {
          customerMap.set(custKey, { customer: shortName, p3: 0, delivery: 0 });
        }
        customerMap.get(custKey)!.p3 += kg;

        if (normSelected) {
          const isMatch = normalizeCust(shortName) === normSelected || custKey === normSelected;
          if (isMatch) {
            if (!itemMap.has(stKey)) {
              itemMap.set(stKey, { item: p.kode_st || 'Unknown', dimensi: dimensiMap.get(key) || codeDimensiMap.get(stKey) || 'Unknown', p3: 0, delivery: 0 });
            }
            itemMap.get(stKey)!.p3 += kg;

            if (customerDailyMap.has(dateStr)) {
              customerDailyMap.get(dateStr)!.p3 += kg;
            }
          }
        }
      }
    });

    deliveryData.forEach((d: any) => {
      const rawDate = d.tanggal_delivery;
      if (!rawDate) return;

      const dDate = new Date(rawDate);
      if (dDate < startDate || dDate > endDate) return;

      const dateStr = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`;

      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { date: dateStr, p3: 0, delivery: 0 });
      }

      const rawCust = d.customer || 'Unknown';
      const custKey = normalizeCust(rawCust);
      const stKey = normalizeCode(d.kode_st);
      const key = `${custKey}|${stKey}`;
      const weight = weightsMap.get(key) ?? codeWeightsMap.get(stKey) ?? 0;
      const kg = (d.qty_delivery_kg || 0);

      dailyMap.get(dateStr)!.delivery += kg;
      
      if (dDate <= yesterday) {
        totalDelivery += kg;

        if (!dailyCustomerMap.has(dateStr)) {
          dailyCustomerMap.set(dateStr, new Map());
        }
        const shortName = shortNameMap.get(custKey) || rawCust;
        if (!dailyCustomerMap.get(dateStr)!.has(custKey)) {
          dailyCustomerMap.get(dateStr)!.set(custKey, { customer: shortName, p3: 0, delivery: 0, items: new Map<string, any>() });
        }
        const custData = dailyCustomerMap.get(dateStr)!.get(custKey)!;
        custData.delivery += kg;

        if (!custData.items.has(stKey)) {
          custData.items.set(stKey, { item: d.kode_st || 'Unknown', dimensi: dimensiMap.get(key) || codeDimensiMap.get(stKey) || 'Unknown', p3: 0, delivery: 0 });
        }
        custData.items.get(stKey)!.delivery += kg;

        if (!customerMap.has(custKey)) {
          customerMap.set(custKey, { customer: shortName, p3: 0, delivery: 0 });
        }
        customerMap.get(custKey)!.delivery += kg;

        if (normSelected) {
          const isMatch = normalizeCust(shortName) === normSelected || custKey === normSelected;
          const isDateMatch = view !== 'delivery-ontime' || (dDate >= startDate && dDate <= endDate);

          if (isMatch && isDateMatch) {
            if (!itemMap.has(stKey)) {
              itemMap.set(stKey, { item: d.kode_st || 'Unknown', dimensi: dimensiMap.get(key) || codeDimensiMap.get(stKey) || 'Unknown', p3: 0, delivery: 0 });
            }
            itemMap.get(stKey)!.delivery += kg;

            if (customerDailyMap.has(dateStr)) {
              customerDailyMap.get(dateStr)!.delivery += kg;
            }
          }
        }
      }
    });

    const dailyArray = Array.from(dailyMap.values())
      .map(d => ({ ...d, percentage: d.p3 > 0 ? (d.delivery / d.p3) * 100 : 0 }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const dailyCustomerDetailsMap = new Map<string, any[]>();
    dailyCustomerMap.forEach((custMap, date) => {
      const details = Array.from(custMap.values()).map(c => ({
        ...c,
        percentage: c.p3 > 0 ? (c.delivery / c.p3) * 100 : 0,
        items: Array.from(c.items.values()).map((i: any) => ({
          ...i,
          percentage: i.p3 > 0 ? (i.delivery / i.p3) * 100 : 0
        })).sort((a, b) => b.p3 - a.p3)
      })).sort((a, b) => a.percentage - b.percentage);
      dailyCustomerDetailsMap.set(date, details);
    });

    return {
      dailyData: dailyArray,
      customerData: Array.from(customerMap.values()).map(c => ({
        ...c,
        percentage: c.p3 > 0 ? (c.delivery / c.p3) * 100 : 0
      })).sort((a, b) => b.p3 - a.p3),
      itemData: Array.from(itemMap.values()).map(i => ({
        ...i,
        percentage: i.p3 > 0 ? (i.delivery / i.p3) * 100 : 0
      })).sort((a, b) => b.p3 - a.p3),
      dailyCustomerDetails: dailyCustomerDetailsMap,
      totals: { p3: totalP3, delivery: totalDelivery },
      customerDailyData: Array.from(customerDailyMap.values())
        .map(d => ({ ...d, percentage: d.p3 > 0 ? (d.delivery / d.p3) * 100 : 0 }))
        .sort((a, b) => a.date.localeCompare(b.date))
    };
  }, [p3Data, deliveryData, materials, selectedCustomer, view, normalizeCust, normalizeCode, searchParams]);

  const deliveryOntimeData = useMemo(() => {
    return customerData.filter(c => c.p3 > 0).sort((a, b) => a.percentage - b.percentage);
  }, [customerData]);

  useEffect(() => {
    setModalPage(0);
  }, [selectedCustomer]);

  const totalPages = Math.ceil(customerData.length / itemsPerPageCustomer);
  const paginatedChartData = customerData.slice(
    currentPage * itemsPerPageCustomer, 
    (currentPage + 1) * itemsPerPageCustomer
  );

  const totalModalPages = modalViewMode === 'item' ? Math.ceil(itemData.length / itemsPerPageModal) : 1;
  const paginatedItemData = modalViewMode === 'item' 
    ? itemData.slice(
        modalPage * itemsPerPageModal,
        (modalPage + 1) * itemsPerPageModal
      )
    : customerDailyData;

  const deliveryItemsPerPage = 15;
  const totalDeliveryPages = Math.ceil(deliveryOntimeData.length / deliveryItemsPerPage);
  const paginatedDeliveryOntimeData = deliveryOntimeData.slice(
    deliveryPage * deliveryItemsPerPage,
    (deliveryPage + 1) * deliveryItemsPerPage
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#FDFBF7]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-10 h-10 text-emerald-600 animate-spin" />
          <p className="text-emerald-900 font-medium animate-pulse">Loading Delivery Performance...</p>
        </div>
      </div>
    );
  }

  if (view === 'delivery-ontime') {
    return (
      <div className="px-6 py-6 bg-[#FDFBF7] min-h-full">
        {subView === 'chart' ? (
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
            <div className="h-[500px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={paginatedDeliveryOntimeData} 
                  margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                  <XAxis 
                    dataKey="customer" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={100}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#94A3B8', fontSize: 11 }}
                    tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                  />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(val: number) => [`${val.toLocaleString('id-ID', { maximumFractionDigits: 0 })} Kg`, '']}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '30px' }} />
                  <Bar 
                    dataKey="p3" 
                    name="P3" 
                    fill="#F97316" 
                    radius={[4, 4, 0, 0]} 
                    barSize={30}
                    onClick={(data) => {
                      if (data && data.customer) {
                        setSelectedCustomer(data.customer);
                        setIsCustomerDetailModalOpen(true);
                      }
                    }}
                    className="cursor-pointer"
                  />
                  <Bar 
                    dataKey="delivery" 
                    name="Delivery" 
                    fill="#10B981" 
                    radius={[4, 4, 0, 0]} 
                    barSize={30}
                    onClick={(data) => {
                      if (data && data.customer) {
                        setSelectedCustomer(data.customer);
                        setIsCustomerDetailModalOpen(true);
                      }
                    }}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pagination Controls for Chart */}
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
              <p className="text-sm text-gray-500 font-medium">
                Showing <span className="text-gray-900 font-bold">{Math.min(deliveryOntimeData.length, deliveryPage * deliveryItemsPerPage + 1)}</span> to <span className="text-gray-900 font-bold">{Math.min(deliveryOntimeData.length, (deliveryPage + 1) * deliveryItemsPerPage)}</span> of <span className="text-gray-900 font-bold">{deliveryOntimeData.length}</span> customers
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDeliveryPage(prev => Math.max(0, prev - 1))}
                  disabled={deliveryPage === 0}
                  className="p-2 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalDeliveryPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setDeliveryPage(i)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        deliveryPage === i 
                          ? 'bg-emerald-600 text-white shadow-md' 
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setDeliveryPage(prev => Math.min(totalDeliveryPages - 1, prev + 1))}
                  disabled={deliveryPage === totalDeliveryPages - 1}
                  className="p-2 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">No</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Customer</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">P3 (Kg)</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Delivery (Kg)</th>
                    <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Achievement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginatedDeliveryOntimeData.map((item, idx) => (
                    <tr 
                      key={idx} 
                      className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                      onClick={() => {
                        setSelectedCustomer(item.customer);
                        setIsCustomerDetailModalOpen(true);
                      }}
                    >
                      <td className="px-6 py-4 text-sm text-gray-500">{deliveryPage * deliveryItemsPerPage + idx + 1}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 group-hover:text-emerald-600 transition-colors">{item.customer}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{item.p3.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                      <td className="px-6 py-4 text-sm text-teal-600 font-medium text-right">{item.delivery.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          item.percentage >= 100 ? 'bg-green-100 text-green-700' :
                          item.percentage >= 80 ? 'bg-blue-100 text-blue-700' :
                          item.percentage >= 50 ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {(item?.percentage ?? 0).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls for Table */}
            <div className="flex items-center justify-between px-6 py-4 bg-gray-50/50 border-t border-gray-100">
              <p className="text-sm text-gray-500 font-medium">
                Showing <span className="text-gray-900 font-bold">{Math.min(deliveryOntimeData.length, deliveryPage * deliveryItemsPerPage + 1)}</span> to <span className="text-gray-900 font-bold">{Math.min(deliveryOntimeData.length, (deliveryPage + 1) * deliveryItemsPerPage)}</span> of <span className="text-gray-900 font-bold">{deliveryOntimeData.length}</span> customers
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDeliveryPage(prev => Math.max(0, prev - 1))}
                  disabled={deliveryPage === 0}
                  className="p-2 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-600" />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalDeliveryPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setDeliveryPage(i)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                        deliveryPage === i 
                          ? 'bg-emerald-600 text-white shadow-md' 
                          : 'text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setDeliveryPage(prev => Math.min(totalDeliveryPages - 1, prev + 1))}
                  disabled={deliveryPage === totalDeliveryPages - 1}
                  className="p-2 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  <ChevronRight className="w-5 h-5 text-gray-600" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Customer Item Detail Modal */}
        {isCustomerDetailModalOpen && selectedCustomer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-100 animate-in fade-in zoom-in duration-300">
              {/* Modal Header */}
              <div className="px-8 py-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{selectedCustomer}</h3>
                  <p className="text-sm text-gray-500 font-medium mt-1">Detailed Item Breakdown - P3 vs Delivery</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button
                      onClick={() => setModalSubView('chart')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        modalSubView === 'chart' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      Grafik
                    </button>
                    <button
                      onClick={() => setModalSubView('report')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        modalSubView === 'report' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      Report
                    </button>
                  </div>
                  <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button
                      onClick={() => setModalChartType('volume')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        modalChartType === 'volume' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      Volume (Kg)
                    </button>
                    <button
                      onClick={() => setModalChartType('percentage')}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        modalChartType === 'percentage' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500'
                      }`}
                    >
                      Achievement (%)
                    </button>
                  </div>
                  <button 
                    onClick={() => setIsCustomerDetailModalOpen(false)}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
                  >
                    <X className="w-6 h-6 text-gray-400 group-hover:text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-auto p-8">
                {modalSubView === 'chart' ? (
                  /* Modal Chart */
                  <div className="bg-gray-50/50 p-6 rounded-3xl border border-gray-100 mb-8">
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={modalChartType === 'volume' ? paginatedItemData : paginatedItemData.map(d => ({ ...d, target: 100 }))}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis 
                            dataKey="item" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#64748B', fontSize: 10 }}
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{ fill: '#94A3B8', fontSize: 11 }}
                            tickFormatter={(val) => modalChartType === 'volume' ? `${(val / 1000).toFixed(0)}k` : `${val}%`}
                          />
                          <Tooltip 
                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            formatter={(val: number) => modalChartType === 'volume' ? [`${Math.round(val).toLocaleString('id-ID')} Kg`, ''] : [`${(val ?? 0).toFixed(1)}%`, '']}
                          />
                          <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                          {modalChartType === 'volume' ? (
                            <>
                              <Bar dataKey="p3" name="P3 (Kg)" fill="#94A3B8" radius={[4, 4, 0, 0]} barSize={20} />
                              <Bar dataKey="delivery" name="Delivery (Kg)" fill="#059669" radius={[4, 4, 0, 0]} barSize={20} />
                            </>
                          ) : (
                            <>
                              <Bar dataKey="percentage" name="Achievement (%)" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={30}>
                                <LabelList dataKey="percentage" position="top" formatter={(val: number) => `${(val ?? 0).toFixed(0)}%`} style={{ fontSize: '10px', fill: '#64748B' }} />
                              </Bar>
                              <Line type="monotone" dataKey="target" name="Target (100%)" stroke="#EF4444" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                            </>
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : (
                  /* Modal Table */
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/80">
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Item Code</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Dimension</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">P3 (Kg)</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Delivery (Kg)</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-center">Achievement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {paginatedItemData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold text-gray-900">{item.item}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 font-medium">{item.dimensi}</td>
                            <td className="px-6 py-4 text-sm text-gray-900 font-bold text-right">{Math.round(item.p3).toLocaleString('id-ID')}</td>
                            <td className="px-6 py-4 text-sm text-teal-600 font-bold text-right">{Math.round(item.delivery).toLocaleString('id-ID')}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                                item.percentage >= 100 ? 'bg-emerald-100 text-emerald-700' :
                                item.percentage >= 80 ? 'bg-blue-100 text-blue-700' :
                                item.percentage >= 50 ? 'bg-orange-100 text-orange-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {(item?.percentage ?? 0).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {totalModalPages > 1 && (
                <div className="px-8 py-6 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                  <p className="text-sm text-gray-500 font-medium">
                    Showing <span className="text-gray-900 font-bold">{modalPage * itemsPerPageModal + 1}</span> to <span className="text-gray-900 font-bold">{Math.min(itemData.length, (modalPage + 1) * itemsPerPageModal)}</span> of <span className="text-gray-900 font-bold">{itemData.length}</span> items
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setModalPage(prev => Math.max(0, prev - 1))}
                      disabled={modalPage === 0}
                      className="p-2 rounded-xl border border-gray-100 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalModalPages }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setModalPage(i)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                            modalPage === i 
                              ? 'bg-emerald-600 text-white shadow-md' 
                              : 'text-gray-500 hover:bg-white'
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setModalPage(prev => Math.min(totalModalPages - 1, prev + 1))}
                      disabled={modalPage === totalModalPages - 1}
                      className="p-2 rounded-xl border border-gray-100 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-6 py-3 bg-[#FDFBF7] min-h-full">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white p-1.5 rounded-2xl border border-[#0A5C36] shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Total P3 (Kg)</p>
          <p className="text-2xl font-bold text-gray-900">{Math.round(totals.p3).toLocaleString('id-ID')}</p>
          <p className="text-[10px] text-gray-400 italic">s/d kemarin</p>
        </div>
        <div className="bg-white p-1.5 rounded-2xl border border-[#0A5C36] shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Total Delivery (Kg)</p>
          <p className="text-2xl font-bold text-teal-600">{Math.round(totals.delivery).toLocaleString('id-ID')}</p>
          <p className="text-[10px] text-gray-400 italic">s/d kemarin</p>
        </div>
        <div className="bg-white p-1.5 rounded-2xl border border-[#0A5C36] shadow-sm">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Achievement Rate</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold text-blue-600">
              {totals.p3 > 0 ? ((totals.delivery / totals.p3) * 100).toFixed(1) : '0.0'}%
            </p>
            <p className="text-xs text-gray-400 mb-1">target 100%</p>
          </div>
          <p className="text-[10px] text-gray-400 italic">s/d kemarin</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-10">
        {/* Daily Performance Line Chart */}
        <div className="bg-white p-1.5 rounded-3xl shadow-sm border border-[#0A5C36] transition-all duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Daily Performance</h3>
                <p className="text-xs text-gray-500">Trend harian P3 vs Delivery ({chartType === 'volume' ? 'Kg' : '%'})</p>
              </div>
            </div>
            <div className="flex bg-gray-100 rounded-full p-1">
              <button
                onClick={() => setChartType('volume')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                  chartType === 'volume' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Volume
              </button>
              <button
                onClick={() => setChartType('percentage')}
                className={`px-3 py-1 rounded-full text-[10px] font-bold transition-all ${
                  chartType === 'percentage' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                %
              </button>
            </div>
          </div>
          
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart 
                data={dailyData} 
                margin={{ top: 10, right: 10, left: 0, bottom: 20 }}
                onClick={(data) => {
                  if (data && data.activeLabel) {
                    setSelectedDate(data.activeLabel);
                  }
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={<CustomXAxisTick />}
                  dy={10}
                  interval={0}
                />
                {chartType === 'volume' ? (
                  <>
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(val: number, name: string) => [val.toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' Kg', name]}
                    />
                    <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
                    <Line type="monotone" dataKey="p3" name="P3" stroke="#F97316" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="delivery" name="Delivery" stroke="#10B981" strokeWidth={2} dot={false} />
                  </>
                ) : (
                  <>
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#94A3B8', fontSize: 11 }}
                      tickFormatter={(val) => `${val}%`}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      formatter={(val: number) => [`${val.toFixed(1)}%`, 'Achievement']}
                    />
                    <Line type="monotone" dataKey="percentage" name="Achievement" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4, fill: '#8B5CF6' }}>
                      <LabelList 
                        dataKey="percentage" 
                        position="top" 
                        formatter={(val: number) => `${(val ?? 0).toFixed(0)}%`} 
                        style={{ fontSize: '10px', fill: '#64748B', fontWeight: 600 }} 
                      />
                    </Line>
                    <ReferenceLine 
                      y={100} 
                      label={{ position: 'right', value: 'Target 100%', fill: '#EF4444', fontSize: 10, fontWeight: 'bold' }} 
                      stroke="#EF4444" 
                      strokeDasharray="3 3" 
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          {
            title: 'Delivery Schedule',
            items: [
              { label: 'P3 vs Stock', icon: <ArrowRightLeft className="w-4 h-4" />, action: () => navigate('/p3-stock') },
            ]
          },
          {
            title: 'Shipment Control',
            items: [
              { label: 'Shipment Cost Control', icon: <DollarSign className="w-4 h-4" /> },
              { label: 'Capacity Truck', icon: <Box className="w-4 h-4" /> },
              { label: 'In Out Time of Truck', icon: <Clock className="w-4 h-4" /> },
              { label: 'Monitoring SPPB', icon: <FileText className="w-4 h-4" /> },
            ]
          },
          {
            title: 'Customer Performance',
            items: [
              { label: 'Customer Performance', icon: <BarChart3 className="w-4 h-4" />, action: () => navigate('/customer-performance') },
              { label: 'SO vs Delivery', icon: <ArrowRightLeft className="w-4 h-4" />, action: () => navigate('/so-vs-delivery') },
              { label: 'Customer Complaint', icon: <AlertTriangle className="w-4 h-4" /> },
            ]
          }
        ].map((section, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{section.title}</h2>
            <div className="space-y-3">
              {section.items.map((item, itemIdx) => (
                <div key={itemIdx} onClick={item.action} className="flex items-center p-3 bg-gray-50 rounded-xl hover:bg-emerald-50 transition-colors cursor-pointer group">
                  <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg shadow-sm mr-3 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                    {item.icon}
                  </div>
                  <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-900">{item.label}</span>
                </div>
              ))}
            </div>

          </div>
        ))}
      </div>

      {/* Daily Detail Modal */}
      {selectedDate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-8 py-1 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
              <div className="flex items-center justify-between gap-4 w-full">
                <div className="space-y-0.5">
                  <h3 className="text-xl font-bold text-[#2D3748]">
                    Detail Performance: {new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </h3>
                  <p className="text-xs text-gray-500">
                    Detail P3 vs Delivery per Customer (Urutan Achievement Terendah)
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex bg-gray-100 rounded-full p-1">
                    <button
                      onClick={() => setModalSubView('chart')}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                        modalSubView === 'chart' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Grafik
                    </button>
                    <button
                      onClick={() => setModalSubView('report')}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                        modalSubView === 'report' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      Report
                    </button>
                  </div>
                  <button 
                    onClick={() => setSelectedDate(null)}
                    className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-6 h-6 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>
            
            <div className="px-8 pt-0 pb-8 flex-1 overflow-y-auto">
              {modalSubView === 'report' ? (
                <div className="overflow-hidden border border-gray-100 rounded-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Customer</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">P3 (Kg)</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Delivery (Kg)</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Achievement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(dailyCustomerDetails.get(selectedDate) || []).map((item: any, idx: number) => (
                        <tr 
                          key={idx} 
                          className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedCustomerForDate(item.customer);
                            setIsDateCustomerDetailModalOpen(true);
                          }}
                        >
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">{item.customer}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 text-right">{item.p3.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                          <td className="px-6 py-4 text-sm text-teal-600 font-medium text-right">{item.delivery.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                          <td className="px-6 py-4 text-right">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                              item.percentage >= 100 ? 'bg-green-100 text-green-700' :
                              item.percentage >= 80 ? 'bg-blue-100 text-blue-700' :
                              item.percentage >= 50 ? 'bg-orange-100 text-orange-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {(item?.percentage ?? 0).toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                      {(!dailyCustomerDetails.get(selectedDate) || dailyCustomerDetails.get(selectedDate).length === 0) && (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-gray-500 italic">
                            Tidak ada data untuk tanggal ini
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="h-[550px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart 
                      data={dailyCustomerDetails.get(selectedDate) || []} 
                      margin={{ top: 0, right: 10, left: 0, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                      <XAxis 
                        dataKey="customer" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                        interval={0}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#94A3B8', fontSize: 11 }}
                        tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        formatter={(val: number) => [`${val.toLocaleString('id-ID', { maximumFractionDigits: 0 })} Kg`, '']}
                      />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '0px' }} />
                      <Bar 
                        dataKey="p3" 
                        name="P3 (Kg)" 
                        fill="#F97316" 
                        radius={[4, 4, 0, 0]} 
                        barSize={30}
                        className="cursor-pointer"
                        onClick={(data) => {
                          const customerName = data?.payload?.customer || data?.customer;
                          if (customerName) {
                            setSelectedCustomerForDate(customerName);
                            setIsDateCustomerDetailModalOpen(true);
                          }
                        }}
                      />
                      <Bar 
                        dataKey="delivery" 
                        name="Delivery (Kg)" 
                        fill="#10B981" 
                        radius={[4, 4, 0, 0]} 
                        barSize={30}
                        className="cursor-pointer"
                        onClick={(data) => {
                          const customerName = data?.payload?.customer || data?.customer;
                          if (customerName) {
                            setSelectedCustomerForDate(customerName);
                            setIsDateCustomerDetailModalOpen(true);
                          }
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Date-Customer Detail Modal (Second Level Drill-down) */}
      {isDateCustomerDetailModalOpen && selectedDate && selectedCustomerForDate && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-8 py-4 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-[#2D3748]">
                  Detail Item: {selectedCustomerForDate}
                </h3>
                <p className="text-xs text-gray-500">
                  Tanggal: {new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button 
                onClick={() => setIsDateCustomerDetailModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            
            <div className="px-8 py-6 flex-1 overflow-y-auto">
              <div className="overflow-hidden border border-gray-100 rounded-2xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Item / Dimensi</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">P3 (Kg)</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Delivery (Kg)</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Achievement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(dailyCustomerDetails.get(selectedDate)?.find(c => c.customer === selectedCustomerForDate)?.items || []).map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{item.item}</div>
                          <div className="text-xs text-gray-500">{item.dimensi}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{item.p3.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                        <td className="px-6 py-4 text-sm text-teal-600 font-medium text-right">{item.delivery.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            item.percentage >= 100 ? 'bg-green-100 text-green-700' :
                            item.percentage >= 80 ? 'bg-blue-100 text-blue-700' :
                            item.percentage >= 50 ? 'bg-orange-100 text-orange-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {(item?.percentage ?? 0).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Performance Modal */}
      {/* Detail Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-8 py-4 flex justify-between items-center border-b border-gray-50 bg-white z-20 relative rounded-t-2xl">
              <div className="space-y-1">
                <h3 className="text-2xl font-bold text-[#2D3748]">
                  Detail Performance: {selectedCustomer}
                </h3>
                <p className="text-sm text-gray-500">
                  {modalViewMode === 'daily' 
                    ? (modalChartType === 'volume' ? 'Perbandingan P3 vs Delivery Harian (Kg)' : 'Persentase Delivery / P3 Harian (%)')
                    : (modalChartType === 'volume' ? 'Perbandingan Delivery Ontime per Item (Kg)' : 'Persentase Delivery / P3 per Item (%)')}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex bg-gray-100 p-1 rounded-full">
                  <button
                    onClick={() => setModalViewMode('daily')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                      modalViewMode === 'daily' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    onClick={() => setModalViewMode('item')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                      modalViewMode === 'item' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Item
                  </button>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-full">
                  <button
                    onClick={() => setModalSubView('chart')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                      modalSubView === 'chart' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Grafik
                  </button>
                  <button
                    onClick={() => setModalSubView('report')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                      modalSubView === 'report' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Report
                  </button>
                </div>
                <div className="flex bg-gray-100 p-1 rounded-full">
                  <button
                    onClick={() => setModalChartType('volume')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                      modalChartType === 'volume' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Volume (Kg)
                  </button>
                  <button
                    onClick={() => setModalChartType('percentage')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${
                      modalChartType === 'percentage' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Persentase (%)
                  </button>
                </div>
                <button 
                  onClick={() => setSelectedCustomer(null)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>
            </div>
            
            <div className="px-8 pt-2 pb-8 flex-1 overflow-y-auto">
              <div className="h-[500px] w-full">
                {modalSubView === 'chart' ? (
                  <ResponsiveContainer width="100%" height="100%">
                    {modalChartType === 'volume' ? (
                      <BarChart 
                        data={paginatedItemData} 
                        margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                        <XAxis 
                          dataKey={modalViewMode === 'daily' ? 'date' : 'dimensi'} 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                          interval={0}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          tickFormatter={(val) => modalViewMode === 'daily' ? (val ? val.split('-')[2] : '') : val}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 11 }}
                          tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          formatter={(val: number) => [`${val.toLocaleString('id-ID', { maximumFractionDigits: 0 })} Kg`, '']}
                        />
                        <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '10px' }} />
                        <Bar 
                          dataKey="p3" 
                          name="P3" 
                          fill="#F97316" 
                          radius={[4, 4, 0, 0]} 
                          barSize={30}
                          onClick={(data: any) => {
                            if (modalViewMode === 'daily') return;
                            console.log("P3 Bar clicked, data:", data);
                            const customer = data.activePayload?.[0]?.payload?.dimensi || data.dimensi;
                            if (customer) {
                              setSelectedCustomer(customer);
                              setIsCustomerDetailModalOpen(true);
                            } else {
                              console.error("Could not find customer dimension in P3 bar data");
                            }
                          }}
                          className="cursor-pointer"
                        />
                        <Bar 
                          dataKey="delivery" 
                          name="Delivery" 
                          fill="#10B981" 
                          radius={[4, 4, 0, 0]} 
                          barSize={30}
                          onClick={(data: any) => {
                            if (modalViewMode === 'daily') return;
                            console.log("Delivery Bar clicked, data:", data);
                            const customer = data.activePayload?.[0]?.payload?.dimensi || data.dimensi;
                            if (customer) {
                              setSelectedCustomer(customer);
                              setIsCustomerDetailModalOpen(true);
                            } else {
                              console.error("Could not find customer dimension in Delivery bar data");
                            }
                          }}
                          className="cursor-pointer"
                        />
                      </BarChart>
                    ) : (
                      <ComposedChart 
                        data={paginatedItemData.map((d: any) => ({ ...d, target: 100 }))} 
                        margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                        <XAxis 
                          dataKey={modalViewMode === 'daily' ? 'date' : 'dimensi'} 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                          interval={0}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                          tickFormatter={(val) => modalViewMode === 'daily' ? (val ? val.split('-')[2] : '') : val}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: '#94A3B8', fontSize: 11 }}
                          unit="%"
                          domain={[0, 100]}
                        />
                        <Tooltip 
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          formatter={(val: number, name: string, props: any) => {
                            const dataKey = props.dataKey;
                            const label = dataKey === 'percentage' ? 'Achievement' : 'Target';
                            return [`${(val ?? 0).toFixed(1)}%`, label];
                          }}
                        />
                        <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '10px' }} />
                        <Bar 
                          dataKey="percentage" 
                          name="Achievement (%)" 
                          fill="#3B82F6" 
                          radius={[4, 4, 0, 0]} 
                          barSize={30}
                          onClick={(data: any) => {
                            if (modalViewMode === 'daily') return;
                            console.log("Bar clicked, raw data:", data);
                            // Recharts Bar onClick often passes the full payload in the first argument, 
                            // but sometimes it's nested. Let's log everything.
                            if (data && data.payload) {
                                console.log("Payload found in data:", data.payload);
                                const customer = data.payload.dimensi || data.payload.customer;
                                if (customer) {
                                    setSelectedCustomer(customer);
                                    setIsCustomerDetailModalOpen(true);
                                    return;
                                }
                            }
                            
                            // Fallback for different Recharts versions/structures
                            const customer = data.dimensi || data.customer;
                            if (customer) {
                                setSelectedCustomer(customer);
                                setIsCustomerDetailModalOpen(true);
                            } else {
                                console.error("Could not find customer dimension in clicked data. Data keys:", Object.keys(data));
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <LabelList dataKey="percentage" position="top" formatter={(val: number) => `${(val ?? 0).toFixed(0)}%`} style={{ fontSize: '10px', fill: '#64748B' }} />
                        </Bar>
                        <Line type="monotone" dataKey="target" name="Target (100%)" stroke="#EF4444" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                      </ComposedChart>
                    )}
                  </ResponsiveContainer>
                ) : (
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50/80">
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">
                            {modalViewMode === 'daily' ? 'Date' : 'Dimension'}
                          </th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">P3 (Kg)</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Delivery (Kg)</th>
                          <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-center">Achievement</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {paginatedItemData.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-bold text-gray-900">
                              {modalViewMode === 'daily' ? item.date : item.dimensi}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 font-bold text-right">{Math.round(item.p3).toLocaleString('id-ID')}</td>
                            <td className="px-6 py-4 text-sm text-teal-600 font-bold text-right">{Math.round(item.delivery).toLocaleString('id-ID')}</td>
                            <td className="px-6 py-4 text-center">
                              <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                                item.percentage >= 100 ? 'bg-emerald-100 text-emerald-700' :
                                item.percentage >= 80 ? 'bg-blue-100 text-blue-700' :
                                item.percentage >= 50 ? 'bg-orange-100 text-orange-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {(item?.percentage ?? 0).toFixed(1)}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              
              {/* Modal Pagination Controls */}
              {totalModalPages > 1 && (
                <div className="flex justify-center items-center gap-3 mt-6">
                  <button
                    onClick={() => setModalPage(p => Math.max(0, p - 1))}
                    disabled={modalPage === 0}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                  >
                    <ArrowLeft className="w-4 h-4 text-gray-600" />
                  </button>
                  <span className="text-sm text-gray-600 font-medium bg-gray-50 px-3 py-1 rounded-lg border border-gray-100">
                    Halaman {modalPage + 1} dari {totalModalPages}
                  </span>
                  <button
                    onClick={() => setModalPage(p => Math.min(totalModalPages - 1, p + 1))}
                    disabled={modalPage === totalModalPages - 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200"
                  >
                    <ArrowLeft className="w-4 h-4 text-gray-600 rotate-180" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
