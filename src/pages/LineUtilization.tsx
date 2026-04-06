import React, { useState, useEffect } from 'react';
import { Calendar, RefreshCw, ArrowLeft, BarChart2, Table } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchAllRows } from '../lib/supabase';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

export default function LineUtilization() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('type') || 'tubing').toLowerCase();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [calcMode, setCalcMode] = useState<'monthly' | 'current'>('current');
  const [viewMode, setViewMode] = useState<'chart' | 'report'>('chart');
  
  const selectedPeriod = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  
  const setSelectedPeriod = (newPeriode: string) => {
    setSearchParams({ ...Object.fromEntries(searchParams), periode: newPeriode });
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
        const [year, month] = selectedPeriod.split('-');
        const formattedPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

        const [coisData, mb51Data, mesinData] = await Promise.all([
          fetchAllRows('cois_prod', 'tanggal,work_centre,proses,set_up,bongkar,machine_time,down_time', (q) => q.eq('periode', formattedPeriode)),
          fetchAllRows('mb51_prod', 'work_centre_lt,proses'),
          fetchAllRows('master_data_mesin', 'work_center,kategori')
        ]);

        const wcKategoriMap = new Map<string, string>();
        (mesinData || []).forEach(m => {
          const wc = (m.work_center || '').trim().toUpperCase();
          if (wc) wcKategoriMap.set(wc, (m.kategori || 'Others').trim());
        });

        const wcProcessMap = new Map<string, string>();
        (mb51Data || []).forEach(row => {
          const wc = (row.work_centre_lt || '').trim().toUpperCase();
          if (wc) wcProcessMap.set(wc, (row.proses || 'LT').trim().toUpperCase());
        });
        (coisData || []).forEach(row => {
          const wc = (row.work_centre || '').trim().toUpperCase();
          if (wc && row.proses) wcProcessMap.set(wc, row.proses.trim().toUpperCase());
        });

        // Calculate Jam Tersedia based on the months present in the data
        const monthsSet = new Set<string>();
        (coisData || []).forEach(row => {
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

        const today = new Date();
        const [selectedYear, selectedMonth] = selectedPeriod.split('-').map(Number);
        const isCurrentMonth = today.getFullYear() === selectedYear && today.getMonth() + 1 === selectedMonth;
        const isPastMonth = selectedYear < today.getFullYear() || (selectedYear === today.getFullYear() && selectedMonth < today.getMonth() + 1);

        let calculatedJamTersedia = 0;
        if (calcMode === 'current' && !isPastMonth) {
          const daysPassed = isCurrentMonth ? today.getDate() : 1;
          const baseHours = daysPassed * 24;
          const rollChangeHours = (daysPassed / 7) * 5;
          const preventiveHours = 8;
          const holidayHours = selectedMonth === 3 ? (10 * 24) : 0;
          calculatedJamTersedia = baseHours - rollChangeHours - preventiveHours - holidayHours;
        } else {
          const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
          const baseHours = daysInMonth * 24;
          const rollChangeHours = (daysInMonth / 7) * 5;
          const preventiveHours = 8;
          const holidayHours = selectedMonth === 3 ? (10 * 24) : 0;
          calculatedJamTersedia = baseHours - rollChangeHours - preventiveHours - holidayHours;
        }

        const wcMap = new Map<string, any>();

        // Aggregate cois_prod
        (coisData || []).forEach(row => {
          if (calcMode === 'current' && !isPastMonth) {
            if (row.tanggal) {
              const d = new Date(row.tanggal);
              if (d.getMonth() + 1 !== selectedMonth || d.getFullYear() !== selectedYear) {
                return; // skip data not in selected month
              }
              if (isCurrentMonth && d.getDate() > today.getDate()) {
                return; // skip future dates if current month
              }
            }
          }

          const wc = (row.work_centre || '').trim().toUpperCase();
          if (!wc) return;
          
          if (!wcMap.has(wc)) {
            wcMap.set(wc, {
              work_centre: wc,
              kategori: wcKategoriMap.get(wc) || 'Others',
              bongkar: 0,
              set_up: 0,
              machine_time: 0,
              down_time: 0,
              jam_tersedia: calculatedJamTersedia
            });
          }
          
          const entry = wcMap.get(wc);
          entry.bongkar += Number(row.bongkar) || 0;
          entry.set_up += Number(row.set_up) || 0;
          entry.machine_time += Number(row.machine_time) || 0;
          entry.down_time += Number(row.down_time) || 0;
        });

        // Calculate utilization
        const aggregatedData = Array.from(wcMap.values()).map(row => {
          const totalMinutes = row.bongkar + row.set_up + row.machine_time + row.down_time;
          const totalHours = totalMinutes / 60;
          
          let utilization = 0;
          if (row.jam_tersedia > 0) {
            utilization = (totalHours / row.jam_tersedia) * 100;
          }
          
          return {
            ...row,
            utilization_percentage: Number((utilization ?? 0).toFixed(2))
          };
        }).sort((a, b) => a.work_centre.localeCompare(b.work_centre));

        setData(aggregatedData);
      } catch (error) {
        console.error('Error fetching line utilization data:', error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [calcMode, selectedPeriod]);

  const filteredData = data.filter(row => {
    const kategori = (row.kategori || 'Others').trim().toLowerCase();
    if (activeTab === 'others') {
      return kategori !== 'tubing' && kategori !== 'haven';
    }
    return kategori === activeTab;
  });

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#FDFBF7] overflow-hidden">
      <div className="px-8 py-4 flex justify-between items-center border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/planning')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-600"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="space-y-0.5">
            <h3 className="text-xl font-bold text-gray-900">Line Utilization</h3>
            <p className="text-sm text-gray-500">Grafik utilisasi per work centre</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2 bg-white border border-gray-300 rounded-lg px-3 py-1.5 shadow-sm">
            <Calendar className="w-4 h-4 text-gray-500" />
            <input
              type="month"
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="text-sm border-none focus:ring-0 p-0 text-gray-700 font-medium bg-transparent"
            />
          </div>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('chart')}
              className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'chart'
                  ? 'bg-white text-[#0A5C36] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5 mr-1.5" />
              Grafik
            </button>
            <button
              onClick={() => setViewMode('report')}
              className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                viewMode === 'report'
                  ? 'bg-white text-[#0A5C36] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Table className="w-3.5 h-3.5 mr-1.5" />
              Report
            </button>
          </div>
          <div className="flex items-center space-x-2 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setCalcMode('current')}
              className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                calcMode === 'current'
                  ? 'bg-white text-[#0A5C36] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Current
            </button>
            <button
              onClick={() => setCalcMode('monthly')}
              className={`flex items-center px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                calcMode === 'monthly'
                  ? 'bg-white text-[#0A5C36] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 mr-1.5" />
              Monthly
            </button>
          </div>
        </div>
      </div>
      
      <div className="p-8 flex-1 overflow-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 h-full flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Loading data...</p>
              </div>
            </div>
          ) : filteredData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Tidak ada data untuk kategori {activeTab}
            </div>
          ) : viewMode === 'chart' ? (
            <div className="w-full h-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredData} margin={{ top: 30, right: 20, left: 20, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis 
                    dataKey="work_centre" 
                    interval={0} 
                    tick={{ fontSize: 10, fill: '#6b7280' }} 
                    axisLine={{ stroke: '#e5e7eb' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tickFormatter={(value) => `${value}%`} 
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#f3f4f6' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const jamKerja = (data.bongkar + data.set_up + data.machine_time + data.down_time) / 60;
                        return (
                          <div className="bg-white p-4 rounded-xl shadow-xl border border-gray-100 min-w-[200px]">
                            <p className="font-bold text-gray-900 mb-3 border-b border-gray-100 pb-2">{data.work_centre}</p>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">Utilization</span>
                                <span className="font-bold text-emerald-600">{data.utilization_percentage}%</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">Jam Tersedia</span>
                                <span className="font-medium text-gray-900">{Math.round(data.jam_tersedia)} jam</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">Jam Kerja</span>
                                <span className="font-medium text-gray-900">{Math.round(jamKerja)} jam</span>
                              </div>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="utilization_percentage" radius={[4, 4, 0, 0]}>
                    <LabelList 
                      dataKey="utilization_percentage" 
                      position="top" 
                      formatter={(val: number) => `${Math.round(val)}%`}
                      style={{ fontSize: '10px', fill: '#6b7280', fontWeight: 'bold' }}
                    />
                    {filteredData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={
                          entry.utilization_percentage >= 80 ? '#10b981' : 
                          entry.utilization_percentage >= 50 ? '#f59e0b' : 
                          '#ef4444'
                        } 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm text-left text-gray-500">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                  <tr>
                    <th className="px-6 py-3">Work Centre</th>
                    <th className="px-6 py-3 text-right">Jam Tersedia</th>
                    <th className="px-6 py-3 text-right">Jam Kerja</th>
                    <th className="px-6 py-3 text-right">Utilization (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.map((row, idx) => {
                    const jamKerja = (row.bongkar + row.set_up + row.machine_time + row.down_time) / 60;
                    return (
                      <tr key={idx} className="bg-white hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-gray-900">{row.work_centre}</td>
                        <td className="px-6 py-4 text-right">{Math.round(row.jam_tersedia)}</td>
                        <td className="px-6 py-4 text-right">{Math.round(jamKerja)}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-bold ${
                            row.utilization_percentage >= 80 ? 'text-emerald-600' : 
                            row.utilization_percentage >= 50 ? 'text-amber-600' : 
                            'text-red-600'
                          }`}>
                            {row.utilization_percentage}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
