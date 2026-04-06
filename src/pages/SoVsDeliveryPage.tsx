import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, ReferenceLine
} from 'recharts';
import { RefreshCw, Calendar, ArrowUp, ArrowDown } from 'lucide-react';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

export default function SoVsDeliveryPage() {
  const { refreshKey } = useRefresh();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(0);
  const [orderType, setOrderType] = useState<'Regular' | 'Non Regular'>('Regular');
  const [timeView, setTimeView] = useState<'Current' | 'Monthly'>('Current');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{ customer: string; originalNames: string[] } | null>(null);
  const [modalPage, setModalPage] = useState(0);
  const [modalSortConfig, setModalSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const itemsPerPage = 15;
  const itemsPerPageModal = 10;

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['so-vs-delivery-data', refreshKey],
    queryFn: async () => {
      const [so, dels, mats] = await Promise.all([
        fetchAllRows('sales_orders', 'customer,qty_order_kg,periode,kode_st'),
        fetchAllRows('deliveries', 'customer,qty_delivery_kg,periode,kode_st'),
        fetchAllRows('material_master', 'customer,short_name_customer,status_order,kode_st,dimensi'),
      ]);
      return { so: so || [], dels: dels || [], mats: mats || [] };
    },
    staleTime: 5 * 60 * 1000,
  });

  const chartType = searchParams.get('chartType') || 'volume';

  const soMultiplier = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const periodeParam = searchParams.get('periode') || currentMonth;
    const [year, month] = periodeParam.split('-');

    const getWorkingDays = (startDate: Date, endDate: Date) => {
      let count = 0;
      const curDate = new Date(startDate.getTime());
      while (curDate <= endDate) {
        const dayOfWeek = curDate.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = curDate.getMonth() === 2 && [18, 20, 23, 24].includes(curDate.getDate());
        if (!isWeekend && !isHoliday) count++;
        curDate.setDate(curDate.getDate() + 1);
      }
      return count;
    };

    const now = new Date();
    const firstDayOfMonth = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    const lastDayOfMonth = new Date(parseInt(year, 10), parseInt(month, 10), 0);
    
    const totalWorkingDays = getWorkingDays(firstDayOfMonth, lastDayOfMonth);
    const endDateForCurrent = now < lastDayOfMonth ? now : lastDayOfMonth;
    const workingDaysPassed = getWorkingDays(firstDayOfMonth, endDateForCurrent);
    
    return (timeView === 'Current' && orderType === 'Regular' && totalWorkingDays > 0) 
      ? (workingDaysPassed / totalWorkingDays) 
      : 1;
  }, [searchParams, timeView, orderType]);

  const chartData = useMemo(() => {
    if (!rawData) return [];

    const currentMonth = new Date().toISOString().slice(0, 7);
    const periodeParam = searchParams.get('periode') || currentMonth;
    const [year, month] = periodeParam.split('-');
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const targetPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

    const { so, dels, mats } = rawData;

    const shortNameMap = new Map<string, string>();
    const customerStatusMap = new Map<string, string>();
    mats.forEach((m: any) => {
      if (m.customer) {
        const custKey = m.customer.trim().toUpperCase();
        if (m.short_name_customer) {
          shortNameMap.set(custKey, m.short_name_customer);
        }
        if (m.status_order === 'Regular Order') {
          customerStatusMap.set(custKey, 'Regular Order');
          if (m.short_name_customer) {
             customerStatusMap.set(m.short_name_customer.trim().toUpperCase(), 'Regular Order');
          }
        }
      }
    });

    const normalizeCust = (c: string) => c ? c.trim().toUpperCase() : 'UNKNOWN';

    const customerMap = new Map<string, { customer: string; so: number; delivery: number; originalNames: Set<string> }>();

    so.forEach((s: any) => {
      if (s.periode !== targetPeriode) return;
      const rawCust = s.customer || 'Unknown';
      const custKey = normalizeCust(rawCust);
      const shortName = shortNameMap.get(custKey) || rawCust;
      const normShort = normalizeCust(shortName);

      if (!customerMap.has(normShort)) {
        customerMap.set(normShort, { customer: shortName, so: 0, delivery: 0, originalNames: new Set() });
      }
      const entry = customerMap.get(normShort)!;
      entry.so += (s.qty_order_kg || 0);
      entry.originalNames.add(rawCust);
    });

    dels.forEach((d: any) => {
      if (d.periode !== targetPeriode) return;
      const rawCust = d.customer || 'Unknown';
      const custKey = normalizeCust(rawCust);
      const shortName = shortNameMap.get(custKey) || rawCust;
      const normShort = normalizeCust(shortName);

      if (!customerMap.has(normShort)) {
        customerMap.set(normShort, { customer: shortName, so: 0, delivery: 0, originalNames: new Set() });
      }
      const entry = customerMap.get(normShort)!;
      entry.delivery += (d.qty_delivery_kg || 0);
      entry.originalNames.add(rawCust);
    });

    return Array.from(customerMap.values())
      .filter(c => {
        const normShort = normalizeCust(c.customer);
        const isRegular = customerStatusMap.get(normShort) === 'Regular Order';
        if (orderType === 'Regular') return isRegular;
        return !isRegular;
      })
      .map(c => {
        const adjustedSo = c.so * soMultiplier;
        const so_percent = adjustedSo > 0 ? 100 : 0;
        const delivery_percent = adjustedSo > 0 ? (c.delivery / adjustedSo) * 100 : (c.delivery > 0 ? 100 : 0);
        return { ...c, so: adjustedSo, so_percent, delivery_percent, originalNames: Array.from(c.originalNames) };
      })
      .sort((a, b) => b.so - a.so);
  }, [rawData, searchParams, orderType, timeView, soMultiplier]);

  const modalData = useMemo(() => {
    if (!selectedCustomer || !rawData) return [];

    const currentMonth = new Date().toISOString().slice(0, 7);
    const periodeParam = searchParams.get('periode') || currentMonth;
    const [year, month] = periodeParam.split('-');
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const targetPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

    const { so, dels, mats } = rawData;
    const { originalNames } = selectedCustomer;
    const originalNamesSet = new Set(originalNames.map(n => n.trim().toUpperCase()));

    const dimensiMap = new Map<string, string>();
    mats.forEach((m: any) => {
      if (m.kode_st && m.dimensi) {
        dimensiMap.set(m.kode_st, m.dimensi);
      }
    });

    const itemMap = new Map<string, { kode_st: string; dimensi: string; so: number; delivery: number }>();

    so.forEach((s: any) => {
      if (s.periode !== targetPeriode) return;
      const rawCust = s.customer || 'Unknown';
      if (!originalNamesSet.has(rawCust.trim().toUpperCase())) return;

      const kodeSt = s.kode_st || 'Unknown';
      if (!itemMap.has(kodeSt)) {
        itemMap.set(kodeSt, { kode_st: kodeSt, dimensi: dimensiMap.get(kodeSt) || '-', so: 0, delivery: 0 });
      }
      itemMap.get(kodeSt)!.so += (s.qty_order_kg || 0);
    });

    dels.forEach((d: any) => {
      if (d.periode !== targetPeriode) return;
      const rawCust = d.customer || 'Unknown';
      if (!originalNamesSet.has(rawCust.trim().toUpperCase())) return;

      const kodeSt = d.kode_st || 'Unknown';
      if (!itemMap.has(kodeSt)) {
        itemMap.set(kodeSt, { kode_st: kodeSt, dimensi: dimensiMap.get(kodeSt) || '-', so: 0, delivery: 0 });
      }
      itemMap.get(kodeSt)!.delivery += (d.qty_delivery_kg || 0);
    });

    let result = Array.from(itemMap.values())
      .map(item => {
        const adjustedSo = item.so * soMultiplier;
        const so_percent = adjustedSo > 0 ? 100 : 0;
        const delivery_percent = adjustedSo > 0 ? (item.delivery / adjustedSo) * 100 : (item.delivery > 0 ? 100 : 0);
        return { ...item, so: adjustedSo, so_percent, delivery_percent };
      });

    if (modalSortConfig) {
      result.sort((a, b) => {
        const { key, direction } = modalSortConfig;
        let aVal = a[key as keyof typeof a];
        let bVal = b[key as keyof typeof b];
        
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
        }
        
        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      result.sort((a, b) => b.so - a.so);
    }

    return result;
  }, [selectedCustomer, rawData, searchParams, soMultiplier, modalSortConfig]);

  const totalPages = Math.ceil(chartData.length / itemsPerPage);
  const paginatedData = chartData.slice(
    currentPage * itemsPerPage,
    (currentPage + 1) * itemsPerPage
  );

  const { minPercent, maxPercent } = useMemo(() => {
    if (chartType !== 'percentage' || paginatedData.length === 0) return { minPercent: 0, maxPercent: 'auto' };
    
    const validPercents = paginatedData.map(d => d.delivery_percent).filter(p => p > 0);
    if (validPercents.length === 0) return { minPercent: 0, maxPercent: 100 };
    
    const min = Math.min(...validPercents);
    const max = Math.max(...validPercents);
    
    return {
      minPercent: Math.max(0, Math.floor(min) - 5),
      maxPercent: Math.ceil(max) + 5
    };
  }, [paginatedData, chartType]);

  const handleModalSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (modalSortConfig && modalSortConfig.key === key && modalSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setModalSortConfig({ key, direction });
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div className="flex justify-end items-center gap-4">
        {orderType === 'Regular' && (
          <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1">
            <button
              onClick={() => { setTimeView('Current'); setCurrentPage(0); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${
                timeView === 'Current'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Current
            </button>
            <button
              onClick={() => { setTimeView('Monthly'); setCurrentPage(0); }}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${
                timeView === 'Monthly'
                  ? 'bg-emerald-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              Monthly
            </button>
          </div>
        )}

        <div className="flex bg-white rounded-full shadow-sm border border-gray-100 p-1">
          <button
            onClick={() => { setOrderType('Regular'); setCurrentPage(0); }}
            className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${
              orderType === 'Regular' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            Regular
          </button>
          <button
            onClick={() => { setOrderType('Non Regular'); setCurrentPage(0); }}
            className={`px-4 py-1.5 rounded-full text-[13px] font-bold transition-all ${
              orderType === 'Non Regular' ? 'bg-indigo-500 text-white shadow-md' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            Non Regular
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="h-[500px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              data={paginatedData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F1F1" />
              <XAxis 
                dataKey="customer" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#475569', fontSize: 11, fontWeight: 500 }}
                interval={0}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#94A3B8', fontSize: 11 }}
                tickFormatter={(val) => chartType === 'percentage' ? `${val}%` : `${(val / 1000).toFixed(0)}k`}
                domain={chartType === 'percentage' ? [minPercent, maxPercent] : [0, 'auto']}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                formatter={(val: number) => [
                  chartType === 'percentage' 
                    ? `${val.toFixed(1)}%` 
                    : `${val.toLocaleString('id-ID', { maximumFractionDigits: 0 })} Kg`, 
                  ''
                ]}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '20px' }} />
              {chartType === 'percentage' && (
                <ReferenceLine 
                  y={100} 
                  stroke="#EF4444" 
                  strokeDasharray="3 3" 
                  strokeWidth={2}
                  label={{ position: 'top', value: 'Target 100%', fill: '#EF4444', fontSize: 11, fontWeight: 'bold' }} 
                />
              )}
              {chartType === 'volume' && (
                <Bar 
                  dataKey="so" 
                  name="Sales Order" 
                  fill="#3B82F6" 
                  radius={[4, 4, 0, 0]} 
                  barSize={30}
                  onClick={(data) => {
                    if (data && data.payload) {
                      setSelectedCustomer(data.payload);
                      setIsModalOpen(true);
                      setModalPage(0);
                    }
                  }}
                  cursor="pointer"
                />
              )}
              <Bar 
                dataKey={chartType === 'percentage' ? 'delivery_percent' : 'delivery'} 
                name={chartType === 'percentage' ? '% Delivery / SO' : 'Delivery'} 
                fill="#10B981" 
                radius={[4, 4, 0, 0]} 
                barSize={30}
                onClick={(data) => {
                  if (data && data.payload) {
                    setSelectedCustomer(data.payload);
                    setIsModalOpen(true);
                    setModalPage(0);
                  }
                }}
                cursor="pointer"
              >
                {chartType === 'percentage' && (
                  <LabelList 
                    dataKey="delivery_percent" 
                    position="top" 
                    formatter={(val: number) => val > 0 ? `${val.toFixed(1)}%` : ''} 
                    style={{ fontSize: '11px', fill: '#64748B', fontWeight: 600 }}
                  />
                )}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 mt-6">
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="text-gray-600 font-medium">← Prev</span>
            </button>
            <span className="text-sm text-gray-600 font-medium bg-gray-50 px-4 py-2 rounded-xl border border-gray-100">
              Halaman {currentPage + 1} dari {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage === totalPages - 1}
              className="p-2 rounded-xl hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="text-gray-600 font-medium">Next →</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal Detail SO vs Delivery */}
      {isModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Detail SO vs Delivery</h3>
                <p className="text-sm text-gray-500 mt-1">Customer: <span className="font-semibold text-indigo-600">{selectedCustomer.customer}</span></p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-16">No</th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleModalSort('kode_st')}
                      >
                        <div className="flex items-center gap-1">
                          Kode ST
                          {modalSortConfig?.key === 'kode_st' && (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleModalSort('dimensi')}
                      >
                        <div className="flex items-center gap-1">
                          Dimensi
                          {modalSortConfig?.key === 'dimensi' && (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleModalSort('so')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Sales Order (Kg)
                          {modalSortConfig?.key === 'so' && (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleModalSort('delivery')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Delivery (Kg)
                          {modalSortConfig?.key === 'delivery' && (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right cursor-pointer hover:bg-gray-100 transition-colors"
                        onClick={() => handleModalSort('delivery_percent')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          % Delivery
                          {modalSortConfig?.key === 'delivery_percent' && (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {modalData.slice(modalPage * itemsPerPageModal, (modalPage + 1) * itemsPerPageModal).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 text-sm text-gray-500">{modalPage * itemsPerPageModal + idx + 1}</td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{row.kode_st}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{row.dimensi}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{row.so.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">{row.delivery.toLocaleString('id-ID', { maximumFractionDigits: 0 })}</td>
                        <td className="px-6 py-4 text-sm text-right">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            row.delivery_percent >= 100 ? 'bg-green-100 text-green-700' :
                            row.delivery_percent >= 80 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {row.delivery_percent.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                    {modalData.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-6 py-8 text-center text-gray-500 text-sm">
                          Tidak ada data detail untuk customer ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {modalData.length > itemsPerPageModal && (
              <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
                <span className="text-sm text-gray-500">
                  Showing {modalPage * itemsPerPageModal + 1} to {Math.min((modalPage + 1) * itemsPerPageModal, modalData.length)} of {modalData.length} items
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModalPage(p => Math.max(0, p - 1))}
                    disabled={modalPage === 0}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setModalPage(p => Math.min(Math.ceil(modalData.length / itemsPerPageModal) - 1, p + 1))}
                    disabled={modalPage >= Math.ceil(modalData.length / itemsPerPageModal) - 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
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
