import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, LabelList, Line 
} from 'recharts';
import { ArrowLeft, BarChart3, FileText, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

export default function CustomerPerformancePage() {
  const { refreshKey } = useRefresh();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const viewMode = searchParams.get('view') || 'chart';
  const chartType = (searchParams.get('chartType') as 'volume' | 'percentage') || 'volume';

  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [modalChartType, setModalChartType] = useState<'volume' | 'percentage'>('volume');
  const [modalSubView, setModalSubView] = useState<'chart' | 'report'>('chart');
  const [currentPage, setCurrentPage] = useState(0);
  const [modalPage, setModalPage] = useState(0);
  
  const [modalViewMode, setModalViewMode] = useState<'daily' | 'item'>('daily');
  const [isCustomerDetailModalOpen, setIsCustomerDetailModalOpen] = useState(false);
  
  const [drillDownData, setDrillDownData] = useState<any[]>([]);
  const [drillDownTitle, setDrillDownTitle] = useState<string>('');
  const [isDrillDownModalOpen, setIsDrillDownModalOpen] = useState(false);
  const [drillDownType, setDrillDownType] = useState<'daily' | 'item'>('daily');
  const [drillDownSortConfig, setDrillDownSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const handleDrillDownSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (drillDownSortConfig && drillDownSortConfig.key === key && drillDownSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setDrillDownSortConfig({ key, direction });
  };

  const sortedDrillDownData = useMemo(() => {
    let sortableData = [...drillDownData];
    if (drillDownSortConfig !== null) {
      sortableData.sort((a, b) => {
        let aValue = a[drillDownSortConfig.key];
        let bValue = b[drillDownSortConfig.key];

        if (drillDownSortConfig.key === 'item') {
           aValue = drillDownType === 'daily' ? a.date : `${a.item} - ${a.dimensi}`;
           bValue = drillDownType === 'daily' ? b.date : `${b.item} - ${b.dimensi}`;
        }

        if (aValue < bValue) {
          return drillDownSortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return drillDownSortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [drillDownData, drillDownSortConfig, drillDownType]);

  const drillDownTotal = useMemo(() => {
    return drillDownData.reduce((acc, curr) => {
      acc.p3 += curr.p3 || 0;
      acc.delivery += curr.delivery || 0;
      return acc;
    }, { p3: 0, delivery: 0 });
  }, [drillDownData]);
  
  const drillDownTotalPercentage = drillDownTotal.p3 > 0 ? (drillDownTotal.delivery / drillDownTotal.p3) * 100 : 0;

  const itemsPerPageCustomer = 15;
  const itemsPerPageModal = 10;

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['customer-performance-data', refreshKey],
    queryFn: async () => {
      const [p3s, dels, mats] = await Promise.all([
        fetchAllRows('p3_data', 'customer,kode_st,qty_p3_pcs,qty_p3_kg,tanggal_delivery'),
        fetchAllRows('deliveries', 'customer,kode_st,qty_delivery_pcs,qty_delivery_kg,tanggal_delivery'),
        fetchAllRows('material_master', 'customer,short_name_customer,kode_st,kode_lt,berat_per_pcs,dimensi,alternative_kodes_st'),
      ]);
      return { p3s: p3s || [], dels: dels || [], mats: mats || [] };
    },
    staleTime: 5 * 60 * 1000,
  });

  const p3Data = rawData?.p3s || [];
  const deliveryData = rawData?.dels || [];
  const materials = rawData?.mats || [];

  const normalizeCust = useCallback((s: string) => {
    if (!s) return '';
    let res = s.trim().toUpperCase();
    res = res.replace(/^(PT\.|PT|CV\.|CV|UD\.|UD)\s+/g, '');
    return res.replace(/[^A-Z0-9]/g, '').toLowerCase();
  }, []);

  const normalizeCode = useCallback((s: string) => (s || '').replace(/\s+/g, '').toLowerCase(), []);

  const { dimensiMap, codeDimensiMap, shortNameMap } = useMemo(() => {
    const dMap = new Map<string, string>();
    const cdMap = new Map<string, string>();
    const snMap = new Map<string, string>();
    
    materials.forEach((m: any) => {
      const custKey = normalizeCust(m.customer);
      const stKey = normalizeCode(m.kode_st);
      const dimensi = m.dimensi || '';
      const key = `${custKey}|${stKey}`;
      dMap.set(key, dimensi);
      cdMap.set(stKey, dimensi);
      if (m.short_name_customer) snMap.set(custKey, m.short_name_customer);
    });
    return { dimensiMap: dMap, codeDimensiMap: cdMap, shortNameMap: snMap };
  }, [materials, normalizeCust, normalizeCode]);

  const { customerData, itemData, customerDailyData } = useMemo(() => {
    if (!materials.length) return { 
      customerData: [], 
      itemData: [], 
      customerDailyData: []
    };

    const weightsMap = new Map<string, number>();
    const codeWeightsMap = new Map<string, number>();

    materials.forEach((m: any) => {
      const custKey = normalizeCust(m.customer);
      const stKey = normalizeCode(m.kode_st);
      const weight = m.berat_per_pcs || 0;
      
      const key = `${custKey}|${stKey}`;
      weightsMap.set(key, weight);
      codeWeightsMap.set(stKey, weight);
      
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

    const customerMap = new Map<string, any>();
    const itemMap = new Map<string, any>();
    const customerDailyMap = new Map<string, any>();

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

    // Pre-fill customerDailyMap with all dates of the month
    const daysInMonth = endDate.getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(selectedYear, selectedMonth, i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      customerDailyMap.set(dateStr, { date: dateStr, p3: 0, delivery: 0 });
    }

    const normSelected = selectedCustomer ? normalizeCust(selectedCustomer) : null;

    p3Data.forEach((p: any) => {
      const rawDate = p.tanggal_delivery;
      if (!rawDate) return;
      const dDate = new Date(rawDate);
      if (dDate < startDate || dDate > endDate) return;

      const dateStr = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`;
      const rawCust = p.customer || 'Unknown';
      const custKey = normalizeCust(rawCust);
      const stKey = normalizeCode(p.kode_st);
      const kg = (p.qty_p3_kg || 0);

      if (dDate <= yesterday) {
        const shortName = shortNameMap.get(custKey) || rawCust;
        if (!customerMap.has(custKey)) {
          customerMap.set(custKey, { customer: shortName, p3: 0, delivery: 0 });
        }
        customerMap.get(custKey)!.p3 += kg;

        if (normSelected) {
          const isMatch = normalizeCust(shortName) === normSelected || custKey === normSelected;
          if (isMatch) {
            if (!itemMap.has(stKey)) {
              itemMap.set(stKey, { item: p.kode_st || 'Unknown', dimensi: dimensiMap.get(`${custKey}|${stKey}`) || codeDimensiMap.get(stKey) || 'Unknown', p3: 0, delivery: 0 });
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
      const rawCust = d.customer || 'Unknown';
      const custKey = normalizeCust(rawCust);
      const stKey = normalizeCode(d.kode_st);
      const kg = (d.qty_delivery_kg || 0);

      if (dDate <= yesterday) {
        const shortName = shortNameMap.get(custKey) || rawCust;
        if (!customerMap.has(custKey)) {
          customerMap.set(custKey, { customer: shortName, p3: 0, delivery: 0 });
        }
        customerMap.get(custKey)!.delivery += kg;

        if (normSelected) {
          const isMatch = normalizeCust(shortName) === normSelected || custKey === normSelected;
          if (isMatch) {
            if (!itemMap.has(stKey)) {
              itemMap.set(stKey, { item: d.kode_st || 'Unknown', dimensi: dimensiMap.get(`${custKey}|${stKey}`) || codeDimensiMap.get(stKey) || 'Unknown', p3: 0, delivery: 0 });
            }
            itemMap.get(stKey)!.delivery += kg;
            if (customerDailyMap.has(dateStr)) {
              customerDailyMap.get(dateStr)!.delivery += kg;
            }
          }
        }
      }
    });

    return {
      customerData: Array.from(customerMap.values()).map(c => ({
        ...c,
        percentage: c.p3 > 0 ? (c.delivery / c.p3) * 100 : 0
      })).sort((a, b) => b.p3 - a.p3),
      itemData: Array.from(itemMap.values()).map(i => ({
        ...i,
        percentage: i.p3 > 0 ? (i.delivery / i.p3) * 100 : 0
      })).sort((a, b) => b.p3 - a.p3),
      customerDailyData: Array.from(customerDailyMap.values())
        .map(d => ({ ...d, percentage: d.p3 > 0 ? (d.delivery / d.p3) * 100 : 0 }))
        .sort((a, b) => a.date.localeCompare(b.date))
    };
  }, [p3Data, deliveryData, materials, selectedCustomer, searchParams, normalizeCust, normalizeCode]);

  const handleDrillDown = useCallback((clickedData: any) => {
    try {
      // Force open for debugging
      setIsDrillDownModalOpen(true);

      if (!selectedCustomer || !rawData || !clickedData) {
        setDrillDownTitle('Debug: Missing Data');
        setDrillDownData([]);
        return;
      }

      // Extract data robustly
      let data = clickedData;
      if (clickedData.activePayload && clickedData.activePayload.length > 0) {
        data = clickedData.activePayload[0].payload;
      } else if (clickedData.payload) {
        data = clickedData.payload;
      }

      const normSelected = normalizeCust(selectedCustomer);
      const { p3s, dels } = rawData;

      if (modalViewMode === 'daily') {
        const dateStr = data.date || data.name || data.activeLabel || 'Unknown Date';

        setDrillDownTitle(`Detail Item - ${selectedCustomer} (${dateStr})`);
        setDrillDownType('item');

        const itemMap = new Map<string, any>();

        if (dateStr !== 'Unknown Date') {
          p3s.forEach((p: any) => {
            if (!p.tanggal_delivery) return;
            const dDate = new Date(p.tanggal_delivery);
            const dStr = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`;
            if (dStr !== dateStr) return;

            const custKey = normalizeCust(p.customer);
            const shortName = shortNameMap.get(custKey) || p.customer;
            const isMatch = normalizeCust(shortName) === normSelected || custKey === normSelected;
            if (!isMatch) return;

            const stKey = normalizeCode(p.kode_st);
            if (!itemMap.has(stKey)) {
              itemMap.set(stKey, {
                item: p.kode_st || 'Unknown',
                dimensi: dimensiMap.get(`${custKey}|${stKey}`) || codeDimensiMap.get(stKey) || 'Unknown',
                p3: 0,
                delivery: 0
              });
            }
            itemMap.get(stKey)!.p3 += (p.qty_p3_pcs || 0);
          });

          dels.forEach((d: any) => {
            if (!d.tanggal_delivery) return;
            const dDate = new Date(d.tanggal_delivery);
            const dStr = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`;
            if (dStr !== dateStr) return;

            const custKey = normalizeCust(d.customer);
            const shortName = shortNameMap.get(custKey) || d.customer;
            const isMatch = normalizeCust(shortName) === normSelected || custKey === normSelected;
            if (!isMatch) return;

            const stKey = normalizeCode(d.kode_st);
            if (!itemMap.has(stKey)) {
              itemMap.set(stKey, {
                item: d.kode_st || 'Unknown',
                dimensi: dimensiMap.get(`${custKey}|${stKey}`) || codeDimensiMap.get(stKey) || 'Unknown',
                p3: 0,
                delivery: 0
              });
            }
            itemMap.get(stKey)!.delivery += (d.qty_delivery_pcs || 0);
          });
        }

        const result = Array.from(itemMap.values()).map(i => ({
          ...i,
          percentage: i.p3 > 0 ? (i.delivery / i.p3) * 100 : 0
        })).sort((a, b) => b.p3 - a.p3);

        setDrillDownData(result);
      } else {
        const itemCode = data.item || data.name || data.activeLabel || 'Unknown Item';

        const stKeyClicked = normalizeCode(itemCode);
        setDrillDownTitle(`Detail Harian - ${itemCode} (${selectedCustomer})`);
        setDrillDownType('daily');

        const dailyMap = new Map<string, any>();

        const now = new Date();
        const periodeParam = searchParams.get('periode') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const [yearStr, monthStr] = periodeParam.split('-');
        const selectedYear = parseInt(yearStr, 10);
        const selectedMonth = parseInt(monthStr, 10) - 1;
        const endDate = new Date(selectedYear, selectedMonth + 1, 0);

        for (let i = 1; i <= endDate.getDate(); i++) {
          const d = new Date(selectedYear, selectedMonth, i);
          const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          dailyMap.set(dateStr, { date: dateStr, p3: 0, delivery: 0 });
        }

        if (itemCode !== 'Unknown Item') {
          p3s.forEach((p: any) => {
            const custKey = normalizeCust(p.customer);
            const shortName = shortNameMap.get(custKey) || p.customer;
            const isMatch = normalizeCust(shortName) === normSelected || custKey === normSelected;
            if (!isMatch) return;

            if (normalizeCode(p.kode_st) !== stKeyClicked) return;

            if (!p.tanggal_delivery) return;
            const dDate = new Date(p.tanggal_delivery);
            const dateStr = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`;
            if (dailyMap.has(dateStr)) {
              dailyMap.get(dateStr)!.p3 += (p.qty_p3_pcs || 0);
            }
          });

          dels.forEach((d: any) => {
            const custKey = normalizeCust(d.customer);
            const shortName = shortNameMap.get(custKey) || d.customer;
            const isMatch = normalizeCust(shortName) === normSelected || custKey === normSelected;
            if (!isMatch) return;

            if (normalizeCode(d.kode_st) !== stKeyClicked) return;

            if (!d.tanggal_delivery) return;
            const dDate = new Date(d.tanggal_delivery);
            const dateStr = `${dDate.getFullYear()}-${String(dDate.getMonth() + 1).padStart(2, '0')}-${String(dDate.getDate()).padStart(2, '0')}`;
            if (dailyMap.has(dateStr)) {
              dailyMap.get(dateStr)!.delivery += (d.qty_delivery_pcs || 0);
            }
          });
        }

        const result = Array.from(dailyMap.values()).map(d => ({
          ...d,
          percentage: d.p3 > 0 ? (d.delivery / d.p3) * 100 : 0
        })).sort((a, b) => a.date.localeCompare(b.date));

        setDrillDownData(result);
      }
    } catch (err) {
      console.error('Error in handleDrillDown:', err);
      // Fallback to open modal with error state if possible
      setDrillDownTitle('Error Loading Data');
      setDrillDownData([]);
    }
  }, [selectedCustomer, rawData, modalViewMode, normalizeCust, normalizeCode, searchParams, dimensiMap, codeDimensiMap, shortNameMap]);

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

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-[#FDFBF7] min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
          <div className="h-[600px] w-full">
            {viewMode === 'chart' ? (
              <ResponsiveContainer width="100%" height="100%">
                {chartType === 'volume' ? (
                  <BarChart 
                    data={paginatedChartData} 
                    margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
                    onClick={(data) => {
                      if (data && data.activeLabel) {
                        setSelectedCustomer(data.activeLabel);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                    <XAxis 
                      dataKey="customer" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                      interval={0}
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
                      className="cursor-pointer"
                    />
                    <Bar 
                      dataKey="delivery" 
                      name="Delivery" 
                      fill="#10B981" 
                      radius={[4, 4, 0, 0]} 
                      barSize={30}
                      className="cursor-pointer"
                    />
                  </BarChart>
                ) : (
                  <ComposedChart 
                    data={paginatedChartData.map(d => ({ ...d, target: 100 }))} 
                    margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
                    onClick={(data) => {
                      if (data && data.activeLabel) {
                        setSelectedCustomer(data.activeLabel);
                      }
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
                    <XAxis 
                      dataKey="customer" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#475569', fontSize: 10, fontWeight: 500 }}
                      interval={0}
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
                      <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100">Customer</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">P3 (Kg)</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right">Delivery (Kg)</th>
                      <th className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-center">Achievement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedChartData.map((item, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors cursor-pointer" onClick={() => setSelectedCustomer(item.customer)}>
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">{item.customer}</td>
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

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-3 mt-8">
              <button
                onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200 transition-all"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <span className="text-sm text-gray-600 font-bold bg-gray-50 px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
                Halaman {currentPage + 1} dari {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage === totalPages - 1}
                className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed border border-gray-200 transition-all"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 rotate-180" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal (Modal Kedua) */}
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
                        onClick={(state: any) => {
                          if (state && state.activePayload && state.activePayload.length > 0) {
                            handleDrillDown(state.activePayload[0].payload);
                          } else if (state && state.activeLabel) {
                            const found = paginatedItemData.find((d: any) => d.date === state.activeLabel || d.dimensi === state.activeLabel || d.item === state.activeLabel);
                            if (found) handleDrillDown(found);
                          }
                        }}
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
                          className="cursor-pointer"
                          onClick={(data) => handleDrillDown(data)}
                        />
                        <Bar 
                          dataKey="delivery" 
                          name="Delivery" 
                          fill="#10B981" 
                          radius={[4, 4, 0, 0]} 
                          barSize={30}
                          className="cursor-pointer"
                          onClick={(data) => handleDrillDown(data)}
                        />
                      </BarChart>
                    ) : (
                      <ComposedChart 
                        data={paginatedItemData.map((d: any) => ({ ...d, target: 100 }))} 
                        margin={{ top: 5, right: 10, left: 0, bottom: 20 }}
                        onClick={(state: any) => {
                          if (state && state.activePayload && state.activePayload.length > 0) {
                            handleDrillDown(state.activePayload[0].payload);
                          } else if (state && state.activeLabel) {
                            const found = paginatedItemData.find((d: any) => d.date === state.activeLabel || d.dimensi === state.activeLabel || d.item === state.activeLabel);
                            if (found) handleDrillDown(found);
                          }
                        }}
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
                          className="cursor-pointer"
                          onClick={(data) => handleDrillDown(data)}
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
                          <tr 
                            key={idx} 
                            className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                            onClick={() => handleDrillDown(item)}
                          >
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
              
              {modalViewMode === 'item' && totalModalPages > 1 && (
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

      {/* Drill Down Modal (Modal Ketiga) */}
      {isDrillDownModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-8 py-6 flex justify-between items-center border-b border-gray-100">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{drillDownTitle}</h3>
                <p className="text-sm text-gray-500">Detail data transaksi</p>
              </div>
              <button 
                onClick={() => setIsDrillDownModalOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>
            
            <div className="p-8 overflow-y-auto">
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm relative max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur-sm shadow-sm">
                    <tr>
                      <th 
                        className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleDrillDownSort('item')}
                      >
                        <div className="flex items-center gap-1">
                          {drillDownType === 'daily' ? 'Tanggal' : 'Item / Dimensi'}
                          {drillDownSortConfig?.key === 'item' && (
                            <span className="text-gray-400">{drillDownSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleDrillDownSort('p3')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          P3 (Pcs)
                          {drillDownSortConfig?.key === 'p3' && (
                            <span className="text-gray-400">{drillDownSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-right cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleDrillDownSort('delivery')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Delivery (Pcs)
                          {drillDownSortConfig?.key === 'delivery' && (
                            <span className="text-gray-400">{drillDownSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 text-center cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleDrillDownSort('percentage')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Achievement
                          {drillDownSortConfig?.key === 'percentage' && (
                            <span className="text-gray-400">{drillDownSortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {sortedDrillDownData.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-gray-900">
                          {drillDownType === 'daily' ? item.date : `${item.item} - ${item.dimensi}`}
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
                    {sortedDrillDownData.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500 italic">
                          Tidak ada data detail untuk pilihan ini
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-10 bg-gray-50/95 backdrop-blur-sm shadow-[0_-1px_2px_rgba(0,0,0,0.05)]">
                    <tr>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900 border-t border-gray-200">
                        Grand Total
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right border-t border-gray-200">
                        {Math.round(drillDownTotal.p3).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-teal-600 text-right border-t border-gray-200">
                        {Math.round(drillDownTotal.delivery).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-center border-t border-gray-200">
                        <span className={`px-3 py-1 rounded-full text-[11px] font-bold ${
                          drillDownTotalPercentage >= 100 ? 'bg-emerald-100 text-emerald-700' :
                          drillDownTotalPercentage >= 80 ? 'bg-blue-100 text-blue-700' :
                          drillDownTotalPercentage >= 50 ? 'bg-orange-100 text-orange-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {drillDownTotalPercentage.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
