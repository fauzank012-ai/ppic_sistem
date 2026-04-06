import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Download, Settings, Check, X, ArrowUpDown, ArrowUp, ArrowDown, FilterX, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { fetchAllRows, fetchFromBackend } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import ReportTable from '../components/ReportTable';

export const COLUMNS = [
  { id: 'no', label: 'No' },
  { id: 'customer', label: 'Customer' },
  { id: 'short_name_customer', label: 'Short Name Customer' },
  { id: 'spec', label: 'Spec' },
  { id: 'dimensi', label: 'Dimensi' },
  { id: 'kode_st', label: 'Kode ST' },
  { id: 'kode_lt', label: 'Kode LT' },
  { id: 'work_center_st', label: 'Work Center ST' },
  { id: 'work_center_lt', label: 'Work Center LT' },
  { id: 'd1', label: 'D1' },
  { id: 'd2', label: 'D2' },
  { id: 'dia', label: 'Dia' },
  { id: 'thick', label: 'Thick' },
  { id: 'length', label: 'Length' },
  { id: 'status_order', label: 'Status Order' },
  { id: 'loo_pcs', label: 'LOO (Pcs)' },
  { id: 'loo_kg', label: 'LOO (Kg)' },
  { id: 'order_pcs', label: 'Order (Pcs)' },
  { id: 'order_kg', label: 'Order (Kg)' },
  { id: 'sisa_order_pcs', label: 'Sisa Order (Pcs)' },
  { id: 'sisa_order_kg', label: 'Sisa Order (Kg)' },
  { id: 'forecast_pcs', label: 'Forecast (Pcs)' },
  { id: 'forecast_kg', label: 'Forecast (Kg)' },
  { id: 'persentase_lt_pcs', label: '% LT' },
  { id: 'persentase_lt_kg_val', label: '% LT (Kg)' },
  { id: 'persentase_st_pcs', label: '% ST' },
  { id: 'wip_lt_pcs', label: 'WIP LT (Pcs)' },
  { id: 'konversi_st_pcs', label: 'Konversi ST (Pcs)' },
  { id: 'konversi_st_kg', label: 'Konversi ST (Kg)' },
  { id: 'wip_st_pcs', label: 'WIP ST (Pcs)' },
  { id: 'wip_st_kg', label: 'WIP ST (Kg)' },
  { id: 'fg_st_pcs', label: 'FG (Pcs)' },
  { id: 'fg_kg', label: 'FG (Kg)' },
  { id: 'balance_pcs', label: 'Balance (Pcs)' },
  { id: 'balance_kg', label: 'Balance (Kg)' },
  { id: 'total_delivery_pcs', label: 'Total Delivery (Pcs)' },
  { id: 'total_delivery_kg', label: 'Total Delivery (Kg)' },
  { id: 'avg_delivery_per_day', label: 'Avg Delivery/Day' },
  { id: 'doc_fg', label: 'DOC FG' },
  { id: 'doc_wip', label: 'DOC WIP' },
  { id: 'doc_wip_lt', label: 'DOC WIP LT' },
  { id: 'alert_st', label: 'Alert ST' },
  { id: 'alert_lt', label: 'Alert LT' },
];

export default function Report() {
  const queryClient = useQueryClient();
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(500);
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterShortName, setFilterShortName] = useState('');
  const [filterSpec, setFilterSpec] = useState('');
  const [filterDimensi, setFilterDimensi] = useState('');
  const [filterD1, setFilterD1] = useState('');
  const [filterD2, setFilterD2] = useState('');
  const [filterDia, setFilterDia] = useState('');
  const [filterThick, setFilterThick] = useState('');
  const [filterLength, setFilterLength] = useState('');
  const [filterWorkCenterST, setFilterWorkCenterST] = useState('');
  const [filterWorkCenterLT, setFilterWorkCenterLT] = useState('');
  const [filterAlertST, setFilterAlertST] = useState('All');
  const [filterAlertLT, setFilterAlertLT] = useState('All');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });
  const { refreshKey, triggerRefresh } = useRefresh();
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {})
  );
  const settingsRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.ceil(total / limit);

  useEffect(() => {
    if (page < totalPages) {
      queryClient.prefetchQuery({
        queryKey: ['report', filterCustomer, page + 1, limit, refreshKey],
        queryFn: async () => {
          const result = await fetchFromBackend('/api/report', {
            params: {
              customer: filterCustomer,
              limit,
              offset: (page) * limit
            }
          });
          return result.data || [];
        },
      });
    }
  }, [page, totalPages, filterCustomer, limit, refreshKey, queryClient]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowColumnSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleColumn = useCallback((id: string) => {
    setVisibleColumns(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleAllColumns = useCallback((show: boolean) => {
    setVisibleColumns(COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: show }), {}));
  }, []);

  const { data: reportData, isLoading: loading } = useQuery({
    queryKey: ['report', filterCustomer, page, limit, refreshKey],
    queryFn: async () => {
      const result = await fetchFromBackend('/api/report', {
        params: {
          customer: filterCustomer,
          limit,
          offset: (page - 1) * limit
        }
      });
      setTotal(result.total || 0);
      return result.data || [];
    },
    staleTime: 30000, // 30 seconds
  });

  const data = reportData || [];

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      const result = await fetchFromBackend('/api/refresh', { method: 'POST' });
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['report'] });
        triggerRefresh();
      } else {
        console.error('Refresh failed:', result.error);
        alert('Refresh failed: ' + result.error);
      }
    } catch (err: any) {
      console.error('Error refreshing data:', err);
      alert('Error refreshing data: ' + (err.message || 'Please try again.'));
    } finally {
      setRefreshing(false);
    }
  };

  const sortedData = useMemo(() => {
    let result = [...data];

    // Client-side filtering for columns other than Customer
    if (filterShortName) {
      result = result.filter(item => (item.short_name_customer || '').toLowerCase().includes(filterShortName.toLowerCase()));
    }
    if (filterSpec) {
      result = result.filter(item => (item.spec || '').toLowerCase().includes(filterSpec.toLowerCase()));
    }
    if (filterDimensi) {
      result = result.filter(item => {
        const dim = `${item.d1 || ''}x${item.d2 || ''}x${item.dia || ''}x${item.thick || ''}x${item.length || ''}`;
        return dim.toLowerCase().includes(filterDimensi.toLowerCase());
      });
    }
    if (filterD1) {
      result = result.filter(item => String(item.d1 || '').toLowerCase().includes(filterD1.toLowerCase()));
    }
    if (filterD2) {
      result = result.filter(item => String(item.d2 || '').toLowerCase().includes(filterD2.toLowerCase()));
    }
    if (filterDia) {
      result = result.filter(item => String(item.dia || '').toLowerCase().includes(filterDia.toLowerCase()));
    }
    if (filterThick) {
      result = result.filter(item => String(item.thick || '').toLowerCase().includes(filterThick.toLowerCase()));
    }
    if (filterLength) {
      result = result.filter(item => String(item.length || '').toLowerCase().includes(filterLength.toLowerCase()));
    }
    if (filterWorkCenterST) {
      result = result.filter(item => (item.work_center_st || '').toLowerCase().includes(filterWorkCenterST.toLowerCase()));
    }
    if (filterWorkCenterLT) {
      result = result.filter(item => (item.work_center_lt || '').toLowerCase().includes(filterWorkCenterLT.toLowerCase()));
    }
    if (filterAlertST !== 'All') {
      result = result.filter(item => item.alert_st === filterAlertST);
    }
    if (filterAlertLT !== 'All') {
      result = result.filter(item => item.alert_lt === filterAlertLT);
    }

    if (sortConfig.key && sortConfig.direction) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, filterShortName, filterSpec, filterDimensi, filterD1, filterD2, filterDia, filterThick, filterLength, filterWorkCenterST, filterWorkCenterLT, filterAlertST, filterAlertLT, sortConfig]);

  const handleSort = useCallback((key: string) => {
    setSortConfig(prev => {
      let direction: 'asc' | 'desc' | null = 'asc';
      if (prev.key === key && prev.direction === 'asc') {
        direction = 'desc';
      } else if (prev.key === key && prev.direction === 'desc') {
        direction = null;
      }
      return { key, direction };
    });
  }, []);

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key || !sortConfig.direction) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    if (sortConfig.direction === 'asc') return <ArrowUp className="w-3 h-3 ml-1 text-indigo-600" />;
    return <ArrowDown className="w-3 h-3 ml-1 text-indigo-600" />;
  };

  const getFilteredOptions = useCallback((field: string) => {
    return data.filter(row => {
      return (
        (field === 'customer' || filterCustomer === '' || (row.customer || '').toLowerCase().includes(filterCustomer.toLowerCase())) &&
        (field === 'short_name_customer' || filterShortName === '' || (row.short_name_customer || '').toLowerCase().includes(filterShortName.toLowerCase())) &&
        (field === 'spec' || filterSpec === '' || (row.spec || '').toLowerCase().includes(filterSpec.toLowerCase())) &&
        (field === 'dimensi' || filterDimensi === '' || (row.dimensi || '').toLowerCase().includes(filterDimensi.toLowerCase())) &&
        (field === 'd1' || filterD1 === '' || String(row.d1 || '').toLowerCase().includes(filterD1.toLowerCase())) &&
        (field === 'd2' || filterD2 === '' || String(row.d2 || '').toLowerCase().includes(filterD2.toLowerCase())) &&
        (field === 'dia' || filterDia === '' || String(row.dia || '').toLowerCase().includes(filterDia.toLowerCase())) &&
        (field === 'thick' || filterThick === '' || String(row.thick || '').toLowerCase().includes(filterThick.toLowerCase())) &&
        (field === 'length' || filterLength === '' || String(row.length || '').toLowerCase().includes(filterLength.toLowerCase())) &&
        (field === 'work_center_st' || filterWorkCenterST === '' || (row.work_center_st || '').toLowerCase().includes(filterWorkCenterST.toLowerCase())) &&
        (field === 'work_center_lt' || filterWorkCenterLT === '' || (row.work_center_lt || '').toLowerCase().includes(filterWorkCenterLT.toLowerCase())) &&
        (field === 'alert_st' || filterAlertST === 'All' || row.alert_st === filterAlertST) &&
        (field === 'alert_lt' || filterAlertLT === 'All' || row.alert_lt === filterAlertLT)
      );
    });
  }, [data, filterCustomer, filterShortName, filterSpec, filterDimensi, filterD1, filterD2, filterDia, filterThick, filterLength, filterWorkCenterST, filterWorkCenterLT, filterAlertST, filterAlertLT]);

  const getUniqueOptions = useCallback((field: string) => {
    const optionsMap = new Map<string, number>();
    getFilteredOptions(field).forEach(item => {
      const val = String(item[field] || '');
      if (val) {
        optionsMap.set(val, (optionsMap.get(val) || 0) + 1);
      }
    });
    return Array.from(optionsMap.entries())
      .map(([val, count]) => ({ val, count }))
      .sort((a, b) => {
        if (!isNaN(Number(a.val)) && !isNaN(Number(b.val))) {
          return Number(a.val) - Number(b.val);
        }
        return a.val.localeCompare(b.val);
      });
  }, [getFilteredOptions]);

  const uniqueCustomers = useMemo(() => getUniqueOptions('customer'), [getUniqueOptions]);
  const uniqueShortNames = useMemo(() => getUniqueOptions('short_name_customer'), [getUniqueOptions]);
  const uniqueSpecs = useMemo(() => getUniqueOptions('spec'), [getUniqueOptions]);
  const uniqueDimensis = useMemo(() => getUniqueOptions('dimensi'), [getUniqueOptions]);
  const uniqueD1s = useMemo(() => getUniqueOptions('d1'), [getUniqueOptions]);
  const uniqueD2s = useMemo(() => getUniqueOptions('d2'), [getUniqueOptions]);
  const uniqueDias = useMemo(() => getUniqueOptions('dia'), [getUniqueOptions]);
  const uniqueThicks = useMemo(() => getUniqueOptions('thick'), [getUniqueOptions]);
  const uniqueLengths = useMemo(() => getUniqueOptions('length'), [getUniqueOptions]);
  const uniqueWorkCenterSTs = useMemo(() => getUniqueOptions('work_center_st'), [getUniqueOptions]);
  const uniqueWorkCenterLTs = useMemo(() => getUniqueOptions('work_center_lt'), [getUniqueOptions]);
  const uniqueAlertSTs = useMemo(() => getUniqueOptions('alert_st'), [getUniqueOptions]);
  const uniqueAlertLTs = useMemo(() => getUniqueOptions('alert_lt'), [getUniqueOptions]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    
    try {
      // Use Web Worker for Excel export to keep UI responsive
      const worker = new Worker(new URL('../workers/excelWorker.ts', import.meta.url), { type: 'module' });
      
      worker.onmessage = (e) => {
        const { success, data, fileName, error } = e.data;
        if (success) {
          const blob = new Blob([data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName || 'Report_Regular_Order.xlsx';
          a.click();
          URL.revokeObjectURL(url);
        } else {
          console.error('Excel Worker Error:', error);
          alert('Export failed: ' + error);
        }
        setExporting(false);
        worker.terminate();
      };

      worker.postMessage({
        data: sortedData,
        fileName: 'Report_Regular_Order.xlsx',
        sheetName: 'Report Regular Order'
      });
    } catch (err) {
      console.error('Export error:', err);
      alert('Export failed. Falling back to main thread.');
      
      // Fallback to main thread if worker fails
      const xlsx = await import('xlsx');
      const ws = xlsx.utils.json_to_sheet(sortedData);
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, 'Report Regular Order');
      xlsx.writeFile(wb, 'Report_Regular_Order.xlsx');
      setExporting(false);
    }
  }, [sortedData, exporting]);

  const isDeadStock = (item: any) => {
    // High FG stock but no delivery/SO in a certain period
    // Simple logic: FG > 0 and no recent delivery (or no delivery at all)
    return item.fg_st_pcs > 0 && !item.last_delivery_date;
  };

  const calculateTotal = (key: string) => {
    return sortedData.reduce((sum, row) => sum + (Number(row[key as keyof typeof row]) || 0), 0);
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading Report Regular Order...</div>;

  return (
    <div className="px-4 py-2 flex flex-col h-full bg-[#FDFBF7]">
      <div className="flex justify-end items-center mb-2">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm ${refreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
          <div className="relative" ref={settingsRef}>
            <button
              onClick={() => setShowColumnSettings(!showColumnSettings)}
              className="flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
            >
              <Settings className="w-4 h-4 mr-2" />
              Columns
            </button>
            
            {showColumnSettings && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50">
                <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                  <span className="font-medium text-sm text-gray-700">Show/Hide Columns</span>
                  <div className="flex space-x-2">
                    <button 
                      onClick={() => toggleAllColumns(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button 
                      onClick={() => toggleAllColumns(false)}
                      className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto p-2">
                  {COLUMNS.map(col => (
                    <label 
                      key={col.id} 
                      className="flex items-center px-3 py-2 hover:bg-gray-50 rounded cursor-pointer group"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 transition-colors ${
                        visibleColumns[col.id] 
                          ? 'bg-indigo-600 border-indigo-600' 
                          : 'border-gray-300 group-hover:border-indigo-400'
                      }`}>
                        {visibleColumns[col.id] && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <input 
                        type="checkbox" 
                        className="hidden"
                        checked={visibleColumns[col.id]}
                        onChange={() => toggleColumn(col.id)}
                      />
                      <span className="text-sm text-gray-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={handleExport}
            className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Export to Excel
          </button>
        </div>
      </div>

      <div className="bg-white p-2 rounded-xl shadow-sm border border-gray-200 mb-2 flex items-center justify-between transition-all duration-300 hover:shadow-md hover:border-gray-300">
        <div className="flex items-center space-x-4">
          <div className="text-sm text-gray-500">
            Showing <span className="font-bold text-gray-900">{sortedData.length}</span> Items
          </div>
          
          {(filterCustomer || filterShortName || filterSpec || filterDimensi || filterD1 || filterD2 || filterDia || filterThick || filterLength || filterWorkCenterST || filterWorkCenterLT || filterAlertST !== 'All' || filterAlertLT !== 'All') && (
            <button
              onClick={() => {
                setFilterCustomer('');
                setFilterShortName('');
                setFilterSpec('');
                setFilterDimensi('');
                setFilterD1('');
                setFilterD2('');
                setFilterDia('');
                setFilterThick('');
                setFilterLength('');
                setFilterWorkCenterST('');
                setFilterWorkCenterLT('');
                setFilterAlertST('All');
                setFilterAlertLT('All');
              }}
              className="flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all text-xs font-bold border border-red-100"
            >
              <FilterX className="w-3.5 h-3.5" />
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col transition-all duration-300 hover:shadow-md hover:border-gray-300">
        <div ref={parentRef} className="overflow-auto flex-1 h-full">
          <ReportTable 
            data={sortedData} 
            visibleColumns={visibleColumns} 
            handleSort={handleSort} 
            getSortIcon={getSortIcon}
            filterCustomer={filterCustomer}
            setFilterCustomer={setFilterCustomer}
            uniqueCustomers={uniqueCustomers}
            filterShortName={filterShortName}
            setFilterShortName={setFilterShortName}
            uniqueShortNames={uniqueShortNames}
            filterSpec={filterSpec}
            setFilterSpec={setFilterSpec}
            uniqueSpecs={uniqueSpecs}
            filterDimensi={filterDimensi}
            setFilterDimensi={setFilterDimensi}
            uniqueDimensis={uniqueDimensis}
            filterWorkCenterST={filterWorkCenterST}
            setFilterWorkCenterST={setFilterWorkCenterST}
            uniqueWorkCenterSTs={uniqueWorkCenterSTs}
            filterWorkCenterLT={filterWorkCenterLT}
            setFilterWorkCenterLT={setFilterWorkCenterLT}
            uniqueWorkCenterLTs={uniqueWorkCenterLTs}
            filterD1={filterD1}
            setFilterD1={setFilterD1}
            uniqueD1s={uniqueD1s}
            filterD2={filterD2}
            setFilterD2={setFilterD2}
            uniqueD2s={uniqueD2s}
            filterDia={filterDia}
            setFilterDia={setFilterDia}
            uniqueDias={uniqueDias}
            filterThick={filterThick}
            setFilterThick={setFilterThick}
            uniqueThicks={uniqueThicks}
            filterLength={filterLength}
            setFilterLength={setFilterLength}
            uniqueLengths={uniqueLengths}
            filterAlertST={filterAlertST}
            setFilterAlertST={setFilterAlertST}
            uniqueAlertSTs={uniqueAlertSTs}
            filterAlertLT={filterAlertLT}
            setFilterAlertLT={setFilterAlertLT}
            uniqueAlertLTs={uniqueAlertLTs}
            calculateTotal={calculateTotal}
            isDeadStock={isDeadStock}
            parentRef={parentRef}
          />
        </div>
        {/* Pagination Controls */}
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between sm:px-6">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => setPage(prev => Math.max(prev - 1, 1))}
              disabled={page === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
              disabled={page === totalPages || totalPages === 0}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{total === 0 ? 0 : (page - 1) * limit + 1}</span> to <span className="font-medium">{Math.min(page * limit, total)}</span> of{' '}
                <span className="font-medium">{total}</span> results
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
              >
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
                <option value={200}>200 per page</option>
                <option value={500}>500 per page</option>
              </select>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                  onClick={() => setPage(prev => Math.max(prev - 1, 1))}
                  disabled={page === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <div className="px-4 py-2 border-t border-b border-gray-300 bg-white text-sm font-medium text-gray-700">
                  Page {page} of {totalPages || 1}
                </div>
                <button
                  onClick={() => setPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={page === totalPages || totalPages === 0}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="sr-only">Next</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
