import React from 'react';
import { 
  X, BarChart2, FileText, Layers, ChevronLeft, ChevronRight, 
  ArrowUp, ArrowDown, ArrowUpDown 
} from 'lucide-react';
import { 
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, 
  Tooltip, Legend, ReferenceLine, Bar, LabelList 
} from 'recharts';
import { MaterialDetail, SortConfig } from '../../types/p3-stock';

interface MaterialDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCustomer: string | null;
  selectedDate: string | null;
  view: 'chart' | 'report';
  setView: (view: 'chart' | 'report') => void;
  chartType: 'volume' | 'percentage';
  setChartType: (type: 'volume' | 'percentage') => void;
  displayData: any[];
  allData: MaterialDetail[];
  yAxisDomain: any[];
  page: number;
  setPage: (updater: (p: number) => number) => void;
  itemsPerPage: number;
  sort: SortConfig;
  setSort: (updater: (prev: SortConfig) => SortConfig) => void;
  totals: {
    p3Pcs: number;
    wip_lt_pcs: number;
    konversi_st_pcs: number;
    wip_st_pcs: number;
    fg_st_pcs: number;
    stockPcs: number;
    p3: number;
    stock: number;
  };
}

export const MaterialDetailModal: React.FC<MaterialDetailModalProps> = ({
  isOpen, onClose, selectedCustomer, selectedDate, view, setView,
  chartType, setChartType, displayData, allData, yAxisDomain,
  page, setPage, itemsPerPage, sort, setSort, totals
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-7xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Sub-Modal Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 rounded-2xl">
              <Layers className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Detail Material P3 vs Stock</h2>
              <p className="text-sm font-bold text-indigo-600">Customer: {selectedCustomer} | Tanggal: {selectedDate ? new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                onClick={() => setView('chart')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  view === 'chart' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <BarChart2 className="w-4 h-4" />
                Grafik
              </button>
              <button
                onClick={() => setView('report')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  view === 'report' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                Report
              </button>
            </div>

            {/* Chart Type Toggle */}
            {view === 'chart' && (
              <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
                <button 
                  onClick={() => setChartType('volume')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${chartType === 'volume' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
                >
                  Volume
                </button>
                <button 
                  onClick={() => setChartType('percentage')}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${chartType === 'percentage' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
                >
                  %
                </button>
              </div>
            )}

            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Sub-Modal Content */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {view === 'chart' ? (
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={displayData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="material" fontSize={10} interval={0} angle={-45} textAnchor="end" height={80} />
                    <YAxis 
                      fontSize={10} 
                      domain={yAxisDomain}
                      tickFormatter={(val) => chartType === 'percentage' ? `${val}%` : val.toLocaleString('id-ID')}
                    />
                    <Tooltip content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="bg-white p-3 border border-gray-100 shadow-xl rounded-xl">
                            <p className="text-xs font-black text-gray-900 mb-0.5">{label}</p>
                            <p className="text-[10px] font-bold text-gray-500 mb-2">{data.dimensi}</p>
                            <div className="space-y-1">
                              {payload.map((entry: any, index: number) => (
                                <div key={index} className="flex items-center justify-between gap-4">
                                  <span className="text-[10px] font-bold" style={{ color: entry.color }}>{entry.name}:</span>
                                  <span className="text-[10px] font-black text-gray-900">
                                    {chartType === 'percentage' ? `${entry.value.toFixed(1)}%` : Math.round(entry.value).toLocaleString('id-ID')}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }} />
                    {chartType === 'percentage' && (
                      <ReferenceLine 
                        y={100} 
                        stroke="#EF4444" 
                        strokeDasharray="3 3" 
                        label={{ value: 'Target 100%', position: 'right', fill: '#EF4444', fontSize: 10, fontWeight: 'bold' }} 
                      />
                    )}
                    {chartType === 'volume' && <Bar dataKey="p3" name="P3 (Kg)" fill="#F97316" radius={[4, 4, 0, 0]} />}
                    <Bar dataKey="stock" name={chartType === 'percentage' ? "Stock (%)" : "Stock (Kg)"} fill="#10B981" radius={[4, 4, 0, 0]}>
                      {chartType === 'percentage' && <LabelList dataKey="stock" position="top" formatter={(val: number) => `${val.toFixed(1)}%`} fontSize={9} />}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-20 bg-white">
                    <tr className="bg-gray-50/80 backdrop-blur-sm shadow-sm">
                      {[
                        { label: 'Kode Material', field: 'material', align: 'left' },
                        { label: 'Dimensi', field: 'dimensi', align: 'left' },
                        { label: 'P3 (Pcs)', field: 'p3Pcs', align: 'right' },
                        { label: 'WIP LT (Pcs)', field: 'wip_lt_pcs', align: 'right' },
                        { label: 'Konversi ST (Pcs)', field: 'konversi_st_pcs', align: 'right' },
                        { label: 'WIP ST (Pcs)', field: 'wip_st_pcs', align: 'right' },
                        { label: 'FG ST (Pcs)', field: 'fg_st_pcs', align: 'right' },
                        { label: 'Stock (Pcs)', field: 'stockPcs', align: 'right' },
                        { label: 'Variance (Pcs)', field: 'variance', align: 'right' },
                        { label: 'Achievement', field: 'achievement', align: 'right' }
                      ].map((col) => (
                        <th 
                          key={col.field}
                          onClick={() => setSort(prev => ({ field: col.field, direction: prev.field === col.field && prev.direction === 'desc' ? 'asc' : 'desc' }))}
                          className={`px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 ${col.align === 'right' ? 'text-right' : 'text-left'} cursor-pointer hover:text-indigo-600 transition-colors`}
                        >
                          <div className={`flex items-center gap-1 ${col.align === 'right' ? 'justify-end' : 'justify-start'}`}>
                            {col.label}
                            {sort.field === col.field ? (
                              sort.direction === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
                            ) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allData.slice(page * itemsPerPage, (page + 1) * itemsPerPage).map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-4 text-sm font-bold text-gray-700 border-b border-gray-50">{row.material}</td>
                        <td className="px-6 py-4 text-sm font-bold text-gray-500 border-b border-gray-50 whitespace-nowrap">{row.dimensi}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-gray-900 border-b border-gray-50 text-right">{row.p3Pcs.toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-gray-500 border-b border-gray-50 text-right">{row.wip_lt_pcs.toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-indigo-600 border-b border-gray-50 text-right">{row.konversi_st_pcs.toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-gray-500 border-b border-gray-50 text-right">{row.wip_st_pcs.toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-gray-500 border-b border-gray-50 text-right">{row.fg_st_pcs.toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-emerald-600 border-b border-gray-50 text-right">{row.stockPcs.toLocaleString('id-ID')}</td>
                        <td className={`px-6 py-4 text-sm font-mono font-bold border-b border-gray-50 text-right ${row.stockPcs - row.p3Pcs < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {(row.stockPcs - row.p3Pcs).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4 border-b border-gray-50 text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black ${
                            (row.p3Pcs > 0 ? (row.stockPcs / row.p3Pcs) * 100 : 0) >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {row.p3Pcs > 0 ? ((row.stockPcs / row.p3Pcs) * 100).toFixed(1) : '0.0'}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-20 bg-white">
                    <tr className="bg-indigo-50/80 backdrop-blur-sm border-t-2 border-indigo-100">
                      <td className="px-6 py-4 text-xs font-black text-indigo-900 uppercase tracking-widest">Grand Total</td>
                      <td className="px-6 py-4 text-xs font-black text-indigo-900 uppercase tracking-widest">-</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-900 text-right">{totals.p3Pcs.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-900 text-right">{totals.wip_lt_pcs.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-600 text-right">{totals.konversi_st_pcs.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-900 text-right">{totals.wip_st_pcs.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-900 text-right">{totals.fg_st_pcs.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-900 text-right">{totals.stockPcs.toLocaleString('id-ID')}</td>
                      <td className={`px-6 py-4 text-sm font-mono font-black text-right ${totals.stockPcs - totals.p3Pcs < 0 ? 'text-red-600' : 'text-indigo-900'}`}>
                        {(totals.stockPcs - totals.p3Pcs).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-600 text-white">
                          {totals.p3Pcs > 0 ? ((totals.stockPcs / totals.p3Pcs) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {allData.length > itemsPerPage && (
                <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/30 shrink-0">
                  <p className="text-xs text-gray-500 font-medium">
                    Showing {page * itemsPerPage + 1} to {Math.min((page + 1) * itemsPerPage, allData.length)} of {allData.length} materials
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                      className="p-2 rounded-lg hover:bg-white disabled:opacity-30 transition-all border border-transparent hover:border-gray-200"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(Math.ceil(allData.length / itemsPerPage) - 1, p + 1))}
                      disabled={page >= Math.ceil(allData.length / itemsPerPage) - 1}
                      className="p-2 rounded-lg hover:bg-white disabled:opacity-30 transition-all border border-transparent hover:border-gray-200"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
