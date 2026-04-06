import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Box, Settings, PackageCheck, Clock, AlertTriangle, TrendingUp, Gauge, RefreshCw, ArrowRightLeft, CalendarClock, Layers, CircleDot } from 'lucide-react';
import { fetchAllRows } from '../lib/supabase';
import { useQuery } from '@tanstack/react-query';

export default function InventoryControl() {
  const { data: stockTotals = {
    coil: 0,
    strip: 0,
    wip: 0,
    fg: 0,
    slow: 0,
    nc: 0,
    dead: 0,
    excess: 0,
    availability: 0
  }, isLoading: loading } = useQuery({
    queryKey: ['inventory_control_totals'],
    queryFn: async () => {
      const [coilData, stripData, stocksData, materialsData, looData, soData, forecastData, deliveryData, minMaxData] = await Promise.all([
        fetchAllRows('stock_coil', 'qty_kg'),
        fetchAllRows('stock_strip', 'qty_kg'),
        fetchAllRows('stocks', 'kode_material,fg_st_pcs,fg_lt_pcs,wip_st_pcs,wip_lt_pcs,wip_lt_kg,wip_st_kg,fg_lt_kg,fg_st_kg,created_at,pasm,grade'),
        fetchAllRows('material_master', 'kode_st,kode_lt,kode_strip,alternative_kodes_st,alternative_kodes_lt,alternative_kode_strip,berat_per_pcs,konversi_lt_ke_st'),
        fetchAllRows('loo_data', 'sisa_loo_pcs,sisa_order_pcs,sisa_loo_kg,sisa_order_kg,kode_st'),
        fetchAllRows('sales_orders', 'qty_order_pcs,qty_order_kg,kode_st'),
        fetchAllRows('forecasts', 'qty_pcs,qty_forecast_kg,kode_st'),
        fetchAllRows('deliveries', 'kode_st,qty_delivery_pcs,tanggal_delivery'),
        fetchAllRows('min_max_stock', 'min_stock,max_stock,kode_st,kode_lt,jenis')
      ]);

        const coilTotalKg = (coilData || []).reduce((sum, item) => sum + (Number(item.qty_kg) || 0), 0);
        const stripTotalKg = (stripData || []).reduce((sum, item) => sum + (Number(item.qty_kg) || 0), 0);

        const materialMap = new Map();
        const matMap = new Map(); // For related materials lookup
        (materialsData || []).forEach(m => {
          const info = { 
            berat_per_pcs: parseFloat(m.berat_per_pcs) || 0,
            konversi: parseFloat(m.konversi_lt_ke_st) || 0,
            kode_st: m.kode_st,
            kode_lt: m.kode_lt,
            kode_strip: m.kode_strip,
            alternative_kodes_st: m.alternative_kodes_st,
            alternative_kodes_lt: m.alternative_kodes_lt,
            alternative_kode_strip: m.alternative_kode_strip
          };
          
          const normalize = (s: string) => (s || '').trim().toLowerCase();
          if (m.kode_st) materialMap.set(normalize(m.kode_st), info);
          if (m.kode_lt) materialMap.set(normalize(m.kode_lt), info);

          const addMat = (k: string) => {
            if (!k) return;
            const key = normalize(k);
            if (!matMap.has(key)) matMap.set(key, []);
            matMap.get(key).push(m);
          };
          addMat(m.kode_st);
          addMat(m.kode_lt);
          addMat(m.kode_strip);
          if (m.alternative_kodes_st) m.alternative_kodes_st.split(',').forEach(addMat);
          if (m.alternative_kodes_lt) m.alternative_kodes_lt.split(',').forEach(addMat);
          if (m.alternative_kode_strip) m.alternative_kode_strip.split(',').forEach(addMat);
        });

        const reqSet = new Set<string>();
        const addReq = (kode: string) => {
          if (kode) reqSet.add(kode.trim().toLowerCase());
        };
        (looData || []).forEach(l => {
          if ((l.sisa_loo_pcs || 0) > 0 || (l.sisa_order_pcs || 0) > 0 || (l.sisa_loo_kg || 0) > 0 || (l.sisa_order_kg || 0) > 0) {
            addReq(l.kode_st);
          }
        });
        (soData || []).forEach(s => {
          if ((s.qty_order_pcs || 0) > 0 || (s.qty_order_kg || 0) > 0) {
            addReq(s.kode_st);
          }
        });
        (forecastData || []).forEach(f => {
          if ((f.qty_pcs || 0) > 0 || (f.qty_forecast_kg || 0) > 0) {
            addReq(f.kode_st);
          }
        });

        const deliveryMap = new Map();
        (deliveryData || []).forEach(d => {
          const kode = (d.kode_st || '').trim().toLowerCase();
          if (!kode) return;
          if (!deliveryMap.has(kode)) deliveryMap.set(kode, { total: 0, days: new Set() });
          const entry = deliveryMap.get(kode);
          entry.total += (d.qty_delivery_pcs || 0);
          if (d.tanggal_delivery) entry.days.add(d.tanggal_delivery.split('T')[0]);
        });

        const getAvgDelivery = (kode: string) => {
          const entry = deliveryMap.get(kode);
          if (!entry) return 0;
          return entry.total / (entry.days.size || 1);
        };

        let wipTotalKg = 0;
        let fgTotalKg = 0;
        let slowTotalKg = 0;
        let ncTotalKg = 0;

        // Find the latest date in stocksData
        let latestDate = '';
        (stocksData || []).forEach(item => {
          if (item.created_at) {
            const date = item.created_at.split('T')[0];
            if (!latestDate || date > latestDate) {
              latestDate = date;
            }
          }
        });

        const filteredStocks = (stocksData || []).filter(item => 
          item.created_at && item.created_at.startsWith(latestDate)
        );

        // Group stocks by material to calculate total stock per material for Dead/Excess logic
        const materialStockMap = new Map();
        filteredStocks.forEach(item => {
          const kodeMat = (item.kode_material || '').trim().toLowerCase();
          const materialInfo = materialMap.get(kodeMat);
          const beratPerPcs = materialInfo?.berat_per_pcs || 0;
          const konversi = materialInfo?.konversi || 0;
          
          const wip_lt_pcs = item.wip_lt_pcs || 0;
          const wip_st_pcs = item.wip_st_pcs || 0;
          const fg_lt_pcs = item.fg_lt_pcs || 0;
          const fg_st_pcs = item.fg_st_pcs || 0;

          const wip_lt_kg = item.wip_lt_kg || 0;
          const wip_st_kg = item.wip_st_kg || 0;
          const fg_lt_kg = item.fg_lt_kg || 0;
          const fg_st_kg = item.fg_st_kg || 0;

          const totalKg = wip_lt_kg + wip_st_kg + fg_lt_kg + fg_st_kg;

          wipTotalKg += wip_lt_kg + wip_st_kg;
          fgTotalKg += fg_lt_kg + fg_st_kg;

          if (String(item.pasm).toUpperCase() === 'SLOW') slowTotalKg += totalKg;
          if (item.grade === 'C' || item.grade === 'E') ncTotalKg += totalKg;

          // For Dead/Excess identification
          if (!materialStockMap.has(kodeMat)) {
            materialStockMap.set(kodeMat, { totalKg: 0, totalPcs: 0 });
          }
          const stock = materialStockMap.get(kodeMat);
          stock.totalKg += totalKg;
          stock.totalPcs += (wip_st_pcs + fg_st_pcs + ((wip_lt_pcs + fg_lt_pcs) * konversi));
        });

        let deadTotalKg = 0;
        let excessTotalKg = 0;

        materialStockMap.forEach((stock, kodeMat) => {
          let hasReq = reqSet.has(kodeMat);
          const relatedMats = matMap.get(kodeMat) || [];
          if (!hasReq) {
            for (const mat of relatedMats) {
              const checkReq = (k: string) => k && reqSet.has(k.trim().toLowerCase());
              if (checkReq(mat.kode_st) || checkReq(mat.kode_lt) || checkReq(mat.kode_strip)) { hasReq = true; break; }
              if (mat.alternative_kodes_st?.split(',').some(checkReq)) { hasReq = true; break; }
              if (mat.alternative_kodes_lt?.split(',').some(checkReq)) { hasReq = true; break; }
              if (mat.alternative_kode_strip?.split(',').some(checkReq)) { hasReq = true; break; }
            }
          }

          if (!hasReq) {
            deadTotalKg += stock.totalKg;
          } else {
            // Excess Stock
            let avgDelivery = getAvgDelivery(kodeMat);
            if (avgDelivery === 0 && relatedMats.length > 0) {
              const uniqueSTs = new Set<string>();
              relatedMats.forEach(m => {
                if (m.kode_st) uniqueSTs.add(m.kode_st.trim().toLowerCase());
                if (m.alternative_kodes_st) m.alternative_kodes_st.split(',').forEach((alt: string) => { if (alt.trim()) uniqueSTs.add(alt.trim().toLowerCase()); });
              });
              let totalRelatedDelivery = 0;
              uniqueSTs.forEach(st => { totalRelatedDelivery += getAvgDelivery(st); });
              avgDelivery = totalRelatedDelivery;
            }
            
            const doc = avgDelivery > 0 ? stock.totalPcs / avgDelivery : (stock.totalPcs > 0 ? Infinity : 0);
            if (doc > 30) {
              excessTotalKg += stock.totalKg;
            }
          }
        });

        // Calculate Availability Stock Percentage
        const isMatch = (stockCode: string, masterCode: string, jenis: string) => {
          const sCode = (stockCode || '').trim().toLowerCase();
          const mCode = (masterCode || '').trim().toLowerCase();
          if (!sCode || !mCode) return false;
          const j = (jenis || '').trim().toUpperCase();
          const isPHitam = j.includes('HITAM');
          if (mCode.includes('*') || isPHitam) {
            const escaped = mCode.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
            const regexStr = '^' + escaped.replace(/\*/g, '.*') + '$';
            try { return new RegExp(regexStr).test(sCode); } catch (e) { return false; }
          }
          return sCode === mCode;
        };

        let okCount = 0;
        let totalCount = 0;

        (minMaxData || []).forEach(item => {
          const min = Number(item.min_stock) || 0;
          const max = Number(item.max_stock) || 0;
          if (min > 0 || max > 0) {
            const matchedStocks = filteredStocks.filter(s => 
              isMatch(s.kode_material || '', item.kode_st || '', item.jenis || '') ||
              isMatch(s.kode_material || '', item.kode_lt || '', item.jenis || '')
            );
            const totalStock = matchedStocks.reduce((sum, s) => 
              sum + (s.fg_st_pcs || 0) + (s.fg_lt_pcs || 0) + (s.wip_st_pcs || 0) + (s.wip_lt_pcs || 0), 0
            );
            totalCount++;
            if (!(min > 0 && totalStock < min) && !(max > 0 && totalStock > max)) {
              okCount++;
            }
          }
        });

        const availabilityPercent = totalCount > 0 ? (okCount / totalCount) * 100 : 0;

        return {
          coil: coilTotalKg / 1000,
          strip: stripTotalKg / 1000,
          wip: wipTotalKg / 1000,
          fg: fgTotalKg / 1000,
          slow: slowTotalKg / 1000,
          nc: ncTotalKg / 1000,
          dead: deadTotalKg / 1000,
          excess: excessTotalKg / 1000,
          availability: availabilityPercent
        };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });

  const sections = [
    {
      title: 'Stock Overview',
      items: [
        { label: 'Coil', icon: <Box className="w-4 h-4" />, to: '/raw-material-stock?type=coil', total: stockTotals.coil },
        { label: 'Strip', icon: <Box className="w-4 h-4" />, to: '/raw-material-stock?type=strip', total: stockTotals.strip },
        { label: 'WIP', icon: <Box className="w-4 h-4" />, total: stockTotals.wip },
        { label: 'FG', icon: <Box className="w-4 h-4" />, to: '/finished-goods-stock', total: stockTotals.fg }
      ]
    },
    {
      title: 'Inventory Health',
      items: [
        { label: 'Slow moving', icon: <Clock className="w-4 h-4" />, to: '/slow-moving-stock', total: stockTotals.slow },
        { label: 'NC Stock', icon: <AlertTriangle className="w-4 h-4" />, to: '/nc-stock', total: stockTotals.nc },
        { label: 'Dead stock', icon: <AlertTriangle className="w-4 h-4" />, to: '/dead-stock', total: stockTotals.dead },
        { label: 'Excess stock', icon: <TrendingUp className="w-4 h-4" />, to: '/excess-stock', total: stockTotals.excess },
        { label: 'Loose Qty Stock', icon: <AlertTriangle className="w-4 h-4" />, to: '/loose-qty-stock' }
      ]
    },
    {
      title: 'Stock Policy',
      items: [
        { label: 'Min / Max Stock (Availability Stock)', icon: <Gauge className="w-4 h-4" />, to: '/min-max-stock', total: stockTotals.availability, isPercent: true },
        { label: 'Reorder Point', icon: <RefreshCw className="w-4 h-4" /> }
      ]
    },
    {
      title: 'Stock Movement',
      items: [
        { label: 'In / Out / Transfer', icon: <ArrowRightLeft className="w-4 h-4" /> },
        { label: 'Aging stock', icon: <CalendarClock className="w-4 h-4" /> },
        { label: 'Location Overview', icon: <Box className="w-4 h-4" />, to: '/location-overview' }
      ]
    }
  ];

  return (
    <div className="p-8 bg-gray-50 min-h-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {sections.map((section, idx) => (
          <div key={idx} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-gray-900 mb-4">{section.title}</h2>
            <ul className="space-y-2">
              {section.items.map((item, itemIdx) => {
                const content = (
                  <div className="flex items-center justify-between text-sm text-gray-600 hover:text-emerald-600 cursor-pointer p-2 rounded-lg hover:bg-emerald-50 transition-colors">
                    <div className="flex items-center">
                      <span className="mr-2">{item.icon}</span>
                      {item.label}
                    </div>
                    {item.total !== undefined && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full shadow-sm ${
                        section.title === 'Inventory Health' 
                          ? 'bg-amber-100 text-amber-800' 
                          : 'bg-teal-100 text-teal-800'
                      }`}>
                        {loading ? (
                          <RefreshCw className="w-3 h-3 animate-spin inline-block" />
                        ) : (
                          item.isPercent 
                            ? `${(item?.total ?? 0).toFixed(1)}%`
                            : `${item.total.toLocaleString('id-ID', { maximumFractionDigits: 0 })} Ton`
                        )}
                      </span>
                    )}
                  </div>
                );
                return (
                  <li key={itemIdx}>
                    {item.to ? <Link to={item.to}>{content}</Link> : content}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
