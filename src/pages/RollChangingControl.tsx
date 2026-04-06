import React, { useMemo } from 'react';
import { Settings, RefreshCw, Loader2, TrendingUp, Target as TargetIcon, CheckCircle2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

export default function RollChangingControl() {
  const { refreshKey } = useRefresh();
  const [searchParams] = useSearchParams();
  
  const now = new Date();
  const currentPeriode = searchParams.get('periode') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedYear, selectedMonth] = currentPeriode.split('-').map(Number);

  const viewType = searchParams.get('viewType') || 'monthly';

  const { data = [], isLoading: loading, refetch } = useQuery({
    queryKey: ['roll-changing-control-data', refreshKey, selectedMonth, selectedYear, viewType],
    queryFn: async () => {
      const [machines, coisData] = await Promise.all([
        fetchAllRows('master_data_mesin', 'work_center,kategori,target_roll_change'),
        fetchAllRows('cois_prod', 'tanggal,work_centre,order_no,bongkar')
      ]);

      if (viewType === 'current') {
        const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
        
        // Calculate days up to yesterday
        const today = new Date();
        let daysUpToYesterday = daysInMonth;
        
        if (today.getFullYear() === selectedYear && today.getMonth() + 1 === selectedMonth) {
          daysUpToYesterday = Math.max(1, today.getDate() - 1);
        } else if (today.getFullYear() < selectedYear || (today.getFullYear() === selectedYear && today.getMonth() + 1 < selectedMonth)) {
          daysUpToYesterday = 0;
        }

        const machineMap = new Map();
        (machines || [])
          .filter((m: any) => (m.kategori || '').toLowerCase().includes('tubing'))
          .forEach((m: any) => {
            const wc = (m.work_center || '').trim().toUpperCase();
            if (wc) {
              const monthlyTarget = Number(m.target_roll_change) || 0;
              const currentTarget = Math.round((monthlyTarget / daysInMonth) * daysUpToYesterday);
              
              machineMap.set(wc, {
                work_center: wc,
                target: currentTarget,
                actual: 0,
                orders: new Set()
              });
            }
          });

        (coisData || []).forEach((c: any) => {
          const coisDate = new Date(c.tanggal);
          if (coisDate.getMonth() === selectedMonth - 1 && coisDate.getFullYear() === selectedYear) {
            // Only count actuals up to yesterday if in current month
            if (today.getFullYear() === selectedYear && today.getMonth() + 1 === selectedMonth && coisDate >= today) {
              return;
            }
            
            const wc = (c.work_centre || '').trim().toUpperCase();
            const orderNo = (c.order_no || '').trim();
            const bongkar = Number(c.bongkar) || 0;
            
            if (wc && orderNo && bongkar > 0 && machineMap.has(wc)) {
              machineMap.get(wc).orders.add(orderNo);
            }
          }
        });

        return Array.from(machineMap.values())
          .map(item => ({
            ...item,
            actual: item.orders.size,
            achievement: item.target > 0 ? (item.orders.size / item.target) * 100 : 0
          }))
          .filter(item => item.target > 0 || item.actual > 0)
          .sort((a, b) => a.work_center.localeCompare(b.work_center, undefined, { numeric: true, sensitivity: 'base' }));
      }

      // Process machine targets for monthly view
      const machineMap = new Map();
      (machines || [])
        .filter((m: any) => (m.kategori || '').toLowerCase().includes('tubing'))
        .forEach((m: any) => {
          const wc = (m.work_center || '').trim().toUpperCase();
          if (wc) {
            machineMap.set(wc, {
              work_center: wc,
              target: Number(m.target_roll_change) || 0,
              actual: 0,
              orders: new Set()
            });
          }
        });

      // Process actual roll changes (unique order_no per machine in selected month with bongkar > 0)
      (coisData || []).forEach((c: any) => {
        const coisDate = new Date(c.tanggal);
        if (coisDate.getMonth() === selectedMonth - 1 && coisDate.getFullYear() === selectedYear) {
          const wc = (c.work_centre || '').trim().toUpperCase();
          const orderNo = (c.order_no || '').trim();
          const bongkar = Number(c.bongkar) || 0;
          if (wc && orderNo && bongkar > 0 && machineMap.has(wc)) {
            machineMap.get(wc).orders.add(orderNo);
          }
        }
      });

      // Convert to array and calculate actual count
      return Array.from(machineMap.values())
        .map(item => ({
          ...item,
          actual: item.orders.size,
          achievement: item.target > 0 ? (item.orders.size / item.target) * 100 : 0
        }))
        .filter(item => item.target > 0 || item.actual > 0)
        .sort((a, b) => a.work_center.localeCompare(b.work_center, undefined, { numeric: true, sensitivity: 'base' }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const totals = useMemo(() => {
    return data.reduce((acc, curr) => ({
      target: acc.target + curr.target,
      actual: acc.actual + curr.actual
    }), { target: 0, actual: 0 });
  }, [data]);

  const overallAchievement = totals.target > 0 ? (totals.actual / totals.target) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-600 animate-spin" />
          <p className="text-gray-500 font-medium animate-pulse">Loading Roll Changing Data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-50 min-h-screen space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <TargetIcon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Total Target</p>
            <h3 className="text-2xl font-bold text-gray-900">{totals.target} <span className="text-sm font-normal text-gray-400">Times</span></h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Total Actual</p>
            <h3 className="text-2xl font-bold text-gray-900">{totals.actual} <span className="text-sm font-normal text-gray-400">Times</span></h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium uppercase tracking-wider">Overall Achievement</p>
            <h3 className="text-2xl font-bold text-gray-900">{(overallAchievement ?? 0).toFixed(1)}%</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Main Chart - Left Side */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex flex-col h-[600px]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Roll Changing Performance</h2>
              <p className="text-xs text-gray-500">Target vs Actual per Tubing Machine</p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => refetch()}
                className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                barGap={4}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0" />
                <XAxis 
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                />
                <YAxis 
                  dataKey="work_center" 
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 10, fontWeight: 'bold' }}
                  width={80}
                />
                <Tooltip 
                  cursor={{ fill: '#f9fafb' }}
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: 'none', 
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    fontSize: '11px'
                  }}
                />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: '10px', fontSize: '11px' }}
                />
                <Bar 
                  dataKey="target" 
                  name="Target" 
                  fill="#e2e8f0" 
                  radius={[0, 4, 4, 0]} 
                  barSize={15}
                >
                  <LabelList dataKey="target" position="right" style={{ fontSize: '9px', fill: '#94a3b8' }} />
                </Bar>
                <Bar 
                  dataKey="actual" 
                  name="Actual" 
                  fill="#10b981" 
                  radius={[0, 4, 4, 0]} 
                  barSize={15}
                >
                  <LabelList dataKey="actual" position="right" style={{ fontSize: '9px', fill: '#059669', fontWeight: 'bold' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Table - Right Side */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col h-[600px]">
          <div className="p-6 border-b border-gray-50">
            <h3 className="text-lg font-bold text-gray-900">Detailed Breakdown</h3>
          </div>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse" style={{ fontSize: '14px' }}>
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-4 py-3 font-black text-gray-400 uppercase tracking-wider">Work Center</th>
                  <th className="px-4 py-3 font-black text-gray-400 uppercase tracking-wider text-center">Target</th>
                  <th className="px-4 py-3 font-black text-gray-400 uppercase tracking-wider text-center">Actual</th>
                  <th className="px-4 py-3 font-black text-gray-400 uppercase tracking-wider text-right">Achv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.map((item, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-bold text-gray-900">{item.work_center}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 font-medium">{item.target}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[12px] font-bold ${
                        item.actual >= item.target ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {item.actual}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              item.achievement >= 100 ? 'bg-emerald-500' : 
                              item.achievement >= 75 ? 'bg-blue-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(item.achievement, 100)}%` }}
                          />
                        </div>
                        <span className="font-bold text-gray-900 w-10">{(item?.achievement ?? 0).toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
