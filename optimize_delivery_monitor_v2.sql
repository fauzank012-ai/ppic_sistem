-- 1. Add indexes for faster filtering and joining
CREATE INDEX IF NOT EXISTS idx_p3_data_tanggal_delivery ON public.p3_data(tanggal_delivery);
CREATE INDEX IF NOT EXISTS idx_deliveries_tanggal_delivery ON public.deliveries(tanggal_delivery);

-- 2. Create a function to get aggregated delivery performance data
-- This pushes the heavy computation to the database server
CREATE OR REPLACE FUNCTION public.get_delivery_performance(
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL,
    p_customer_filter TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_result JSON;
BEGIN
    WITH 
    -- 1. Expanded Material Master for mapping
    mats AS (
        SELECT 
            normalized_customer,
            normalized_code,
            canonical_kode_st,
            customer as original_customer
        FROM public.material_codes_expanded
    ),
    -- 2. P3 Data with mapped codes and weights
    p3_mapped AS (
        SELECT 
            p.tanggal_delivery,
            p.normalized_customer,
            p.normalized_kode_st,
            p.qty_p3_pcs,
            p.qty_p3_kg,
            mm.berat_per_pcs,
            mm.short_name_customer,
            mm.dimensi,
            mm.kode_st as canonical_st
        FROM public.p3_data p
        LEFT JOIN public.material_codes_expanded mce ON 
            p.normalized_customer = mce.normalized_customer AND 
            p.normalized_kode_st = mce.normalized_code
        LEFT JOIN public.material_master mm ON mce.canonical_kode_st = mm.kode_st
        WHERE (p_start_date IS NULL OR p.tanggal_delivery >= p_start_date)
          AND (p_end_date IS NULL OR p.tanggal_delivery <= p_end_date)
    ),
    -- 3. Delivery Data with mapped codes and weights
    del_mapped AS (
        SELECT 
            d.tanggal_delivery,
            d.normalized_customer,
            d.normalized_kode_st,
            d.qty_delivery_pcs,
            mm.berat_per_pcs,
            mm.short_name_customer,
            mm.dimensi,
            mm.kode_st as canonical_st
        FROM public.deliveries d
        LEFT JOIN public.material_codes_expanded mce ON 
            d.normalized_customer = mce.normalized_customer AND 
            d.normalized_kode_st = mce.normalized_code
        LEFT JOIN public.material_master mm ON mce.canonical_kode_st = mm.kode_st
        WHERE (p_start_date IS NULL OR d.tanggal_delivery >= p_start_date)
          AND (p_end_date IS NULL OR d.tanggal_delivery <= p_end_date)
    ),
    -- 4. Daily Aggregation
    daily_agg AS (
        SELECT 
            tanggal_delivery::TEXT as date,
            SUM(qty_p3_kg) as p3,
            0 as delivery
        FROM p3_mapped
        GROUP BY tanggal_delivery
        UNION ALL
        SELECT 
            tanggal_delivery::TEXT as date,
            0 as p3,
            SUM(qty_delivery_pcs * berat_per_pcs) as delivery
        FROM del_mapped
        GROUP BY tanggal_delivery
    ),
    daily_final AS (
        SELECT date, SUM(p3) as p3, SUM(delivery) as delivery
        FROM daily_agg
        GROUP BY date
        ORDER BY date
    ),
    -- 5. Customer Aggregation
    cust_agg AS (
        SELECT 
            COALESCE(short_name_customer, normalized_customer) as customer,
            SUM(qty_p3_kg) as p3,
            0 as delivery
        FROM p3_mapped
        GROUP BY 1
        UNION ALL
        SELECT 
            COALESCE(short_name_customer, normalized_customer) as customer,
            0 as p3,
            SUM(qty_delivery_pcs * berat_per_pcs) as delivery
        FROM del_mapped
        GROUP BY 1
    ),
    cust_final AS (
        SELECT customer, SUM(p3) as p3, SUM(delivery) as delivery
        FROM cust_agg
        GROUP BY customer
        ORDER BY delivery DESC
    )
    SELECT json_build_object(
        'daily', (SELECT json_agg(daily_final) FROM daily_final),
        'customer', (SELECT json_agg(cust_final) FROM cust_final)
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
