# Absensi Wajah Sodikuna — tahap fondasi

Branch pengembangan: `feature/absensi-wajah`

## Yang disiapkan
- Metadata persetujuan terpisah pada `public.face_consents`.
- Penyimpanan template biometrik terenkripsi pada schema `private.face_templates`.
- Tidak ada endpoint publik untuk membaca template biometrik.
- Tidak menyimpan foto mentah atau embedding tanpa enkripsi.
- Tabel lama `jamaah`, `agenda`, dan `attendance` tidak diubah oleh migrasi ini.

## Penting sebelum migrasi dijalankan
Migrasi ini baru fondasi skema. Jangan aktifkan pendaftaran/pengenalan wajah di aplikasi sampai Edge Functions selesai dibuat dan diuji. Backend harus:
1. Memverifikasi sesi petugas dan perannya.
2. Memeriksa persetujuan aktif dan versi formulir persetujuan.
3. Menghasilkan embedding di lingkungan tepercaya.
4. Mengenkripsi embedding dengan secret terpisah dari database.
5. Menghapus template saat persetujuan ditarik.
6. Mencatat kehadiran secara idempotent (unique agenda_id + jamaah_id).
7. Tidak mengirim template atau foto wajah ke browser/URL publik.

Untuk jamaah anak, wajib ada persetujuan orang tua/wali. Jamaah tanpa persetujuan atau yang tidak dikenali harus tetap dapat memakai QR atau konfirmasi manual.

## Belum dikerjakan
- Edge Function enrollment, match, withdrawal dan face check-in.
- Pemilihan/validasi model pengenalan wajah dan liveness/anti-spoofing.
- UI kamera, pendaftaran dan persetujuan.
- Pengujian perangkat nyata serta penilaian akurasi/fairness.
- SQL migrasi belum dijalankan di Supabase dan belum di-deploy ke Netlify.
