# Absensi Wajah Sodikuna — tahap fondasi

Branch pengembangan: `feature/absensi-wajah`

## Yang disiapkan
- Metadata persetujuan aktif pada `public.face_consents`.
- Template biometrik terenkripsi pada schema `private.face_templates`.
- Tidak ada endpoint publik untuk membaca template biometrik.
- Tidak menyimpan foto mentah atau embedding tanpa enkripsi.
- Tabel lama `jamaah`, `agenda`, dan `attendance` tidak diubah oleh migrasi ini.

## Penghapusan biometrik
Jika admin menarik persetujuan atau meminta penghapusan data biometrik seorang jamaah, backend harus menghapus secara fisik baris terkait dari `private.face_templates` dan `public.face_consents`. Jangan membuat soft-delete, alasan penarikan, atau tabel riwayat penghapusan. Jangan menghapus data jamaah atau riwayat absensinya.

Penghapusan dari database aktif tidak menjamin penghapusan seketika dari backup, snapshot, atau log infrastruktur penyedia. Masa retensi cadangan mengikuti kebijakan Supabase.

## Syarat sebelum fitur diaktifkan
Migrasi ini baru fondasi skema. Jangan aktifkan pendaftaran/pengenalan wajah sampai backend dan pengujian selesai. Backend harus:
1. Memverifikasi sesi petugas dan memastikan perannya admin.
2. Memeriksa persetujuan aktif dan versi formulir persetujuan.
3. Menghasilkan embedding hanya di lingkungan tepercaya.
4. Mengenkripsi embedding dengan secret terpisah dari database.
5. Menghapus template dan persetujuan secara fisik saat diminta.
6. Mencatat kehadiran secara idempotent (unique `agenda_id + jamaah_id`).
7. Tidak mengirim template atau foto wajah ke browser/URL publik.
8. Tidak mencatat foto, embedding, atau identitas jamaah ke log fungsi.

Untuk jamaah anak, wajib ada persetujuan orang tua/wali. Jamaah tanpa persetujuan atau yang tidak dikenali tetap dapat memakai QR atau konfirmasi manual.

## Belum dikerjakan
- Backend enrollment, match, withdrawal dan face check-in.
- Pemilihan/validasi model pengenalan wajah dan liveness/anti-spoofing.
- UI kamera, pendaftaran dan persetujuan.
- Pengujian perangkat nyata serta penilaian akurasi/fairness.
- SQL migrasi belum dijalankan di Supabase dan belum di-deploy ke Netlify.
