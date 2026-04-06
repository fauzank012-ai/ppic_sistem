import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, ChevronLeft, ChevronRight, X, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { useViewMode } from '../contexts/ViewModeContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useRefresh } from '../contexts/RefreshContext';

const CustomXAxisTick = ({ x, y, payload }: any) => {
  if (!payload || !payload.value) return null;
  const maxCharsPerLine = 15;
  const words = payload.value.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  words.forEach((word: string) => {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  });
  if (currentLine) lines.push(currentLine.trim());

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill="#666" fontSize={10}>
        {lines.map((line, index) => (
          <tspan textAnchor="middle" x="0" dy={index === 0 ? 0 : 12} key={index}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
};

export default function DownTimeReportPage() {
  const { refreshKey } = useRefresh();
  const [currentPage, setCurrentPage] = useState(1);
  const [chartPage, setChartPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalFilter, setModalFilter] = useState<{ type: 'category' | 'work_center' | 'pic' | null, value: string | null }>({ type: null, value: null });
  const [modalSortConfig, setModalSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPeriod = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const selectedCategory = searchParams.get('category') || 'Down Time';
  const itemsPerPage = 20;
  const chartItemsPerPage = 10;
  const { viewMode } = useViewMode();

  const formattedPeriode = useMemo(() => {
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const [year, month] = selectedPeriod.split('-');
    return `${monthNames[parseInt(month, 10) - 1]}-${year}`;
  }, [selectedPeriod]);

  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['down-time-report-data', refreshKey, formattedPeriode, selectedPeriod],
    queryFn: async () => {
      const { data: downTimeData, error } = await supabase
        .from('down_time')
        .select('*')
        .or(`periode.eq.${selectedPeriod},periode.eq.${formattedPeriode}`)
        .order('id', { ascending: true });
      
      if (error) throw error;
      return downTimeData || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data.length > 0 && !searchParams.has('category')) {
      const cats = new Set(data.map(d => d.down_time_kategori).filter(Boolean));
      const catArray = Array.from(cats);
      if (catArray.includes('Down Time')) {
        setSearchParams(prev => { prev.set('category', 'Down Time'); return prev; }, { replace: true });
      } else if (catArray.includes('down time')) {
        setSearchParams(prev => { prev.set('category', 'down time'); return prev; }, { replace: true });
      } else if (catArray.length > 0) {
        setSearchParams(prev => { prev.set('category', catArray[0] as string); return prev; }, { replace: true });
      } else {
        setSearchParams(prev => { prev.set('category', 'All'); return prev; }, { replace: true });
      }
    }
  }, [data, searchParams, setSearchParams]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredData = useMemo(() => {
    let filtered = data.filter(d => d.periode === selectedPeriod || d.periode === formattedPeriode);
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(d => (d.down_time_kategori || '').toLowerCase() === selectedCategory.toLowerCase());
    }
    return filtered;
  }, [data, selectedCategory, selectedPeriod]);

  const sortedData = useMemo(() => {
    if (!sortConfig) return filteredData;
    return [...filteredData].sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      // Handle potential null/undefined
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortConfig]);

  // Reset pagination when category changes
  useEffect(() => {
    setCurrentPage(1);
    setChartPage(1);
  }, [selectedCategory]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedData, currentPage]);

  const chartDataWorkCenter = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach(row => {
      const wc = row.work_center || 'Unknown';
      map.set(wc, (map.get(wc) || 0) + (Number(row.durasi_down_time) || 0));
    });
    
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: String(name), value: value / 60 }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const chartDataCategory = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach(row => {
      const cat = row.down_time || 'Unknown';
      map.set(cat, (map.get(cat) || 0) + (Number(row.durasi_down_time) || 0));
    });
    
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: String(name), value: value / 60 }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const chartDataPIC = useMemo(() => {
    const map = new Map<string, number>();
    filteredData.forEach(row => {
      const pic = row.pic_down_time || 'Unknown';
      map.set(pic, (map.get(pic) || 0) + (Number(row.durasi_down_time) || 0));
    });
    
    return Array.from(map.entries())
      .map(([name, value]) => ({ name: String(name), value: value / 60 }))
      .sort((a, b) => b.value - a.value);
  }, [filteredData]);

  const paginatedChartDataWorkCenter = chartDataWorkCenter;
  const paginatedChartDataCategory = useMemo(() => chartDataCategory.slice((chartPage - 1) * chartItemsPerPage, chartPage * chartItemsPerPage), [chartDataCategory, chartPage]);
  const paginatedChartDataPIC = chartDataPIC;
  
  const totalChartPages = Math.ceil(chartDataCategory.length / chartItemsPerPage);

  const modalData = useMemo(() => {
    if (!modalFilter.type || !modalFilter.value) return [];
    
    let data = filteredData.filter(d => {
      if (modalFilter.type === 'category') return (d.down_time || 'Unknown') === modalFilter.value;
      if (modalFilter.type === 'work_center') return (d.work_center || 'Unknown') === modalFilter.value;
      if (modalFilter.type === 'pic') return (d.pic_down_time || 'Unknown') === modalFilter.value;
      return false;
    });
    
    if (modalSortConfig) {
      data.sort((a, b) => {
        let aValue = a[modalSortConfig.key];
        let bValue = b[modalSortConfig.key];
        
        if (modalSortConfig.key === 'durasi_down_time') {
          aValue = Number(aValue) || 0;
          bValue = Number(bValue) || 0;
        } else {
          aValue = String(aValue || '').toLowerCase();
          bValue = String(bValue || '').toLowerCase();
        }

        if (aValue < bValue) return modalSortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return modalSortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return data;
  }, [filteredData, modalFilter, modalSortConfig]);

  const handleModalSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (modalSortConfig && modalSortConfig.key === key && modalSortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setModalSortConfig({ key, direction });
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      ) : (
        <>
          {viewMode === 'chart' ? (
            <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 h-[420px] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-gray-700">Down Time per Jenis DT</h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setChartPage(p => Math.max(1, p - 1))}
                    disabled={chartPage === 1}
                    className="p-1 rounded border hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs py-1 px-2">Page {chartPage} of {totalChartPages || 1}</span>
                  <button
                    onClick={() => setChartPage(p => Math.min(totalChartPages, p + 1))}
                    disabled={chartPage === totalChartPages || totalChartPages === 0}
                    className="p-1 rounded border hover:bg-gray-100 disabled:opacity-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paginatedChartDataCategory} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                    <XAxis dataKey="name" tick={<CustomXAxisTick />} interval={0} />
                    <YAxis unit="h" />
                    <Tooltip formatter={(value: number) => value.toFixed(2) + ' h'} cursor={{fill: 'transparent'}} />
                    <Bar 
                      dataKey="value" 
                      name="Durasi (Jam)" 
                      fill="#f59e0b" 
                      label={{ position: 'top', formatter: (value: number) => value.toFixed(1) }} 
                      onClick={(data) => {
                        if (data && data.name) {
                          setModalFilter({ type: 'category', value: data.name });
                          setIsModalOpen(true);
                        }
                      }}
                      cursor="pointer"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 h-[350px]">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Down Time per Work Center</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paginatedChartDataWorkCenter} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                    <XAxis dataKey="name" tick={<CustomXAxisTick />} interval={0} />
                    <YAxis unit="h" />
                    <Tooltip formatter={(value: number) => value.toFixed(2) + ' h'} />
                    <Bar dataKey="value" name="Durasi (Jam)" fill="#10b981" label={{ position: 'top', formatter: (value: number) => value.toFixed(1) }} 
                      onClick={(data) => {
                        if (data && data.name) {
                          setModalFilter({ type: 'work_center', value: data.name });
                          setIsModalOpen(true);
                        }
                      }}
                      cursor="pointer"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 h-[350px]">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Down Time per PIC</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paginatedChartDataPIC} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                    <XAxis dataKey="name" tick={<CustomXAxisTick />} interval={0} />
                    <YAxis unit="h" />
                    <Tooltip formatter={(value: number) => value.toFixed(2) + ' h'} />
                    <Bar dataKey="value" name="Durasi (Jam)" fill="#3b82f6" label={{ position: 'top', formatter: (value: number) => value.toFixed(1) }} 
                      onClick={(data) => {
                        if (data && data.name) {
                          setModalFilter({ type: 'pic', value: data.name });
                          setIsModalOpen(true);
                        }
                      }}
                      cursor="pointer"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] text-left text-gray-700">
                <thead className="text-[10px] text-gray-900 uppercase bg-gray-100">
                  <tr>
                    <th className="px-4 py-2">No</th>
                    <th className="px-4 py-2 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('tanggal')}>
                      Tanggal {sortConfig?.key === 'tanggal' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />)}
                    </th>
                    <th className="px-4 py-2 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('work_center')}>
                      Work Center {sortConfig?.key === 'work_center' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />)}
                    </th>
                    <th className="px-4 py-2 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('order_no')}>
                      Order No {sortConfig?.key === 'order_no' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />)}
                    </th>
                    <th className="px-4 py-2 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('down_time_kategori')}>
                      Kategori Down Time {sortConfig?.key === 'down_time_kategori' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />)}
                    </th>
                    <th className="px-4 py-2 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('down_time')}>
                      Down Time {sortConfig?.key === 'down_time' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />)}
                    </th>
                    <th className="px-4 py-2 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('durasi_down_time')}>
                      Waktu Down Time (Durasi) {sortConfig?.key === 'durasi_down_time' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />)}
                    </th>
                    <th className="px-4 py-2 cursor-pointer hover:bg-gray-200" onClick={() => handleSort('keterangan_down_time')}>
                      Keterangan Down Time {sortConfig?.key === 'keterangan_down_time' && (sortConfig.direction === 'asc' ? <ArrowUp className="inline w-3 h-3" /> : <ArrowDown className="inline w-3 h-3" />)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.map((row, index) => (
                    <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                      <td className="px-4 py-2">{row.tanggal}</td>
                      <td className="px-4 py-2">{row.work_center}</td>
                      <td className="px-4 py-2">{row.order_no}</td>
                      <td className="px-4 py-2">{row.down_time_kategori}</td>
                      <td className="px-4 py-2">{row.down_time}</td>
                      <td className="px-4 py-2">{row.durasi_down_time}</td>
                      <td className="px-4 py-2">{row.keterangan_down_time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-gray-600">
                Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, data.length)} of {data.length} entries
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1 rounded border hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs py-1 px-2">Page {currentPage} of {totalPages || 1}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  className="p-1 rounded border hover:bg-gray-100 disabled:opacity-50"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        </>
      )}

      {/* Modal Detail Down Time */}
      {isModalOpen && modalFilter.value && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
            <div className="flex flex-col border-b">
              <div className="flex items-center justify-between p-4">
                <h3 className="text-lg font-bold text-gray-800">
                  Detail Down Time: {modalFilter.value}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="px-4 pb-2">
                <table className="w-full text-[11px] text-left text-gray-700 table-fixed">
                  <thead className="text-[10px] text-gray-900 uppercase bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 rounded-l-md w-[5%]">No</th>
                      <th className="px-4 py-2 cursor-pointer hover:bg-gray-200 transition-colors w-[12%]" onClick={() => handleModalSort('tanggal')}>
                        <div className="flex items-center gap-1">
                          Tanggal
                          {modalSortConfig?.key === 'tanggal' ? (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-2 cursor-pointer hover:bg-gray-200 transition-colors w-[13%]" onClick={() => handleModalSort('work_center')}>
                        <div className="flex items-center gap-1">
                          Work Center
                          {modalSortConfig?.key === 'work_center' ? (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-2 cursor-pointer hover:bg-gray-200 transition-colors w-[15%]" onClick={() => handleModalSort('order_no')}>
                        <div className="flex items-center gap-1">
                          Order No
                          {modalSortConfig?.key === 'order_no' ? (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-2 cursor-pointer hover:bg-gray-200 transition-colors w-[15%]" onClick={() => handleModalSort('down_time_kategori')}>
                        <div className="flex items-center gap-1">
                          Kategori Down Time
                          {modalSortConfig?.key === 'down_time_kategori' ? (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-2 cursor-pointer hover:bg-gray-200 transition-colors w-[15%]" onClick={() => handleModalSort('down_time')}>
                        <div className="flex items-center gap-1">
                          Down Time
                          {modalSortConfig?.key === 'down_time' ? (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-2 cursor-pointer hover:bg-gray-200 transition-colors w-[10%]" onClick={() => handleModalSort('durasi_down_time')}>
                        <div className="flex items-center gap-1">
                          Durasi
                          {modalSortConfig?.key === 'durasi_down_time' ? (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-4 py-2 cursor-pointer hover:bg-gray-200 transition-colors rounded-r-md w-[15%]" onClick={() => handleModalSort('keterangan_down_time')}>
                        <div className="flex items-center gap-1">
                          Keterangan
                          {modalSortConfig?.key === 'keterangan_down_time' ? (
                            modalSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400" />
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
            <div className="px-4 pb-4 overflow-auto flex-1">
              <table className="w-full text-[11px] text-left text-gray-700 table-fixed">
                <tbody>
                  {modalData.length > 0 ? (
                    modalData.map((row, index) => (
                      <tr key={row.id} className="bg-white border-b hover:bg-gray-50">
                        <td className="px-4 py-2 w-[5%]">{index + 1}</td>
                        <td className="px-4 py-2 w-[12%] truncate" title={row.tanggal}>{row.tanggal}</td>
                        <td className="px-4 py-2 w-[13%] truncate" title={row.work_center}>{row.work_center}</td>
                        <td className="px-4 py-2 w-[15%] truncate" title={row.order_no}>{row.order_no}</td>
                        <td className="px-4 py-2 w-[15%] truncate" title={row.down_time_kategori}>{row.down_time_kategori}</td>
                        <td className="px-4 py-2 w-[15%] truncate" title={row.down_time}>{row.down_time}</td>
                        <td className="px-4 py-2 w-[10%] truncate" title={row.durasi_down_time}>{row.durasi_down_time}</td>
                        <td className="px-4 py-2 w-[15%] truncate" title={row.keterangan_down_time}>{row.keterangan_down_time}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        Tidak ada data
                      </td>
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
}

