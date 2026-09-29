# DI HAIR STUDIO & NAIL V2

Versi awal modular berdasarkan brief DI HAIR, data cabang/artist yang diberikan, dan katalog treatment yang diunggah.

## Jalankan
Buka `index.html` di browser. Untuk pengalaman terbaik, gunakan local server sederhana (mis. VS Code Live Server).

## Ganti logo
File: `assets/logo/dihair-logo.png`
Ganti file tersebut dengan file logo baru dan pertahankan nama `dihair-logo.png`.

## Ganti foto
Foto placeholder saat ini memakai URL Unsplash agar website langsung terlihat.

Untuk foto lokal, simpan foto ke folder yang sesuai, lalu ubah URL di `js/data.js` atau `index.html`.

Folder utama:
- `assets/hero/`
- `assets/services/`
- `assets/gallery/`
- `assets/artists/`
- `assets/locations/`

## Ganti data layanan
Data Signature Services dan katalog ada di `js/data.js`.

- `DIHAIR.signature` = 10 layanan yang tampil di homepage.
- `DIHAIR.catalog` = katalog layanan lengkap.

Harga pada katalog mengikuti data PDF yang tersedia. Untuk layanan yang sebelumnya Anda berikan dengan harga berbeda dari PDF, data katalog PDF diprioritaskan pada daftar katalog; Signature Services mempertahankan data brief Anda, kecuali Hair Spa Mask yang disesuaikan ke harga PDF Rp75.000.

## Booking
Link booking online StudioKu tersimpan di `js/data.js` sebagai `ZENWEL_URL`.
Jika link berubah, cukup ubah satu baris itu.

## WhatsApp
Nomor cabang tersimpan di `DIHAIR.locations`.
Nomor kerja sama tersimpan di halaman `pages/collaboration.html`.

## QA foto & render (tanpa browser)
Semua gambar berjalan lewat helper di `js/main.js` (`pic()`, `picTag()`, `heroPhoto()`): crop eksplisit
(w/h), `srcset` 1.6x, titik fokus per-foto (`DIHAIR.photos`) dan remap untuk foto yang sudah mati di
Unsplash (`DIHAIR.photoSubstitute`). Empat skrip di `tools/` memeriksanya dari terminal:

- `node tools/img-check.mjs audit` — cek semua URL foto masih hidup (HTTP 200). Id yang sudah mati tapi
  masih dipakai sebagai kunci `photoSubstitute` dilaporkan `SAFE`, bukan error.
- `node tools/img-check.mjs probe <url|id> [...]` — cek manual satu/beberapa URL foto.
- `node tools/img-check.mjs review <id> [...]` — unduh thumbnail 420px ke `tools/_review` (folder dev,
  bukan bagian `assets/`) untuk cek visual cepat.
- `node tools/render-check.mjs` — smoke test render: setiap foto diminta dengan crop+q=78, `<picture>` hero
  punya source portrait + `fetchpriority=high` + titik fokus, kartu lokasi punya `<picture>` dua crop
  (banner desktop / mobile, bukan satu crop untuk dua bentuk kotak), fallback statis di `index.html` memakai
  URL yang sama dengan skrip (hero tidak diunduh dua kali), semua foto punya titik fokus, dan tidak ada kartu
  yang membuat `<img>` langsung dari URL data.
- `node tools/responsive-check.mjs [lebar ...]` — audit layout di Chrome headless (CDP, tanpa dependensi):
  14 halaman × 13 lebar (320, 375, 390, 430, 600, 768, 834, 1024, 1280, 1366, 1440, 1536, 1920).
  Gagal bila ada overflow horizontal, elemen keluar viewport, foto gepeng/rusak/ukuran nol, header salah
  breakpoint, menu hamburger tidak terbuka, carousel tidak bisa digeser, atau hero tidak maju. Laporan lengkap
  ditulis ke `tools/_review/responsive-report.json`. Tambahkan `--page=pages/about.html` untuk satu halaman.

Jalankan ketiganya sebelum deploy/commit:
`node tools/img-check.mjs audit && node tools/render-check.mjs && node tools/responsive-check.mjs`

Dua skrip satu-kali sebelumnya (`apply-pictag.mjs`, `fix-photo-usage.mjs`) sudah dijalankan dan aman
diulang: kalau pola tidak ditemukan lagi, skrip hanya melaporkan "already applied".

## Riwayat perbaikan foto
- 44 referensi foto di `js/data.js` dipindahkan ke foto yang subjeknya sesuai kartu (ada yang tadinya rak
  buku, wastafel kaki, atau meja rias).
- 5 id yang sudah dihapus dari Unsplash dipertahankan hanya sebagai kunci `photoSubstitute` supaya URL
  lama tetap aman; audit menandainya `SAFE`.
- Tujuh halaman (`academy`, `artists`, `franchise`, `locations`, `our-work`, `program`, `services`) kini
  memakai `picTag()` — sebelumnya menulis `<img src="...">` mentah sehingga tanpa crop/titik fokus.
- 13 grid menjadi carousel scroll-snap native (`data-carousel`) dengan tombol panah di desktop.
- Kartu lokasi art-directed seperti hero: satu foto dikirim dalam dua crop — 1400×540 (banner) untuk
  desktop, 700×480 untuk mobile — lewat `locationPhoto()` + `<source media="(max-width:760px)">`, karena
  kotak kartunya berubah bentuk (48vw×220px vs 82vw×220px).

## Riwayat perbaikan responsive
Audit `tools/responsive-check.mjs` (14 halaman × 13 lebar = 182 pemeriksaan) menemukan 2 bug layout;
keduanya diperbaiki tanpa mengubah desain:
- **Menu tablet mati (768/834/1024px)**: tombol hamburger muncul sejak 1100px ke bawah, tetapi gaya
  `.mobile-menu` hanya ada di blok `@media(max-width:760px)` — jadi panel tidak pernah tampil sementara
  `body` terkunci scroll. Sekarang gaya overlay ada di luar media query (di desktop tetap
  `visibility:hidden` sampai tombol ditekan).
- **Foto hero tidak pernah memenuhi layar**: `.hero-slide.is-active` adalah flex item tanpa lebar, jadi
  kotaknya menyusut ke lebar teks (601×842 di 1920px — foto potret di tengah hero). Ditambah
  `width:100%`; sekarang 1920×842 dan memakai crop 2:1 seperti yang diminta `PIC.hero`.

