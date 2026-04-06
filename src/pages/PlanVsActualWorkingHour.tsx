import React, { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows, supabase } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { X } from 'lucide-react';

export default function PlanVsActualWorkingHour() {
  const [searchParams] = useSearchParams();
  const currentType = searchParams.get('type') || 'tubing';
  
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const periodeParam = searchParams.get('periode') || currentMonth;
  const [year, month] = periodeParam.split('-');
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const targetPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedWC, setSelectedWC] = useState<string | null>(null);
  const [chartType, setChartType] = useState<'hours' | 'achievement'>('hours');
  const [selectedWCForModal, setSelectedWCForModal] = useState<string | null>(null);
  const [modalView, setModalView] = useState<'grafik' | 'report'>('grafik');
  const [selectedDateForDowntime, setSelectedDateForDowntime] = useState<string | null>(null);
  const { refreshKey } = useRefresh();

  const { data: workingHourData, isLoading: loading } = useQuery({
    queryKey: ['plan-vs-actual-working-hour-data', refreshKey, periodeParam],
    queryFn: async () => {
      const [mb51Data, coisData, shiftData, machineData] = await Promise.all([
        fetchAllRows('mb51_prod', 'work_centre_lt,proses,tanggal,periode', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('cois_prod', 'tanggal,work_centre,set_up,bongkar,machine_time,down_time,proses,periode', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('daftar_shift', 'tanggal,work_center,plan_working_hour,periode', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('master_data_mesin', 'work_center,kategori')
      ]);
      return { 
        mb51: mb51Data || [], 
        cois: coisData || [], 
        shift: shiftData || [], 
        machines: machineData || [] 
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: downtimeDetails, isLoading: loadingDowntime } = useQuery({
    queryKey: ['downtime-details', selectedWCForModal, selectedDateForDowntime],
    queryFn: async () => {
      if (!selectedWCForModal || !selectedDateForDowntime) return [];
      const { data, error } = await supabase
        .from('down_time')
        .select('*')
        .eq('tanggal', selectedDateForDowntime);
      if (error) throw error;
      
      // Filter in JS to handle case sensitivity and trailing spaces
      return (data || []).filter(d => 
        (d.work_center || '').trim().toUpperCase() === selectedWCForModal
      );
    },
    enabled: !!selectedWCForModal && !!selectedDateForDowntime,
  });

  const { mb51 = [], cois = [], shift = [], machines = [] } = workingHourData || {};

  const filteredMb51 = useMemo(() => {
    return mb51;
  }, [mb51]);

  const filteredCois = useMemo(() => {
    return cois;
  }, [cois]);

  const filteredShift = useMemo(() => {
    return shift;
  }, [shift]);

  const wcProcessMap = useMemo(() => {
    const map = new Map<string, string>();
    filteredMb51.forEach(row => map.set((row.work_centre_lt || '').trim().toUpperCase(), row.proses || 'LT'));
    filteredCois.forEach(row => map.set((row.work_centre || '').trim().toUpperCase(), row.proses || 'LT'));
    return map;
  }, [filteredMb51, filteredCois]);

  const aggregatedData = useMemo(() => {
    const map = new Map<string, { work_centre: string, planHours: number, actualHours: number }>();
    
    const coisMap = new Map<string, number>();
    const shiftMap = new Map<string, number>();

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const isCurrentMonth = periodeParam === currentMonth;

    filteredCois.forEach(c => {
      // If current month, only include until yesterday
      if (isCurrentMonth && c.tanggal >= todayStr) return;

      const wc = (c.work_centre || '').trim().toUpperCase();
      const totalTime = (Number(c.set_up) || 0) + (Number(c.bongkar) || 0) + (Number(c.machine_time) || 0) + (Number(c.down_time) || 0);
      coisMap.set(wc, (coisMap.get(wc) || 0) + (totalTime / 60));
    });

    filteredShift.forEach(s => {
      // If current month, only include until yesterday
      if (isCurrentMonth && s.tanggal >= todayStr) return;

      const wc = (s.work_center || '').trim().toUpperCase();
      const planHours = Number(s.plan_working_hour) || 0;
      shiftMap.set(wc, (shiftMap.get(wc) || 0) + planHours);
    });

    const allWCs = new Set([
      ...coisMap.keys(), 
      ...shiftMap.keys(), 
      ...wcProcessMap.keys(),
      ...machines.map(m => (m.work_center || '').trim().toUpperCase())
    ]);
    
    allWCs.forEach(wc => {
      if (!wc) return;
      
      const machineInfo = machines.find(m => (m.work_center || '').trim().toUpperCase() === wc);
      const kategori = (machineInfo?.kategori || '').toLowerCase();
      
      let isCategoryMatch = false;
      if (currentType === 'tubing') {
        isCategoryMatch = kategori.includes('tubing');
      } else if (currentType === 'haven') {
        isCategoryMatch = kategori.includes('haven');
      } else {
        isCategoryMatch = !kategori.includes('tubing') && !kategori.includes('haven');
      }

      if (isCategoryMatch) {
        map.set(wc, {
          work_centre: wc,
          planHours: shiftMap.get(wc) || 0,
          actualHours: coisMap.get(wc) || 0
        });
      }
    });
    
    return Array.from(map.values())
      .map(item => ({
        ...item,
        variance: item.actualHours - item.planHours,
        achievement: item.planHours > 0 ? (item.actualHours / item.planHours) * 100 : 0
      }))
      .sort((a, b) => a.work_centre.localeCompare(b.work_centre, undefined, { numeric: true, sensitivity: 'base' }));
  }, [filteredCois, filteredShift, wcProcessMap, machines, currentType, periodeParam, currentMonth]);

  const achievementDomain = useMemo(() => {
    const values = aggregatedData.map(d => d.achievement).filter(v => v > 0);
    if (values.length === 0) return [0, 100];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [Math.max(0, Math.floor(min - 5)), Math.ceil(max + 5)];
  }, [aggregatedData]);

  const hoursDomain = useMemo(() => {
    const values = aggregatedData.flatMap(d => [d.planHours, d.actualHours]).filter(v => v > 0);
    if (values.length === 0) return [0, 10];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [Math.max(0, Math.floor(min - 5)), Math.ceil(max + 5)];
  }, [aggregatedData]);

  const dailyDataForModal = useMemo(() => {
    if (!selectedWCForModal) return [];

    const map = new Map<string, { tanggal: string, planHours: number, actualHours: number }>();

    filteredCois.forEach(c => {
      const wc = (c.work_centre || '').trim().toUpperCase();
      if (wc === selectedWCForModal) {
        const date = c.tanggal;
        const totalTime = (Number(c.set_up) || 0) + (Number(c.bongkar) || 0) + (Number(c.machine_time) || 0) + (Number(c.down_time) || 0);
        const existing = map.get(date) || { tanggal: date, planHours: 0, actualHours: 0 };
        existing.actualHours += (totalTime / 60);
        map.set(date, existing);
      }
    });

    filteredShift.forEach(s => {
      const wc = (s.work_center || '').trim().toUpperCase();
      if (wc === selectedWCForModal) {
        const date = s.tanggal;
        const planHours = Number(s.plan_working_hour) || 0;
        const existing = map.get(date) || { tanggal: date, planHours: 0, actualHours: 0 };
        existing.planHours += planHours;
        map.set(date, existing);
      }
    });

    return Array.from(map.values())
      .map(item => ({
        ...item,
        achievement: item.planHours > 0 ? (item.actualHours / item.planHours) * 100 : 0
      }))
      .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  }, [selectedWCForModal, filteredCois, filteredShift]);

  const modalAchievementDomain = useMemo(() => {
    const values = dailyDataForModal.map(d => d.achievement).filter(v => v > 0);
    if (values.length === 0) return [0, 100];
    const min = Math.min(...values);
    const max = Math.max(...values);
    return [Math.max(0, Math.floor(min - 5)), Math.ceil(max + 5)];
  }, [dailyDataForModal]);

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Plan vs Actual Working Hour</h2>
            <p className="text-sm text-gray-500">
              Periode: {targetPeriode}
              {periodeParam === new Date().toISOString().slice(0, 7) && (
                <span className="ml-2 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-medium">
                  Data: 01 s/d Kemarin
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Achievement (%)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aggregatedData}>
                  <XAxis dataKey="work_centre" tick={{ fontSize: 10 }} />
                  <YAxis domain={achievementDomain} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar 
                    dataKey="achievement" 
                    fill="#f59e0b" 
                    name="Achievement (%)"
                    onClick={(data) => {
                      if (data && data.work_centre) {
                        setSelectedWCForModal(data.work_centre);
                      }
                    }}
                    cursor="pointer"
                  >
                    <LabelList dataKey="achievement" position="top" formatter={(val: number) => `${(val ?? 0).toFixed(0)}%`} style={{ fontSize: '10px', fill: '#64748B' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-4">Plan vs Actual Hours</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={aggregatedData}>
                  <XAxis dataKey="work_centre" tick={{ fontSize: 10 }} />
                  <YAxis domain={hoursDomain} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="planHours" fill="#3b82f6" name="Plan Hours">
                    <LabelList dataKey="planHours" position="top" formatter={(val: number) => (val ?? 0).toFixed(1)} style={{ fontSize: '10px', fill: '#64748B' }} />
                  </Bar>
                  <Bar dataKey="actualHours" fill="#10b981" name="Actual Hours">
                    <LabelList dataKey="actualHours" position="top" formatter={(val: number) => (val ?? 0).toFixed(1)} style={{ fontSize: '10px', fill: '#64748B' }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" style={{ fontSize: '11px' }}>
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200">NO</th>
                <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200">Work Center</th>
                <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200 text-right">Plan Hours</th>
                <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200 text-right">Actual Hours</th>
                <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200 text-right">Variance</th>
                <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200 text-right">Achievement (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center">Memuat data...</td></tr>
              ) : aggregatedData.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700">{index + 1}</td>
                  <td className="px-4 py-2 text-gray-700">{row.work_centre}</td>
                  <td className="px-4 py-2 text-right text-blue-600">{(row?.planHours ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">{(row?.actualHours ?? 0).toFixed(2)}</td>
                  <td className={`px-4 py-2 text-right ${Math.abs(row.variance) > 0.001 ? 'text-red-600' : 'text-gray-700'}`}>{(row?.variance ?? 0).toFixed(2)}</td>
                  <td className={`px-4 py-2 text-right font-bold ${Math.abs(row.achievement - 100) > 0.05 ? 'text-red-600' : 'text-green-600'}`}>{(row?.achievement ?? 0).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedWCForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                Daily Achievement - {selectedWCForModal}
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button
                    onClick={() => setModalView('grafik')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      modalView === 'grafik' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Grafik
                  </button>
                  <button
                    onClick={() => setModalView('report')}
                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      modalView === 'report' 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Report
                  </button>
                </div>
                <button 
                  onClick={() => setSelectedWCForModal(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              {modalView === 'grafik' ? (
                <div className="h-64 mb-6">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyDataForModal}>
                      <XAxis 
                        dataKey="tanggal" 
                        tick={{ fontSize: 10 }} 
                        tickFormatter={(val) => {
                          if (!val) return '';
                          const parts = val.split('-');
                          return parts.length === 3 ? parts[2] : val;
                        }}
                      />
                      <YAxis domain={modalAchievementDomain} tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar 
                        dataKey="achievement" 
                        fill="#f59e0b" 
                        name="Achievement (%)"
                        onClick={(data) => {
                          if (data && data.tanggal) {
                            setSelectedDateForDowntime(data.tanggal);
                          }
                        }}
                        cursor="pointer"
                      >
                        <LabelList dataKey="achievement" position="top" formatter={(val: number) => `${(val ?? 0).toFixed(0)}%`} style={{ fontSize: '10px', fill: '#64748B' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <table className="w-full text-left border-collapse" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200">Tanggal</th>
                      <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200 text-right">Plan Hours</th>
                      <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200 text-right">Actual Hours</th>
                      <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200 text-right">Achievement (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dailyDataForModal.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{row.tanggal}</td>
                        <td className="px-4 py-2 text-right text-blue-600">{(row.planHours ?? 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-emerald-600">{(row.actualHours ?? 0).toFixed(2)}</td>
                        <td className={`px-4 py-2 text-right font-bold ${Math.abs(row.achievement - 100) > 0.05 ? 'text-red-600' : 'text-green-600'}`}>{(row.achievement ?? 0).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {selectedWCForModal && selectedDateForDowntime && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                Detail Down Time - {selectedWCForModal} ({selectedDateForDowntime})
              </h2>
              <button 
                onClick={() => setSelectedDateForDowntime(null)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              {loadingDowntime ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
                </div>
              ) : downtimeDetails && downtimeDetails.length > 0 ? (
                <table className="w-full text-left border-collapse" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200">No</th>
                      <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200">Order No</th>
                      <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200">Kategori Down Time</th>
                      <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200">Down Time</th>
                      <th className="px-4 py-2 font-bold text-gray-500 uppercase border-b border-gray-200 text-right">Durasi (Menit)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {downtimeDetails.map((row, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{index + 1}</td>
                        <td className="px-4 py-2 text-gray-700">{row.order_no}</td>
                        <td className="px-4 py-2 text-gray-700">{row.down_time_kategori}</td>
                        <td className="px-4 py-2 text-gray-700">{row.down_time}</td>
                        <td className="px-4 py-2 text-right text-red-600 font-medium">{row.durasi_down_time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Tidak ada data down time untuk tanggal ini.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
