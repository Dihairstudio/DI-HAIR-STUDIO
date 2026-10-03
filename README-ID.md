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
(w/h) per breakpoint, kandidat `srcset` 1x + 2x, `sizes` yang mengikuti lebar render sebenarnya, titik
fokus per-foto (`DIHAIR.photos`) dan remap untuk foto yang sudah mati di Unsplash
(`DIHAIR.photoSubstitute`). Foto diminta dengan `auto=format,compress` + `q=72` supaya CDN tidak
pernah mengirim PNG mentah (sebelumnya satu foto sampai 960 KB). Empat skrip di `tools/` memeriksanya
dari terminal:

- `node tools/img-check.mjs audit` — cek semua URL foto masih hidup (HTTP 200). Id yang sudah mati tapi
  masih dipakai sebagai kunci `photoSubstitute` dilaporkan `SAFE`, bukan error.
- `node tools/img-check.mjs probe <url|id> [...]` — cek manual satu/beberapa URL foto.
- `node tools/img-check.mjs review <id> [...]` — unduh thumbnail 420px ke `tools/_review` (folder dev,
  bukan bagian `assets/`) untuk cek visual cepat.
- `node tools/render-check.mjs` — smoke test render: setiap foto diminta lewat `pic()` dengan crop +
  `q=72` + `auto=format,compress`, tiap tier punya kandidat 2x (tidak ada upscale di retina), hero
  art-directed per lebar+tinggi, hanya slide pertama yang `fetchpriority=high`, fallback statis di
  `index.html` memakai URL yang sama dengan skrip (hero tidak diunduh dua kali), semua foto punya titik
  fokus, tidak ada URL foto yang ditulis mati di HTML, dan tidak ada kartu yang membuat `<img>` langsung
  dari URL data.
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
- Setiap kartu kini punya satu crop per pita lebar (`PIC[part].tiers`, 6 pita) + kandidat 2x. Crop
  dipilih dari ukuran kartu asli yang terukur di browser, jadi rasio file ≈ rasio kotak dan
  `object-fit:cover` hanya memotong beberapa persen, bukan 30–50%.

## Perbaikan ukuran gambar (2026-10)
Audit ukuran gambar menemukan crop yang tidak cocok dengan kotak render-nya. Perbaikannya:
- **Hero terpotong 64%**: `.hero` setinggi `min(78vh,860px)` sehingga rasio kotaknya berayun 0,37–5,0
  tergantung lebar **dan tinggi** jendela; satu crop 2:1 tidak bisa melayani semuanya. Kini hero
  art-directed per `(width, height)` di `HERO_TIERS` (18 `<source>`), dan rasio tiap tier dipilih
  agar `cover` hanya memotong ≤25% (terukur 13–21% di viewport target). Layout hero tidak diubah.
- **PNG 960 KB**: `auto=format` sempat mengembalikan `image/png` untuk `photo-1598452963314`
  walau klien hanya menerima JPEG. Diganti `auto=format,compress` + `q=72` — file yang sama kini
  27–39 KB (WebP 15–27 KB, AVIF 11–16 KB) dan format modern tetap dinegosiasi.
- **Logo 264 KB untuk slot 52px**: `assets/logo/dihair-logo.png` di-downscale ke 128×128 (9,2 KB),
  cukup untuk DPR 2 pada slot 52/58px, tampilan identik. Atribut `width`/`height` disamakan dengan
  ukuran CSS.
- **`sizes` meleset**: diganti dengan lebar render yang benar-benar terukur per pita (mis. kartu
  service 15vw di 1920px, sebelumnya diklaim 23vw), dan tiap tier punya kandidat 2x sehingga tidak
  ada upscale di layar retina.
- **URL foto literal** (`.story-image`, `.nail-image` di `index.html`/`about.html`, dan gambar
  concept di `academy.html`) sekarang memakai atribut `data-photo` yang diproses `panels()` lewat
  `pic()` yang sama — dapat crop, `q`, dan remap 404 yang sama seperti kartu lain.
- **Kartu program terpotong 53%** di 768px: kolom foto program hanya separuh lebar kartu saat card
  masih 2-up, jadi crop-nya sendiri portrait di pita 761–1100px.
- **Grid inline** (`grid-template-columns` di `artists.html`/`our-work.html`) yang mengalahkan aturan
  carousel dihapus; kedua section itu kini memakai crop `*Page` (kontainer capped 1240px) terpisah
  dari versi homepage yang full-bleed.

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

