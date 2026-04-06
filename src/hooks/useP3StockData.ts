import { useMemo } from 'react';
import { CustomerDetail, MaterialDetail, SortConfig } from '../types/p3-stock';

export function useP3StockData(
  rawData: any,
  p3Data: any[],
  stockDateMatMap: Map<string, any>,
  currentPeriode: string,
  selectedDate: string | null,
  selectedCustomer: string | null,
  modalSort: SortConfig,
  subModalSort: SortConfig,
  modalPage: number,
  subModalPage: number,
  itemsPerPageModal: number,
  modalChartType: 'volume' | 'percentage',
  subModalChartType: 'volume' | 'percentage'
) {
  const chartData = useMemo(() => {
    const dateMap = new Map<string, { date: string, p3: number, stock: number }>();
    
    p3Data.forEach((p: any) => {
      const date = p.tanggal_delivery ? p.tanggal_delivery.split('T')[0] : '';
      if (!date || !date.startsWith(currentPeriode)) return;
      
      const code = (p.kode_st || '').trim().toLowerCase();
      const p3Qty = p.qty_p3_kg || 0;
      const availableStock = (stockDateMatMap.get(`${date}|${code}`)?.kg || 0);
      
      if (!dateMap.has(date)) dateMap.set(date, { date, p3: 0, stock: 0 });
      const entry = dateMap.get(date)!;
      entry.p3 += p3Qty;
      entry.stock += Math.min(availableStock, p3Qty);
    });
    
    return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [p3Data, stockDateMatMap, currentPeriode]);

  const customerDetailData = useMemo(() => {
    if (!selectedDate) return [];
    
    const custMap = new Map<string, CustomerDetail>();
    const shortNameMap = new Map<string, string>();
    
    if (rawData?.material_master) {
      rawData.material_master.forEach((m: any) => {
        if (m.customer && m.short_name_customer) {
          shortNameMap.set(m.customer.trim().toLowerCase(), m.short_name_customer);
        }
      });
    }

    const p3ByCustMat = new Map<string, { kg: number, pcs: number }>();
    p3Data.forEach((p: any) => {
      const datePart = p.tanggal_delivery ? p.tanggal_delivery.split('T')[0] : '';
      if (datePart !== selectedDate || !p.kode_st) return;
      const code = p.kode_st.trim().toLowerCase();
      const key = `${p.customer}|${code}`;
      const existing = p3ByCustMat.get(key) || { kg: 0, pcs: 0 };
      p3ByCustMat.set(key, { kg: existing.kg + (p.qty_p3_kg || 0), pcs: existing.pcs + (p.qty_p3_pcs || 0) });
    });

    p3ByCustMat.forEach((p3Val, key) => {
      const [customer, code] = key.split('|');
      const availableStock = stockDateMatMap.get(`${selectedDate}|${code}`) || { kg: 0, pcs: 0 };
      
      if (!custMap.has(customer)) {
        const shortName = shortNameMap.get(customer.trim().toLowerCase()) || customer;
        custMap.set(customer, { 
          customer, 
          short_name_customer: shortName, 
          p3: 0, 
          stock: 0, 
          p3Pcs: 0, 
          stockPcs: 0,
          variance: 0,
          achievement: 0
        });
      }
      const entry = custMap.get(customer)!;
      entry.p3 += p3Val.kg;
      entry.stock += Math.min(availableStock.kg, p3Val.kg);
      entry.p3Pcs += p3Val.pcs;
      entry.stockPcs += Math.min(availableStock.pcs, p3Val.pcs);
    });

    return Array.from(custMap.values()).map(d => ({
      ...d,
      variance: d.stockPcs - d.p3Pcs,
      achievement: d.p3 > 0 ? (d.stock / d.p3) * 100 : 0
    })).sort((a, b) => {
      const { field, direction } = modalSort;
      let valA = a[field as keyof CustomerDetail];
      let valB = b[field as keyof CustomerDetail];
      
      if (typeof valA === 'string') {
        return direction === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
      }
      return direction === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [selectedDate, p3Data, stockDateMatMap, modalSort, rawData?.material_master]);

  const modalTotals = useMemo(() => {
    return customerDetailData.reduce((acc, curr) => ({
      p3: acc.p3 + curr.p3,
      stock: acc.stock + curr.stock,
      p3Pcs: acc.p3Pcs + curr.p3Pcs,
      stockPcs: acc.stockPcs + curr.stockPcs,
    }), { p3: 0, stock: 0, p3Pcs: 0, stockPcs: 0 });
  }, [customerDetailData]);

  const modalDisplayData = useMemo(() => {
    const paginatedData = customerDetailData.slice(modalPage * itemsPerPageModal, (modalPage + 1) * itemsPerPageModal);
    if (modalChartType === 'volume') return paginatedData;
    return paginatedData.map(d => ({
      customer: d.customer,
      short_name_customer: d.short_name_customer,
      p3: 0,
      stock: d.p3 > 0 ? (d.stock / d.p3) * 100 : 0
    }));
  }, [customerDetailData, modalChartType, modalPage, itemsPerPageModal]);

  const modalYAxisDomain = useMemo(() => {
    if (modalChartType !== 'percentage') return ['auto', 'auto'];
    const values = modalDisplayData.map(d => d.stock).filter(v => v > 0);
    if (values.length === 0) return [0, 100];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    return [Math.max(0, Math.floor(minVal - 5)), Math.ceil(maxVal + 5)];
  }, [modalDisplayData, modalChartType]);

  const materialDetailData = useMemo(() => {
    if (!selectedDate || !selectedCustomer) return [];
    
    const p3ByMat = new Map<string, { kg: number, pcs: number }>();
    p3Data.forEach((p: any) => {
      const datePart = p.tanggal_delivery ? p.tanggal_delivery.split('T')[0] : '';
      if (datePart !== selectedDate || p.customer !== selectedCustomer || !p.kode_st) return;
      const code = p.kode_st.trim().toLowerCase();
      const existing = p3ByMat.get(code) || { kg: 0, pcs: 0 };
      p3ByMat.set(code, { 
        kg: existing.kg + (p.qty_p3_kg || 0), 
        pcs: existing.pcs + (p.qty_p3_pcs || 0) 
      });
    });

    const materialMasterMap = new Map<string, { dimensi: string, konversi: number, originalCode: string }>();
    if (rawData?.material_master) {
      rawData.material_master.forEach((m: any) => {
        const code = (m.kode_st || '').trim().toLowerCase();
        if (code) materialMasterMap.set(code, { 
          dimensi: m.dimensi || '-', 
          konversi: m.konversi_lt_ke_st || 0,
          originalCode: m.kode_st
        });
      });
    }

    return Array.from(p3ByMat.entries()).map(([code, p3Val]) => {
      const availableStock = stockDateMatMap.get(`${selectedDate}|${code}`) || { kg: 0, pcs: 0, wip_st_pcs: 0, wip_lt_pcs: 0, fg_st_pcs: 0 };
      const masterInfo = materialMasterMap.get(code) || { dimensi: '-', konversi: 0, originalCode: code };

      return {
        material: masterInfo.originalCode,
        dimensi: masterInfo.dimensi,
        p3: p3Val.kg,
        p3Pcs: p3Val.pcs,
        stock: Math.min(availableStock.kg, p3Val.kg),
        stockPcs: Math.min(availableStock.pcs, p3Val.pcs),
        wip_st_pcs: availableStock.wip_st_pcs,
        wip_lt_pcs: availableStock.wip_lt_pcs,
        fg_st_pcs: availableStock.fg_st_pcs,
        konversi_st_pcs: masterInfo.konversi * availableStock.wip_lt_pcs,
        variance: Math.min(availableStock.pcs, p3Val.pcs) - p3Val.pcs,
        achievement: p3Val.pcs > 0 ? (Math.min(availableStock.pcs, p3Val.pcs) / p3Val.pcs) * 100 : 0
      };
    }).sort((a, b) => {
      const { field, direction } = subModalSort;
      let valA = a[field as keyof MaterialDetail];
      let valB = b[field as keyof MaterialDetail];
      if (typeof valA === 'string') {
        return direction === 'asc' ? valA.localeCompare(valB as string) : (valB as string).localeCompare(valA);
      }
      return direction === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [selectedDate, selectedCustomer, p3Data, stockDateMatMap, subModalSort, rawData?.material_master]);

  const subModalTotals = useMemo(() => {
    return materialDetailData.reduce((acc, curr) => ({
      p3: acc.p3 + curr.p3,
      stock: acc.stock + curr.stock,
      p3Pcs: acc.p3Pcs + curr.p3Pcs,
      stockPcs: acc.stockPcs + curr.stockPcs,
      konversi_st_pcs: acc.konversi_st_pcs + curr.konversi_st_pcs,
      wip_st_pcs: acc.wip_st_pcs + curr.wip_st_pcs,
      wip_lt_pcs: acc.wip_lt_pcs + curr.wip_lt_pcs,
      fg_st_pcs: acc.fg_st_pcs + curr.fg_st_pcs
    }), { p3: 0, stock: 0, p3Pcs: 0, stockPcs: 0, konversi_st_pcs: 0, wip_st_pcs: 0, wip_lt_pcs: 0, fg_st_pcs: 0 });
  }, [materialDetailData]);

  const subModalDisplayData = useMemo(() => {
    if (subModalChartType === 'volume') return materialDetailData;
    return materialDetailData.map(d => ({
      material: d.material,
      dimensi: d.dimensi,
      p3: 0,
      stock: d.p3Pcs > 0 ? (d.stockPcs / d.p3Pcs) * 100 : 0
    }));
  }, [materialDetailData, subModalChartType]);

  const subModalYAxisDomain = useMemo(() => {
    if (subModalChartType !== 'percentage') return ['auto', 'auto'];
    const values = subModalDisplayData.map(d => d.stock).filter(v => v > 0);
    if (values.length === 0) return [0, 100];
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    return [Math.max(0, Math.floor(minVal - 5)), Math.ceil(maxVal + 5)];
  }, [subModalDisplayData, subModalChartType]);

  return {
    chartData,
    customerDetailData,
    modalTotals,
    modalDisplayData,
    modalYAxisDomain,
    materialDetailData,
    subModalTotals,
    subModalDisplayData,
    subModalYAxisDomain
  };
}
