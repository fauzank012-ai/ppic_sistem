import React from 'react';
import { 
  X, BarChart2, FileText, ChevronLeft, ChevronRight, 
  ArrowUp, ArrowDown, ArrowUpDown 
} from 'lucide-react';
import { 
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, 
  Tooltip, Legend, ReferenceLine, Bar, Cell, LabelList 
} from 'recharts';
import { CustomerDetail, SortConfig } from '../../types/p3-stock';

interface CustomerDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string | null;
  view: 'chart' | 'report';
  setView: (view: 'chart' | 'report') => void;
  chartType: 'volume' | 'percentage';
  setChartType: (type: 'volume' | 'percentage') => void;
  displayData: any[];
  allData: CustomerDetail[];
  yAxisDomain: any[];
  page: number;
  setPage: (updater: (p: number) => number) => void;
  itemsPerPage: number;
  sort: SortConfig;
  setSort: (updater: (prev: SortConfig) => SortConfig) => void;
  totals: {
    p3: number;
    stock: number;
    p3Pcs: number;
    stockPcs: number;
  };
  onCustomerClick: (customer: CustomerDetail) => void;
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  isOpen, onClose, selectedDate, view, setView,
  chartType, setChartType, displayData, allData, yAxisDomain,
  page, setPage, itemsPerPage, sort, setSort, totals, onCustomerClick
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-50 rounded-2xl">
              <BarChart2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Detail P3 vs Stock</h2>
              <p className="text-sm font-bold text-emerald-600">Tanggal: {selectedDate ? new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200">
              <button
                onClick={() => setView('chart')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  view === 'chart' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <BarChart2 className="w-4 h-4" />
                Grafik
              </button>
              <button
                onClick={() => setView('report')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                  view === 'report' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <FileText className="w-4 h-4" />
                Report
              </button>
            </div>

            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 flex flex-col min-h-0 relative">
          {view === 'chart' ? (
            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
              <div className="flex justify-end">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                  <button 
                    onClick={() => setChartType('volume')}
                    className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${chartType === 'volume' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500'}`}
                  >
                    Volume
                  </button>
                  <button 
                    onClick={() => setChartType('percentage')}
                    className={`px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${chartType === 'percentage' ? 'bg-white shadow-sm text-emerald-600' : 'text-gray-500'}`}
                  >
                    %
                  </button>
                </div>
              </div>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={displayData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="short_name_customer" fontSize={10} interval={0} angle={-45} textAnchor="end" height={80} />
                    <YAxis 
                      fontSize={10} 
                      domain={yAxisDomain}
                      tickFormatter={(val) => chartType === 'percentage' ? `${val}%` : val.toLocaleString('id-ID')}
                    />
                    <Tooltip formatter={(val: number) => [chartType === 'percentage' ? `${val.toFixed(1)}%` : Math.round(val).toLocaleString('id-ID'), chartType === 'percentage' ? 'Percentage' : 'Kg']} />
                    <Legend />
                    {chartType === 'percentage' && (
                      <ReferenceLine 
                        y={100} 
                        stroke="#EF4444" 
                        strokeDasharray="3 3" 
                        label={{ value: 'Target 100%', position: 'right', fill: '#EF4444', fontSize: 10, fontWeight: 'bold' }} 
                      />
                    )}
                    {chartType === 'volume' && (
                      <Bar dataKey="p3" name="P3 (Kg)" fill="#F97316" radius={[4, 4, 0, 0]} cursor="pointer">
                        {displayData.map((entry, index) => (
                          <Cell key={`cell-modal-p3-${index}`} onClick={() => onCustomerClick(entry)} />
                        ))}
                      </Bar>
                    )}
                    <Bar dataKey="stock" name={chartType === 'percentage' ? "Stock (%)" : "Stock (Kg)"} fill="#10B981" radius={[4, 4, 0, 0]} cursor="pointer">
                      {displayData.map((entry, index) => (
                        <Cell key={`cell-modal-stock-${index}`} onClick={() => onCustomerClick(entry)} />
                      ))}
                      {chartType === 'percentage' && <LabelList dataKey="stock" position="top" formatter={(val: number) => `${val.toFixed(1)}%`} fontSize={9} />}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Pagination for Chart */}
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Showing {page * itemsPerPage + 1} to {Math.min((page + 1) * itemsPerPage, allData.length)} of {allData.length} customers
                </p>
                <div className="flex gap-2">
                  <button 
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="p-2 rounded-xl border border-gray-200 hover:bg-white disabled:opacity-50 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    disabled={(page + 1) * itemsPerPage >= allData.length}
                    onClick={() => setPage(p => p + 1)}
                    className="p-2 rounded-xl border border-gray-200 hover:bg-white disabled:opacity-50 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 z-20 bg-white">
                    <tr className="bg-gray-50/80 backdrop-blur-sm shadow-sm">
                      {[
                        { label: 'Customer', field: 'customer', align: 'left' },
                        { label: 'P3 (Kg)', field: 'p3', align: 'right' },
                        { label: 'Stock (Kg)', field: 'stock', align: 'right' },
                        { label: 'P3 (Pcs)', field: 'p3Pcs', align: 'right' },
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
                      <tr 
                        key={idx} 
                        className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                        onClick={() => onCustomerClick(row)}
                      >
                        <td className="px-6 py-4 text-sm font-bold text-gray-700 border-b border-gray-50">{row.customer}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-gray-900 border-b border-gray-50 text-right">{Math.round(row.p3).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-emerald-600 border-b border-gray-50 text-right">{Math.round(row.stock).toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-gray-900 border-b border-gray-50 text-right">{row.p3Pcs.toLocaleString('id-ID')}</td>
                        <td className="px-6 py-4 text-sm font-mono font-bold text-emerald-600 border-b border-gray-50 text-right">{row.stockPcs.toLocaleString('id-ID')}</td>
                        <td className={`px-6 py-4 text-sm font-mono font-bold border-b border-gray-50 text-right ${row.stockPcs - row.p3Pcs < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                          {(row.stockPcs - row.p3Pcs).toLocaleString('id-ID')}
                        </td>
                        <td className="px-6 py-4 border-b border-gray-50 text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black ${
                            (row.p3 > 0 ? (row.stock / row.p3) * 100 : 0) >= 100 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {row.p3 > 0 ? ((row.stock / row.p3) * 100).toFixed(1) : '0.0'}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-20 bg-white">
                    <tr className="bg-indigo-50/80 backdrop-blur-sm border-t-2 border-indigo-100">
                      <td className="px-6 py-4 text-xs font-black text-indigo-900 uppercase tracking-widest">Grand Total</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-900 text-right">{Math.round(totals.p3).toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-900 text-right">{Math.round(totals.stock).toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-900 text-right">{totals.p3Pcs.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm font-mono font-black text-indigo-900 text-right">{totals.stockPcs.toLocaleString('id-ID')}</td>
                      <td className={`px-6 py-4 text-sm font-mono font-black text-right ${totals.stockPcs - totals.p3Pcs < 0 ? 'text-red-600' : 'text-indigo-900'}`}>
                        {(totals.stockPcs - totals.p3Pcs).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-600 text-white">
                          {totals.p3 > 0 ? ((totals.stock / totals.p3) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Pagination */}
              <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between shrink-0">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  Showing {page * itemsPerPage + 1} to {Math.min((page + 1) * itemsPerPage, allData.length)} of {allData.length} customers
                </p>
                <div className="flex gap-2">
                  <button 
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="p-2 rounded-xl border border-gray-200 hover:bg-white disabled:opacity-50 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button 
                    disabled={(page + 1) * itemsPerPage >= allData.length}
                    onClick={() => setPage(p => p + 1)}
                    className="p-2 rounded-xl border border-gray-200 hover:bg-white disabled:opacity-50 transition-all"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
