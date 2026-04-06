import { useState, useMemo } from 'react';
import { Download, Search, X, ArrowUpDown, ArrowUp, ArrowDown, Layers, CircleDot, BarChart2, FileText } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from 'recharts';

const COLUMNS = [
  { id: 'no', label: 'No' },
  { id: 'spec', label: 'Spec' },
  { id: 'act_thick', label: 'Aktual Tebal' },
  { id: 'total_loo_kg', label: 'Total LOO (Kg)' },
  { id: 'total_sisa_order_kg', label: 'Total Sisa Order (Kg)' },
  { id: 'total_forecast_kg', label: 'Total Forecast (Kg)' },
  { id: 'wip_lt_kg', label: 'Stock WIP LT (Kg)' },
  { id: 'wip_kg', label: 'Stock WIP (Kg)' },
  { id: 'fg_kg', label: 'Stock FG (Kg)' },
  { id: 'stock_strip_kg', label: 'Stock Strip (Kg)' },
  { id: 'stock_coil_kg', label: 'Stock Coil (Kg)' },
  { id: 'net_coil_requirement_kg', label: 'Net Coil Requirement (Kg)' },
  { id: 'coil_req_n1', label: 'Coil Req N+1' },
  { id: 'coil_req_n2', label: 'Coil Req N+2' },
  { id: 'coil_req_n3', label: 'Coil Req N+3' },
];

export default function CoilRequirement() {
  const [searchParams] = useSearchParams();
  const selectedPeriod = searchParams.get('periode') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const [searchTerm, setSearchTerm] = useState('');
  const [specFilter, setSpecFilter] = useState<string>('all');
  const [thickFilter, setThickFilter] = useState<string>('all');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });
  const { refreshKey } = useRefresh();
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(
    COLUMNS.reduce((acc, col) => ({ ...acc, [col.id]: true }), {})
  );

  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['coil-requirements', refreshKey, selectedPeriod],
    queryFn: async () => {
      const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const [year, month] = selectedPeriod.split('-');
      const formattedPeriode = `${monthNames[parseInt(month, 10) - 1]}-${year}`;

      const [
        materials,
        sos,
        loos,
        forecasts,
        stocks,
        stockStrips,
        stockCoils,
        masterKonversiSpec,
        reportViewMat
      ] = await Promise.all([
        fetchAllRows('material_master', 'spec,act_thick,berat_per_pcs,kode_st,kode_strip,alternative_kode_strip,customer,kode_lt,lebar_strip,thick,spec_strip,alternative_spec_strip'),
        fetchAllRows('sales_orders', 'kode_st,customer,qty_order_pcs,qty_order_kg', (q) => q.eq('periode', formattedPeriode)),
        fetchAllRows('loo_data', 'kode_st,customer,sisa_loo_pcs,sisa_order_pcs,sisa_loo_kg,sisa_order_kg'),
        fetchAllRows('forecasts', 'kode_st,customer,qty_pcs,qty_forecast_kg', (q) => q.eq('periode', formattedPeriode)),
        fetchAllRows('stocks', 'kode_material,wip_lt_pcs,wip_st_pcs,fg_lt_pcs'),
        fetchAllRows('stock_strip', 'lebar_strip,tebal_strip,spec_strip,qty_kg'),
        fetchAllRows('stock_coil', 'kode_material_coil,qty_kg,spec,tebal_coil'),
        fetchAllRows('master_konversi_spec_material', 'spec,spec_strip,alternative_spec_strip,spec_coil,alternative_spec_coil'),
        fetchAllRows('report_view_mat', 'kode_st,dimensi')
      ]);

      const currentDay = new Date().getDate();
      const groupMap = new Map<string, any>();
      
      const dimensiMap = new Map<string, string>();
      (reportViewMat || []).forEach((r: any) => {
        if (r.kode_st) {
          dimensiMap.set(r.kode_st.trim().toLowerCase(), r.dimensi || '');
        }
      });

      materials.forEach((m: any) => {
        const spec = m.spec || 'Unknown Spec';
        const actThick = m.act_thick || 0;
        const groupKey = `${spec}|${actThick}`;

        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            spec,
            act_thick: actThick,
            total_loo_kg: 0,
            total_order_kg: 0,
            total_sisa_order_kg: 0,
            total_forecast_kg: 0,
            total_requirement_kg: 0,
            wip_lt_kg: 0,
            wip_kg: 0,
            fg_kg: 0,
            stock_strip_kg: 0,
            stock_coil_kg: 0,
            net_coil_requirement_kg: 0,
            order_details: [],
            related_strips: new Set<string>(),
            related_coils: new Set<string>(),
            related_lts: new Set<string>(),
            related_lebar_strips: new Set<number>(),
            related_tebal_strips: new Set<number>(),
            related_spec_strips: new Set<string>()
          });
        }

        const entry = groupMap.get(groupKey);
        const beratPerPcs = m.berat_per_pcs || 0;
        const kodeST = m.kode_st;
        const kodeStrip = m.kode_strip;
        const altKodeStrip = m.alternative_kode_strip;
        const customer = m.customer;

        // Order
        const soData = (sos || []).filter((s: any) => 
          (s.kode_st || '').trim().toLowerCase() === (kodeST || '').trim().toLowerCase() && 
          (s.customer || '').trim().toLowerCase() === (customer || '').trim().toLowerCase()
        );
        const orderPcs = soData.reduce((sum: number, s: any) => sum + (s.qty_order_pcs || 0), 0);
        const orderKg = soData.reduce((sum: number, s: any) => sum + (s.qty_order_kg || ((s.qty_order_pcs || 0) * beratPerPcs)), 0);

        // LOO & Sisa Order
        const looData = (loos || []).filter((l: any) => 
          (l.kode_st || '').trim().toLowerCase() === (kodeST || '').trim().toLowerCase() && 
          (l.customer || '').trim().toLowerCase() === (customer || '').trim().toLowerCase()
        );
        const looPcs = looData.reduce((sum: number, l: any) => sum + (l.sisa_loo_pcs || 0), 0);
        const looKg = looData.reduce((sum: number, l: any) => sum + (l.sisa_loo_kg || ((l.sisa_loo_pcs || 0) * beratPerPcs)), 0);
        
        const sisaOrderPcs = looData.reduce((sum: number, l: any) => sum + (l.sisa_order_pcs || 0), 0);
        const sisaOrderKg = looData.reduce((sum: number, l: any) => sum + (l.sisa_order_kg || ((l.sisa_order_pcs || 0) * beratPerPcs)), 0);

        // Forecast
        const forecastData = (forecasts || []).filter((f: any) => 
          (f.kode_st || '').trim().toLowerCase() === (kodeST || '').trim().toLowerCase() && 
          (f.customer || '').trim().toLowerCase() === (customer || '').trim().toLowerCase()
        );
        const forecastPcs = forecastData.reduce((sum: number, f: any) => sum + (f.qty_pcs || 0), 0);
        const forecastKg = forecastData.reduce((sum: number, f: any) => sum + (f.qty_forecast_kg || ((f.qty_pcs || 0) * beratPerPcs)), 0);

        // Requirement calculation logic
        let requirementKg = 0;
        if (currentDay >= 1 && currentDay <= 15) {
          requirementKg = sisaOrderKg + looKg + Math.max(0, forecastKg - orderKg);
        } else {
          requirementKg = sisaOrderKg + looKg;
        }

        entry.total_loo_kg += looKg;
        entry.total_order_kg += orderKg;
        entry.total_sisa_order_kg += sisaOrderKg;
        entry.total_forecast_kg += forecastKg;
        entry.total_requirement_kg += requirementKg;

        if (looKg > 0 || sisaOrderKg > 0 || forecastKg > 0) {
          const dimensi = kodeST ? (dimensiMap.get(kodeST.trim().toLowerCase()) || `${m.act_thick || 0} x ${m.lebar_strip || 0}`) : `${m.act_thick || 0} x ${m.lebar_strip || 0}`;
          
          entry.order_details.push({
            kode_st: kodeST,
            dimensi: dimensi,
            customer: customer,
            sisa_loo_kg: looKg,
            sisa_order_kg: sisaOrderKg,
            forecast_kg: forecastKg
          });
        }

        if (m.kode_lt) entry.related_lts.add(m.kode_lt);
        if (kodeST) entry.related_strips.add(kodeST.trim().toLowerCase());
        if (kodeStrip) entry.related_strips.add(kodeStrip.trim().toLowerCase());
        if (altKodeStrip) {
          altKodeStrip.split(',').forEach((a: string) => entry.related_strips.add(a.trim().toLowerCase()));
        }
        if (m.lebar_strip) entry.related_lebar_strips.add(Number(m.lebar_strip));
        if (m.act_thick) entry.related_tebal_strips.add(Number(m.act_thick));
        if (m.thick) entry.related_tebal_strips.add(Number(m.thick));
        if (m.spec_strip) entry.related_spec_strips.add(m.spec_strip.trim().toLowerCase());
        if (m.alternative_spec_strip) {
          m.alternative_spec_strip.split(',').forEach((a: string) => entry.related_spec_strips.add(a.trim().toLowerCase()));
        }
      });

      // Add Stock WIP LT, WIP, FG, Strip, and Coil
      groupMap.forEach((entry) => {
        // Find related coils from master_konversi_spec_material based on spec
        const konversiData = (masterKonversiSpec || []).filter((k: any) => 
          (k.spec || '').trim().toLowerCase() === entry.spec.trim().toLowerCase()
        );
        
        konversiData.forEach((k: any) => {
          if (k.spec_coil) entry.related_coils.add(k.spec_coil.trim().toLowerCase());
          if (k.alternative_spec_coil) {
            k.alternative_spec_coil.split(',').forEach((a: string) => entry.related_coils.add(a.trim().toLowerCase()));
          }
        });

        let totalWipLtKg = 0;
        let totalWipKg = 0;
        let totalFgKg = 0;
        
        entry.related_lts.forEach((kodeLT: string) => {
          const stokDataLT = (stocks || []).find((s: any) => s.kode_material === kodeLT);
          if (stokDataLT) {
            const ltMaster = materials.find((m: any) => m.kode_st === kodeLT);
            const ltWeight = ltMaster?.berat_per_pcs || 1;
            totalWipLtKg += (stokDataLT.wip_lt_pcs || 0) * ltWeight;
            totalWipKg += (stokDataLT.wip_st_pcs || 0) * ltWeight;
            totalFgKg += (stokDataLT.fg_lt_pcs || 0) * ltWeight;
          }
        });
        entry.wip_lt_kg = totalWipLtKg;
        entry.wip_kg = totalWipKg;
        entry.fg_kg = totalFgKg;

        // Calculate Stock Strip based on lebar_strip, tebal_strip, and spec_strip
        const stockStripData = (stockStrips || []).filter((s: any) => {
          const sLebar = Number(s.lebar_strip) || 0;
          const sTebal = Number(s.tebal_strip) || 0;
          const sSpec = (s.spec_strip || '').trim().toLowerCase();
          return entry.related_lebar_strips.has(sLebar) && entry.related_tebal_strips.has(sTebal) && entry.related_spec_strips.has(sSpec);
        });
        entry.stock_strip_kg = stockStripData.reduce((sum: number, s: any) => sum + (Number(s.qty_kg) || 0), 0);

        // Calculate Stock Coil
        const stockCoilData = (stockCoils || []).filter((c: any) => {
          const cSpec = (c.spec || '').trim().toLowerCase();
          const cTebal = Number(c.tebal_coil) || 0;
          return entry.related_coils.has(cSpec) && entry.related_tebal_strips.has(cTebal);
        });
        entry.stock_coil_kg = stockCoilData.reduce((sum: number, c: any) => sum + (Number(c.qty_kg) || 0), 0);
        entry.stock_coil_details = stockCoilData;

        // Formula Net Coil Requirement:
        // Net Coil Requirement = Max(0, Total Requirement - Stock WIP LT - Stock WIP - Stock FG - Stock Strip - Stock Coil)
        entry.net_coil_requirement_kg = Math.max(0, entry.total_requirement_kg - entry.wip_lt_kg - entry.wip_kg - entry.fg_kg - entry.stock_strip_kg - entry.stock_coil_kg);
        
        // N+1, N+2, N+3 calculations
        // N+1 = Net Coil Requirement + (1 * Forecast)
        // N+2 = Net Coil Requirement + (2 * Forecast)
        // N+3 = Net Coil Requirement + (3 * Forecast)
        // Wait, if it's "total kebutuhan dan stok sesuai perhitungan yang sudah ada ditambah dengan kebutuhan untuk forecast 1x"
        // It should be Math.max(0, total_requirement + (1 * forecast) - all_stocks)
        const totalStock = entry.wip_lt_kg + entry.wip_kg + entry.fg_kg + entry.stock_strip_kg + entry.stock_coil_kg;
        entry.coil_req_n1 = Math.max(0, entry.total_requirement_kg + entry.total_forecast_kg - totalStock);
        entry.coil_req_n2 = Math.max(0, entry.total_requirement_kg + (2 * entry.total_forecast_kg) - totalStock);
        entry.coil_req_n3 = Math.max(0, entry.total_requirement_kg + (3 * entry.total_forecast_kg) - totalStock);
      });

      return Array.from(groupMap.values());
    },
    staleTime: 5 * 60 * 1000,
  });

  const uniqueSpecs = useMemo(() => {
    const specsMap = new Map<string, number>();
    data.forEach(item => {
      const matchesSearch = !searchTerm || (item.spec || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesThick = thickFilter === 'all' || String(item.act_thick) === thickFilter;
      
      if (matchesSearch && matchesThick && item.spec) {
        specsMap.set(item.spec, (specsMap.get(item.spec) || 0) + 1);
      }
    });
    return Array.from(specsMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, thickFilter, searchTerm]);

  const uniqueThicks = useMemo(() => {
    const thicksMap = new Map<number, number>();
    data.forEach(item => {
      const matchesSearch = !searchTerm || (item.spec || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesSpec = specFilter === 'all' || item.spec === specFilter;
      
      if (matchesSearch && matchesSpec && item.act_thick !== undefined) {
        thicksMap.set(item.act_thick, (thicksMap.get(item.act_thick) || 0) + 1);
      }
    });
    return Array.from(thicksMap.entries())
      .map(([val, count]) => ({ val, count }))
      .sort((a, b) => a.val - b.val);
  }, [data, specFilter, searchTerm]);

  const filteredData = useMemo(() => {
    return data.filter(row => {
      const searchStr = searchTerm.toLowerCase();
      const matchesSearch = (row.spec || '').toLowerCase().includes(searchStr);
      const matchesSpec = specFilter === 'all' || row.spec === specFilter;
      const matchesThick = thickFilter === 'all' || String(row.act_thick) === thickFilter;
      
      return matchesSearch && matchesSpec && matchesThick;
    });
  }, [data, searchTerm, specFilter, thickFilter]);

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];

      if (aValue === bValue) return 0;
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const aString = String(aValue || '').toLowerCase();
      const bString = String(bValue || '').toLowerCase();
      
      if (sortConfig.direction === 'asc') {
        return aString.localeCompare(bString);
      } else {
        return bString.localeCompare(aString);
      }
    });
  }, [filteredData, sortConfig]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = null;
    }
    setSortConfig({ key, direction });
  };

  const formatNumber = (num: number) => num.toLocaleString(undefined, { maximumFractionDigits: 0 });

  const totals = useMemo(() => {
    return sortedData.reduce((acc, row) => {
      acc.total_loo_kg += row.total_loo_kg || 0;
      acc.total_sisa_order_kg += row.total_sisa_order_kg || 0;
      acc.total_forecast_kg += row.total_forecast_kg || 0;
      acc.wip_lt_kg += row.wip_lt_kg || 0;
      acc.wip_kg += row.wip_kg || 0;
      acc.fg_kg += row.fg_kg || 0;
      acc.stock_strip_kg += row.stock_strip_kg || 0;
      acc.stock_coil_kg += row.stock_coil_kg || 0;
      acc.net_coil_requirement_kg += row.net_coil_requirement_kg || 0;
      acc.coil_req_n1 += row.coil_req_n1 || 0;
      acc.coil_req_n2 += row.coil_req_n2 || 0;
      acc.coil_req_n3 += row.coil_req_n3 || 0;
      return acc;
    }, {
      total_loo_kg: 0,
      total_sisa_order_kg: 0,
      total_forecast_kg: 0,
      wip_lt_kg: 0,
      wip_kg: 0,
      fg_kg: 0,
      stock_strip_kg: 0,
      stock_coil_kg: 0,
      net_coil_requirement_kg: 0,
      coil_req_n1: 0,
      coil_req_n2: 0,
      coil_req_n3: 0,
    });
  }, [sortedData]);

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key || !sortConfig.direction) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    if (sortConfig.direction === 'asc') return <ArrowUp className="w-3 h-3 ml-1 text-teal-600" />;
    return <ArrowDown className="w-3 h-3 ml-1 text-teal-600" />;
  };

  const [viewMode, setViewMode] = useState<'report' | 'grafik'>('grafik');
  const [chartPage, setChartPage] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedChartItem, setSelectedChartItem] = useState<any>(null);
  const [modalView, setModalView] = useState<'stok' | 'order'>('stok');
  const [orderSortConfig, setOrderSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' | null }>({ key: '', direction: null });
  const itemsPerPage = 10;

  const handleOrderSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (orderSortConfig.key === key && orderSortConfig.direction === 'asc') {
      direction = 'desc';
    } else if (orderSortConfig.key === key && orderSortConfig.direction === 'desc') {
      direction = null;
    }
    setOrderSortConfig({ key, direction });
  };

  const getOrderSortIcon = (key: string) => {
    if (orderSortConfig.key !== key || !orderSortConfig.direction) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    if (orderSortConfig.direction === 'asc') return <ArrowUp className="w-3 h-3 ml-1 text-teal-600" />;
    return <ArrowDown className="w-3 h-3 ml-1 text-teal-600" />;
  };

  const sortedOrderDetails = useMemo(() => {
    if (!selectedChartItem || !selectedChartItem.order_details) return [];
    let sortableItems = [...selectedChartItem.order_details];
    if (orderSortConfig.key && orderSortConfig.direction !== null) {
      sortableItems.sort((a, b) => {
        if (a[orderSortConfig.key] < b[orderSortConfig.key]) {
          return orderSortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[orderSortConfig.key] > b[orderSortConfig.key]) {
          return orderSortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [selectedChartItem, orderSortConfig]);

  const chartData = useMemo(() => {
    return [...sortedData]
      .sort((a, b) => (b.net_coil_requirement_kg || 0) - (a.net_coil_requirement_kg || 0))
      .map(item => ({
        ...item,
        chartLabel: `${item.spec} (${item.act_thick}mm)`
      }));
  }, [sortedData]);

  const totalChartPages = Math.ceil(chartData.length / itemsPerPage);
  const paginatedChartData = chartData.slice((chartPage - 1) * itemsPerPage, chartPage * itemsPerPage);

  const handleExport = async () => {
    const xlsx = await import('xlsx');
    const ws = xlsx.utils.json_to_sheet(sortedData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Coil Requirements');
    xlsx.writeFile(wb, 'Coil_Requirements.xlsx');
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Calculating Coil Requirements...</div>;

  return (
    <div className="px-6 py-6 flex flex-col h-full font-sans">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex items-center gap-4 transition-all duration-300 hover:shadow-md hover:border-gray-300">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all"
            placeholder="Search by spec..."
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center bg-white border border-gray-200 rounded-full p-1 shadow-sm">
          <button
            onClick={() => setViewMode('grafik')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
              viewMode === 'grafik' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <BarChart2 className="w-4 h-4" />
            Grafik
          </button>
          <button
            onClick={() => setViewMode('report')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
              viewMode === 'report' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <FileText className="w-4 h-4" />
            Report
          </button>
        </div>

        <button
          onClick={handleExport}
          className="flex items-center px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-all shadow-md hover:shadow-lg active:scale-95 text-sm"
        >
          <Download className="w-4 h-4 mr-2" />
          Export to Excel
        </button>

        {(specFilter !== 'all' || thickFilter !== 'all' || searchTerm) && (
          <button
            onClick={() => {
              setSpecFilter('all');
              setThickFilter('all');
              setSearchTerm('');
            }}
            className="text-xs font-medium text-teal-600 hover:text-teal-700 hover:underline transition-all"
          >
            Reset All Filters
          </button>
        )}

        <div className="ml-auto text-sm text-gray-500">
          Showing <span className="font-bold text-gray-900">{filteredData.length}</span> Coil Requirements
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col transition-all duration-300 hover:shadow-md hover:border-gray-300">
        {viewMode === 'report' ? (
          <div className="overflow-auto flex-1">
            <table className="min-w-full divide-y divide-gray-200 text-[10px]">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {visibleColumns.no && <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap w-10">No</th>}
                {visibleColumns.spec && (
                  <th className="px-2 py-2 text-left font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('spec')}>
                    <div className="flex items-center">Spec {getSortIcon('spec')}</div>
                    <div className="mt-1" onClick={e => e.stopPropagation()}>
                      <select
                        value={specFilter}
                        onChange={(e) => setSpecFilter(e.target.value)}
                        className="w-full px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                      >
                        <option value="all">All</option>
                        {uniqueSpecs.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                      </select>
                    </div>
                  </th>
                )}
                {visibleColumns.act_thick && (
                  <th className="px-2 py-2 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('act_thick')}>
                    <div className="flex items-center justify-end">Aktual Tebal {getSortIcon('act_thick')}</div>
                    <div className="mt-1" onClick={e => e.stopPropagation()}>
                      <select
                        value={thickFilter}
                        onChange={(e) => setThickFilter(e.target.value)}
                        className="w-full px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-teal-500 bg-white"
                      >
                        <option value="all">All</option>
                        {uniqueThicks.map(t => <option key={t.val} value={t.val}>{t.val}</option>)}
                      </select>
                    </div>
                  </th>
                )}
                {visibleColumns.total_loo_kg && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('total_loo_kg')}>
                    <div className="flex items-center justify-end">Total LOO (Kg) {getSortIcon('total_loo_kg')}</div>
                  </th>
                )}
                {visibleColumns.total_sisa_order_kg && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('total_sisa_order_kg')}>
                    <div className="flex items-center justify-end">Total Sisa Order (Kg) {getSortIcon('total_sisa_order_kg')}</div>
                  </th>
                )}
                {visibleColumns.total_forecast_kg && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('total_forecast_kg')}>
                    <div className="flex items-center justify-end">Total Forecast (Kg) {getSortIcon('total_forecast_kg')}</div>
                  </th>
                )}
                {visibleColumns.wip_lt_kg && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('wip_lt_kg')}>
                    <div className="flex items-center justify-end">Stock WIP LT (Kg) {getSortIcon('wip_lt_kg')}</div>
                  </th>
                )}
                {visibleColumns.wip_kg && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('wip_kg')}>
                    <div className="flex items-center justify-end">Stock WIP (Kg) {getSortIcon('wip_kg')}</div>
                  </th>
                )}
                {visibleColumns.fg_kg && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('fg_kg')}>
                    <div className="flex items-center justify-end">Stock FG (Kg) {getSortIcon('fg_kg')}</div>
                  </th>
                )}
                {visibleColumns.stock_strip_kg && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('stock_strip_kg')}>
                    <div className="flex items-center justify-end">Stock Strip (Kg) {getSortIcon('stock_strip_kg')}</div>
                  </th>
                )}
                {visibleColumns.stock_coil_kg && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('stock_coil_kg')}>
                    <div className="flex items-center justify-end">Stock Coil (Kg) {getSortIcon('stock_coil_kg')}</div>
                  </th>
                )}
                {visibleColumns.net_coil_requirement_kg && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('net_coil_requirement_kg')}>
                    <div className="flex items-center justify-end">Net Coil Requirement (Kg) {getSortIcon('net_coil_requirement_kg')}</div>
                  </th>
                )}
                {visibleColumns.coil_req_n1 && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('coil_req_n1')}>
                    <div className="flex items-center justify-end">Coil Req N+1 {getSortIcon('coil_req_n1')}</div>
                  </th>
                )}
                {visibleColumns.coil_req_n2 && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('coil_req_n2')}>
                    <div className="flex items-center justify-end">Coil Req N+2 {getSortIcon('coil_req_n2')}</div>
                  </th>
                )}
                {visibleColumns.coil_req_n3 && (
                  <th className="px-2 py-1.5 text-right font-semibold text-gray-600 whitespace-nowrap cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('coil_req_n3')}>
                    <div className="flex items-center justify-end">Coil Req N+3 {getSortIcon('coil_req_n3')}</div>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {sortedData.map((row, index) => (
                <tr key={`${row.spec}-${row.act_thick}-${index}`} className="hover:bg-gray-50 transition-colors group">
                  {visibleColumns.no && <td className="px-2 py-1 text-center text-gray-400 font-mono text-[10px]">{index + 1}</td>}
                  {visibleColumns.spec && <td className="px-2 py-1 text-gray-600">{row.spec}</td>}
                  {visibleColumns.act_thick && <td className="px-2 py-1 text-right text-gray-600">{row.act_thick?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>}
                  {visibleColumns.total_loo_kg && <td className="px-2 py-1 text-right text-gray-600">{formatNumber(row.total_loo_kg)}</td>}
                  {visibleColumns.total_sisa_order_kg && <td className="px-2 py-1 text-right text-gray-600">{formatNumber(row.total_sisa_order_kg)}</td>}
                  {visibleColumns.total_forecast_kg && <td className="px-2 py-1 text-right text-gray-600">{formatNumber(row.total_forecast_kg)}</td>}
                  {visibleColumns.wip_lt_kg && <td className="px-2 py-1 text-right text-gray-600">{formatNumber(row.wip_lt_kg)}</td>}
                  {visibleColumns.wip_kg && <td className="px-2 py-1 text-right text-gray-600">{formatNumber(row.wip_kg)}</td>}
                  {visibleColumns.fg_kg && <td className="px-2 py-1 text-right text-gray-600">{formatNumber(row.fg_kg)}</td>}
                  {visibleColumns.stock_strip_kg && <td className="px-2 py-1 text-right text-gray-600">{formatNumber(row.stock_strip_kg)}</td>}
                  {visibleColumns.stock_coil_kg && <td className="px-2 py-1 text-right text-gray-600">{formatNumber(row.stock_coil_kg)}</td>}
                  {visibleColumns.net_coil_requirement_kg && <td className="px-2 py-1 text-right font-bold text-teal-600">{formatNumber(row.net_coil_requirement_kg)}</td>}
                  {visibleColumns.coil_req_n1 && <td className="px-2 py-1 text-right font-bold text-indigo-600">{formatNumber(row.coil_req_n1)}</td>}
                  {visibleColumns.coil_req_n2 && <td className="px-2 py-1 text-right font-bold text-indigo-600">{formatNumber(row.coil_req_n2)}</td>}
                  {visibleColumns.coil_req_n3 && <td className="px-2 py-1 text-right font-bold text-indigo-600">{formatNumber(row.coil_req_n3)}</td>}
                </tr>
              ))}
            </tbody>
            <tfoot className="font-bold">
              <tr className="sticky bottom-0 z-20 bg-gray-200 shadow-[0_-1px_0_0_#e5e7eb]">
                {visibleColumns.no && <td className="px-2 py-1" colSpan={1}></td>}
                {visibleColumns.spec && <td className="px-2 py-1">Grand Total</td>}
                {visibleColumns.act_thick && <td className="px-2 py-1"></td>}
                {visibleColumns.total_loo_kg && <td className="px-2 py-1 text-right">{formatNumber(totals.total_loo_kg)}</td>}
                {visibleColumns.total_sisa_order_kg && <td className="px-2 py-1 text-right">{formatNumber(totals.total_sisa_order_kg)}</td>}
                {visibleColumns.total_forecast_kg && <td className="px-2 py-1 text-right">{formatNumber(totals.total_forecast_kg)}</td>}
                {visibleColumns.wip_lt_kg && <td className="px-2 py-1 text-right">{formatNumber(totals.wip_lt_kg)}</td>}
                {visibleColumns.wip_kg && <td className="px-2 py-1 text-right">{formatNumber(totals.wip_kg)}</td>}
                {visibleColumns.fg_kg && <td className="px-2 py-1 text-right">{formatNumber(totals.fg_kg)}</td>}
                {visibleColumns.stock_strip_kg && <td className="px-2 py-1 text-right">{formatNumber(totals.stock_strip_kg)}</td>}
                {visibleColumns.stock_coil_kg && <td className="px-2 py-1 text-right">{formatNumber(totals.stock_coil_kg)}</td>}
                {visibleColumns.net_coil_requirement_kg && <td className="px-2 py-1 text-right text-teal-600">{formatNumber(totals.net_coil_requirement_kg)}</td>}
                {visibleColumns.coil_req_n1 && <td className="px-2 py-1 text-right text-indigo-600">{formatNumber(totals.coil_req_n1)}</td>}
                {visibleColumns.coil_req_n2 && <td className="px-2 py-1 text-right text-indigo-600">{formatNumber(totals.coil_req_n2)}</td>}
                {visibleColumns.coil_req_n3 && <td className="px-2 py-1 text-right text-indigo-600">{formatNumber(totals.coil_req_n3)}</td>}
              </tr>
            </tfoot>
          </table>
        </div>
        ) : (
          <div className="p-6 h-full flex flex-col">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Grafik Net Coil Requirement</h3>
            <div className="flex-1 min-h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={paginatedChartData}
                  margin={{ top: 30, right: 30, left: 20, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                  <XAxis 
                    dataKey="chartLabel" 
                    angle={-45} 
                    textAnchor="end" 
                    height={80} 
                    interval={0} 
                    tick={{ fontSize: 10, fill: '#6B7280' }} 
                  />
                  <YAxis 
                    tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11, fill: '#6B7280' }}
                  />
                  <Tooltip 
                    formatter={(value: number) => [formatNumber(value) + ' Kg', 'Net Coil Requirement']}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar 
                    dataKey="net_coil_requirement_kg" 
                    name="Net Coil Requirement (Kg)" 
                    fill="#0D9488" 
                    radius={[4, 4, 0, 0]}
                    onClick={(data) => {
                      setSelectedChartItem(data);
                      setIsModalOpen(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <LabelList 
                      dataKey="net_coil_requirement_kg" 
                      position="top" 
                      formatter={(val: number) => formatNumber(val)} 
                      style={{ fontSize: '10px', fill: '#4B5563', fontWeight: 500 }} 
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {totalChartPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-gray-500">
                  Showing {((chartPage - 1) * itemsPerPage) + 1} to {Math.min(chartPage * itemsPerPage, chartData.length)} of {chartData.length} items
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setChartPage(p => Math.max(1, p - 1))}
                    disabled={chartPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600 font-medium">
                    Page {chartPage} of {totalChartPages}
                  </span>
                  <button
                    onClick={() => setChartPage(p => Math.min(totalChartPages, p + 1))}
                    disabled={chartPage === totalChartPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal for Stock Coil Details */}
      {isModalOpen && selectedChartItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-800">
                Detail {selectedChartItem.spec} ({selectedChartItem.act_thick}mm)
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 border-b border-gray-200 bg-gray-50 flex gap-2">
              <button
                onClick={() => setModalView('stok')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  modalView === 'stok' 
                    ? 'bg-teal-600 text-white shadow-sm' 
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Stok Coil
              </button>
              <button
                onClick={() => setModalView('order')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  modalView === 'order' 
                    ? 'bg-teal-600 text-white shadow-sm' 
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Order Details
              </button>
            </div>

            <div className="p-4 overflow-auto flex-1">
              {modalView === 'stok' ? (
                selectedChartItem.stock_coil_details && selectedChartItem.stock_coil_details.length > 0 ? (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Kode Material Coil</th>
                          <th className="px-4 py-3 font-semibold">Spec</th>
                          <th className="px-4 py-3 font-semibold text-right">Tebal Coil (mm)</th>
                          <th className="px-4 py-3 font-semibold text-right">Qty (Kg)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {selectedChartItem.stock_coil_details.map((coil: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{coil.kode_material_coil}</td>
                            <td className="px-4 py-3 text-gray-600">{coil.spec}</td>
                            <td className="px-4 py-3 text-gray-600 text-right">{coil.tebal_coil}</td>
                            <td className="px-4 py-3 text-gray-900 font-medium text-right">{formatNumber(coil.qty_kg)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-right">Total:</td>
                          <td className="px-4 py-3 text-right text-teal-600">
                            {formatNumber(selectedChartItem.stock_coil_details.reduce((sum: number, c: any) => sum + (Number(c.qty_kg) || 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Tidak ada data stock coil untuk item ini.
                  </div>
                )
              ) : (
                sortedOrderDetails && sortedOrderDetails.length > 0 ? (
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleOrderSort('kode_st')}>
                            <div className="flex items-center">Kode ST {getOrderSortIcon('kode_st')}</div>
                          </th>
                          <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleOrderSort('dimensi')}>
                            <div className="flex items-center">Dimensi {getOrderSortIcon('dimensi')}</div>
                          </th>
                          <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleOrderSort('customer')}>
                            <div className="flex items-center">Customer {getOrderSortIcon('customer')}</div>
                          </th>
                          <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-gray-100 text-right" onClick={() => handleOrderSort('sisa_loo_kg')}>
                            <div className="flex items-center justify-end">Sisa LOO (Kg) {getOrderSortIcon('sisa_loo_kg')}</div>
                          </th>
                          <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-gray-100 text-right" onClick={() => handleOrderSort('sisa_order_kg')}>
                            <div className="flex items-center justify-end">Sisa Order (Kg) {getOrderSortIcon('sisa_order_kg')}</div>
                          </th>
                          <th className="px-4 py-3 font-semibold cursor-pointer hover:bg-gray-100 text-right" onClick={() => handleOrderSort('forecast_kg')}>
                            <div className="flex items-center justify-end">Forecast (Kg) {getOrderSortIcon('forecast_kg')}</div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {sortedOrderDetails.map((order: any, idx: number) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{order.kode_st}</td>
                            <td className="px-4 py-3 text-gray-600">{order.dimensi}</td>
                            <td className="px-4 py-3 text-gray-600">{order.customer}</td>
                            <td className="px-4 py-3 text-gray-900 font-medium text-right">{formatNumber(order.sisa_loo_kg)}</td>
                            <td className="px-4 py-3 text-gray-900 font-medium text-right">{formatNumber(order.sisa_order_kg)}</td>
                            <td className="px-4 py-3 text-gray-900 font-medium text-right">{formatNumber(order.forecast_kg)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold">
                        <tr>
                          <td colSpan={3} className="px-4 py-3 text-right">Total:</td>
                          <td className="px-4 py-3 text-right text-teal-600">
                            {formatNumber(sortedOrderDetails.reduce((sum: number, o: any) => sum + (Number(o.sisa_loo_kg) || 0), 0))}
                          </td>
                          <td className="px-4 py-3 text-right text-teal-600">
                            {formatNumber(sortedOrderDetails.reduce((sum: number, o: any) => sum + (Number(o.sisa_order_kg) || 0), 0))}
                          </td>
                          <td className="px-4 py-3 text-right text-teal-600">
                            {formatNumber(sortedOrderDetails.reduce((sum: number, o: any) => sum + (Number(o.forecast_kg) || 0), 0))}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    Tidak ada data order untuk item ini.
                  </div>
                )
              )}
            </div>
            <div className="p-4 border-t border-gray-200 flex justify-end">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
