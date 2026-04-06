import { useQuery } from '@tanstack/react-query';
import { fetchAllRows } from '../lib/supabase';

export function useMaterialMaster() {
  return useQuery({
    queryKey: ['material_master'],
    queryFn: () => fetchAllRows('material_master', 
      'id,customer,short_name_customer,kode_st,kode_lt,berat_per_pcs,dimensi,alternative_kodes_st,alternative_kodes_lt,konversi_lt_ke_st'
    ),
    staleTime: 10 * 60 * 1000, // 10 menit — data master jarang berubah
    gcTime: 30 * 60 * 1000,
  });
}
