# Spesifikasi Kalkulasi (MATH_SPEC.md)

Dokumen ini menjelaskan semua rumus dan logika kalkulasi yang digunakan dalam aplikasi **StockMonitor**.

## 1. Kalkulasi Utama (P3 vs Stock)

Aplikasi ini membandingkan Rencana Pengiriman (P3) dengan Stok yang tersedia pada tanggal yang sama.

### A. P3 (Delivery Plan)
P3 adalah total kuantitas rencana pengiriman yang dikelompokkan berdasarkan tanggal, customer, atau material.
- **P3 (Kg)** = $\sum \text{qty\_p3\_kg}$
- **P3 (Pcs)** = $\sum \text{qty\_p3\_pcs}$

### B. Stock (Available Stock)
Stok yang ditampilkan dalam grafik P3 vs Stock adalah stok yang **tercover** oleh rencana pengiriman. Nilai ini dibatasi oleh nilai P3 (Capping logic).
- **Stock (Kg)** = $\min(\text{Stok Tersedia (Kg)}, \text{P3 (Kg)})$
- **Stock (Pcs)** = $\min(\text{Stok Tersedia (Pcs)}, \text{P3 (Pcs)})$

*Catatan: Logika ini digunakan untuk menunjukkan sejauh mana rencana pengiriman dapat dipenuhi oleh stok yang ada.*

### C. Achievement (%)
Persentase pemenuhan rencana pengiriman oleh stok yang tersedia.
- **Achievement (%)** = $\left( \frac{\text{Stock}}{\text{P3}} \right) \times 100$
- Jika P3 = 0, maka Achievement = 0.

### D. Variance
Selisih antara stok yang tersedia (tercover) dengan rencana pengiriman dalam satuan Pcs.
- **Variance** = $\text{Stock (Pcs)} - \text{P3 (Pcs)}$

---

## 2. Kalkulasi Inventaris (Stock Detail)

### A. Total Stock (Pcs)
Total stok fisik yang tersedia untuk suatu material.
- **Total Stock** = $\text{WIP ST (Pcs)} + \text{WIP LT (Pcs)} + \text{FG ST (Pcs)}$

### B. Konversi LT ke ST
Kalkulasi untuk mengonversi stok *Long Term* (LT) menjadi *Short Term* (ST) berdasarkan nilai konversi di Master Material.
- **Konversi ST (Pcs)** = $\text{WIP LT (Pcs)} \times \text{Konversi LT ke ST}$

---

## 3. Logika Grafik (Chart Logic)

### A. Skala Dinamis Sumbu Y (Mode %)
Untuk memberikan visualisasi yang lebih detail pada mode persentase, sumbu Y dihitung secara dinamis berdasarkan data yang tampil di halaman (paginasi).
- **Y-Min** = $\max(0, \lfloor \min(\text{Achievement}) - 5 \rfloor)$
- **Y-Max** = $\lceil \max(\text{Achievement}) + 5 \rceil$
*Keterangan: Nilai 0 diabaikan dalam penentuan nilai minimum.*

### B. Target Line
Garis referensi statis pada grafik mode persentase.
- **Target Line** = $100\%$

---

## 4. Pengolahan Data (Aggregation)

Data agregat dihitung menggunakan fungsi `reduce` pada array data detail:
- **Total P3** = $\sum \text{item.p3}$
- **Total Stock** = $\sum \text{item.stock}$
- **Total Variance** = $\sum \text{item.variance}$
- **Average Achievement** = $\left( \frac{\sum \text{Total Stock}}{\sum \text{Total P3}} \right) \times 100$
