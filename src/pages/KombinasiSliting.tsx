import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Save, Download, Calendar, Loader2, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { fetchAllRows, insertInChunks, supabase } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

interface SlitingRow {
  id: number;
  customer: string;
  pipeSpec: string;
  d1: string;
  d2: string;
  dia: string;
  thick: string;
  stripWidth: string;
  stripRequirement: string;
  lines: string;
  stripWeight: string;
  totalStripWeight: string;
  currentStock: string;
  avgOrderMonth: string;
  avgOrderMonth6: string;
  avgOrderMonth12: string;
  status: string;
}

interface CoilInputRow {
  id: number;
  kodeMaterial: string;
  coilSpec: string;
  batchNo: string;
  thick: string;
  width: string;
  qty: string;
  coilWeight: string;
  heatNo: string;
  coilManufactur: string;
}

interface MaterialSpec {
  spec: string;
  d1: number[];
  d2: number[];
  dia: number[];
  thick: number[];
}

interface RawMaterialMaster {
  spec: string;
  d1: number;
  d2: number;
  dia: number;
  act_thick: number;
  spec_strip: string;
  alternative_spec_strip: string;
}

interface StockStrip {
  lebar_strip: number;
  tebal_strip: number;
  spec_strip: string;
  qty_kg: number;
}

interface LebarStrip {
  spec: string;
  d1: number;
  d2: number;
  dia: number;
  thick: number;
  strip_width: number;
}

interface SavedSession {
  session_id: string;
  save_date: string;
  work_center?: string;
  coils: any[];
  sliting: any[];
}

// Helper to format numbers for Indonesian locale
const formatIndo = (val: number | string | undefined | null, decimals: number = 2): string => {
  if (val === '' || val === undefined || val === null) return '';
  const num = typeof val === 'number' ? val : parseFloat(val.toString().replace(/\./g, '').replace(/,/g, '.'));
  if (isNaN(num)) return val.toString();
  return num.toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
};

// Helper to parse Indonesian formatted numbers back to standard numbers
const parseIndo = (val: string | number | undefined | null): number => {
  if (val === '' || val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  
  const str = val.toString().trim();
  if (!str) return 0;

  // Indonesian format (id-ID): Thousands = '.', Decimal = ','
  // We remove all dots and replace comma with dot to get a standard float string.
  // This is consistent with the internal parsing logic in formatIndo.
  const cleaned = str.replace(/\./g, '').replace(/,/g, '.');
  return parseFloat(cleaned) || 0;
};

// Helper to parse numbers from DB which might be stored as "3.4" or "3,4"
const parseDBNumber = (val: string | number | undefined | null): number => {
  if (val === '' || val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  
  const str = val.toString().trim();
  if (!str) return 0;

  if (str.includes(',')) {
    return parseFloat(str.replace(/\./g, '').replace(/,/g, '.')) || 0;
  }
  
  return parseFloat(str) || 0;
};

const StatusIndicator = React.memo(({ status }: { status: string }) => {
  if (!status) return null;
  
  const getColors = () => {
    switch (status) {
      case 'Green Flag':
        return 'from-emerald-400 to-emerald-600 shadow-emerald-500/50';
      case 'Yellow Flag':
        return 'from-yellow-300 to-amber-500 shadow-amber-500/50';
      case 'Red Flag':
        return 'from-red-400 to-red-600 shadow-red-500/50';
      default:
        return 'from-gray-300 to-gray-400 shadow-gray-400/50';
    }
  };

  return (
    <div className="flex items-center justify-center w-full h-full p-1">
      <div 
        className={`relative w-6 h-6 rounded-full shadow-md border border-black/10 flex-shrink-0 bg-gradient-to-b ${getColors()}`}
        title={status}
      >
        <div className="absolute top-[2px] left-[15%] w-[70%] h-[40%] bg-gradient-to-b from-white/70 to-transparent rounded-full"></div>
      </div>
    </div>
  );
});

const SlitingRowComponent = React.memo(({
  row,
  index,
  customers,
  materialSpecs,
  customerSpecsMap,
  getDimensionOptions,
  handleInputChange,
  loadingSpecs
}: {
  row: SlitingRow;
  index: number;
  customers: string[];
  materialSpecs: MaterialSpec[];
  customerSpecsMap: Map<string, Set<string>>;
  getDimensionOptions: (row: SlitingRow, field: 'd1' | 'd2' | 'dia') => number[];
  handleInputChange: (id: number, field: keyof SlitingRow, value: string) => void;
  loadingSpecs: boolean;
}) => {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="border border-gray-200 p-1 text-center font-bold text-gray-400">{index + 1}</td>
      <td className="border border-gray-200 p-0 relative group">
        <input
          list={`customer-list-${row.id}`}
          value={row.customer}
          onChange={(e) => handleInputChange(row.id, 'customer', e.target.value)}
          placeholder="Type or select customer"
          className="w-full h-full px-1.5 py-1 bg-transparent focus:outline-none focus:bg-emerald-50/50"
        />
        <datalist id={`customer-list-${row.id}`}>
          {customers.map((cust, i) => (
            <option key={`${cust}-${i}`} value={cust} />
          ))}
        </datalist>
      </td>
      <td className="border border-gray-200 p-0 relative group">
        <input
          list={`specs-list-${row.id}`}
          value={row.pipeSpec}
          onChange={(e) => handleInputChange(row.id, 'pipeSpec', e.target.value)}
          placeholder={loadingSpecs ? "Loading..." : "Type or select spec"}
          className="w-full h-full px-1.5 py-1 bg-transparent focus:outline-none focus:bg-emerald-50/50"
        />
        <datalist id={`specs-list-${row.id}`}>
          {materialSpecs
            .filter(item => {
              const allowedSpecs = customerSpecsMap.get(row.customer);
              if (!allowedSpecs) return true;
              return allowedSpecs.has(item.spec);
            })
            .map((item, i) => (
              <option key={`${item.spec}-${i}`} value={item.spec} />
            ))}
        </datalist>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-emerald-500 transition-colors">
          <Search className="w-3 h-3" />
        </div>
      </td>
      <td className="border border-gray-200 p-0">
        <input 
          list={`d1-list-${row.id}`}
          type="text" 
          value={row.d1} 
          onChange={(e) => handleInputChange(row.id, 'd1', e.target.value)}
          onBlur={(e) => handleInputChange(row.id, 'd1', formatIndo(e.target.value))}
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
        />
        <datalist id={`d1-list-${row.id}`}>
          {getDimensionOptions(row, 'd1').map(val => (
            <option key={val} value={formatIndo(val)} />
          ))}
        </datalist>
      </td>
      <td className="border border-gray-200 p-0">
        <input 
          list={`d2-list-${row.id}`}
          type="text" 
          value={row.d2} 
          onChange={(e) => handleInputChange(row.id, 'd2', e.target.value)}
          onBlur={(e) => handleInputChange(row.id, 'd2', formatIndo(e.target.value))}
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
        />
        <datalist id={`d2-list-${row.id}`}>
          {getDimensionOptions(row, 'd2').map(val => (
            <option key={val} value={formatIndo(val)} />
          ))}
        </datalist>
      </td>
      <td className="border border-gray-200 p-0">
        <input 
          list={`dia-list-${row.id}`}
          type="text" 
          value={row.dia} 
          onChange={(e) => handleInputChange(row.id, 'dia', e.target.value)}
          onBlur={(e) => handleInputChange(row.id, 'dia', formatIndo(e.target.value))}
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
        />
        <datalist id={`dia-list-${row.id}`}>
          {getDimensionOptions(row, 'dia').map(val => (
            <option key={val} value={formatIndo(val)} />
          ))}
        </datalist>
      </td>
      <td className="border border-gray-200 p-0 bg-gray-50/50">
        <input 
          type="text" 
          value={row.thick} 
          readOnly
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none font-bold text-emerald-700"
        />
      </td>
      <td className="border border-gray-200 p-0">
        <input 
          type="text" 
          value={row.lines} 
          onChange={(e) => handleInputChange(row.id, 'lines', e.target.value)}
          onBlur={(e) => handleInputChange(row.id, 'lines', formatIndo(e.target.value, 0))}
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
        />
      </td>
      <td className="border border-gray-200 p-0 bg-gray-50/50">
        <input 
          type="text" 
          value={row.stripWidth} 
          readOnly
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none font-medium text-gray-600"
        />
      </td>
      <td className="border border-gray-200 p-0 bg-gray-50/50">
        <input 
          type="text" 
          value={row.stripWeight} 
          readOnly
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none font-medium text-gray-600"
        />
      </td>
      <td className="border border-gray-200 p-0 bg-gray-50/50">
        <input 
          type="text" 
          value={row.totalStripWeight} 
          readOnly
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none font-bold text-gray-800"
        />
      </td>
      <td className="border border-gray-200 p-0 bg-gray-50/50">
        <input 
          type="text" 
          value={row.currentStock} 
          readOnly
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none font-medium text-gray-600"
        />
      </td>
      <td className="border border-gray-200 p-0 bg-gray-50/50">
        <input 
          type="text" 
          value={row.stripRequirement} 
          readOnly
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none font-bold text-blue-600"
        />
      </td>
      <td className="border border-gray-200 p-0 bg-gray-50/50">
        <input 
          type="text" 
          value={row.avgOrderMonth} 
          readOnly
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none font-medium text-gray-500"
        />
      </td>
      <td className="border border-gray-200 p-0 bg-gray-50/50">
        <input 
          type="text" 
          value={row.avgOrderMonth6} 
          readOnly
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none font-medium text-gray-500"
        />
      </td>
      <td className="border border-gray-200 p-0 bg-gray-50/50">
        <input 
          type="text" 
          value={row.avgOrderMonth12} 
          readOnly
          className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none font-medium text-gray-500"
        />
      </td>
      <td className="border border-gray-200 p-0">
        <StatusIndicator status={row.status} />
      </td>
    </tr>
  );
});

const groupDataBySession = (coilData: any[], slitingData: any[]): SavedSession[] => {
  const sessionsMap = new Map<string, SavedSession>();
  
  const isStrValid = (val: any) => typeof val === 'string' && val.trim() !== '' && val.trim() !== '-' && val.trim() !== 'undefined' && val.trim() !== 'null';
  const isNumValid = (val: any) => {
    if (val === null || val === undefined || val === '') return false;
    const num = Number(val);
    return !isNaN(num) && num > 0;
  };

  coilData.forEach(c => {
    const hasData = isStrValid(c.kode_material) || 
                    isStrValid(c.coil_spec) || 
                    isStrValid(c.batch_no) || 
                    isNumValid(c.thick) ||
                    isNumValid(c.width) ||
                    isNumValid(c.qty) ||
                    isNumValid(c.coil_weight) ||
                    isStrValid(c.heat_no) ||
                    isStrValid(c.coil_manufactur);
    
    if (!hasData) return;

    if (!sessionsMap.has(c.session_id)) {
      sessionsMap.set(c.session_id, { 
        session_id: c.session_id, 
        save_date: c.save_date, 
        work_center: c.work_center,
        coils: [], 
        sliting: [] 
      });
    }
    sessionsMap.get(c.session_id)!.coils.push(c);
  });

  slitingData.forEach(s => {
    const hasData = isStrValid(s.customer) || 
                    isStrValid(s.pipe_spec) || 
                    isNumValid(s.d1) ||
                    isNumValid(s.d2) ||
                    isNumValid(s.dia) ||
                    isNumValid(s.strip_width) ||
                    isNumValid(s.lines) ||
                    isNumValid(s.total_strip_weight);
    
    if (!hasData) return;

    if (!sessionsMap.has(s.session_id)) {
      sessionsMap.set(s.session_id, { 
        session_id: s.session_id, 
        save_date: s.save_date, 
        work_center: s.work_center,
        coils: [], 
        sliting: [] 
      });
    }
    sessionsMap.get(s.session_id)!.sliting.push(s);
  });

  return Array.from(sessionsMap.values()).sort((a, b) => 
    new Date(b.save_date).getTime() - new Date(a.save_date).getTime()
  );
};

export default function KombinasiSliting() {
  const [afvalMm, setAfvalMm] = useState('');
  const [afvalPercent, setAfvalPercent] = useState('');
  const [materialSpecs, setMaterialSpecs] = useState<MaterialSpec[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [rawMaterials, setRawMaterials] = useState<RawMaterialMaster[]>([]);
  const [averageOrders, setAverageOrders] = useState<any[]>([]);
  const [stockStrips, setStockStrips] = useState<StockStrip[]>([]);
  const [lebarStrips, setLebarStrips] = useState<LebarStrip[]>([]);
  const [stripRequirements, setStripRequirements] = useState<Map<string, number>>(new Map());
  const [loadingSpecs, setLoadingSpecs] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [alertType, setAlertType] = useState<'error' | 'success'>('error');
  const [confirmWarnings, setConfirmWarnings] = useState<string[]>([]);
  const [activeCoilRowsToSave, setActiveCoilRowsToSave] = useState<CoilInputRow[]>([]);
  const [activeSlitingRowsToSave, setActiveSlitingRowsToSave] = useState<SlitingRow[]>([]);
  const [exportDate, setExportDate] = useState(new Date().toISOString().split('T')[0]);
  const [isExporting, setIsExporting] = useState(false);
  const { refreshKey } = useRefresh();
  const [workCenter, setWorkCenter] = useState('');
  const [workCenters] = useState<string[]>(['SLIT-501', 'SLIT-502']);
  const [todaySummary, setTodaySummary] = useState<SavedSession[]>([]);
  const [tableInputs, setTableInputs] = useState<Record<string, { orderNo: string, keterangan: string }>>({});

  const handleTableInputChange = (sessionId: string, field: 'orderNo' | 'keterangan', value: string) => {
    setTableInputs(prev => ({
      ...prev,
      [sessionId]: {
        ...(prev[sessionId] || { orderNo: '', keterangan: '' }),
        [field]: value
      }
    }));
  };

  const handleTableInputBlur = async (sessionId: string, field: 'orderNo' | 'keterangan', value: string) => {
    try {
      const dbField = field === 'orderNo' ? 'order_no' : 'keterangan';
      const { error } = await supabase
        .from('saved_coil_input')
        .update({ [dbField]: value })
        .eq('session_id', sessionId);
        
      if (error) {
        console.error(`Error updating ${field}:`, error);
        // We don't show an alert here to avoid interrupting the user, but we log it
      }
    } catch (err) {
      console.error(`Failed to update ${field}:`, err);
    }
  };

  const fetchTodaySummary = async () => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const [coilData, slitingData] = await Promise.all([
        supabase.from('saved_coil_input').select('*').eq('save_date', today),
        supabase.from('saved_sliting_combination').select('*').eq('save_date', today)
      ]);

      if (coilData.error) throw coilData.error;
      if (slitingData.error) throw slitingData.error;

      const sessions = groupDataBySession(coilData.data || [], slitingData.data || []);
      
      // Initialize tableInputs with data from database
      const initialInputs: Record<string, { orderNo: string, keterangan: string }> = {};
      sessions.forEach(session => {
        // Assuming the first coil in the session has the order_no and keterangan
        const firstCoil = session.coils[0] as any;
        if (firstCoil) {
          initialInputs[session.session_id] = {
            orderNo: firstCoil.order_no || '',
            keterangan: firstCoil.keterangan || ''
          };
        }
      });
      setTableInputs(initialInputs);

      // Sort sessions by time (extracted from session_id if it's Date.now())
      const sortedSessions = sessions.sort((a, b) => {
        const timeA = parseInt(a.session_id.split('-')[0]);
        const timeB = parseInt(b.session_id.split('-')[0]);
        return timeA - timeB; // Oldest first
      });

      setTodaySummary(sortedSessions);
    } catch (err) {
      console.error("Error fetching today summary:", err);
    }
  };

  const [allDataForCalculation, setAllDataForCalculation] = useState<{
    sos: any[],
    loos: any[],
    stocks: any[],
    forecasts: any[]
  }>({ sos: [], loos: [], stocks: [], forecasts: [] });

  const customerSpecsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    rawMaterials.forEach(item => {
      if (item.customer && item.spec) {
        if (!map.has(item.customer)) {
          map.set(item.customer, new Set());
        }
        map.get(item.customer)!.add(item.spec);
      }
    });
    return map;
  }, [rawMaterials]);

  const customerDimensionsMap = useMemo(() => {
    const map = new Map<string, { d1: Set<number>, d2: Set<number>, dia: Set<number> }>();
    rawMaterials.forEach(item => {
      const cust = item.customer || '';
      const spec = item.spec || '';
      
      const keys = [
        cust, // Index by customer only
        spec, // Index by spec only
        `${cust}|${spec}` // Index by both
      ];

      keys.forEach(key => {
        if (key) {
          if (!map.has(key)) {
            map.set(key, { d1: new Set(), d2: new Set(), dia: new Set() });
          }
          const entry = map.get(key)!;
          if (item.d1) entry.d1.add(item.d1);
          if (item.d2) entry.d2.add(item.d2);
          if (item.dia) entry.dia.add(item.dia);
        }
      });
    });
    return map;
  }, [rawMaterials]);

  const getDimensionOptions = useCallback((row: SlitingRow, field: 'd1' | 'd2' | 'dia') => {
    const cust = row.customer || '';
    const spec = row.pipeSpec || '';
    const key = cust && spec ? `${cust}|${spec}` : (cust || spec || '');
    
    if (key && customerDimensionsMap.has(key)) {
      const entry = customerDimensionsMap.get(key)!;
      return Array.from(entry[field]).sort((a: number, b: number) => a - b);
    }
    
    // Fallback to all rawMaterials if no customer/spec or no match in map
    const values = Array.from(new Set(rawMaterials.map(m => m[field === 'dia' ? 'dia' : field]).filter(v => v !== null && v !== undefined))) as number[];
    return values.sort((a: number, b: number) => a - b);
  }, [customerDimensionsMap, rawMaterials]);

  const initialSlitingRows = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    customer: '',
    pipeSpec: '',
    d1: '',
    d2: '',
    dia: '',
    thick: '',
    stripWidth: '',
    stripRequirement: '',
    lines: '',
    stripWeight: '',
    totalStripWeight: '',
    currentStock: '',
    avgOrderMonth: '',
    avgOrderMonth6: '',
    avgOrderMonth12: '',
    status: '',
  }));

  const initialCoilRows = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    kodeMaterial: '',
    coilSpec: '',
    batchNo: '',
    thick: '',
    width: '',
    qty: '',
    coilWeight: '',
    heatNo: '',
    coilManufactur: '',
  }));

  const [rows, setRows] = useState<SlitingRow[]>(initialSlitingRows);
  const [coilRows, setCoilRows] = useState<CoilInputRow[]>(initialCoilRows);

  const handleAddCoilRow = () => {
    setCoilRows(prev => [
      ...prev,
      {
        id: prev.length > 0 ? Math.max(...prev.map(r => r.id)) + 1 : 1,
        kodeMaterial: '',
        coilSpec: '',
        batchNo: '',
        thick: '',
        width: '',
        qty: '',
        coilWeight: '',
        heatNo: '',
        coilManufactur: '',
      }
    ]);
  };

  const handleAddRow = () => {
    const newId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    const firstRow = rows[0];
    
    // Create new row with values from first row
    const newRow: SlitingRow = {
      id: newId,
      customer: firstRow?.customer || '',
      pipeSpec: firstRow?.pipeSpec || '',
      d1: firstRow?.d1 || '',
      d2: firstRow?.d2 || '',
      dia: firstRow?.dia || '',
      thick: firstRow?.thick || '',
      stripWidth: firstRow?.stripWidth || '',
      stripRequirement: firstRow?.stripRequirement || '',
      lines: '',
      stripWeight: '',
      totalStripWeight: '',
      currentStock: '',
      avgOrderMonth: '',
      avgOrderMonth6: '',
      avgOrderMonth12: '',
      status: '',
    };

    setRows([...rows, newRow]);
  };

  const totalCoilWeight = useMemo(() => {
    const total = coilRows.reduce((sum, row) => {
      const qty = parseIndo(row.qty) || 1;
      return sum + (parseIndo(row.coilWeight) * qty);
    }, 0);
    return total > 0 ? formatIndo(total) : '';
  }, [coilRows]);

  const masterCoilWidth = useMemo(() => {
    const rowWithWidth = coilRows.find(row => parseIndo(row.width) > 0);
    return rowWithWidth ? rowWithWidth.width : '';
  }, [coilRows]);

  const masterCoilThick = useMemo(() => {
    const rowWithThick = coilRows.find(row => parseIndo(row.thick) > 0);
    return rowWithThick ? rowWithThick.thick : '';
  }, [coilRows]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [matData, stripData, stockData, sos, loos, stocks, forecasts, avgOrders] = await Promise.all([
          fetchAllRows('material_master', 'customer,spec,d1,d2,dia,thick,act_thick,berat_per_pcs,lebar_strip,spec_strip,alternative_spec_strip,kode_st,kode_lt'),
          fetchAllRows('master_lebar_strip', 'spec,d1,d2,dia,thick,strip_width'),
          fetchAllRows('stock_strip', 'lebar_strip,tebal_strip,spec_strip,qty_kg'),
          fetchAllRows('sales_orders', 'kode_st,customer,qty_order_pcs,qty_order_kg'),
          fetchAllRows('loo_data', 'kode_st,customer,sisa_loo_pcs,sisa_order_pcs,sisa_loo_kg,sisa_order_kg'),
          fetchAllRows('stocks', 'kode_material,wip_lt_pcs,wip_st_pcs,fg_lt_pcs'),
          fetchAllRows('forecasts', 'kode_st,customer,qty_pcs,qty_forecast_kg'),
          fetchAllRows('average_order', 'spec,d1,d2,dia,thick,avg_order_month_3,avg_order_month_6,avg_order_month_12')
        ]);
        
        setRawMaterials(matData);
        setAverageOrders(avgOrders);
        setStockStrips(stockData);
        setAllDataForCalculation({ sos, loos, stocks, forecasts });

        // Pre-process sos, loos, forecasts into maps for faster lookup
        const soMap = new Map<string, any[]>();
        (sos || []).forEach((s: any) => {
          const key = `${(s.kode_st || '').trim().toLowerCase()}|${(s.customer || '').trim().toLowerCase()}`;
          if (!soMap.has(key)) soMap.set(key, []);
          soMap.get(key)!.push(s);
        });

        const looMap = new Map<string, any[]>();
        (loos || []).forEach((l: any) => {
          const key = `${(l.kode_st || '').trim().toLowerCase()}|${(l.customer || '').trim().toLowerCase()}`;
          if (!looMap.has(key)) looMap.set(key, []);
          looMap.get(key)!.push(l);
        });

        const forecastMap = new Map<string, any[]>();
        (forecasts || []).forEach((f: any) => {
          const key = `${(f.kode_st || '').trim().toLowerCase()}|${(f.customer || '').trim().toLowerCase()}`;
          if (!forecastMap.has(key)) forecastMap.set(key, []);
          forecastMap.get(key)!.push(f);
        });

        // Calculate Strip Requirements (Net Requirement) using RawMaterial logic
        const currentDay = new Date().getDate();
        const groupMap = new Map<string, any>();

        matData.forEach((m: any) => {
          const spec = m.spec || 'Unknown Spec';
          const d1 = m.d1 || 0;
          const d2 = m.d2 || 0;
          const dia = m.dia || 0;
          const actThick = m.act_thick || 0;
          const groupKey = `${spec}|${d1}|${d2}|${dia}|${actThick}`;

          const kodeST = m.kode_st;
          const customer = m.customer;
          const beratPerPcs = m.berat_per_pcs || 0;
          const lookupKey = `${(kodeST || '').trim().toLowerCase()}|${(customer || '').trim().toLowerCase()}`;

          // Order
          const soData = soMap.get(lookupKey) || [];
          const orderPcs = soData.reduce((sum: number, s: any) => sum + (s.qty_order_pcs || 0), 0);
          const orderKg = soData.reduce((sum: number, s: any) => sum + (s.qty_order_kg || ((s.qty_order_pcs || 0) * beratPerPcs)), 0);

          // LOO & Sisa Order
          const looData = looMap.get(lookupKey) || [];
          const looPcs = looData.reduce((sum: number, l: any) => sum + (l.sisa_loo_pcs || 0), 0);
          const looKg = looData.reduce((sum: number, l: any) => sum + (l.sisa_loo_kg || ((l.sisa_loo_pcs || 0) * beratPerPcs)), 0);
          
          const sisaOrderPcs = looData.reduce((sum: number, l: any) => sum + (l.sisa_order_pcs || 0), 0);
          const sisaOrderKg = looData.reduce((sum: number, l: any) => sum + (l.sisa_order_kg || ((l.sisa_order_pcs || 0) * beratPerPcs)), 0);

          // Forecast
          const forecastData = forecastMap.get(lookupKey) || [];
          const forecastPcs = forecastData.reduce((sum: number, f: any) => sum + (f.qty_pcs || 0), 0);
          const forecastKg = forecastData.reduce((sum: number, f: any) => sum + (f.qty_forecast_kg || ((f.qty_pcs || 0) * beratPerPcs)), 0);

          // Requirement calculation logic
          let requirementKg = 0;
          if (currentDay >= 1 && currentDay <= 15) {
            requirementKg = sisaOrderKg + looKg + Math.max(0, forecastKg - orderKg);
          } else {
            requirementKg = sisaOrderKg + looKg;
          }

          if (!groupMap.has(groupKey)) {
            groupMap.set(groupKey, {
              total_requirement_kg: 0,
              wip_lt_kg: 0,
              wip_kg: 0,
              fg_kg: 0,
              total_stock_strip_kg: 0,
              related_lts: new Set<string>(),
              related_lebar_strips: new Set<number>(),
              related_tebal_strips: new Set<number>(),
              related_spec_strips: new Set<string>()
            });
          }

          const entry = groupMap.get(groupKey);
          entry.total_requirement_kg += requirementKg;
          
          if (m.kode_lt) entry.related_lts.add(m.kode_lt);
          if (m.lebar_strip) entry.related_lebar_strips.add(Number(m.lebar_strip));
          if (m.act_thick) entry.related_tebal_strips.add(Number(m.act_thick));
          if (m.thick) entry.related_tebal_strips.add(Number(m.thick));
          if (m.spec_strip) entry.related_spec_strips.add(m.spec_strip.trim().toLowerCase());
          if (m.alternative_spec_strip) {
            m.alternative_spec_strip.split(',').forEach((a: string) => entry.related_spec_strips.add(a.trim().toLowerCase()));
          }
        });

        const calculatedRequirements = new Map<string, number>();

        groupMap.forEach((entry, groupKey) => {
          let totalWipLtKg = 0;
          let totalWipKg = 0;
          let totalFgKg = 0;
          
          entry.related_lts.forEach((kodeLT: string) => {
            const stokDataLT = (stocks || []).find((s: any) => s.kode_material === kodeLT);
            if (stokDataLT) {
              const ltMaster = matData.find((m: any) => m.kode_st === kodeLT);
              const ltWeight = ltMaster?.berat_per_pcs || 1;
              totalWipLtKg += (stokDataLT.wip_lt_pcs || 0) * ltWeight;
              totalWipKg += (stokDataLT.wip_st_pcs || 0) * ltWeight;
              totalFgKg += (stokDataLT.fg_lt_pcs || 0) * ltWeight;
            }
          });

          const stockStripData = (stockData || []).filter((s: any) => {
            const sLebar = Number(s.lebar_strip) || 0;
            const sTebal = Number(s.tebal_strip) || 0;
            const sSpec = (s.spec_strip || '').trim().toLowerCase();
            return entry.related_lebar_strips.has(sLebar) && entry.related_tebal_strips.has(sTebal) && entry.related_spec_strips.has(sSpec);
          });
          const totalStockStripKg = stockStripData.reduce((sum: number, s: any) => sum + (Number(s.qty_kg) || 0), 0);

          const netRequirement = Math.max(0, entry.total_requirement_kg - totalWipLtKg - totalWipKg - totalFgKg - totalStockStripKg);
          calculatedRequirements.set(groupKey, netRequirement);
        });

        setStripRequirements(calculatedRequirements);

        // Extract unique customers
        const uniqueCustomers = Array.from(new Set(matData.map((m: any) => m.customer).filter(Boolean))) as string[];
        setCustomers(uniqueCustomers.sort());

        // Group dimensions by spec
        const specsMap = new Map<string, { d1: Set<number>, d2: Set<number>, dia: Set<number>, thick: Set<number> }>();
        
        matData.forEach((item: any) => {
          if (!item.spec) return;
          
          if (!specsMap.has(item.spec)) {
            specsMap.set(item.spec, {
              d1: new Set(),
              d2: new Set(),
              dia: new Set(),
              thick: new Set()
            });
          }
          
          const entry = specsMap.get(item.spec)!;
          if (item.d1) entry.d1.add(item.d1);
          if (item.d2) entry.d2.add(item.d2);
          if (item.dia) entry.dia.add(item.dia);
          if (item.act_thick) entry.thick.add(item.act_thick);
        });
        
        const formattedSpecs: MaterialSpec[] = Array.from(specsMap.entries()).map(([spec, values]) => ({
          spec,
          d1: Array.from(values.d1).sort((a, b) => a - b),
          d2: Array.from(values.d2).sort((a, b) => a - b),
          dia: Array.from(values.dia).sort((a, b) => a - b),
          thick: Array.from(values.thick).sort((a, b) => a - b),
        }));
        
        setMaterialSpecs(formattedSpecs.sort((a, b) => a.spec.localeCompare(b.spec)));
        setLebarStrips(stripData.map((s: any) => ({
          spec: (s.spec || '').trim(),
          d1: Number(s.d1) || 0,
          d2: Number(s.d2) || 0,
          dia: Number(s.dia) || 0,
          thick: Number(s.thick) || 0,
          strip_width: Number(s.strip_width) || 0
        })));

        // Fetch today summary
        fetchTodaySummary();
      } catch (err) {
        console.error("Error loading data:", err);
      } finally {
        setLoadingSpecs(false);
      }
    };
    loadData();
  }, [refreshKey]);
  const rawMaterialLookup = useMemo(() => {
    const map = new Map<string, RawMaterialMaster[]>();
    rawMaterials.forEach(m => {
      const key = `${m.spec}|${m.act_thick}|${m.d1}|${m.d2}|${m.dia}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [rawMaterials]);

  const stockStripLookup = useMemo(() => {
    const map = new Map<string, number>();
    stockStrips.forEach(s => {
      const key = `${s.lebar_strip}|${s.tebal_strip}|${s.spec_strip.trim().toLowerCase()}`;
      map.set(key, (map.get(key) || 0) + (Number(s.qty_kg) || 0));
    });
    return map;
  }, [stockStrips]);

  const averageOrderLookup = useMemo(() => {
    const map = new Map<string, any>();
    averageOrders.forEach(a => {
      const key = `${(a.spec || '').trim().toLowerCase()}|${parseDBNumber(a.thick)}|${parseDBNumber(a.d1)}|${parseDBNumber(a.d2)}|${parseDBNumber(a.dia)}`;
      map.set(key, a);
    });
    return map;
  }, [averageOrders]);

  const calculateRowMetrics = useCallback((
    row: SlitingRow, 
    cWidth: string, 
    cWeight: string, 
    cThick: string,
    prevRow?: SlitingRow,
    isFirstRow: boolean = false
  ): SlitingRow => {
    const cw = parseIndo(cWidth);
    const cwt = parseIndo(cWeight);
    
    let updatedRow = { ...row };

    const d1Val = parseIndo(updatedRow.d1);
    const d2Val = parseIndo(updatedRow.d2);
    const diaVal = parseIndo(updatedRow.dia);
    const hasDimensions = (d1Val > 0 && d2Val > 0) || diaVal > 0;

    if (isFirstRow) {
      // Sync thickness from coil input if available for the first row
      if (cThick) {
        updatedRow.thick = cThick;
      }
    } else {
      // For subsequent rows, auto-fill from the row above if dimensions are filled
      if (hasDimensions) {
        if (prevRow) {
          if (!updatedRow.pipeSpec) updatedRow.pipeSpec = prevRow.pipeSpec;
          if (!updatedRow.thick) updatedRow.thick = prevRow.thick;
        }
      } else {
        // If dimensions are not filled, clear the auto-filled values
        updatedRow.pipeSpec = '';
        updatedRow.thick = '';
      }
    }

    const thickVal = parseIndo(updatedRow.thick);

    // Auto-fill Strip Width logic
    if (thickVal > 0 && hasDimensions) {
      const lookupSpec = updatedRow.pipeSpec === 'SUS409L' ? 'SUS409L' : '';
      const match = lebarStrips.find(s => 
        s.spec === lookupSpec &&
        s.thick === thickVal &&
        ((d1Val > 0 && d2Val > 0 && s.d1 === d1Val && s.d2 === d2Val) || 
         (diaVal > 0 && s.dia === diaVal))
      );
      
      if (match) {
        updatedRow.stripWidth = formatIndo(match.strip_width);
      }
    }

    const sw = parseIndo(updatedRow.stripWidth);

    // Auto-fill Strip Requirement
    if (updatedRow.pipeSpec && thickVal > 0 && (d1Val > 0 || diaVal > 0)) {
      const groupKey = `${updatedRow.pipeSpec}|${d1Val}|${d2Val}|${diaVal}|${thickVal}`;
      const netReq = stripRequirements.get(groupKey);
      
      if (netReq !== undefined) {
        updatedRow.stripRequirement = formatIndo(netReq);
      } else {
        updatedRow.stripRequirement = '';
      }
    } else {
      updatedRow.stripRequirement = '';
    }

    const lines = parseIndo(updatedRow.lines);

    // Weight Calculations
    if (cw > 0 && cwt > 0 && sw > 0) {
      const singleWeight = (sw / cw) * cwt;
      const totalWeight = lines * singleWeight;
      updatedRow.stripWeight = formatIndo(singleWeight);
      updatedRow.totalStripWeight = formatIndo(totalWeight);
    } else {
      updatedRow.stripWeight = '';
      updatedRow.totalStripWeight = '';
    }

    // Stock Calculation
    const stripWidthVal = parseIndo(updatedRow.stripWidth);

    if (updatedRow.pipeSpec && thickVal > 0 && stripWidthVal > 0) {
      // Find all matching material master entries to get all possible spec_strips and alternatives
      const lookupKey = `${updatedRow.pipeSpec}|${thickVal}|${d1Val}|${d2Val}|${diaVal}`;
      const matches = rawMaterialLookup.get(lookupKey) || [];

      if (matches.length > 0) {
        const allowedSpecs = new Set<string>();
        matches.forEach(m => {
          if (m.spec_strip) allowedSpecs.add(m.spec_strip.trim().toLowerCase());
          if (m.alternative_spec_strip) {
            m.alternative_spec_strip.split(',').forEach(s => allowedSpecs.add(s.trim().toLowerCase()));
          }
        });

        // Sum stock from stock_strip using lookup
        let totalStock = 0;
        allowedSpecs.forEach(spec => {
          const stockKey = `${stripWidthVal}|${thickVal}|${spec}`;
          totalStock += stockStripLookup.get(stockKey) || 0;
        });

        updatedRow.currentStock = formatIndo(totalStock);
      } else {
        updatedRow.currentStock = '';
      }
    } else {
      updatedRow.currentStock = '';
    }

    // Average Order Calculation
    if (updatedRow.pipeSpec && thickVal > 0 && hasDimensions) {
      const lookupKey = `${updatedRow.pipeSpec.trim().toLowerCase()}|${thickVal}|${d1Val}|${d2Val}|${diaVal}`;
      const matchAvg = averageOrderLookup.get(lookupKey);

      if (matchAvg) {
        updatedRow.avgOrderMonth = matchAvg.avg_order_month_3 != null ? formatIndo(matchAvg.avg_order_month_3) : '';
        updatedRow.avgOrderMonth6 = matchAvg.avg_order_month_6 != null ? formatIndo(matchAvg.avg_order_month_6) : '';
        updatedRow.avgOrderMonth12 = matchAvg.avg_order_month_12 != null ? formatIndo(matchAvg.avg_order_month_12) : '';
      } else {
        updatedRow.avgOrderMonth = '';
        updatedRow.avgOrderMonth6 = '';
        updatedRow.avgOrderMonth12 = '';
      }
    } else {
      updatedRow.avgOrderMonth = '';
      updatedRow.avgOrderMonth6 = '';
      updatedRow.avgOrderMonth12 = '';
    }

    // Status Calculation
    const totalWeight = parseIndo(updatedRow.totalStripWeight) + parseIndo(updatedRow.currentStock);
    const avg3 = parseIndo(updatedRow.avgOrderMonth);
    const avg12 = parseIndo(updatedRow.avgOrderMonth12);
    
    if (updatedRow.pipeSpec && hasDimensions && (totalWeight > 0 || avg3 > 0 || avg12 > 0)) {
      if (totalWeight < avg3) {
        updatedRow.status = 'Green Flag';
      } else if (totalWeight < avg12) {
        updatedRow.status = 'Yellow Flag';
      } else {
        updatedRow.status = 'Red Flag';
      }
    } else {
      updatedRow.status = '';
    }

    return updatedRow;
  }, [lebarStrips, stripRequirements, rawMaterialLookup, stockStripLookup, averageOrderLookup]);

  const handleInputChange = useCallback((id: number, field: keyof SlitingRow, value: string) => {
    setRows(prev => {
      // Find the first row to use its values for propagation
      const firstRow = prev[0];
      const isFirstRow = id === (firstRow?.id || 1);
      const shouldPropagate = isFirstRow && (field === 'pipeSpec');

      let newRows = prev.map(row => {
        if (row.id === id || shouldPropagate) {
          let updatedRow = { ...row, [field]: value };
          
          // Auto-fill dimensions if spec is selected or changed via propagation
          if (field === 'pipeSpec') {
            if (!value) {
              // Clear dimensions if spec is cleared
              updatedRow.d1 = '';
              updatedRow.d2 = '';
              updatedRow.dia = '';
              updatedRow.stripWidth = '';
            } else {
              const matchedSpec = materialSpecs.find(s => s.spec === value);
              if (matchedSpec) {
                // If there's only one unique value for a dimension, auto-fill it
                if (matchedSpec.d1.length === 1) updatedRow.d1 = formatIndo(matchedSpec.d1[0]);
                if (matchedSpec.d2.length === 1) updatedRow.d2 = formatIndo(matchedSpec.d2[0]);
                if (matchedSpec.dia.length === 1) updatedRow.dia = formatIndo(matchedSpec.dia[0]);
              }
            }
          }
          return updatedRow;
        }
        return row;
      });

      // Recalculate metrics sequentially to allow auto-fill from previous rows
      for (let i = 0; i < newRows.length; i++) {
        newRows[i] = calculateRowMetrics(
          newRows[i], 
          masterCoilWidth, 
          totalCoilWeight, 
          masterCoilThick,
          i > 0 ? newRows[i - 1] : undefined,
          i === 0
        );
      }

      return newRows;
    });
  }, [masterCoilWidth, totalCoilWeight, masterCoilThick, calculateRowMetrics, materialSpecs]);

  const handleCoilInputChange = (id: number, field: keyof CoilInputRow, value: string) => {
    setCoilRows(prev => prev.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleCoilPaste = (e: React.ClipboardEvent, startRowId: number, startField: keyof CoilInputRow) => {
    e.preventDefault();
    const clipboardData = e.clipboardData.getData('text');
    if (!clipboardData) return;

    const rows_data = clipboardData.split(/\r?\n/).filter(row => row.trim() !== '');
    
    const fields: (keyof CoilInputRow)[] = [
      'kodeMaterial', 'coilSpec', 'batchNo', 'thick', 'width', 'qty', 'coilWeight', 'heatNo', 'coilManufactur'
    ];
    
    const startFieldIndex = fields.indexOf(startField);
    if (startFieldIndex === -1) return;

    setCoilRows(prev => {
      const newCoilRows = [...prev];
      const startRowIndex = newCoilRows.findIndex(r => r.id === startRowId);
      if (startRowIndex === -1) return prev;

      rows_data.forEach((rowText, rowIndex) => {
        const targetRowIndex = startRowIndex + rowIndex;
        
        if (targetRowIndex >= newCoilRows.length) {
           newCoilRows.push({
             id: newCoilRows.length + 1,
             kodeMaterial: '',
             coilSpec: '',
             batchNo: '',
             thick: '',
             width: '',
             qty: '',
             coilWeight: '',
             heatNo: '',
             coilManufactur: '',
           });
        }

        const columns = rowText.split('\t');
        columns.forEach((colText, colIndex) => {
          const targetFieldIndex = startFieldIndex + colIndex;
          if (targetFieldIndex >= fields.length) return;

          const field = fields[targetFieldIndex];
          let value = colText.trim();
          
          // Apply formatting for numeric fields
          if (['thick', 'width', 'coilWeight'].includes(field)) {
            value = formatIndo(value);
          } else if (field === 'qty') {
            value = formatIndo(value, 0);
          }

          newCoilRows[targetRowIndex] = {
            ...newCoilRows[targetRowIndex],
            [field]: value
          };
        });
      });
      return newCoilRows;
    });
  };

  // Recalculate all rows when coil width, weight, thick, or base data changes
  useEffect(() => {
    setRows(prev => {
      let newRows = [...prev];
      for (let i = 0; i < newRows.length; i++) {
        newRows[i] = calculateRowMetrics(
          newRows[i], 
          masterCoilWidth, 
          totalCoilWeight, 
          masterCoilThick,
          i > 0 ? newRows[i - 1] : undefined,
          i === 0
        );
      }
      return newRows;
    });
  }, [masterCoilWidth, totalCoilWeight, masterCoilThick, rawMaterials, stockStrips, lebarStrips, averageOrders]);

  // Auto-calculate Afval
  useEffect(() => {
    const cw = parseIndo(masterCoilWidth);
    if (cw > 0) {
      const totalSw = rows.reduce((acc, row) => acc + (parseIndo(row.stripWidth) * parseIndo(row.lines)), 0);
      const mm = cw - totalSw;
      const percent = (mm / cw) * 100;
      setAfvalMm(formatIndo(mm));
      setAfvalPercent(formatIndo(percent, 2) + ' %');
    } else {
      setAfvalMm('');
      setAfvalPercent('');
    }
  }, [masterCoilWidth, rows]);

  const handleSave = async () => {
    const activeCoilRows = coilRows.filter(r => 
      (r.kodeMaterial && r.kodeMaterial.trim() !== '') || 
      (r.coilSpec && r.coilSpec.trim() !== '') || 
      (r.batchNo && r.batchNo.trim() !== '') || 
      parseIndo(r.thick) > 0 || 
      parseIndo(r.width) > 0 || 
      parseIndo(r.qty) > 0 || 
      parseIndo(r.coilWeight) > 0
    );
    const activeSlitingRows = rows.filter(r => 
      (r.customer && r.customer.trim() !== '') || 
      (r.pipeSpec && r.pipeSpec.trim() !== '') || 
      parseIndo(r.d1) > 0 || 
      parseIndo(r.d2) > 0 || 
      parseIndo(r.dia) > 0 || 
      parseIndo(r.stripWidth) > 0 || 
      parseIndo(r.lines) > 0
    );

    if (activeCoilRows.length === 0 && activeSlitingRows.length === 0) {
      setAlertType('error');
      setAlertMessage('Tidak ada data untuk disimpan.');
      return;
    }

    if (!workCenter) {
      setAlertType('error');
      setAlertMessage('Pilih Work Center terlebih dahulu.');
      return;
    }

    const warnings: string[] = [];
    const hasRedFlag = activeSlitingRows.some(r => r.status === 'Red Flag');
    const afvalVal = parseIndo(afvalPercent);

    if (hasRedFlag) {
      warnings.push('Terdapat item dengan status Red Flag (Total Strip Weight + Current Stock melebihi rata-rata order 12 bulan).');
    }
    if (afvalVal > 1) {
      warnings.push(`Persentase Afval (${afvalPercent}%) melebihi batas normal (1%).`);
    }

    if (warnings.length > 0) {
      setActiveCoilRowsToSave(activeCoilRows);
      setActiveSlitingRowsToSave(activeSlitingRows);
      setConfirmWarnings(warnings);
      setShowConfirmModal(true);
      return;
    }

    await executeSave(activeCoilRows, activeSlitingRows);
  };

  const executeSave = async (coils: CoilInputRow[], slitings: SlitingRow[]) => {
    setIsSaving(true);
    try {
      const sessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const saveDate = new Date().toISOString().split('T')[0];

      const coilDataToSave = coils.map(r => ({
        session_id: sessionId,
        save_date: saveDate,
        work_center: workCenter,
        kode_material: r.kodeMaterial,
        coil_spec: r.coilSpec,
        batch_no: r.batchNo,
        thick: parseIndo(r.thick),
        width: parseIndo(r.width),
        qty: parseIndo(r.qty),
        coil_weight: parseIndo(r.coilWeight),
        heat_no: r.heatNo,
        coil_manufactur: r.coilManufactur
      }));

      const slitingDataToSave = slitings.map(r => ({
        session_id: sessionId,
        save_date: saveDate,
        work_center: workCenter,
        customer: r.customer,
        pipe_spec: r.pipeSpec,
        d1: parseIndo(r.d1),
        d2: parseIndo(r.d2),
        dia: parseIndo(r.dia),
        thick: parseIndo(r.thick),
        strip_width: parseIndo(r.stripWidth),
        net_requirement: parseIndo(r.stripRequirement),
        lines: parseIndo(r.lines),
        strip_weight: parseIndo(r.stripWeight),
        total_strip_weight: parseIndo(r.totalStripWeight),
        current_stock: parseIndo(r.currentStock),
        avg_order_month: parseIndo(r.avgOrderMonth),
        avg_order_month_6: parseIndo(r.avgOrderMonth6),
        avg_order_month_12: parseIndo(r.avgOrderMonth12),
        status: r.status
      }));

      if (coilDataToSave.length > 0) {
        await insertInChunks('saved_coil_input', coilDataToSave);
      }
      if (slitingDataToSave.length > 0) {
        await insertInChunks('saved_sliting_combination', slitingDataToSave);
      }

      setAlertType('success');
      setAlertMessage('Data berhasil disimpan!');
      setRows(initialSlitingRows);
      setCoilRows(initialCoilRows);
      setWorkCenter(''); // Reset work center
      fetchTodaySummary();
    } catch (error: any) {
      console.error('Error saving data:', error);
      setAlertType('error');
      setAlertMessage(`Gagal menyimpan data: ${error.message || 'Error tidak diketahui'}`);
    } finally {
      setIsSaving(false);
      setShowConfirmModal(false);
    }
  };

  const handleExport = async () => {
    if (!exportDate) {
      setAlertType('error');
      setAlertMessage('Pilih tanggal terlebih dahulu.');
      return;
    }

    setIsExporting(true);
    try {
      const { data: coilData, error: coilError } = await supabase
        .from('saved_coil_input')
        .select('*')
        .eq('save_date', exportDate);

      const { data: slitingData, error: slitingError } = await supabase
        .from('saved_sliting_combination')
        .select('*')
        .eq('save_date', exportDate);

      if (coilError || slitingError) {
        console.error('Export query error:', coilError || slitingError);
        throw coilError || slitingError;
      }

      if ((!coilData || coilData.length === 0) && (!slitingData || slitingData.length === 0)) {
        setAlertType('error');
        setAlertMessage('Tidak ada data pada tanggal tersebut.');
        return;
      }

      const wb = XLSX.utils.book_new();

      const sessions = groupDataBySession(coilData || [], slitingData || []);
      const exportRows: any[] = [];
      let no = 1;

      sessions.forEach(session => {
        const maxRows = Math.max(session.coils.length, session.sliting.length);
        const dateObj = new Date(session.save_date);
        const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;
        const inputs = tableInputs[session.session_id] || { orderNo: '', keterangan: '' };

        for (let i = 0; i < maxRows; i++) {
          const coil = session.coils[i];
          const sliting = session.sliting[i];

          let kodeStrip = '';
          if (sliting && sliting.strip_width > 0) {
            if (session.coils[0]?.kode_material) {
              kodeStrip = `C2${session.coils[0].kode_material.substring(2, 12)}+${(sliting.strip_width * 10).toString().padStart(5, '0')}`;
            } else {
              kodeStrip = `${sliting.pipe_spec}+${(sliting.strip_width * 10).toString().padStart(5, '0')}`;
            }
          }

          exportRows.push({
            'No': i === 0 ? no : '',
            'Tanggal': i === 0 ? formattedDate : '',
            'Work Center': i === 0 ? (session.work_center || '') : '',
            'Order No': i === 0 ? inputs.orderNo : '',
            'Kode Material': coil?.kode_material || '',
            'Coil Spec': coil?.coil_spec || '',
            'Batch No': coil?.batch_no || '',
            'Thick': coil && coil.thick > 0 ? coil.thick : '',
            'Width': coil && coil.width > 0 ? coil.width : '',
            'Qty': coil && coil.qty > 0 ? coil.qty : '',
            'Coil Weight': coil && coil.coil_weight > 0 ? coil.coil_weight : '',
            'Heat No': coil?.heat_no || '',
            'Coil Manufactur': coil?.coil_manufactur || '',
            'Strip Width': sliting && sliting.strip_width > 0 ? sliting.strip_width : '',
            'Lines': sliting && sliting.lines > 0 ? sliting.lines : '',
            'Customer': sliting?.customer || '',
            'Kode Strip': kodeStrip,
            'Total Strip Weight': sliting && sliting.total_strip_weight > 0 ? sliting.total_strip_weight : '',
            'Keterangan': i === 0 ? inputs.keterangan : ''
          });
        }
        no++;
      });

      const ws = XLSX.utils.json_to_sheet(exportRows);
      XLSX.utils.book_append_sheet(wb, ws, 'Data Simpan');

      XLSX.writeFile(wb, `Kombinasi_Sliting_${exportDate}.xlsx`);
    } catch (error: any) {
      console.error('Error exporting data:', error);
      setAlertType('error');
      setAlertMessage(`Gagal mengekspor data: ${error.message || 'Error tidak diketahui'}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="p-[10px] bg-[#FDFBF7] min-h-screen font-sans">
      {/* Top Action Bar */}
      <div className="mb-[10px] flex flex-wrap items-center justify-between gap-4 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            SIMPAN DATA
          </button>
        </div>

        <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2 px-2 text-gray-500">
            <Calendar className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-wider">Export by Date</span>
          </div>
          <input
            type="date"
            value={exportDate}
            onChange={(e) => setExportDate(e.target.value)}
            className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-gray-700"
          />
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg font-bold text-sm hover:bg-gray-900 transition-all active:scale-95 disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            EXPORT EXCEL
          </button>
        </div>
      </div>
      {/* Main Table */}
      <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-[10px]">
        <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-white text-xs font-black uppercase tracking-widest">Kombinasi Sliting</h2>
            <div className="flex items-center gap-3 ml-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Work Center:</span>
              <div className="flex bg-gray-900/80 p-1 rounded-lg border border-gray-700/50 h-8">
                <button
                  type="button"
                  onClick={() => setWorkCenter('SLIT-501')}
                  className={`px-4 py-0 flex items-center justify-center text-[11px] font-black tracking-wider rounded-md transition-all duration-200 ${
                    workCenter === 'SLIT-501' 
                      ? 'bg-blue-500 text-white shadow-md ring-1 ring-blue-400/50' 
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  }`}
                >
                  SLIT-501
                </button>
                <button
                  type="button"
                  onClick={() => setWorkCenter('SLIT-502')}
                  className={`px-4 py-0 flex items-center justify-center text-[11px] font-black tracking-wider rounded-md transition-all duration-200 ${
                    workCenter === 'SLIT-502' 
                      ? 'bg-blue-500 text-white shadow-md ring-1 ring-blue-400/50' 
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  }`}
                >
                  SLIT-502
                </button>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-white text-[10px] font-black uppercase tracking-widest opacity-70">Afval (mm):</span>
                <span className="text-red-400 text-xs font-black">{afvalMm}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white text-[10px] font-black uppercase tracking-widest opacity-70">Afval (%):</span>
                <span className="text-red-400 text-xs font-black">{afvalPercent}</span>
              </div>
            </div>
            <button
              onClick={handleAddRow}
              className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold text-[10px] hover:bg-emerald-700 transition-all active:scale-95"
            >
              <Plus className="w-3 h-3" />
              TAMBAH BARIS
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center w-12">No</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center min-w-[120px]">Customer</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center min-w-[150px]">Pipe Spec</th>
                <th colSpan={4} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Pipe Dimension</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Lines</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Strip Width</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Strip Weight</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Total Strip Weight</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Current Stock</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Strip Requirement</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Avg Order/Month<br/>(3 month)</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Avg Order/Month<br/>(6 month)</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Avg Order/Month<br/>(12 month)</th>
                <th rowSpan={2} className="border border-gray-200 p-1.5 font-black uppercase tracking-wider text-[9px] text-center">Status</th>
              </tr>
              <tr className="bg-gray-50 text-gray-600">
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center w-16">D1</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center w-16">D2</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center w-16">Dia</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center w-16">Thick</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {rows.map((row, index) => (
                <SlitingRowComponent
                  key={row.id}
                  row={row}
                  index={index}
                  customers={customers}
                  materialSpecs={materialSpecs}
                  customerSpecsMap={customerSpecsMap}
                  loadingSpecs={loadingSpecs}
                  handleInputChange={handleInputChange}
                  getDimensionOptions={getDimensionOptions}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Coil Input Table */}
      <div className="mb-[10px] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
          <h2 className="text-white text-xs font-black uppercase tracking-widest">Coil Input</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center w-12">No</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center">Kode Material</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center">Coil Spec</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center">Batch No</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center">Thick</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center">Width</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center">Qty</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center">Coil Weight</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center">Heat No</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-[9px] text-center">Coil Manufactur</th>
              </tr>
            </thead>
            <tbody>
              {coilRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="border border-gray-200 p-1 text-center bg-gray-50 font-bold text-gray-500">{row.id}</td>
                  <td className="border border-gray-200 p-0">
                    <input 
                      type="text" 
                      value={row.kodeMaterial} 
                      onChange={(e) => handleCoilInputChange(row.id, 'kodeMaterial', e.target.value)}
                      onPaste={(e) => handleCoilPaste(e, row.id, 'kodeMaterial')}
                      className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input 
                      type="text" 
                      value={row.coilSpec} 
                      onChange={(e) => handleCoilInputChange(row.id, 'coilSpec', e.target.value)}
                      onPaste={(e) => handleCoilPaste(e, row.id, 'coilSpec')}
                      className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input 
                      type="text" 
                      value={row.batchNo} 
                      onChange={(e) => handleCoilInputChange(row.id, 'batchNo', e.target.value)}
                      onPaste={(e) => handleCoilPaste(e, row.id, 'batchNo')}
                      className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input 
                      type="text" 
                      value={row.thick} 
                      onChange={(e) => handleCoilInputChange(row.id, 'thick', e.target.value)}
                      onBlur={(e) => handleCoilInputChange(row.id, 'thick', formatIndo(e.target.value))}
                      onPaste={(e) => handleCoilPaste(e, row.id, 'thick')}
                      className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input 
                      type="text" 
                      value={row.width} 
                      onChange={(e) => handleCoilInputChange(row.id, 'width', e.target.value)}
                      onBlur={(e) => handleCoilInputChange(row.id, 'width', formatIndo(e.target.value))}
                      onPaste={(e) => handleCoilPaste(e, row.id, 'width')}
                      className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input 
                      type="text" 
                      value={row.qty} 
                      onChange={(e) => handleCoilInputChange(row.id, 'qty', e.target.value)}
                      onBlur={(e) => handleCoilInputChange(row.id, 'qty', formatIndo(e.target.value, 0))}
                      onPaste={(e) => handleCoilPaste(e, row.id, 'qty')}
                      className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input 
                      type="text" 
                      value={row.coilWeight} 
                      onChange={(e) => handleCoilInputChange(row.id, 'coilWeight', e.target.value)}
                      onBlur={(e) => handleCoilInputChange(row.id, 'coilWeight', formatIndo(e.target.value))}
                      onPaste={(e) => handleCoilPaste(e, row.id, 'coilWeight')}
                      className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input 
                      type="text" 
                      value={row.heatNo} 
                      onChange={(e) => handleCoilInputChange(row.id, 'heatNo', e.target.value)}
                      onPaste={(e) => handleCoilPaste(e, row.id, 'heatNo')}
                      className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                    />
                  </td>
                  <td className="border border-gray-200 p-0">
                    <input 
                      type="text" 
                      value={row.coilManufactur} 
                      onChange={(e) => handleCoilInputChange(row.id, 'coilManufactur', e.target.value)}
                      onPaste={(e) => handleCoilPaste(e, row.id, 'coilManufactur')}
                      className="w-full h-full px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Today's Summary Table */}
      <div className="mt-8 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-[10px]">
        <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
          <h2 className="text-white text-xs font-black uppercase tracking-widest">Data Simpan Hari Ini</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-gray-100 text-gray-700">
                <th rowSpan={2} className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center w-10">No</th>
                <th rowSpan={2} className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center w-20">Tanggal</th>
                <th rowSpan={2} className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center w-20">Work Center</th>
                <th rowSpan={2} className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center w-20">Order No</th>
                <th colSpan={9} className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Data Material Coil</th>
                <th colSpan={5} className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Data Strip</th>
                <th rowSpan={2} className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Keterangan</th>
              </tr>
              <tr className="bg-gray-50 text-gray-600">
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Kode Material</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Coil Spec</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Batch No</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Thick</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Width</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Qty</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Coil Weight</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Heat No</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Coil Manufactur</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Strip Width</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Lines</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Customer</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Kode Strip</th>
                <th className="border border-gray-200 p-1 font-black uppercase tracking-wider text-center">Total Strip Weight</th>
              </tr>
            </thead>
            <tbody>
              {todaySummary.length === 0 ? (
                <tr>
                  <td colSpan={19} className="border border-gray-200 p-4 text-center text-gray-400 italic">Belum ada data yang disimpan hari ini.</td>
                </tr>
              ) : (
                todaySummary.map((session, sIdx) => {
                  const maxRows = Math.max(session.coils.length, session.sliting.length);
                  return Array.from({ length: maxRows }).map((_, rIdx) => {
                    const coil = session.coils[rIdx];
                    const sliting = session.sliting[rIdx];
                    const dateObj = new Date(session.save_date);
                    const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;

                    return (
                      <tr key={`${session.session_id}-${rIdx}`} className="hover:bg-gray-50 transition-colors">
                        {rIdx === 0 ? (
                          <>
                            <td rowSpan={maxRows} className="border border-gray-200 p-1 text-center font-bold bg-gray-50/50">{sIdx + 1}</td>
                            <td rowSpan={maxRows} className="border border-gray-200 p-1 text-center text-gray-500 bg-gray-50/50">{formattedDate}</td>
                            <td rowSpan={maxRows} className="border border-gray-200 p-1 text-center text-gray-500 bg-gray-50/50">{session.work_center || ''}</td>
                          </>
                        ) : null}
                        {rIdx === 0 ? (
                          <td rowSpan={maxRows} className="border border-gray-200 p-0 text-center">
                            <input 
                              type="text" 
                              value={tableInputs[session.session_id]?.orderNo || ''}
                              onChange={(e) => handleTableInputChange(session.session_id, 'orderNo', e.target.value)}
                              onBlur={(e) => handleTableInputBlur(session.session_id, 'orderNo', e.target.value)}
                              className="w-full h-full min-h-[30px] px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50"
                              placeholder="-"
                            />
                          </td>
                        ) : null}
                        
                        {/* Coil Data */}
                        <td className="border border-gray-200 p-1 text-center">{coil?.kode_material || ''}</td>
                        <td className="border border-gray-200 p-1 text-center">{coil?.coil_spec || ''}</td>
                        <td className="border border-gray-200 p-1 text-center">{coil?.batch_no || ''}</td>
                        <td className="border border-gray-200 p-1 text-center">{coil && coil.thick > 0 ? formatIndo(coil.thick) : ''}</td>
                        <td className="border border-gray-200 p-1 text-center">{coil && coil.width > 0 ? formatIndo(coil.width) : ''}</td>
                        <td className="border border-gray-200 p-1 text-center">{coil && coil.qty > 0 ? formatIndo(coil.qty, 0) : ''}</td>
                        <td className="border border-gray-200 p-1 text-center font-bold">{coil && coil.coil_weight > 0 ? formatIndo(coil.coil_weight) : ''}</td>
                        <td className="border border-gray-200 p-1 text-center">{coil?.heat_no || ''}</td>
                        <td className="border border-gray-200 p-1 text-center">{coil?.coil_manufactur || ''}</td>

                        {/* Sliting Data */}
                        <td className="border border-gray-200 p-1 text-center">{sliting && sliting.strip_width > 0 ? formatIndo(sliting.strip_width) : ''}</td>
                        <td className="border border-gray-200 p-1 text-center">{sliting && sliting.lines > 0 ? formatIndo(sliting.lines, 0) : ''}</td>
                        <td className="border border-gray-200 p-1 text-center">{sliting?.customer || ''}</td>
                        <td className="border border-gray-200 p-1 text-center">
                          {sliting && sliting.strip_width > 0 ? (
                            session.coils[0]?.kode_material 
                              ? `C2${session.coils[0].kode_material.substring(2, 12)}+${(sliting.strip_width * 10).toString().padStart(5, '0')}`
                              : `${sliting.pipe_spec}+${(sliting.strip_width * 10).toString().padStart(5, '0')}`
                          ) : ''}
                        </td>
                        <td className="border border-gray-200 p-1 text-center font-bold">{sliting && sliting.total_strip_weight > 0 ? formatIndo(sliting.total_strip_weight) : ''}</td>
                        
                        {rIdx === 0 ? (
                          <td rowSpan={maxRows} className="border border-gray-200 p-0 text-center">
                            <textarea
                              value={tableInputs[session.session_id]?.keterangan || ''}
                              onChange={(e) => handleTableInputChange(session.session_id, 'keterangan', e.target.value)}
                              onBlur={(e) => handleTableInputBlur(session.session_id, 'keterangan', e.target.value)}
                              className="w-full h-full min-h-[30px] px-1.5 py-1 text-center bg-transparent focus:outline-none focus:bg-emerald-50/50 resize-none"
                              placeholder="-"
                            />
                          </td>
                        ) : null}
                      </tr>
                    );
                  });
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-amber-500 px-6 py-4 flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-white" />
              <h3 className="text-white font-bold text-lg">Konfirmasi Penyimpanan</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 mb-4 font-medium">
                Sistem menemukan beberapa peringatan pada data Anda:
              </p>
              <ul className="space-y-3 mb-6">
                {confirmWarnings.map((warning, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 bg-amber-50 p-3 rounded-lg border border-amber-100">
                    <span className="text-amber-500 mt-0.5">•</span>
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-500 mb-6 italic">
                Apakah Anda yakin ingin tetap menyimpan data ini?
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  disabled={isSaving}
                >
                  BATAL
                </button>
                <button
                  onClick={() => executeSave(activeCoilRowsToSave, activeSlitingRowsToSave)}
                  className="flex items-center gap-2 px-6 py-2 bg-amber-500 text-white rounded-lg font-bold text-sm hover:bg-amber-600 transition-colors shadow-lg shadow-amber-200 active:scale-95 disabled:opacity-50"
                  disabled={isSaving}
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  TETAP SIMPAN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alert Modal */}
      {alertMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className={`px-6 py-4 flex items-center gap-3 ${alertType === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}>
              <AlertTriangle className="w-6 h-6 text-white" />
              <h3 className="text-white font-bold text-lg">
                {alertType === 'success' ? 'Berhasil' : 'Peringatan'}
              </h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 font-medium text-center">
                {alertMessage}
              </p>
              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setAlertMessage(null)}
                  className={`px-6 py-2 text-white rounded-lg font-bold text-sm transition-colors shadow-lg active:scale-95 ${
                    alertType === 'success' 
                      ? 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-200' 
                      : 'bg-red-500 hover:bg-red-600 shadow-red-200'
                  }`}
                >
                  TUTUP
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
