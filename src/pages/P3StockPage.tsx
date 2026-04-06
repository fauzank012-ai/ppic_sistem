import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Cell, LabelList 
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { dataService } from '../services/dataService';
import { BarChart2 } from 'lucide-react';
import { CustomerDetailModal } from '../components/p3-stock/CustomerDetailModal';
import { MaterialDetailModal } from '../components/p3-stock/MaterialDetailModal';
import { useP3StockData } from '../hooks/useP3StockData';
import { SortConfig, CustomerDetail } from '../types/p3-stock';

export default function P3StockPage() {
  const [mode, setMode] = useState<'volume' | 'percentage'>('volume');
  const [searchParams] = useSearchParams();
  const currentPeriode = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  // Modal State
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [modalView, setModalView] = useState<'chart' | 'report'>('chart');
  const [subModalView, setSubModalView] = useState<'chart' | 'report'>('chart');
  const [modalChartType, setModalChartType] = useState<'volume' | 'percentage'>('volume');
  const [subModalChartType, setSubModalChartType] = useState<'volume' | 'percentage'>('volume');
  const [modalPage, setModalPage] = useState(0);
  const [subModalPage, setSubModalPage] = useState(0);
  const [modalSort, setModalSort] = useState<SortConfig>({ field: 'p3', direction: 'desc' });
  const [subModalSort, setSubModalSort] = useState<SortConfig>({ field: 'p3', direction: 'desc' });
  const itemsPerPageModal = 10;

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['p3-stock-data', currentPeriode],
    queryFn: () => dataService.getP3StockData(currentPeriode),
    staleTime: 5 * 60 * 1000,
  });

  const p3Data = useMemo(() => {
    const raw = rawData?.p3s || [];
    return raw.filter((p: any) => p.tanggal_delivery && p.tanggal_delivery.startsWith(currentPeriode));
  }, [rawData?.p3s, currentPeriode]);

  const stockDateMatMap = useMemo(() => {
    const raw = rawData?.stocks || [];
    const map = new Map<string, any>();
    
    raw.forEach((s: any) => {
      const date = s.created_at ? s.created_at.split('T')[0] : '';
      if (!date) return;
      const code = (s.kode_material || '').trim().toLowerCase();
      const kg = (s.wip_st_kg || 0) + (s.wip_lt_kg || 0) + (s.fg_st_kg || 0) + (s.fg_lt_kg || 0);
      const wip_st_pcs = s.wip_st_pcs || 0;
      const wip_lt_pcs = s.wip_lt_pcs || 0;
      const fg_st_pcs = s.fg_st_pcs || 0;
      const pcs = wip_st_pcs + wip_lt_pcs + fg_st_pcs + (s.fg_lt_pcs || 0);
      
      const key = `${date}|${code}`;
      const existing = map.get(key) || { kg: 0, pcs: 0, wip_st_pcs: 0, wip_lt_pcs: 0, fg_st_pcs: 0 };
      map.set(key, { 
        kg: existing.kg + kg, 
        pcs: existing.pcs + pcs,
        wip_st_pcs: existing.wip_st_pcs + wip_st_pcs,
        wip_lt_pcs: existing.wip_lt_pcs + wip_lt_pcs,
        fg_st_pcs: existing.fg_st_pcs + fg_st_pcs
      });
    });
    return map;
  }, [rawData?.stocks]);

  const {
    chartData,
    customerDetailData,
    modalTotals,
    modalDisplayData,
    modalYAxisDomain,
    materialDetailData,
    subModalTotals,
    subModalDisplayData,
    subModalYAxisDomain
  } = useP3StockData(
    rawData,
    p3Data,
    stockDateMatMap,
    currentPeriode,
    selectedDate,
    selectedCustomer,
    modalSort,
    subModalSort,
    modalPage,
    subModalPage,
    itemsPerPageModal,
    modalChartType,
    subModalChartType
  );

  const displayData = useMemo(() => {
    if (mode === 'volume') return chartData;
    return chartData.map(d => ({
      date: d.date,
      p3: 0,
      stock: d.p3 > 0 ? (d.stock / d.p3) * 100 : 0
    }));
  }, [chartData, mode]);

  const handleBarClick = (data: any) => {
    if (data && data.date) {
      setSelectedDate(data.date);
      setIsModalOpen(true);
      setModalPage(0);
    }
  };

  const handleCustomerClick = (data: CustomerDetail) => {
    if (data && data.customer) {
      setSelectedCustomer(data.customer);
      setIsSubModalOpen(true);
      setSubModalPage(0);
    }
  };

  const yAxisDomain = useMemo(() => {
    if (mode === 'percentage') return [0, 100];
    const values = displayData.flatMap(d => [d.p3, d.stock]).filter(v => v > 0);
    if (values.length === 0) return [0, 10000];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    return [Math.max(0, minVal - 5000), maxVal + 5000];
  }, [displayData, mode]);

  const formatYAxis = (val: number) => {
    if (mode === 'percentage') return `${val}%`;
    return val.toLocaleString('id-ID');
  };

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="w-full bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">P3 Vs Stock</h1>
          <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setMode('volume')}
              className={`px-4 py-2 rounded-md font-medium transition-all ${mode === 'volume' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Volume
            </button>
            <button 
              onClick={() => setMode('percentage')}
              className={`px-4 py-2 rounded-md font-medium transition-all ${mode === 'percentage' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              %
            </button>
          </div>
        </div>
        
        <div className="h-[500px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={displayData} onClick={(data: any) => {
              if (data && data.activePayload && data.activePayload[0]) {
                handleBarClick(data.activePayload[0].payload);
              }
            }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis 
                dataKey="date" 
                tickFormatter={(val) => {
                  const d = new Date(val);
                  return `${d.getDate()}/${d.getMonth() + 1}`;
                }}
              />
              <YAxis 
                domain={yAxisDomain} 
                tickFormatter={formatYAxis}
                width={80}
              />
              <Tooltip formatter={(val: number) => [mode === 'percentage' ? `${val.toFixed(1)}%` : Math.round(val).toLocaleString('id-ID'), mode === 'percentage' ? 'Percentage' : 'Kg']} />
              <Legend />
              {mode === 'volume' && (
                <Bar dataKey="p3" name="P3 (Kg)" fill="#F97316" cursor="pointer">
                  {displayData.map((entry, index) => (
                    <Cell key={`cell-p3-${index}`} onClick={() => handleBarClick(entry)} />
                  ))}
                </Bar>
              )}
              <Bar dataKey="stock" name={mode === 'percentage' ? "Stock (%)" : "Stock (Kg)"} fill="#10B981" cursor="pointer">
                {displayData.map((entry, index) => (
                  <Cell key={`cell-stock-${index}`} onClick={() => handleBarClick(entry)} />
                ))}
                {mode === 'percentage' && <LabelList dataKey="stock" position="top" formatter={(val: number) => `${val.toFixed(1)}%`} />}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <CustomerDetailModal 
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          selectedDate={selectedDate}
          view={modalView}
          setView={setModalView}
          chartType={modalChartType}
          setChartType={setModalChartType}
          displayData={modalDisplayData}
          allData={customerDetailData}
          yAxisDomain={modalYAxisDomain}
          page={modalPage}
          setPage={setModalPage}
          itemsPerPage={itemsPerPageModal}
          sort={modalSort}
          setSort={setModalSort}
          totals={modalTotals}
          onCustomerClick={handleCustomerClick}
        />

        <MaterialDetailModal 
          isOpen={isSubModalOpen}
          onClose={() => setIsSubModalOpen(false)}
          selectedCustomer={selectedCustomer}
          selectedDate={selectedDate}
          view={subModalView}
          setView={setSubModalView}
          chartType={subModalChartType}
          setChartType={setSubModalChartType}
          displayData={subModalDisplayData}
          allData={materialDetailData}
          yAxisDomain={subModalYAxisDomain}
          page={subModalPage}
          setPage={setSubModalPage}
          itemsPerPage={itemsPerPageModal}
          sort={subModalSort}
          setSort={setSubModalSort}
          totals={subModalTotals}
        />
      </div>
    </div>
  );
}
