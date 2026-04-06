import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Activity, Search, Download, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import * as xlsx from 'xlsx';

export default function ProductionOutput({ userRole }: { userRole?: string | null }) {
  const [searchParams] = useSearchParams();
  const { refreshKey } = useRefresh();
  const [searchTerm, setSearchTerm] = useState('');
  
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const periodeParam = searchParams.get('periode') || currentMonth;
  const [year, month] = periodeParam.split('-');
  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const targetPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;
  const currentType = searchParams.get('type') || 'tubing';

  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['production-output-data', refreshKey, periodeParam],
    queryFn: async () => {
      const [mb51Data, materialData, mesinData, coisData] = await Promise.all([
        fetchAllRows('mb51_prod', 'tanggal,work_centre_lt,order_no,kode_lt,proses,gr_qty_kg,gi_qty_kg,gr_qty_pcs,periode', (q) => q.eq('periode', targetPeriode)),
        fetchAllRows('material_master', 'kode_lt,kode_st,dimensi,d_inch,d1,d2,dia,thick,length,moq,pcs_per_jam_cut,kg_per_jam_mill'),
        fetchAllRows('master_data_mesin', 'work_center, target_yield, kategori'),
        fetchAllRows('cois_prod', 'order_no,machine_time,set_up,bongkar,down_time,periode', (q) => q.eq('periode', targetPeriode))
      ]);

      // Create maps for material master data based on kode_lt and kode_st
      const materialMap = new Map<string, any>();
      materialData.forEach(m => {
        if (m.kode_lt) {
          materialMap.set(m.kode_lt.trim().toLowerCase(), m);
        }
        if (m.kode_st) {
          materialMap.set(m.kode_st.trim().toLowerCase(), m);
        }
      });

      // Create maps for mesin data based on work_center
      const mesinMap = new Map<string, { target_yield: number, kategori: string }>();
      mesinData.forEach(m => {
        if (m.work_center) {
          mesinMap.set(m.work_center.trim().toUpperCase(), {
            target_yield: Number(m.target_yield) || 0,
            kategori: (m.kategori || '').toLowerCase()
          });
        }
      });

      // Create map for cois data based on order_no
      const coisMap = new Map<string, any>();
      coisData.forEach(c => {
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

      return mb51Data.map(row => {
        const kodeLt = (row.kode_lt || '').trim();
        const kodeSt = (row.kode_st || '').trim() || kodeLt;
        const workCenter = (row.work_centre_lt || '').trim().toUpperCase();
        
        // Try to find material info using kode_lt, then kode_st
        const materialInfo = materialMap.get(kodeLt.toLowerCase()) || materialMap.get(kodeSt.toLowerCase()) || {};
        const mesinInfo = mesinMap.get(workCenter) || { target_yield: 0, kategori: '' };
        const targetYield = mesinInfo.target_yield;
        const kategori = mesinInfo.kategori;
        
        const grQtyKg = row.gr_qty_kg || 0;
        const giQtyKg = row.gi_qty_kg || 0;
        const yieldPercent = giQtyKg > 0 ? (grQtyKg / giQtyKg) * 100 : 0;
        const moq = materialInfo.moq || 0;

        // Get cois data
        const coisInfo = coisMap.get((row.order_no || '').trim()) || {};
        const setUp = Number(coisInfo.set_up) || 0;
        const bongkar = Number(coisInfo.bongkar) || 0;
        const machineTime = Number(coisInfo.machine_time) || 0;
        const downTime = Number(coisInfo.down_time) || 0;
        const totalTime = setUp + bongkar + machineTime + downTime;

        // Calculate length: 5 rightmost digits / 10
        const codeForLength = (row.proses || 'LT') === 'LT' ? kodeLt : kodeSt;
        const last5 = codeForLength.slice(-5);
        const lengthVal = !isNaN(Number(last5)) ? Number(last5) / 10 : 0;

        // Speed Achievement calculation
        const grQtyPcs = Number(row.gr_qty_pcs) || 0;
        const targetPcsPerHour = Number(materialInfo.pcs_per_jam_cut) || 0;
        const targetKgPerHour = Number(materialInfo.kg_per_jam_mill) || 0;
        
        let speedAchievement = 0;
        if (machineTime > 0) {
          const actualSpeed = (row.proses === 'ST' ? grQtyPcs : grQtyKg) / (machineTime / 60);
          const targetSpeed = row.proses === 'ST' ? targetPcsPerHour : targetKgPerHour;
          speedAchievement = targetSpeed > 0 ? (actualSpeed / targetSpeed) * 100 : 0;
        }

        return {
          ...row,
          kode_st: kodeSt,
          dimensi: materialInfo.dimensi || '-',
          d_inch: materialInfo.d_inch || '-',
          d1: materialInfo.d1 || '-',
          d2: materialInfo.d2 || '-',
          dia: materialInfo.dia || '-',
          thick: materialInfo.thick || '-',
          length: lengthVal > 0 ? lengthVal : (materialInfo.length || '-'),
          moq: moq,
          target_yield: targetYield,
          gr_qty_kg: grQtyKg,
          yield_percent: yieldPercent,
          status_moq: grQtyKg >= moq ? 'OK' : 'NOT OK',
          status_yield: targetYield > 0 ? (yieldPercent >= targetYield ? 'OK' : 'NOT OK') : '-',
          set_up_pct: totalTime > 0 ? (setUp / totalTime) * 100 : 0,
          bongkar_pct: totalTime > 0 ? (bongkar / totalTime) * 100 : 0,
          machine_time_pct: totalTime > 0 ? (machineTime / totalTime) * 100 : 0,
          down_time_pct: totalTime > 0 ? (downTime / totalTime) * 100 : 0,
          speed_achievement: speedAchievement,
          kategori: kategori
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  const filteredData = useMemo(() => {
    return data.filter(row => {
      // Category filter
      const kategori = (row.kategori || '').toLowerCase();
      let matchesCategory = false;
      if (currentType === 'tubing') {
        matchesCategory = kategori.includes('tubing');
      } else if (currentType === 'haven') {
        matchesCategory = kategori.includes('haven');
      } else {
        matchesCategory = !kategori.includes('tubing') && !kategori.includes('haven');
      }
      if (!matchesCategory) return false;

      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = (
        (row.work_centre_lt || '').toLowerCase().includes(searchLower) ||
        (row.order_no || '').toLowerCase().includes(searchLower) ||
        (row.kode_lt || '').toLowerCase().includes(searchLower)
      );
      return matchesSearch;
    });
  }, [data, searchTerm, periodeParam, currentType]);

  const handleExport = () => {
    const exportData = filteredData.map((row) => ({
      'Work Center': row.work_centre_lt,
      'Order No': row.order_no,
      'Kode': row.proses === 'LT' ? row.kode_lt : row.kode_st,
      'Dimensi': row.dimensi,
      'D"': row.d_inch,
      'D1': row.d1,
      'D2': row.d2,
      'DIA': row.dia,
      'THICK': row.thick,
      'LENGTH': row.length,
      'MOQ': row.moq,
      'GR (Pcs)': row.gr_qty_pcs,
      'GR (Kg)': row.gr_qty_kg,
      'Status MOQ': row.status_moq,
      'GI (Kg)': row.gi_qty_kg,
      'Target Yield (%)': row.target_yield,
      '% Yield': row.yield_percent,
      'Status Yield': row.status_yield,
      '% Set Up': row.set_up_pct,
      '% Bongkar': row.bongkar_pct,
      '% Machine Time': row.machine_time_pct,
      '% Down Time': row.down_time_pct,
      'Pencapaian (%)': (row.speed_achievement ?? 0).toFixed(1) + '%'
    }));

    const ws = xlsx.utils.json_to_sheet(exportData);
    const wb = xlsx.utils.book_new();
    const sheetName = 'Production_Report';
    xlsx.utils.book_append_sheet(wb, ws, sheetName);
    xlsx.writeFile(wb, `${sheetName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num || 0);
  };

  const formatKg = (num: number) => {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(num || 0);
  };

  const formatPercent = (num: number) => {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num || 0) + '%';
  };

  const calculateTotal = (key: string) => {
    return filteredData.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  };

  const calculateTotalForProcess = (key: string, process: 'LT' | 'ST') => {
    return filteredData
      .filter(row => (row.proses || 'LT') === process)
      .reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  };

  const calculateTotalYieldLT = () => {
    const totalGrKg = calculateTotalForProcess('gr_qty_kg', 'LT');
    const totalGiKg = calculateTotalForProcess('gi_qty_kg', 'LT');
    return totalGiKg > 0 ? (totalGrKg / totalGiKg) * 100 : 0;
  };

  const calculateGrandTotalPct = (key: string) => {
    const total = filteredData.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
    return filteredData.length > 0 ? total / filteredData.length : 0;
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-end mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari data..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors shadow-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>
      
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
        <div className="overflow-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
              <tr>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">Work Center</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">Order No</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">Kode</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">Dimensi</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">D"</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">D1</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">D2</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">DIA</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">THICK</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider">LENGTH</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">MOQ</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">GR (Pcs)</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">GR (Kg)</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-center">Status MOQ</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">GI (Kg)</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">Target Yield</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">% Yield</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-center">Status Yield</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">% Set Up</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">% Bongkar</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">% Machine Time</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">% Down Time</th>
                <th className="px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider text-right">Pencapaian (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={22} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                      <p className="text-gray-500">Memuat data...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={22} className="px-6 py-12 text-center text-gray-500">
                    Tidak ada data yang ditemukan
                  </td>
                </tr>
              ) : (
                filteredData.map((row, index) => (
                  <tr key={index} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.work_centre_lt || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.order_no || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.proses === 'LT' ? row.kode_lt : row.kode_st || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.dimensi || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.d_inch || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.d1 || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.d2 || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.dia || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.thick || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-gray-700">{row.length || '-'}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-right font-medium text-gray-700">{formatNumber(row.moq)}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-right font-medium text-emerald-600">{formatNumber(row.gr_qty_pcs)}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-right font-medium text-blue-600">{formatKg(row.gr_qty_kg)}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${row.status_moq === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {row.status_moq}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-right font-medium text-amber-600">{formatKg(row.gi_qty_kg)}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 text-right font-medium text-gray-600">{row.target_yield > 0 ? `${row.target_yield}%` : '-'}</td>
                    <td className={`px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis text-right font-bold ${row.target_yield > 0 && row.yield_percent < row.target_yield ? 'text-red-600' : 'text-emerald-600'}`}>{formatPercent(row.yield_percent)}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 text-center">
                      {row.status_yield !== '-' ? (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${row.status_yield === 'OK' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {row.status_yield}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 text-right font-medium text-gray-600">{formatPercent(row.set_up_pct)}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 text-right font-medium text-gray-600">{formatPercent(row.bongkar_pct)}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 text-right font-medium text-gray-600">{formatPercent(row.machine_time_pct)}</td>
                    <td className="px-3 py-2 text-[11px] border-r border-gray-100 text-right font-medium text-gray-600">{formatPercent(row.down_time_pct)}</td>
                    <td className={`px-3 py-2 text-[11px] border-r border-gray-100 text-right font-bold ${row.speed_achievement >= 100 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatPercent(row.speed_achievement)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 bg-gray-100 font-bold border-t-2 border-gray-300 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
              <tr>
                <td colSpan={9} className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-center">GRAND TOTAL</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-right">{formatNumber(calculateTotal('moq'))}</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-right text-emerald-600">{formatNumber(calculateTotal('gr_qty_pcs'))}</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-right text-blue-600">{formatKg(calculateTotal('gr_qty_kg'))}</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-center">-</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-right text-amber-600">{formatKg(calculateTotal('gi_qty_kg'))}</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-center">-</td>
                <td className={`px-3 py-2 text-[11px] border-r border-gray-200 text-right ${calculateTotalYieldLT() < 90 ? 'text-red-600' : 'text-emerald-600'}`}>{formatPercent(calculateTotalYieldLT())}</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-center">-</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-right text-gray-600">{formatPercent(calculateGrandTotalPct('set_up_pct'))}</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-right text-gray-600">{formatPercent(calculateGrandTotalPct('bongkar_pct'))}</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200 text-right text-gray-600">{formatPercent(calculateGrandTotalPct('machine_time_pct'))}</td>
                <td className="px-3 py-2 text-[11px] text-gray-800 text-right text-gray-600">{formatPercent(calculateGrandTotalPct('down_time_pct'))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}