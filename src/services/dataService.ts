import { fetchAllRows, isSupabaseConfigured } from '../lib/supabase';

// Toggle this to use local mock data instead of Supabase
const USE_MOCK_DATA = import.meta.env.VITE_USE_MOCK_DATA === 'true';

export const dataService = {
  async getP3StockData(periode: string) {
    if (USE_MOCK_DATA || !isSupabaseConfigured) {
      return this.getMockP3StockData(periode);
    }

    const [p3s, stocks, material_master] = await Promise.all([
      fetchAllRows('p3_data', 'customer,kode_st,qty_p3_pcs,qty_p3_kg,tanggal_delivery'),
      fetchAllRows('stocks', 'created_at,kode_material,wip_st_kg,wip_lt_kg,fg_st_kg,fg_lt_kg,wip_st_pcs,wip_lt_pcs,fg_st_pcs,fg_lt_pcs'),
      fetchAllRows('material_master', 'customer,short_name_customer,kode_st,dimensi,konversi_lt_ke_st')
    ]);

    return { 
      p3s: p3s || [], 
      stocks: stocks || [], 
      material_master: material_master || [] 
    };
  },

  // Mock data for local trial
  async getMockP3StockData(periode: string) {
    console.log('Using mock data for periode:', periode);
    // Return empty arrays or some sample data
    return {
      p3s: [
        { customer: 'SAMPLE CUST A', kode_st: 'MAT-001', qty_p3_pcs: 100, qty_p3_kg: 500, tanggal_delivery: `${periode}-01T00:00:00Z` },
        { customer: 'SAMPLE CUST B', kode_st: 'MAT-002', qty_p3_pcs: 200, qty_p3_kg: 1000, tanggal_delivery: `${periode}-02T00:00:00Z` },
      ],
      stocks: [
        { created_at: `${periode}-01T00:00:00Z`, kode_material: 'MAT-001', wip_st_pcs: 80, wip_lt_pcs: 10, fg_st_pcs: 5, wip_st_kg: 400, wip_lt_kg: 50, fg_st_kg: 25 },
        { created_at: `${periode}-02T00:00:00Z`, kode_material: 'MAT-002', wip_st_pcs: 210, wip_lt_pcs: 0, fg_st_pcs: 0, wip_st_kg: 1050, wip_lt_kg: 0, fg_st_kg: 0 },
      ],
      material_master: [
        { customer: 'SAMPLE CUST A', short_name_customer: 'CUST A', kode_st: 'MAT-001', dimensi: '10x10', konversi_lt_ke_st: 1 },
        { customer: 'SAMPLE CUST B', short_name_customer: 'CUST B', kode_st: 'MAT-002', dimensi: '20x20', konversi_lt_ke_st: 1 },
      ]
    };
  }
};
