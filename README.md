# StockMonitor - Order & Inventory Management

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/username/stock-monitor)
[![Lisensi](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Aplikasi full-stack untuk memantau stok, pesanan, dan pengiriman secara real-time. Aplikasi ini dirancang untuk membantu manajemen inventaris dengan visualisasi data yang interaktif dan fitur impor/ekspor data.

## Daftar Isi
- [Persyaratan](#persyaratan)
- [Instalasi](#instalasi)
- [Konfigurasi](#konfigurasi)
- [Penggunaan](#penggunaan)
- [Kontribusi](#kontribusi)
- [Lisensi](#lisensi)

## Persyaratan
- Node.js 18+
- npm atau yarn
- Akun Supabase (untuk database dan autentikasi)

## Instalasi
```bash
# Clone repositori
git clone https://github.com/username/stock-monitor.git

# Masuk ke direktori proyek
cd stock-monitor

# Instal dependensi
npm install
```

## Konfigurasi
Buat file `.env` di direktori root dan tambahkan variabel lingkungan berikut (lihat `.env.example` sebagai referensi):

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
API_KEY=your_secret_api_key
```

Pastikan juga untuk menjalankan skrip SQL yang ada di `supabase_schema.sql` pada SQL Editor di dashboard Supabase Anda untuk menyiapkan tabel dan view yang diperlukan.

## Penggunaan
Untuk menjalankan aplikasi dalam mode pengembangan:
```bash
npm run dev
```
Aplikasi akan berjalan di `http://localhost:3000`.

Untuk membangun aplikasi untuk produksi:
```bash
npm run build
npm start
```

## Kontribusi
Kontribusi selalu terbuka! Silakan buat *pull request* atau buka *issue* untuk saran dan perbaikan.
1. Fork repositori ini.
2. Buat branch fitur baru (`git checkout -b fitur-baru`).
3. Commit perubahan Anda (`git commit -m 'Menambahkan fitur baru'`).
4. Push ke branch tersebut (`git push origin fitur-baru`).
5. Buat Pull Request.

## Lisensi
Didistribusikan di bawah Lisensi MIT. Lihat `LICENSE` untuk informasi lebih lanjut.
