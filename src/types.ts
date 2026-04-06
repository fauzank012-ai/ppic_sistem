export interface MasterDataMesin {
  id: string;
  work_center: string;
  jumlah_shift: number;
  hari_kerja_per_minggu: number;
  kategori?: string;
  efisiensi?: number;
  target_yield?: number;
  /** Target frekuensi terjadinya roll change dalam 1 bulan (jumlah kali) */
  target_roll_change?: number;
  created_at?: string;
  updated_at?: string;
}

export interface MaterialMaster {
  id: string;
  customer: string;
  short_name_customer?: string;
  spec?: string;
  dimensi?: string;
  kode_st: string;
  kode_lt?: string;
  alternative_kodes_st?: string;
  alternative_kodes_lt?: string;
  work_center_st?: string;
  work_center_lt?: string;
  moq?: number;
  d1?: number;
  d2?: number;
  dia?: number;
  thick?: number;
  length?: number;
  berat_per_pcs?: number;
  konversi_lt_ke_st?: number;
  kg_per_jam_mill?: number;
  pcs_per_jam_cut?: number;
  created_at?: string;
  updated_at?: string;
}

export interface SalesOrder {
  id: string;
  customer: string;
  kode_st: string;
  qty_order_pcs: number;
  periode: string;
  created_at?: string;
}

export interface Delivery {
  id: string;
  customer: string;
  kode_st: string;
  qty_delivery_pcs: number;
  tanggal_delivery: string;
  periode: string;
  created_at?: string;
}

export interface Stock {
  id: string;
  kode_material: string;
  wip_lt_pcs: number;
  wip_st_pcs: number;
  fg_st_pcs: number;
  created_at?: string;
}

export interface Forecast {
  id: string;
  customer: string;
  kode_st: string;
  qty_pcs: number;
  periode: string;
  created_at?: string;
}

export interface P3Data {
  id: string;
  customer: string;
  kode_st: string;
  tanggal_delivery: string;
  qty_p3_pcs: number;
  created_at?: string;
}
