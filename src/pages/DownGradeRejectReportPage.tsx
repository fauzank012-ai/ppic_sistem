import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useRefresh } from '../contexts/RefreshContext';
import { useViewMode } from '../contexts/ViewModeContext';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, ComposedChart, Line } from 'recharts';

const DownGradeRejectChart = ({ data }: { data: any[] }) => {
  const [paretoView, setParetoView] = useState<'dg' | 'reject'>('dg');
  const [selectedDetail, setSelectedDetail] = useState<{ type: 'work_center' | 'problem', value: string } | null>(null);
  const [modalSortConfig, setModalSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const chartData = useMemo(() => {
    const grouped = data.reduce((acc, curr) => {
      const wc = curr.work_center || 'Unknown';
      if (!acc[wc]) {
        acc[wc] = { name: wc, dg: 0, reject: 0, gi: 0 };
      }
      acc[wc].dg += Number(curr.qty_dg_kg || 0);
      acc[wc].reject += Number(curr.qty_reject_kg || 0);
      acc[wc].gi += Number(curr.gi_kg || 0);
      return acc;
    }, {} as Record<string, { name: string, dg: number, reject: number, gi: number }>);

    const sortedGrouped = Object.values(grouped) as { name: string, dg: number, reject: number, gi: number }[];
    sortedGrouped.sort((a, b) => a.name.localeCompare(b.name));

    const volume = sortedGrouped.map(item => ({
      name: item.name,
      'Down Grade': item.dg,
      'Reject': item.reject
    }));

    const percentage = sortedGrouped.map(item => ({
      name: item.name,
      'Down Grade': item.gi ? (item.dg / item.gi) * 100 : 0,
      'Reject': item.gi ? (item.reject / item.gi) * 100 : 0
    }));

    return { volume, percentage };
  }, [data]);

  const paretoData = useMemo(() => {
    const grouped = data.reduce((acc, curr) => {
      const problem = curr.problem || 'Unknown';
      if (!acc[problem]) {
        acc[problem] = { name: problem, dg: 0, reject: 0 };
      }
      acc[problem].dg += Number(curr.qty_dg_kg || 0);
      acc[problem].reject += Number(curr.qty_reject_kg || 0);
      return acc;
    }, {} as Record<string, { name: string, dg: number, reject: number }>);

    const key = paretoView === 'dg' ? 'dg' : 'reject';
    
    const sorted = (Object.values(grouped) as { name: string, dg: number, reject: number }[])
      .filter(item => item[key] > 0)
      .sort((a, b) => b[key] - a[key]);

    const total = sorted.reduce((sum, item) => sum + item[key], 0);
    let cumulative = 0;

    return sorted.map(item => {
      cumulative += item[key];
      return {
        name: item.name,
        value: item[key],
        cumulativePercentage: total > 0 ? (cumulative / total) * 100 : 0
      };
    });
  }, [data, paretoView]);

  const detailData = useMemo(() => {
    if (!selectedDetail) return [];
    if (selectedDetail.type === 'work_center') {
      return data.filter(d => d.work_center === selectedDetail.value);
    } else {
      return data.filter(d => d.problem === selectedDetail.value);
    }
  }, [data, selectedDetail]);

  const handleModalSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (modalSortConfig && modalSortConfig.key === key && modalSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setModalSortConfig({ key, direction });
  };

  const sortedDetailData = useMemo(() => {
    if (!modalSortConfig) return detailData;
    return [...detailData].sort((a, b) => {
      let aVal = a[modalSortConfig.key];
      let bVal = b[modalSortConfig.key];
      
      const numericKeys = ['qty_dg_pcs', 'qty_dg_kg', 'percent_dg', 'qty_reject_mtr', 'qty_reject_kg', 'percent_reject'];
      if (numericKeys.includes(modalSortConfig.key)) {
        aVal = Number(aVal || 0);
        bVal = Number(bVal || 0);
      } else {
        if (aVal === null || aVal === undefined) aVal = '';
        if (bVal === null || bVal === undefined) bVal = '';
      }
      
      if (aVal < bVal) return modalSortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return modalSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [detailData, modalSortConfig]);

  return (
    <div className="flex flex-col gap-6 w-full overflow-y-auto relative">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Total Volume (KG)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData.volume} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => value.toFixed(1) + ' KG'} cursor={{ fill: 'transparent' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Down Grade" fill="#f59e0b" name="Down Grade (KG)" onClick={(entry) => setSelectedDetail({ type: 'work_center', value: entry.name })} cursor="pointer" />
              <Bar dataKey="Reject" fill="#ef4444" name="Reject (KG)" onClick={(entry) => setSelectedDetail({ type: 'work_center', value: entry.name })} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-700 mb-4">Total Percentage (%)</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData.percentage} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis unit="%" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => value.toFixed(1) + '%'} cursor={{ fill: 'transparent' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Down Grade" fill="#f59e0b" name="Down Grade (%)" onClick={(entry) => setSelectedDetail({ type: 'work_center', value: entry.name })} cursor="pointer" />
              <Bar dataKey="Reject" fill="#ef4444" name="Reject (%)" onClick={(entry) => setSelectedDetail({ type: 'work_center', value: entry.name })} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-bold text-gray-700">Pareto Problem</h3>
          <div className="flex gap-6">
            <button
              onClick={() => setParetoView('dg')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                paretoView === 'dg' ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Down Grade
            </button>
            <button
              onClick={() => setParetoView('reject')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                paretoView === 'reject' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Reject
            </button>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={350}>
          <ComposedChart data={paretoData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 12 }} />
            <Tooltip 
              formatter={(value: number, name: string) => {
                if (name === 'Cumulative %') return value.toFixed(1) + '%';
                return value.toFixed(1) + ' KG';
              }}
              cursor={{ fill: 'transparent' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar yAxisId="left" dataKey="value" name={paretoView === 'dg' ? 'Down Grade (KG)' : 'Reject (KG)'} fill={paretoView === 'dg' ? '#f59e0b' : '#ef4444'} onClick={(entry) => setSelectedDetail({ type: 'problem', value: entry.name })} cursor="pointer" />
            <Line yAxisId="right" type="monotone" dataKey="cumulativePercentage" name="Cumulative %" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="overflow-auto flex-1">
              <table className="w-full text-[11px] text-left text-gray-700 border-collapse">
                <thead className="sticky top-0 z-20 bg-white shadow-sm">
                  <tr>
                    <th colSpan={11} className="p-4 border-b bg-white">
                      <div className="flex justify-between items-center">
                        <h2 className="text-lg font-bold text-gray-800">
                          Detail {selectedDetail.type === 'work_center' ? 'Work Center' : 'Problem'}: {selectedDetail.value}
                        </h2>
                        <button onClick={() => setSelectedDetail(null)} className="p-1 hover:bg-gray-100 rounded-full">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    </th>
                  </tr>
                  <tr className="text-[10px] text-gray-900 uppercase bg-gray-100">
                    <th className="px-4 py-2">No</th>
                    {[
                      { key: 'work_center', label: 'Work Center' },
                      { key: 'order_no', label: 'Order No' },
                      { key: 'problem', label: 'Problem' },
                      { key: 'keterangan', label: 'Keterangan' },
                      { key: 'qty_dg_pcs', label: 'Qty DG (Pcs)' },
                      { key: 'qty_dg_kg', label: 'Qty DG (Kg)' },
                      { key: 'percent_dg', label: '% DG' },
                      { key: 'qty_reject_mtr', label: 'Qty Reject (Mtr)' },
                      { key: 'qty_reject_kg', label: 'Qty Reject (Kg)' },
                      { key: 'percent_reject', label: '% Reject' },
                    ].map(col => (
                      <th key={col.key} className="px-4 py-2 cursor-pointer hover:bg-gray-200" onClick={() => handleModalSort(col.key)}>
                        <div className="flex items-center gap-1">
                          {col.label}
                          {modalSortConfig?.key === col.key ? (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="inline w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedDetailData.map((row, index) => (
                    <tr key={row.id || index} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{index + 1}</td>
                      <td className="px-4 py-2">{row.work_center}</td>
                      <td className="px-4 py-2">{row.order_no}</td>
                      <td className="px-4 py-2">{row.problem}</td>
                      <td className="px-4 py-2">{row.keterangan}</td>
                      <td className="px-4 py-2">{row.qty_dg_pcs}</td>
                      <td className="px-4 py-2">{Number(row.qty_dg_kg || 0).toFixed(1)}</td>
                      <td className="px-4 py-2">{Number(row.percent_dg || 0).toFixed(1)}%</td>
                      <td className="px-4 py-2">{row.qty_reject_mtr}</td>
                      <td className="px-4 py-2">{Number(row.qty_reject_kg || 0).toFixed(1)}</td>
                      <td className="px-4 py-2">{Number(row.percent_reject || 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                  {sortedDetailData.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-4 py-8 text-center text-gray-500">No data available</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function DownGradeRejectReportPage() {
  const { refreshKey } = useRefresh();
  const { viewMode } = useViewMode();
  const [searchParams] = useSearchParams();
  const selectedPeriodeParam = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [year, month] = selectedPeriodeParam.split('-');
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const targetPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [workCenterFilter, setWorkCenterFilter] = useState('All');

  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['down-grade-reject-report-data', selectedPeriodeParam, refreshKey],
    queryFn: async () => {
      const [downGradeData, prodData] = await Promise.all([
        supabase.from('down_grade').select('*').eq('periode', targetPeriode).order('id', { ascending: true }),
        supabase.from('mb51_prod').select('order_no, gi_qty_kg').eq('periode', targetPeriode)
      ]);
      
      if (downGradeData.error) throw downGradeData.error;
      if (prodData.error) throw prodData.error;

      const giMap = new Map();
      (prodData.data || []).forEach((row: any) => {
        const orderNo = (row.order_no || '').trim();
        if (orderNo) {
          giMap.set(orderNo, (giMap.get(orderNo) || 0) + (Number(row.gi_qty_kg) || 0));
        }
      });

      return (downGradeData.data || []).map((row: any) => {
        const giKg = giMap.get((row.order_no || '').trim()) || 0;
        return {
          ...row,
          gi_kg: giKg,
          percent_dg: giKg ? (Number(row.qty_dg_kg || 0) / Number(giKg)) * 100 : 0,
          percent_reject: giKg ? (Number(row.qty_reject_kg || 0) / Number(giKg)) * 100 : 0
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  const uniqueWorkCenters = useMemo(() => Array.from(new Set(data.map(d => d.work_center))).filter(Boolean).sort(), [data]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredData = useMemo(() => workCenterFilter === 'All' ? data : data.filter(d => d.work_center === workCenterFilter), [data, workCenterFilter]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    return [...filteredData].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <div className="flex-1 overflow-hidden p-6">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
          </div>
        ) : viewMode === 'chart' ? (
          <DownGradeRejectChart data={sortedData} />
        ) : (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 h-full flex flex-col">
            <div className="overflow-auto flex-1">
              <table className="w-full text-[11px] text-left text-gray-700 border-collapse">
                <thead className="text-[10px] text-gray-900 uppercase bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-2 sticky left-0 bg-gray-100">No</th>
                    {[
                      { key: 'work_center', label: 'Work Center', filter: true },
                      { key: 'order_no', label: 'Order No' },
                      { key: 'problem', label: 'Problem' },
                      { key: 'keterangan', label: 'Keterangan' },
                      { key: 'qty_dg_pcs', label: 'Qty DG (Pcs)' },
                      { key: 'qty_dg_kg', label: 'Qty DG (Kg)' },
                      { key: 'percent_dg', label: '% DG' },
                      { key: 'qty_reject_mtr', label: 'Qty Reject (Mtr)' },
                      { key: 'qty_reject_kg', label: 'Qty Reject (Kg)' },
                      { key: 'percent_reject', label: '% Reject' },
                    ].map(col => (
                      <th key={col.key} className="px-4 py-2 cursor-pointer hover:bg-gray-200" onClick={() => !col.filter && handleSort(col.key)}>
                        <div className="flex items-center gap-6">
                          {col.filter ? (
                            <select 
                              value={workCenterFilter} 
                              onChange={(e) => setWorkCenterFilter(e.target.value)}
                              className="bg-transparent font-bold uppercase cursor-pointer"
                            >
                              <option value="All">All Work Center</option>
                              {uniqueWorkCenters.map(wc => <option key={wc} value={wc}>{wc}</option>)}
                            </select>
                          ) : (
                            <>
                              {col.label} {sortConfig?.key === col.key ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />
                              ) : (
                                <ArrowUpDown className="inline w-3 h-3 text-gray-400" />
                              )}
                            </>
                          )}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedData.map((row, index) => (
                    <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-4 py-2 sticky left-0 bg-white">{index + 1}</td>
                      <td className="px-4 py-2">{row.work_center}</td>
                      <td className="px-4 py-2">{row.order_no}</td>
                      <td className="px-4 py-2">{row.problem}</td>
                      <td className="px-4 py-2">{row.keterangan}</td>
                      <td className="px-4 py-2">{row.qty_dg_pcs}</td>
                      <td className="px-4 py-2">{Number(row.qty_dg_kg || 0).toFixed(1)}</td>
                      <td className="px-4 py-2">{Number(row.percent_dg || 0).toFixed(1)}%</td>
                      <td className="px-4 py-2">{row.qty_reject_mtr}</td>
                      <td className="px-4 py-2">{Number(row.qty_reject_kg || 0).toFixed(1)}</td>
                      <td className="px-4 py-2">{Number(row.percent_reject || 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
