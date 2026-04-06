export interface P3StockData {
  date: string;
  p3: number;
  stock: number;
}

export interface CustomerDetail {
  customer: string;
  short_name_customer: string;
  p3: number;
  stock: number;
  p3Pcs: number;
  stockPcs: number;
  variance: number;
  achievement: number;
}

export interface MaterialDetail {
  material: string;
  dimensi: string;
  p3: number;
  p3Pcs: number;
  stock: number;
  stockPcs: number;
  wip_st_pcs: number;
  wip_lt_pcs: number;
  fg_st_pcs: number;
  konversi_st_pcs: number;
  variance: number;
  achievement: number;
}

export interface SortConfig {
  field: string;
  direction: 'asc' | 'desc';
}
