# Evaluasi teknis Absensi Wajah Sodikuna

Tanggal evaluasi: 19 November 2026
Branch: `feature/absensi-wajah`

## Keputusan sementara

Jangan mengirim foto atau frame kamera ke Supabase. Arah yang paling sesuai dengan batasan privasi proyek adalah pemrosesan awal di perangkat (browser) menggunakan model ONNX yang berjalan melalui WebAssembly. Browser hanya mengirim template hasil ekstraksi yang sudah dienkripsi ke backend Supabase; foto/frame kamera tidak diunggah atau disimpan.

Ini masih keputusan arsitektur sementara, bukan fitur siap produksi.

## Dasar teknis yang sudah diverifikasi

- Dokumentasi ONNX Runtime menyatakan ONNX Runtime Web dapat menjalankan inferensi di browser dengan WebAssembly (CPU), termasuk Chrome/Edge Android. WebGPU tersedia pada sebagian versi Chromium Android, tetapi bukan syarat minimum.
- Dokumentasi ONNX Runtime menjelaskan inferensi di browser mengurangi pengiriman data ke server dan dapat meningkatkan privasi karena data untuk inferensi tetap berada di perangkat.
- Supabase Edge Functions menyediakan autentikasi pemanggil melalui `withSupabase({ auth: 'user' })`, klien RLS pengguna, dan klien admin backend. Secret key hanya boleh digunakan di backend.

## Alur target (belum diimplementasikan)

1. Admin memilih jamaah dan membaca formulir persetujuan.
2. Orang dewasa menyetujui sendiri; untuk anak, persetujuan diberikan orang tua/wali.
3. Browser meminta akses kamera, mendeteksi wajah, menjalankan pemeriksaan kualitas dan anti-spoof/liveness.
4. Model di perangkat menghasilkan embedding/template. Frame/foto mentah tetap di memori perangkat dan dibuang setelah proses.
5. Template dienkripsi di browser dengan skema yang ditinjau secara kriptografis, lalu dikirim melalui HTTPS ke Edge Function.
6. Edge Function memverifikasi sesi admin, persetujuan aktif, ukuran/format payload, dan batas frekuensi; lalu menyimpan ciphertext ke schema privat.
7. Saat absensi, proses pengenalan dan pencocokan hanya dijalankan setelah pemeriksaan liveness. Backend memeriksa hasil dan mencatat hadir menggunakan pasangan unik agenda + jamaah.
8. Jika wajah tidak cocok, liveness gagal, tidak ada persetujuan, atau kamera/model tidak tersedia, petugas kembali ke QR atau pencarian manual.

## Hal yang wajib diuji sebelum pemilihan model

- Lisensi model dan bobot mengizinkan penggunaan pada aplikasi ini.
- Akurasi verifikasi pada kondisi nyata: pencahayaan, sudut, jarak kamera, kacamata, variasi perangkat Android, dan kelompok usia jamaah.
- Tingkat false accept dan false reject diukur; jangan memilih ambang hanya dari satu atau dua percobaan.
- Anti-spoof diuji terhadap foto cetak, foto di layar HP, dan video pemutaran ulang. Deteksi wajah biasa bukan bukti bahwa orang hadir secara langsung.
- Performa pada HP Android kelas bawah, penggunaan RAM, ukuran unduhan model, dan waktu pemindaian.
- Model dan runtime dipin versinya; aset model dihosting pada origin aplikasi, bukan mengambil model dari URL pihak ketiga saat absensi.
- Template dienkripsi dengan kunci backend terpisah dari database. Jangan menganggap enkripsi di browser menggantikan pemeriksaan otorisasi server.

## Batasan dan fallback

- ONNX Runtime Web adalah runtime inferensi, bukan model pengenalan wajah siap pakai. Model deteksi, pengenalan, dan liveness masih harus dipilih dan diuji terpisah.
- Pemrosesan di browser membantu menjaga foto tetap di perangkat, tetapi template biometrik tetap data sensitif. Pengiriman template hanya boleh melalui jalur terenkripsi dan backend terautentikasi.
- Tidak ada pengenalan wajah yang boleh otomatis mencatat hadir jika pemeriksaan gagal atau hasil ambigu.
- QR dan absensi manual tetap tersedia dan tidak boleh bergantung pada modul wajah.

## Status

Belum ada perubahan pada database produksi, Edge Function produksi, atau website Netlify. Migrasi dan fungsi penghapusan pada branch masih perlu diuji di lingkungan non-produksi. Jangan mengaktifkan fitur sampai model, liveness, enkripsi, kontrol akses, penghapusan, dan pengujian perangkat nyata lulus review.
