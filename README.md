# MAJELIS TA'LIM SODIKUNA CARINGIN SUKABUMI

Aplikasi web administrasi majelis: dashboard, agenda, data jamaah, absensi, keuangan, pengumuman, laporan, dan ekspor/impor CSV.

## Kebutuhan
- Node.js 18+
- Project Supabase

## Menjalankan lokal
1. Ekstrak ZIP.
2. Jalankan `npm install`.
3. Salin `.env.example` menjadi `.env`.
4. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` dari Supabase Project Settings > API Keys.
5. Di Supabase SQL Editor, jalankan seluruh isi `supabase/schema.sql`.
6. Buat akun pertama melalui Supabase Authentication > Users.
7. Salin UUID akun tersebut, lalu jalankan SQL:
   `insert into public.profiles(id, full_name, role) values ('UUID-AKUN', 'Administrator Sodikuna', 'super_admin');`
8. Jalankan `npm run dev`.

## Build produksi
`npm run build` menghasilkan folder `dist`. Deploy folder `dist` ke Netlify. Atur `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` pada Site configuration > Environment variables, lalu deploy ulang. Untuk project Sodikuna gunakan URL project `https://vmdjbfvowsytmftdgpqa.supabase.co`. Publishable key sudah tersedia pada konfigurasi project; jangan gunakan `service_role` atau secret key di frontend.

## Import / Export
- Import jamaah menggunakan CSV dengan header:
  `nomor_anggota,nama,telepon,alamat,status`
- Export data jamaah dan absensi tersedia di menu masing-masing.
- Import absensi CSV tersedia di menu Absensi dengan header: `agenda_id,jamaah_id,status,catatan`. Gunakan UUID agenda dan UUID jamaah yang sesuai di database.
- Laporan keuangan dapat diekspor CSV dari menu Laporan.

## Catatan keamanan dan kelengkapan
- Jangan pernah memasukkan `service_role` key ke frontend. Gunakan hanya anon/publishable key.
- Kebijakan RLS pada `supabase/schema.sql` adalah baseline awal dan wajib diuji dengan akun setiap peran sebelum dipakai untuk data nyata.
- Akun pengurus/jamaah harus dibuat oleh admin dan diberi baris profil sesuai role.
- QR saat ini menghasilkan kode sesi agenda. Endpoint validasi QR, pemindaian kamera, pembatasan token, dan pencatatan absensi jamaah mandiri memerlukan fungsi backend/Edge Function agar tidak bisa dipalsukan.
- Export XLSX/PDF, pengulangan agenda, notifikasi WhatsApp, backup terjadwal, dokumentasi upload, serta log otomatis lengkap merupakan pekerjaan iterasi berikutnya.
- Data contoh tidak disertakan. Gunakan data jamaah yang sah dan persetujuan pengelola.
