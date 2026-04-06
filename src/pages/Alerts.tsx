import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Download, AlertTriangle, X } from 'lucide-react';
import { fetchAllRows } from '../lib/supabase';
import { useRefresh } from '../contexts/RefreshContext';

export default function Alerts() {
  const [loading, setLoading] = useState(true);
  const [alertsData, setAlertsData] = useState<any[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'ST' | 'LT'>('ALL');
  
  // Column filters
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterWorkCenterST, setFilterWorkCenterST] = useState('');
  const [filterWorkCenterLT, setFilterWorkCenterLT] = useState('');
  const [filterSpec, setFilterSpec] = useState('');
  const [filterD1, setFilterD1] = useState('');
  const [filterD2, setFilterD2] = useState('');
  const [filterDia, setFilterDia] = useState('');
  const [filterThick, setFilterThick] = useState('');
  const [filterLength, setFilterLength] = useState('');
  const { refreshKey } = useRefresh();

  useEffect(() => {
    const fetchAlertsData = async () => {
      try {
        setLoading(true);
        
        const [
          materials,
          deliveries,
          stoks,
          sos,
          forecasts,
          loos
        ] = await Promise.all([
          fetchAllRows('material_master', 'kode_st,customer,kode_lt,alternative_kodes_st,alternative_kodes_lt,konversi_lt_ke_st,dimensi,spec,work_center_st,work_center_lt,d1,d2,dia,thick,length'),
          fetchAllRows('deliveries', 'kode_st,qty_delivery_pcs,tanggal_delivery'),
          fetchAllRows('stocks', 'kode_material,wip_st_pcs,fg_st_pcs,wip_lt_pcs'),
          fetchAllRows('sales_orders', 'kode_st,customer,qty_order_pcs'),
          fetchAllRows('forecasts', 'kode_st,customer,qty_pcs'),
          fetchAllRows('loo_data', 'kode_st,customer,sisa_order_pcs')
        ]);

        if (!materials || materials.length === 0) {
          setAlertsData([]);
          setLoading(false);
          return;
        }

        // Calculate avg delivery per day for each material
        const deliveryMap = new Map<string, { totalPcs: number, uniqueDays: Set<string> }>();
        
        deliveries.forEach((d: any) => {
          const dCode = (d.kode_st || '').trim().toLowerCase();
          if (!dCode) return;
          
          if (!deliveryMap.has(dCode)) {
            deliveryMap.set(dCode, { totalPcs: 0, uniqueDays: new Set() });
          }
          
          const entry = deliveryMap.get(dCode)!;
          entry.totalPcs += (d.qty_delivery_pcs || 0);
          if (d.tanggal_delivery) {
            entry.uniqueDays.add(d.tanggal_delivery);
          }
        });

        // Index demand data for O(1) lookup
        const soMap = new Map<string, number>();
        sos.forEach((s: any) => {
          const key = `${(s.kode_st || '').trim().toLowerCase()}|${(s.customer || '').trim().toLowerCase()}`;
          soMap.set(key, (soMap.get(key) || 0) + (s.qty_order_pcs || 0));
        });

        const forecastMap = new Map<string, number>();
        forecasts.forEach((f: any) => {
          const key = `${(f.kode_st || '').trim().toLowerCase()}|${(f.customer || '').trim().toLowerCase()}`;
          forecastMap.set(key, (forecastMap.get(key) || 0) + (f.qty_pcs || 0));
        });

        const looMap = new Map<string, number>();
        loos.forEach((l: any) => {
          const key = `${(l.kode_st || '').trim().toLowerCase()}|${(l.customer || '').trim().toLowerCase()}`;
          looMap.set(key, (looMap.get(key) || 0) + (l.sisa_order_pcs || 0));
        });

        const alertsList: any[] = [];

        materials.forEach((m: any) => {
          const kodeST = m.kode_st;
          if (!kodeST) return;

          const mST = kodeST.trim().toLowerCase();
          const mCustomer = (m.customer || '').trim().toLowerCase();
          const key = `${mST}|${mCustomer}`;

          const mLT = (m.kode_lt || '').trim().toLowerCase();
          const mAltST = (m.alternative_kodes_st || '').split(',').map((c: string) => c.trim().toLowerCase());
          const mAltLT = (m.alternative_kodes_lt || '').split(',').map((c: string) => c.trim().toLowerCase());
          
          let totalDeliveryPcs = 0;
          const uniqueDaysSet = new Set<string>();

          // Find all matching deliveries for this material
          deliveryMap.forEach((data, dCode) => {
            if (dCode === mST || dCode === mLT || mAltST.includes(dCode) || mAltLT.includes(dCode)) {
              totalDeliveryPcs += data.totalPcs;
              data.uniqueDays.forEach(day => uniqueDaysSet.add(day));
            }
          });

          const uniqueDays = uniqueDaysSet.size || 1;
          const avgDeliveryPerDay = totalDeliveryPcs / uniqueDays;

          // Check demand using indexed maps
          const orderPcs = soMap.get(key) || 0;
          const forecastPcs = forecastMap.get(key) || 0;
          const sisaOrderPcs = looMap.get(key) || 0;

          const hasDemand = orderPcs > 0 || forecastPcs > 0;

          if (hasDemand && avgDeliveryPerDay > 0) {
            const stokDataST = (stoks || []).find((s: any) => s.kode_material === kodeST) || { wip_st_pcs: 0, fg_st_pcs: 0, wip_lt_pcs: 0 };
            
            const konversiLTkeST = m.konversi_lt_ke_st || 0;
            const konversiKeSTPcs = (stokDataST.wip_lt_pcs || 0) * konversiLTkeST;
            
            const totalStockST = (stokDataST.wip_st_pcs || 0) + (stokDataST.fg_st_pcs || 0);
            const docST = totalStockST / avgDeliveryPerDay;
            
            const totalStockLT = totalStockST + konversiKeSTPcs;
            const docLT = totalStockLT / avgDeliveryPerDay;

            const balancePcs = totalStockLT - sisaOrderPcs;

            const isAlertST = docST < 1;
            const isAlertLT = docLT < 5;

            if (isAlertST || isAlertLT) {
              alertsList.push({
                kodeST: m.kode_st,
                kodeLT: m.kode_lt || '-',
                dimensi: m.dimensi || '-',
                spec: m.spec || '-',
                customer: m.customer || '-',
                workCenterST: m.work_center_st || '-',
                workCenterLT: m.work_center_lt || '-',
                d1: m.d1 || '',
                d2: m.d2 || '',
                dia: m.dia || '',
                thick: m.thick || '',
                length: m.length || '',
                sisaOrderPcs: sisaOrderPcs,
                avgDelivery: avgDeliveryPerDay,
                stokFG: stokDataST.fg_st_pcs || 0,
                stokWIP: stokDataST.wip_st_pcs || 0,
                stokWIPLT: stokDataST.wip_lt_pcs || 0,
                balancePcs: balancePcs,
                docST: docST,
                docLT: docLT,
                isAlertST,
                isAlertLT,
                alertType: isAlertST && isAlertLT ? 'ST & LT' : isAlertST ? 'ST' : 'LT'
              });
            }
          }
        });

        // Sort by DOC ST ascending
        alertsList.sort((a, b) => a.docST - b.docST);
        setAlertsData(alertsList);
      } catch (error) {
        console.error('Error fetching alerts data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAlertsData();
  }, [refreshKey]);

  const filteredData = alertsData.filter(item => {
    if (filterType === 'ST' && !item.isAlertST) return false;
    if (filterType === 'LT' && !item.isAlertLT) return false;
    
    return (
      (filterCustomer === '' || (item.customer || '').toLowerCase().includes(filterCustomer.toLowerCase())) &&
      (filterWorkCenterST === '' || (item.workCenterST || '').toLowerCase().includes(filterWorkCenterST.toLowerCase())) &&
      (filterWorkCenterLT === '' || (item.workCenterLT || '').toLowerCase().includes(filterWorkCenterLT.toLowerCase())) &&
      (filterSpec === '' || (item.spec || '').toLowerCase().includes(filterSpec.toLowerCase())) &&
      (filterD1 === '' || String(item.d1 || '').toLowerCase().includes(filterD1.toLowerCase())) &&
      (filterD2 === '' || String(item.d2 || '').toLowerCase().includes(filterD2.toLowerCase())) &&
      (filterDia === '' || String(item.dia || '').toLowerCase().includes(filterDia.toLowerCase())) &&
      (filterThick === '' || String(item.thick || '').toLowerCase().includes(filterThick.toLowerCase())) &&
      (filterLength === '' || String(item.length || '').toLowerCase().includes(filterLength.toLowerCase()))
    );
  });

  const getFilteredOptions = (field: string) => {
    return alertsData.filter(row => {
      if (filterType === 'ST' && !row.isAlertST) return false;
      if (filterType === 'LT' && !row.isAlertLT) return false;
      
      return (
        (field === 'customer' || filterCustomer === '' || (row.customer || '').toLowerCase().includes(filterCustomer.toLowerCase())) &&
        (field === 'workCenterST' || filterWorkCenterST === '' || (row.workCenterST || '').toLowerCase().includes(filterWorkCenterST.toLowerCase())) &&
        (field === 'workCenterLT' || filterWorkCenterLT === '' || (row.workCenterLT || '').toLowerCase().includes(filterWorkCenterLT.toLowerCase())) &&
        (field === 'spec' || filterSpec === '' || (row.spec || '').toLowerCase().includes(filterSpec.toLowerCase())) &&
        (field === 'd1' || filterD1 === '' || String(row.d1 || '').toLowerCase().includes(filterD1.toLowerCase())) &&
        (field === 'd2' || filterD2 === '' || String(row.d2 || '').toLowerCase().includes(filterD2.toLowerCase())) &&
        (field === 'dia' || filterDia === '' || String(row.dia || '').toLowerCase().includes(filterDia.toLowerCase())) &&
        (field === 'thick' || filterThick === '' || String(row.thick || '').toLowerCase().includes(filterThick.toLowerCase())) &&
        (field === 'length' || filterLength === '' || String(row.length || '').toLowerCase().includes(filterLength.toLowerCase()))
      );
    });
  };

  const uniqueOptions = (field: string) => {
    const options = new Map<string, number>();
    getFilteredOptions(field).forEach(item => {
      const val = String(item[field] || '');
      if (val) {
        options.set(val, (options.get(val) || 0) + 1);
      }
    });
    return Array.from(options.entries())
      .map(([val, count]) => ({ val, count }))
      .sort((a, b) => a.val.localeCompare(b.val, undefined, { numeric: true }));
  };

  const handleExport = async () => {
    const xlsx = await import('xlsx');
    const ws = xlsx.utils.json_to_sheet(filteredData.map(item => {
      const row: any = {};
      
      if (filterType !== 'LT') {
        row['Kode Material'] = item.kodeST;
      }
      
      if (filterType !== 'ST') {
        row['Kode LT'] = item.kodeLT;
      }
      
      row['Spec'] = item.spec;
      row['Customer'] = item.customer;
      
      if (filterType !== 'LT') {
        row['Work Center ST'] = item.workCenterST;
      }
      
      if (filterType !== 'ST') {
        row['Work Center LT'] = item.workCenterLT;
      }
      
      row['D1'] = item.d1;
      row['D2'] = item.d2;
      row['Dia'] = item.dia;
      row['Act Thick'] = item.thick;
      row['Panjang'] = item.length;
      row['Stok FG (Pcs)'] = item.stokFG;
      row['Stok WIP ST (Pcs)'] = item.stokWIP;
      row['Stok WIP LT (Pcs)'] = item.stokWIPLT;
      row['Sisa Order (Pcs)'] = item.sisaOrderPcs;
      row['Balance (Pcs)'] = item.balancePcs;
      row['Avg Delivery/Day'] = item.avgDelivery.toLocaleString(undefined, {maximumFractionDigits: 0});
      row['DOC ST (Days)'] = (item?.docST ?? 0).toFixed(1);
      row['DOC LT (Days)'] = (item?.docLT ?? 0).toFixed(1);
      row['Alert Type'] = item.alertType;
      
      return row;
    }));
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Alerts Report');
    xlsx.writeFile(wb, `Alerts_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-teal-600 animate-spin" />
          <p className="text-gray-500 font-medium">Memuat data Alerts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 flex flex-col h-full bg-[#FDFBF7] animate-in fade-in duration-500">
      <div className="flex justify-end items-end mb-4">
        <div className="flex items-center gap-4">
          <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <button
              onClick={() => setFilterType('ALL')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterType === 'ALL' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Semua
            </button>
            <button
              onClick={() => setFilterType('ST')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterType === 'ST' ? 'bg-red-50 text-red-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Alert ST
            </button>
            <button
              onClick={() => setFilterType('LT')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${filterType === 'LT' ? 'bg-emerald-50 text-emerald-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Alert LT
            </button>
          </div>
          <button 
            onClick={handleExport}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-3 py-1.5 rounded-xl hover:bg-gray-50 transition-all text-xs font-medium shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col transition-all duration-300 hover:shadow-md hover:border-gray-300">
        <div className="overflow-auto flex-1">
          <table className="min-w-full divide-y divide-gray-200 text-[11px]">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {filterType !== 'LT' && (
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap align-top">Kode Material</th>
                )}
                {filterType !== 'ST' && (
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap align-top">Kode LT</th>
                )}
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap align-top">
                  <div className="flex flex-col gap-1">
                    <span>Spec</span>
                    <div className="flex items-center gap-1">
                      <select value={filterSpec} onChange={e => setFilterSpec(e.target.value)} className="w-20 px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                        <option value="">All</option>
                        {uniqueOptions('spec').map((c, i) => <option key={i} value={c.val}>{c.val} ({c.count})</option>)}
                      </select>
                      {filterSpec && (
                        <button onClick={() => setFilterSpec('')} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap align-top">
                  <div className="flex flex-col gap-1">
                    <span>Customer</span>
                    <div className="flex items-center gap-1">
                      <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)} className="w-24 px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                        <option value="">All</option>
                        {uniqueOptions('customer').map((c, i) => <option key={i} value={c.val}>{c.val} ({c.count})</option>)}
                      </select>
                      {filterCustomer && (
                        <button onClick={() => setFilterCustomer('')} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
                {filterType !== 'LT' && (
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap align-top">
                    <div className="flex flex-col gap-1">
                      <span>Work Center ST</span>
                      <div className="flex items-center gap-1">
                        <select value={filterWorkCenterST} onChange={e => setFilterWorkCenterST(e.target.value)} className="w-24 px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                          <option value="">All</option>
                          {uniqueOptions('workCenterST').map((c, i) => <option key={i} value={c.val}>{c.val} ({c.count})</option>)}
                        </select>
                        {filterWorkCenterST && (
                          <button onClick={() => setFilterWorkCenterST('')} className="text-gray-400 hover:text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </th>
                )}
                {filterType !== 'ST' && (
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap align-top">
                    <div className="flex flex-col gap-1">
                      <span>Work Center LT</span>
                      <div className="flex items-center gap-1">
                        <select value={filterWorkCenterLT} onChange={e => setFilterWorkCenterLT(e.target.value)} className="w-24 px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                          <option value="">All</option>
                          {uniqueOptions('workCenterLT').map((c, i) => <option key={i} value={c.val}>{c.val} ({c.count})</option>)}
                        </select>
                        {filterWorkCenterLT && (
                          <button onClick={() => setFilterWorkCenterLT('')} className="text-gray-400 hover:text-red-500">
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </th>
                )}
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">
                  <div className="flex flex-col gap-1 items-end">
                    <span>D1</span>
                    <div className="flex items-center gap-1">
                      <select value={filterD1} onChange={e => setFilterD1(e.target.value)} className="w-16 px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                        <option value="">All</option>
                        {uniqueOptions('d1').map((c, i) => <option key={i} value={c.val}>{c.val} ({c.count})</option>)}
                      </select>
                      {filterD1 && (
                        <button onClick={() => setFilterD1('')} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">
                  <div className="flex flex-col gap-1 items-end">
                    <span>D2</span>
                    <div className="flex items-center gap-1">
                      <select value={filterD2} onChange={e => setFilterD2(e.target.value)} className="w-16 px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                        <option value="">All</option>
                        {uniqueOptions('d2').map((c, i) => <option key={i} value={c.val}>{c.val} ({c.count})</option>)}
                      </select>
                      {filterD2 && (
                        <button onClick={() => setFilterD2('')} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">
                  <div className="flex flex-col gap-1 items-end">
                    <span>Dia</span>
                    <div className="flex items-center gap-1">
                      <select value={filterDia} onChange={e => setFilterDia(e.target.value)} className="w-16 px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                        <option value="">All</option>
                        {uniqueOptions('dia').map((c, i) => <option key={i} value={c.val}>{c.val} ({c.count})</option>)}
                      </select>
                      {filterDia && (
                        <button onClick={() => setFilterDia('')} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">
                  <div className="flex flex-col gap-1 items-end">
                    <span>Act Thick</span>
                    <div className="flex items-center gap-1">
                      <select value={filterThick} onChange={e => setFilterThick(e.target.value)} className="w-16 px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                        <option value="">All</option>
                        {uniqueOptions('thick').map((c, i) => <option key={i} value={c.val}>{c.val} ({c.count})</option>)}
                      </select>
                      {filterThick && (
                        <button onClick={() => setFilterThick('')} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">
                  <div className="flex flex-col gap-1 items-end">
                    <span>Panjang</span>
                    <div className="flex items-center gap-1">
                      <select value={filterLength} onChange={e => setFilterLength(e.target.value)} className="w-16 px-1 py-0.5 border border-gray-300 rounded text-[9px] font-normal focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white">
                        <option value="">All</option>
                        {uniqueOptions('length').map((c, i) => <option key={i} value={c.val}>{c.val} ({c.count})</option>)}
                      </select>
                      {filterLength && (
                        <button onClick={() => setFilterLength('')} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">Stok FG</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">Stok WIP</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">Sisa Order (Pcs)</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">Balance (Pcs)</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">Avg Dlv/Day</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">DOC ST</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap align-top">DOC LT</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap align-top">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.length > 0 ? (
                filteredData.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-50 transition-colors">
                    {filterType !== 'LT' && (
                      <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">{item.kodeST}</td>
                    )}
                    {filterType !== 'ST' && (
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{item.kodeLT}</td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{item.spec}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{item.customer}</td>
                    {filterType !== 'LT' && (
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{item.workCenterST}</td>
                    )}
                    {filterType !== 'ST' && (
                      <td className="px-3 py-2 whitespace-nowrap text-gray-600">{item.workCenterLT}</td>
                    )}
                    <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{item.d1 === 0 || item.d1 === '0' ? '' : item.d1}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{item.d2 === 0 || item.d2 === '0' ? '' : item.d2}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{item.dia === 0 || item.dia === '0' ? '' : item.dia}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{item.thick}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{item.length}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{item.stokFG.toLocaleString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{item.stokWIP.toLocaleString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right text-gray-600">{item.sisaOrderPcs.toLocaleString()}</td>
                    <td className={`px-3 py-2 whitespace-nowrap text-right font-bold ${item.balancePcs < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {item.balancePcs.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-medium text-gray-900">{item.avgDelivery.toLocaleString(undefined, {maximumFractionDigits: 0})}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <span className={`font-bold ${item.isAlertST ? 'text-red-600' : 'text-gray-900'}`}>
                        {(item?.docST ?? 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <span className={`font-bold ${item.isAlertLT ? 'text-emerald-600' : 'text-gray-900'}`}>
                        {(item?.docLT ?? 0).toFixed(1)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                        item.alertType === 'ST & LT' ? 'bg-red-100 text-red-700' :
                        item.alertType === 'ST' ? 'bg-red-50 text-red-600' :
                        'bg-emerald-50 text-emerald-600'
                      }`}>
                        <AlertTriangle className="w-3 h-3" />
                        {item.alertType}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={filterType === 'ALL' ? 19 : 17} className="px-3 py-8 text-center text-gray-500">
                    Tidak ada data alert yang ditemukan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
