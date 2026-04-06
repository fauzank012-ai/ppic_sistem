
import React, { memo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { COLUMNS } from '../pages/Report';
import { X } from 'lucide-react';

interface ReportTableProps {
  data: any[];
  visibleColumns: Record<string, boolean>;
  handleSort: (key: string) => void;
  getSortIcon: (key: string) => React.ReactNode;
  filterCustomer: string;
  setFilterCustomer: (val: string) => void;
  uniqueCustomers: { val: string; count: number }[];
  filterShortName: string;
  setFilterShortName: (val: string) => void;
  uniqueShortNames: { val: string; count: number }[];
  filterSpec: string;
  setFilterSpec: (val: string) => void;
  uniqueSpecs: { val: string; count: number }[];
  filterDimensi: string;
  setFilterDimensi: (val: string) => void;
  uniqueDimensis: { val: string; count: number }[];
  filterWorkCenterST: string;
  setFilterWorkCenterST: (val: string) => void;
  uniqueWorkCenterSTs: { val: string; count: number }[];
  filterWorkCenterLT: string;
  setFilterWorkCenterLT: (val: string) => void;
  uniqueWorkCenterLTs: { val: string; count: number }[];
  filterD1: string;
  setFilterD1: (val: string) => void;
  uniqueD1s: { val: string; count: number }[];
  filterD2: string;
  setFilterD2: (val: string) => void;
  uniqueD2s: { val: string; count: number }[];
  filterDia: string;
  setFilterDia: (val: string) => void;
  uniqueDias: { val: string; count: number }[];
  filterThick: string;
  setFilterThick: (val: string) => void;
  uniqueThicks: { val: string; count: number }[];
  filterLength: string;
  setFilterLength: (val: string) => void;
  uniqueLengths: { val: string; count: number }[];
  filterAlertST: string;
  setFilterAlertST: (val: string) => void;
  uniqueAlertSTs: { val: string; count: number }[];
  filterAlertLT: string;
  setFilterAlertLT: (val: string) => void;
  uniqueAlertLTs: { val: string; count: number }[];
  calculateTotal: (key: string) => number;
  isDeadStock: (item: any) => boolean;
  parentRef: React.RefObject<HTMLDivElement>;
}

const ReportTable = memo(({ 
  data, 
  visibleColumns, 
  handleSort, 
  getSortIcon,
  filterCustomer,
  setFilterCustomer,
  uniqueCustomers,
  filterShortName,
  setFilterShortName,
  uniqueShortNames,
  filterSpec,
  setFilterSpec,
  uniqueSpecs,
  filterDimensi,
  setFilterDimensi,
  uniqueDimensis,
  filterWorkCenterST,
  setFilterWorkCenterST,
  uniqueWorkCenterSTs,
  filterWorkCenterLT,
  setFilterWorkCenterLT,
  uniqueWorkCenterLTs,
  filterD1,
  setFilterD1,
  uniqueD1s,
  filterD2,
  setFilterD2,
  uniqueD2s,
  filterDia,
  setFilterDia,
  uniqueDias,
  filterThick,
  setFilterThick,
  uniqueThicks,
  filterLength,
  setFilterLength,
  uniqueLengths,
  filterAlertST,
  setFilterAlertST,
  uniqueAlertSTs,
  filterAlertLT,
  setFilterAlertLT,
  uniqueAlertLTs,
  calculateTotal,
  isDeadStock,
  parentRef
}: ReportTableProps) => {
  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45, // Estimate row height
    overscan: 10,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();

  const paddingTop = virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
  const paddingBottom = virtualRows.length > 0 ? totalSize - (virtualRows?.[virtualRows.length - 1]?.end || 0) : 0;

  const renderFilterSelect = (
    value: string, 
    onChange: (val: string) => void, 
    options: { val: string; count: number }[], 
    placeholder: string
  ) => (
    <div className="relative group">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full text-[10px] py-1 pl-2 pr-6 border rounded bg-white focus:ring-1 focus:ring-indigo-500 appearance-none ${
          value ? 'border-indigo-500 text-indigo-700 font-bold' : 'border-gray-200 text-gray-500'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((opt, idx) => (
          <option key={idx} value={opt.val}>
            {opt.val} ({opt.count})
          </option>
        ))}
      </select>
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-red-500"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );

  return (
    <table className="w-full text-left border-collapse table-fixed min-w-[3000px]">
      <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
        <tr>
          {COLUMNS.map(col => visibleColumns[col.id] && (
            <th 
              key={col.id} 
              className={`px-3 py-2 text-[10px] font-bold text-gray-600 border-b border-r border-gray-200 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors ${
                col.id === 'no' ? 'w-12' : 'w-32'
              }`}
              onClick={() => handleSort(col.id)}
            >
              <div className="flex items-center justify-between">
                <span>{col.label}</span>
                {getSortIcon(col.id)}
              </div>
            </th>
          ))}
        </tr>
        <tr className="bg-gray-100/50">
          {COLUMNS.map(col => visibleColumns[col.id] && (
            <th key={`filter-${col.id}`} className="px-2 py-1.5 border-b border-r border-gray-200">
              {col.id === 'customer' && renderFilterSelect(filterCustomer, setFilterCustomer, uniqueCustomers, 'All Customers')}
              {col.id === 'short_name_customer' && renderFilterSelect(filterShortName, setFilterShortName, uniqueShortNames, 'All Names')}
              {col.id === 'spec' && renderFilterSelect(filterSpec, setFilterSpec, uniqueSpecs, 'All Specs')}
              {col.id === 'dimensi' && renderFilterSelect(filterDimensi, setFilterDimensi, uniqueDimensis, 'All Dimensi')}
              {col.id === 'work_center_st' && renderFilterSelect(filterWorkCenterST, setFilterWorkCenterST, uniqueWorkCenterSTs, 'All WC ST')}
              {col.id === 'work_center_lt' && renderFilterSelect(filterWorkCenterLT, setFilterWorkCenterLT, uniqueWorkCenterLTs, 'All WC LT')}
              {col.id === 'd1' && renderFilterSelect(filterD1, setFilterD1, uniqueD1s, 'All D1')}
              {col.id === 'd2' && renderFilterSelect(filterD2, setFilterD2, uniqueD2s, 'All D2')}
              {col.id === 'dia' && renderFilterSelect(filterDia, setFilterDia, uniqueDias, 'All Dia')}
              {col.id === 'thick' && renderFilterSelect(filterThick, setFilterThick, uniqueThicks, 'All Thick')}
              {col.id === 'length' && renderFilterSelect(filterLength, setFilterLength, uniqueLengths, 'All Length')}
              {col.id === 'alert_st' && renderFilterSelect(filterAlertST, setFilterAlertST, uniqueAlertSTs, 'All Alerts')}
              {col.id === 'alert_lt' && renderFilterSelect(filterAlertLT, setFilterAlertLT, uniqueAlertLTs, 'All Alerts')}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 relative" style={{ height: `${totalSize}px` }}>
        {paddingTop > 0 && (
          <tr>
            <td style={{ height: `${paddingTop}px` }} />
          </tr>
        )}
        {virtualRows.map((virtualRow) => {
          const item = data[virtualRow.index];
          const isDead = isDeadStock(item);
          return (
            <tr 
              key={virtualRow.key} 
              data-index={virtualRow.index} 
              ref={rowVirtualizer.measureElement}
              className={`hover:bg-indigo-50/30 transition-colors group ${isDead ? 'bg-red-50/30' : ''}`}
            >
              {COLUMNS.map(col => visibleColumns[col.id] && (
                <td 
                  key={`${virtualRow.key}-${col.id}`} 
                  className={`px-3 py-2 text-[11px] border-r border-gray-100 whitespace-nowrap overflow-hidden text-ellipsis ${
                    col.id === 'no' ? 'text-center text-gray-400 font-mono' : 'text-gray-700'
                  }`}
                >
                  {col.id === 'no' ? virtualRow.index + 1 : (
                    typeof item[col.id] === 'number' 
                      ? item[col.id].toLocaleString('id-ID', { maximumFractionDigits: 2 }) 
                      : (item[col.id] || '-')
                  )}
                </td>
              ))}
            </tr>
          );
        })}
        {paddingBottom > 0 && (
          <tr>
            <td style={{ height: `${paddingBottom}px` }} />
          </tr>
        )}
      </tbody>
      <tfoot className="sticky bottom-0 z-20 bg-gray-100 font-bold border-t-2 border-gray-300 shadow-[0_-2px_4px_rgba(0,0,0,0.05)]">
        <tr>
          {COLUMNS.map(col => visibleColumns[col.id] && (
            <td key={`footer-${col.id}`} className="px-3 py-2 text-[11px] text-gray-800 border-r border-gray-200">
              {col.id === 'no' ? 'TOTAL' : (
                ['loo_pcs', 'loo_kg', 'order_pcs', 'order_kg', 'sisa_order_pcs', 'sisa_order_kg', 'forecast_pcs', 'forecast_kg', 'wip_lt_pcs', 'konversi_st_pcs', 'konversi_st_kg', 'wip_st_pcs', 'wip_st_kg', 'fg_st_pcs', 'fg_kg', 'balance_pcs', 'balance_kg', 'total_delivery_pcs', 'total_delivery_kg'].includes(col.id)
                  ? calculateTotal(col.id).toLocaleString('id-ID', { maximumFractionDigits: 2 })
                  : ''
              )}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
});

export default ReportTable;
