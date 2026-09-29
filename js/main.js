/* $ / $$ accept an optional root so a widget can look inside itself
   (needed now that one page can hold several carousels). */
const $ = (s, root) => (root || document).querySelector(s);
const $$ = (s, root) => [...(root || document).querySelectorAll(s)];

const IN_PAGES = /[\\/]pages[\\/]/i.test(location.pathname);

function page(path) {
  const clean = String(path).replace(/^\/+/, '');
  if (clean === 'index.html' || clean === '') return IN_PAGES ? '../index.html' : 'index.html';
  if (IN_PAGES) return clean.replace(/^pages\//i, '');
  return clean.startsWith('pages/') ? clean : ('pages/' + clean);
}

function asset(path) {
  const clean = String(path).replace(/^\/+/, '');
  return IN_PAGES ? ('../' + clean) : clean;
}


/* =============================================================
   PHOTOGRAPHY HELPERS — art-directed, responsive crops
   Config lives in js/data.js: DIHAIR.photos (focal points),
   DIHAIR.photoSubstitute (404 photos), DIHAIR.heroSlides.

   PIC[part] describes the box a photo is shown in: [w, h] in CSS px
   (2x for retina) + the `sizes` hint. Because the delivered file is
   requested with the same aspect ratio as its box, object-fit:cover only
   has a couple of percent left to trim — that is what stops subjects from
   being cut off. `crop=faces|entropy` keeps the subject inside that crop,
   the focal point (--pos-d / --pos-m) fine-tunes it per breakpoint.
   ============================================================= */
const PIC = {
  service: { box: [760, 545], sizes: '(max-width:760px) 78vw, (max-width:1100px) 46vw, 23vw' },
  catalog: { box: [720, 420], sizes: '(max-width:760px) 92vw, (max-width:1100px) 46vw, 30vw' },
  pkg: { box: [760, 430], sizes: '(max-width:760px) 92vw, (max-width:1100px) 46vw, 30vw' },
  product: { box: [760, 590], sizes: '(max-width:760px) 92vw, (max-width:1100px) 46vw, 30vw' },
  artist: { box: [660, 630], sizes: '(max-width:760px) 72vw, (max-width:1100px) 46vw, 23vw' },
  location: { box: [1400, 540], sizes: '(max-width:1100px) 46vw, 48vw', mobile: [700, 480], mobileSizes: '82vw' },
  gallery: { box: [700, 620], sizes: '(max-width:760px) 72vw, (max-width:1100px) 46vw, 23vw' },
  story: { box: [1400, 950], sizes: '(max-width:760px) 95vw, 50vw' },
  academy: { box: [1000, 640], sizes: '(max-width:760px) 95vw, 50vw' },
  hero: { box: [2000, 1000], sizes: '100vw', mobile: [1080, 1620] }
};

function photoId(url) {
  const m = String(url || '').match(/photo-[0-9a-f-]+/i);
  return m ? m[0] : '';
}

/* Swap photos that no longer exist upstream (see DIHAIR.photoSubstitute). */
function photoUrl(url) {
  const id = photoId(url);
  const sub = id && DIHAIR.photoSubstitute ? DIHAIR.photoSubstitute[id] : '';
  return sub ? String(url).replace(id, sub) : String(url || '');
}

/* Focal point of a photo: 'd' (>=761px) or 'm' (<=760px). */
function photoFocal(url, bp) {
  const p = (DIHAIR.photos || {})[photoId(photoUrl(url))];
  if (!p) return '';
  return bp === 'm' ? (p.posM || p.pos || '') : (p.pos || '');
}

/* Ask the CDN for an explicit, subject-aware crop of `url`. */
function pic(url, w, h) {
  const src = photoUrl(url);
  if (!src || !/images\.unsplash\.com/i.test(src)) return src; // local assets pass through
  const cut = src.indexOf('?');
  const base = cut > -1 ? src.slice(0, cut) : src;
  const p = new URLSearchParams(cut > -1 ? src.slice(cut + 1) : '');
  const mode = ((DIHAIR.photos || {})[photoId(src)] || {}).mode;
  p.set('auto', 'format');
  p.set('fit', 'crop');
  p.set('w', String(w));
  if (h) p.set('h', String(h)); else p.delete('h');
  p.set('crop', mode === 'entropy' ? 'entropy' : 'faces');
  p.set('q', '78');
  return base + '?' + p.toString();
}

/* Inline CSS vars with the focal points (breakpoint chosen by style.css). */
function focalStyle(url, desktopPos, mobilePos, extra) {
  const d = desktopPos || photoFocal(url, 'd');
  const m = mobilePos || photoFocal(url, 'm') || d;
  const bits = [];
  if (d) bits.push('--pos-d:' + d);
  if (m) bits.push('--pos-m:' + m);
  if (extra) bits.push(extra);
  return bits.length ? ` style="${bits.join(';')}"` : '';
}

/* <img> with art-directed srcset + focal point, for any card/part. */
function picTag(url, part, alt) {
  const c = PIC[part] || PIC.gallery;
  const [w, h] = c.box;
  const [w2, h2] = [Math.round(w * 1.6), Math.round(h * 1.6)];
  return `<img src="${pic(url, w, h)}" srcset="${pic(url, w, h)} ${w}w, ${pic(url, w2, h2)} ${w2}w" sizes="${c.sizes}" alt="${alt || ''}" loading="lazy" decoding="async"${focalStyle(url)}>`;
}

/* Hero slide photo: portrait crop on mobile, wide crop on desktop, so the
   mobile hero is not a zoomed-in slice of the desktop image. */
function heroPhoto(slide) {
  const c = PIC.hero;
  const [w, h] = c.box;
  const [mw, mh] = c.mobile;
  const wide = [Math.round(w * 1.25), Math.round(h * 1.25)];
  const tall = [Math.round(mw * 1.2), Math.round(mh * 1.2)];
  return `<picture>
      <source media="(max-width:760px)" srcset="${pic(slide.image, mw, mh)} ${mw}w, ${pic(slide.image, tall[0], tall[1])} ${tall[0]}w" sizes="100vw">
      <img class="hero-media" src="${pic(slide.image, w, h)}" srcset="${pic(slide.image, w, h)} ${w}w, ${pic(slide.image, wide[0], wide[1])} ${wide[0]}w" sizes="100vw" alt="${slide.alt || ''}" fetchpriority="high" decoding="async"${focalStyle(slide.image, slide.desktopPosition, slide.mobilePosition)}>
    </picture>`;
}

/* Location card photo: the card box changes shape (≈82vw x 220px on mobile,
   ≈48vw x 220px on desktop), so one crop cannot serve both. Same idea as the
   hero: a near-4:3 crop for mobile, a wide banner crop for desktop. */
function locationPhoto(loc) {
  const c = PIC.location;
  const [w, h] = c.box;
  const [mw, mh] = c.mobile;
  const wide = [Math.round(w * 1.6), Math.round(h * 1.6)];
  const fit = [Math.round(mw * 1.6), Math.round(mh * 1.6)];
  return `<picture>
          <source media="(max-width:760px)" srcset="${pic(loc.image, mw, mh)} ${mw}w, ${pic(loc.image, fit[0], fit[1])} ${fit[0]}w" sizes="${c.mobileSizes}">
          <img src="${pic(loc.image, w, h)}" srcset="${pic(loc.image, w, h)} ${w}w, ${pic(loc.image, wide[0], wide[1])} ${wide[0]}w" sizes="${c.sizes}" alt="${loc.name || ''}" loading="lazy" decoding="async"${focalStyle(loc.image)}>
        </picture>`;
}


function header() {
  return `
  <header class="site-header" id="siteHeader">
    <div class="header-inner">
      <a class="brand" href="${page('index.html')}" aria-label="DI HAIR STUDIO & NAIL Home">
        <img src="${asset('assets/logo/dihair-logo.png')}" alt="DI HAIR STUDIO & NAIL" width="60" height="60">
      </a>

      <nav class="desktop-nav" aria-label="Navigasi Utama">
        <a href="${page('index.html')}">HOME</a>
        <a href="${page('pages/services.html')}">SERVICES</a>
        <a href="${page('pages/packages.html')}">PACKAGES</a>
        <a href="${page('pages/products.html')}">PRODUCTS</a>
        <a href="${page('pages/our-work.html')}">OUR WORK</a>
        <a href="${page('pages/artists.html')}">ARTISTS</a>
        <a href="${page('pages/locations.html')}">LOCATIONS</a>

        <div class="nav-more" id="navMore">
          <button type="button" aria-expanded="false" aria-haspopup="true">
            MORE <span class="chevron">▾</span>
          </button>
          <div class="more-menu" role="menu">
            <a href="${page('pages/about.html')}" role="menuitem">ABOUT</a>
            <a href="${page('pages/academy.html')}" role="menuitem">ACADEMY</a>
            <a href="${page('pages/program.html')}" role="menuitem">PROGRAM</a>
            <a href="${page('pages/franchise.html')}" role="menuitem">FRANCHISE</a>
          </div>
        </div>
      </nav>

      <div class="header-actions">
        <a class="nav-book" href="${ZENWEL_URL}" target="_blank" rel="noopener">BOOK NOW</a>
        <button class="menu-toggle" id="menuToggle" aria-label="Buka navigasi mobile" aria-expanded="false" aria-controls="mobileMenu">
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </div>
  </header>

  <div class="mobile-menu" id="mobileMenu" aria-hidden="true">
    <div class="mobile-menu-inner">
      <div class="mobile-menu-head">
        <span class="mobile-menu-label">NAVIGATION</span>
        <button class="mobile-menu-close" id="mobileClose" aria-label="Tutup navigasi">✕</button>
      </div>
      <nav class="mobile-nav-links">
        <a href="${page('index.html')}"><span class="nav-idx">01</span> HOME</a>
        <a href="${page('pages/services.html')}"><span class="nav-idx">02</span> SERVICES</a>
        <a href="${page('pages/packages.html')}"><span class="nav-idx">03</span> PACKAGES</a>
        <a href="${page('pages/products.html')}"><span class="nav-idx">04</span> PRODUCTS</a>
        <a href="${page('pages/our-work.html')}"><span class="nav-idx">05</span> OUR WORK</a>
        <a href="${page('pages/artists.html')}"><span class="nav-idx">06</span> ARTISTS</a>
        <a href="${page('pages/locations.html')}"><span class="nav-idx">07</span> LOCATIONS</a>
        <div class="mobile-divider"></div>
        <a href="${page('pages/about.html')}"><span class="nav-idx">08</span> ABOUT</a>
        <a href="${page('pages/academy.html')}"><span class="nav-idx">09</span> ACADEMY</a>
        <a href="${page('pages/program.html')}"><span class="nav-idx">10</span> PROGRAM</a>
        <a href="${page('pages/franchise.html')}"><span class="nav-idx">11</span> FRANCHISE</a>
      </nav>
      <div class="mobile-menu-footer">
        <a class="mobile-book" href="${ZENWEL_URL}" target="_blank" rel="noopener">BOOK DI HAIR STUDIO ↗</a>
        <div class="mobile-quick-wa">
          <a href="https://wa.me/6287797894767" target="_blank" rel="noopener">WA REV</a>
          <span>·</span>
          <a href="https://wa.me/6285773230091" target="_blank" rel="noopener">WA JOCA</a>
        </div>
      </div>
    </div>
  </div>`;
}

function footer() {
  return `
  <footer class="footer">
    <div class="footer-top">
      <div class="footer-brand-col">
        <a href="${page('index.html')}" class="footer-logo-link">
          <img src="${asset('assets/logo/dihair-logo.png')}" class="footer-logo" alt="DI HAIR STUDIO & NAIL">
        </a>
        <h4 class="footer-brand-title">DI HAIR</h4>
        <p class="footer-brand-sub">Hair · Beauty · Nail</p>
        <p class="footer-bio">A modern studio for personal style, beauty and self-expression. Elevating hair craft & grooming rituals.</p>
        <div class="footer-hours-badge">
          <span>EVERY DAY</span> · 10.00 – 22.00
        </div>
      </div>

      <div class="footer-nav-col">
        <p class="footer-label">EXPLORE</p>
        <a href="${page('pages/services.html')}">Services</a>
        <a href="${page('pages/packages.html')}">Packages</a>
        <a href="${page('pages/products.html')}">Products</a>
        <a href="${page('pages/our-work.html')}">Our Work</a>
        <a href="${page('pages/artists.html')}">Artists</a>
        <a href="${page('pages/locations.html')}">Locations</a>
      </div>

      <div class="footer-nav-col">
        <p class="footer-label">COMPANY</p>
        <a href="${page('pages/about.html')}">About</a>
        <a href="${page('pages/academy.html')}">Academy</a>
        <a href="${page('pages/program.html')}">Program</a>
        <a href="${page('pages/franchise.html')}">Franchise</a>
      </div>

      <div class="footer-nav-col">
        <p class="footer-label">BOOKING</p>
        <a href="${ZENWEL_URL}" target="_blank" rel="noopener" class="footer-book-link">Book Online ↗</a>
        <a href="https://wa.me/6287797894767" target="_blank" rel="noopener">WhatsApp REV</a>
        <a href="https://wa.me/6285773230091" target="_blank" rel="noopener">WhatsApp JOCA</a>
        <a href="https://wa.me/6281295713034" target="_blank" rel="noopener">Franchise Info</a>
      </div>
    </div>

    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} DI HAIR STUDIO & NAIL. ALL RIGHTS RESERVED.</span>
      <span>GAYAMU DI MULAI DI SINI.</span>
    </div>
  </footer>`;
}


function initShell() {
  const headerContainer = $('#site-header');
  const footerContainer = $('#site-footer');
  if (headerContainer) headerContainer.innerHTML = header();
  if (footerContainer) footerContainer.innerHTML = footer();

  const toggle = $('#menuToggle');
  const closeBtn = $('#mobileClose');
  const menu = $('#mobileMenu');

  function openMenu() {
    if (!menu) return;
    menu.classList.add('is-open');
    menu.setAttribute('aria-hidden', 'false');
    toggle?.classList.add('is-open');
    toggle?.setAttribute('aria-expanded', 'true');
    document.body.classList.add('menu-locked');
  }

  function closeMenu() {
    if (!menu) return;
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    toggle?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-locked');
  }

  toggle?.addEventListener('click', () => {
    if (menu?.classList.contains('is-open')) closeMenu();
    else openMenu();
  });

  closeBtn?.addEventListener('click', closeMenu);

  $$('#mobileMenu a').forEach(a => {
    a.addEventListener('click', closeMenu);
  });

  const moreBtn = $('#navMore button');
  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = moreBtn.getAttribute('aria-expanded') === 'true';
    moreBtn.setAttribute('aria-expanded', !isExpanded);
    $('#navMore')?.classList.toggle('is-active', !isExpanded);
  });

  document.addEventListener('click', () => {
    if ($('#navMore')?.classList.contains('is-active')) {
      moreBtn?.setAttribute('aria-expanded', 'false');
      $('#navMore')?.classList.remove('is-active');
    }
  });

  function handleScroll() {
    const siteHeader = $('#siteHeader');
    if (siteHeader) {
      siteHeader.classList.toggle('scrolled', window.scrollY > 30);
    }
  }
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

// Service Card - PENTING: Sesuai Master Task Bagian 9, HILANGKAN HARGA DARI SERVICE CARDS
function cardService(x, idx) {
  const categoryTag = x.category || 'SIGNATURE';
  const num = String((idx || 0) + 1).padStart(2, '0');
  return `
  <article class="service-card">
    <div class="card-image">
      ${picTag(x.image, 'service', x.name)}
      <span class="card-tag">${categoryTag}</span>
    </div>
    <div class="card-body">
      <div class="card-meta">
        <span class="card-num">${num}</span>
        <span class="card-cat">${categoryTag}</span>
      </div>
      <h3 class="card-title">${x.name}</h3>
      <p class="card-desc">${x.desc}</p>
      <div class="card-actions">
        <a class="card-cta" href="${page('pages/services.html')}">EXPLORE →</a>
        <a class="card-book" href="${ZENWEL_URL}" target="_blank" rel="noopener">BOOK</a>
      </div>
    </div>
  </article>`;
}

// Package Card (Harga BOLEH ditampilkan pada Packages)
function cardPackage(pkg) {
  const includesList = (pkg.includes || []).map(inc => `<li>${inc}</li>`).join('');
  return `
  <article class="pkg-card">
    <div class="pkg-image">
      ${picTag(pkg.image, 'pkg', pkg.name)}
      <span class="pkg-code">${pkg.code}</span>
    </div>
    <div class="pkg-body">
      <div class="pkg-meta">
        <span class="pkg-category">${pkg.category || 'CURATED PACKAGE'}</span>
        <span class="pkg-duration">${pkg.duration || 'Flexible'}</span>
      </div>
      <h3 class="pkg-name">${pkg.name}</h3>
      <p class="pkg-desc">${pkg.description}</p>
      <ul class="pkg-includes">
        ${includesList}
      </ul>
      <div class="pkg-foot">
        <div class="pkg-price-wrap">
          <span class="price-label">INVESTMENT</span>
          <span class="pkg-price">${pkg.price}</span>
        </div>
        <a class="button button-dark pkg-book-btn" href="${ZENWEL_URL}" target="_blank" rel="noopener">BOOK PACKAGE ↗</a>
      </div>
    </div>
  </article>`;
}

// Product Card (Status COMING SOON, Price placeholder)
function cardProduct(prod) {
  const benefitsList = (prod.benefits || []).map(b => `<li>${b}</li>`).join('');
  return `
  <article class="product-card">
    <div class="product-image">
      ${picTag(prod.image, 'product', prod.name)}
      <span class="product-status-badge">${prod.status}</span>
    </div>
    <div class="product-body">
      <span class="product-cat">${prod.category} · ${prod.size}</span>
      <h3 class="product-name">${prod.name}</h3>
      <p class="product-tagline">${prod.tagline}</p>
      <p class="product-desc">${prod.description}</p>
      <ul class="product-benefits">
        ${benefitsList}
      </ul>
      <div class="product-foot">
        <span class="product-price">${prod.price}</span>
        <span class="product-note">OFFICIAL BRAND LAUNCH SOON</span>
      </div>
    </div>
  </article>`;
}

function renderHome() {
  const sigContainer = $('#signatureServices');
  const pkgContainer = $('#homePackages');
  const galContainer = $('#homeGallery');
  const artContainer = $('#homeArtists');
  const locContainer = $('#homeLocations');

  if (sigContainer && DIHAIR.signature) {
    sigContainer.innerHTML = DIHAIR.signature.map((x, i) => cardService(x, i)).join('');
  }

  // Tampilkan 3 featured packages di homepage sesuai brief
  if (pkgContainer && DIHAIR.packages) {
    const featuredPackages = DIHAIR.packages.filter(p => p.featured).slice(0, 3);
    pkgContainer.innerHTML = (featuredPackages.length ? featuredPackages : DIHAIR.packages.slice(0, 3)).map(cardPackage).join('');
  }

  if (galContainer && DIHAIR.gallery) {
    galContainer.innerHTML = DIHAIR.gallery.map((x, i) => {
      const title = Array.isArray(x) ? x[0] : x.title;
      const img = Array.isArray(x) ? x[1] : x.image;
      const cat = Array.isArray(x) ? (x[2] || 'STUDIO') : (x.category || 'STUDIO');
      return `
      <a class="gallery-card" href="${page('pages/our-work.html')}">
        ${picTag(img, 'gallery', title)}
        <div class="gallery-info">
          <span class="gal-cat">${cat.toUpperCase()}</span>
          <span class="gal-title">${String(i + 1).padStart(2, '0')} · ${title}</span>
        </div>
      </a>`;
    }).join('');
  }

  if (artContainer && DIHAIR.artists) {
    artContainer.innerHTML = DIHAIR.artists.map(x => `
      <article class="artist-card">
        <div class="artist-image">
          ${picTag(x.image, 'artist', x.name)}
          <span class="artist-branch-pill">BRANCH ${x.branch}</span>
        </div>
        <div class="artist-details">
          <h3 class="artist-name">${x.name}</h3>
          <p class="artist-role">${x.role}</p>
          <p class="artist-specialty">${x.specialty || ''}</p>
        </div>
      </article>`).join('');
  }

  if (locContainer && DIHAIR.locations) {
    locContainer.innerHTML = DIHAIR.locations.map(x => `
      <article class="location-card">
        <div class="loc-img-wrap">
          ${locationPhoto(x)}
          <span class="loc-badge">${x.short}</span>
        </div>
        <div class="loc-content">
          <p class="loc-tagline">DI HAIR STUDIO</p>
          <h3 class="loc-title">${x.name}</h3>
          <p class="loc-address">${x.address}</p>
          <div class="loc-hours-line">
            <strong>OPERATIONAL</strong>
            <span>Every Day · ${x.hours || DIHAIR.hours}</span>
          </div>
          <div class="loc-team-preview">
            <span class="team-label">STUDIO ARTISTS</span>
            <p>${Array.isArray(x.team) ? x.team.map(t => typeof t === 'string' ? t.split('—')[0].trim() : t.name).join(', ') : ''}</p>
          </div>
          <div class="loc-actions">
            <a class="loc-wa-btn" href="${x.waLink}" target="_blank" rel="noopener">WHATSAPP BRANCH</a>
            <a class="loc-book-btn" href="${x.bookingUrl || ZENWEL_URL}" target="_blank" rel="noopener">BOOK AT ${x.short} ↗</a>
          </div>
        </div>
      </article>`).join('');
  }
}

/* =============================================================
   HERO — slides come from DIHAIR.heroSlides (js/data.js) so every slide
   owns its own crop + focal point. Autoplay pauses whenever the visitor is
   busy: hovering, tabbing through the controls, another tab in front, or
   the slider scrolled out of view. With prefers-reduced-motion the slider
   never moves on its own and changes are announced politely instead.
   ============================================================= */
const HERO_MS = 6500;

function renderHero() {
  const root = $('.hero');
  const list = root && $('.hero-slides', root);
  if (!list || !Array.isArray(DIHAIR.heroSlides) || !DIHAIR.heroSlides.length) return;
  const total = DIHAIR.heroSlides.length;

  /* Same markup contract as before: article.hero-slide > .hero-overlay +
     .hero-copy holding .eyebrow, h1/h2, p and a.button.button-light — so all
     existing hero CSS keeps working. Only the photo layer changes: a static
     background-image becomes an art-directed <picture> (wide crop on desktop,
     tall crop on mobile) positioned by its own focal point. */
  list.innerHTML = DIHAIR.heroSlides.map((s, i) => {
    const cta = s.cta || {};
    const tag = s.heading || 'h2';
    return `
    <article class="hero-slide${i === 0 ? ' is-active' : ''}" role="group" aria-roledescription="slide" aria-label="Slide ${i + 1} dari ${total}: ${s.eyebrow}">
      ${heroPhoto(s)}
      <div class="hero-overlay"></div>
      <div class="hero-copy">
        <p class="eyebrow">${s.eyebrow}</p>
        <${tag}>${s.title}</${tag}>
        <p>${s.copy}</p>
        <a class="button button-light" href="${cta.href || ZENWEL_URL}"${cta.external ? ' target="_blank" rel="noopener"' : ''}>${cta.text || 'BOOK NOW'}</a>
      </div>
    </article>`;
  }).join('');

  /* Dots, the counter and the live region are generated from the data, so
     they can never drift out of sync with the number of slides. */
  if (!root.querySelector('.hero-dots')) {
    root.insertAdjacentHTML('beforeend', '<div class="hero-dots"></div>');
  }
  root.querySelector('.hero-dots').innerHTML = DIHAIR.heroSlides.map((s, i) =>
    `<button type="button" class="hero-dot${i === 0 ? ' is-active' : ''}" data-slide="${i}" aria-label="Tampilkan slide ${i + 1}: ${s.eyebrow}" aria-current="${i === 0 ? 'true' : 'false'}"></button>`).join('');

  const counter = $('.hero-counter', root);
  if (counter) counter.innerHTML = `<span id="heroCurrent">01</span> / ${String(total).padStart(2, '0')}`;

  /* Screen readers hear which slide is showing without stealing focus. */
  if (!$('.hero-status', root)) {
    root.insertAdjacentHTML('beforeend',
      `<p class="hero-status visually-hidden" aria-live="polite">Slide 1 dari ${total}</p>`);
  }

  /* The first hero photo is the Largest Contentful Paint: warm it up here so
     the browser starts the request as early as possible. */
  const first = DIHAIR.heroSlides[0];
  if (first && !document.querySelector('link[data-hero-preload]')) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.fetchPriority = 'high';
    link.dataset.heroPreload = 'true';
    link.href = pic(first.image, PIC.hero.box[0], PIC.hero.box[1]);
    document.head.appendChild(link);
  }
}

function hero() {
  const root = $('.hero');
  if (!root || !$('.hero-slide', root)) return;
  const slides = $$('.hero-slide', root);
  const dots = $$('.hero-dot', root);
  const status = $('.hero-status', root);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = 0, timer = null, hovering = false, focusing = false, inView = true;

  const goTo = n => {
    const next = (n + slides.length) % slides.length;
    if (next === cur) return;
    slides[cur].classList.remove('is-active');
    dots[cur]?.classList.remove('is-active');
    dots[cur]?.setAttribute('aria-current', 'false');
    cur = next;
    slides[cur].classList.add('is-active');
    dots[cur]?.classList.add('is-active');
    dots[cur]?.setAttribute('aria-current', 'true');
    if (status) status.textContent = `Slide ${cur + 1} dari ${slides.length}`;
    const counter = $('#heroCurrent');
    if (counter) counter.textContent = String(cur + 1).padStart(2, '0');
    const bar = $('#heroProgress');
    if (bar) {
      bar.style.animation = 'none';
      void bar.offsetWidth;
      bar.style.animation = `heroProgress ${HERO_MS}ms linear forwards`;
    }
  };

  /* Autoplay only runs while the visitor is actually watching. */
  const start = () => {
    if (reduced || hovering || focusing || !inView || document.hidden || timer) return;
    timer = setInterval(() => goTo(cur + 1), HERO_MS);
    root.classList.add('is-playing');
  };
  const stop = () => { clearInterval(timer); timer = null; root.classList.remove('is-playing'); };
  const restart = () => { stop(); start(); };

  root.classList.toggle('is-static', reduced);
  if (reduced && status) status.textContent = `Slide 1 dari ${slides.length} · rotasi otomatis dimatikan`;

  $('.hero-next')?.addEventListener('click', () => { goTo(cur + 1); restart(); });
  $('.hero-prev')?.addEventListener('click', () => { goTo(cur - 1); restart(); });
  dots.forEach(dot => dot.addEventListener('click', () => {
    goTo(parseInt(dot.dataset.slide, 10) || 0);
    restart();
  }));

  /* Keyboard: arrows change slides, Home/End jump to the ends. The slider is
     skipped with Tab, never trapped. */
  root.setAttribute('tabindex', '-1');
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(cur + 1); restart(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(cur - 1); restart(); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); restart(); }
    else if (e.key === 'End') { e.preventDefault(); goTo(slides.length - 1); restart(); }
  });

  /* Pause while focus is inside: a keyboard or screen-reader user must not
     have the panel change underneath them. */
  root.addEventListener('focusin', () => { focusing = true; stop(); });
  root.addEventListener('focusout', () => {
    focusing = root.contains(document.activeElement);
    if (!focusing) start();
  });
  root.addEventListener('mouseenter', () => { hovering = true; stop(); });
  root.addEventListener('mouseleave', () => { hovering = false; start(); });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  /* Pause when scrolled away — nobody watches a slider that is off screen. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      inView = entries.some(x => x.isIntersecting);
      inView ? start() : stop();
    }, { threshold: 0.15 }).observe(root);
  }

  /* Swipe, without ever stealing the vertical page scroll. */
  let startX = 0, startY = 0, swiping = false;
  root.addEventListener('touchstart', e => {
    startX = e.changedTouches[0].clientX;
    startY = e.changedTouches[0].clientY;
    swiping = true;
    stop();
  }, { passive: true });
  root.addEventListener('touchend', e => {
    if (!swiping) return;
    swiping = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goTo(dx < 0 ? cur + 1 : cur - 1);
    }
    start();
  }, { passive: true });

  start();
}

function initCarousels(scope) {
  $$('[data-carousel]', scope || document).forEach(buildCarousel);
}

/* Wrap a grid in a scroll-snap carousel without touching page markup:
   only the container itself scrolls horizontally, so the vertical page
   scroll is never hijacked, and swipe works natively on touch. */
function buildCarousel(track) {
  if (!track || track.dataset.carouselReady === 'true') return;
  track.dataset.carouselReady = 'true';
  if (track.children.length === 0) { /* filled later by a page script */ }

  let shell = track.parentElement && track.parentElement.classList.contains('carousel')
    ? track.parentElement : null;
  if (!shell) {
    shell = document.createElement('div');
    shell.className = 'carousel';
    shell.setAttribute('role', 'group');
    shell.setAttribute('aria-label', track.dataset.carouselLabel || 'Geser untuk melihat selengkapnya');
    track.parentNode.insertBefore(shell, track);
    shell.appendChild(track);
    shell.insertAdjacentHTML('beforeend',
      `<button type="button" class="carousel-btn carousel-prev" aria-label="Sebelumnya">←</button>
       <button type="button" class="carousel-btn carousel-next" aria-label="Berikutnya">→</button>`);
  }
  track.classList.add('carousel-track');
  track.tabIndex = 0;

  const prev = $('.carousel-prev', shell);
  const next = $('.carousel-next', shell);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const step = () => {
    const first = track.firstElementChild;
    if (!first) return track.clientWidth || 300;
    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
    return first.getBoundingClientRect().width + gap;
  };
  const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const sync = () => {
    const room = maxScroll();
    shell.classList.toggle('is-fitted', room <= 4);
    if (prev) prev.disabled = track.scrollLeft <= 4;
    if (next) next.disabled = track.scrollLeft >= room - 4;
  };

  shell.addEventListener('click', e => {
    const btn = e.target.closest('.carousel-btn');
    if (!btn) return;
    track.scrollBy({
      left: (btn.classList.contains('carousel-next') ? 1 : -1) * step(),
      behavior: reduced ? 'auto' : 'smooth'
    });
  });

  /* Arrow keys move the carousel only while it (or a child) has focus. */
  track.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    track.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * step(), behavior: reduced ? 'auto' : 'smooth' });
  });

  let raf = 0;
  track.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; sync(); });
  }, { passive: true });
  window.addEventListener('resize', sync, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(sync).observe(track);
  /* Exposed so content that arrives *after* init (page scripts fill their own
     grid) can re-sync the arrows: adding children changes scrollWidth but not
     the track's own box, so ResizeObserver would never notice. */
  track.__carouselSync = sync;
  sync();
}

/* Grids are often filled by a page script after init() — pick up any
   [data-carousel] container that appears later, and re-sync the ones whose
   content changed so the arrows/scroll state stay correct. */
function watchCarousels() {
  if (!('MutationObserver' in window)) return;
  const check = node => {
    if (!node || node.nodeType !== 1) return;
    if (node.matches && node.matches('[data-carousel]')) buildCarousel(node);
    if (node.querySelectorAll) node.querySelectorAll('[data-carousel]').forEach(buildCarousel);
  };
  const resync = node => {
    if (!node || node.nodeType !== 1) return;
    const track = node.matches && node.matches('[data-carousel]')
      ? node : (node.closest ? node.closest('[data-carousel]') : null);
    if (track && track.__carouselSync) track.__carouselSync();
  };
  new MutationObserver(muts => muts.forEach(m => {
    m.addedNodes.forEach(n => { check(n); resync(n); });
    m.removedNodes.forEach(resync);
  })).observe(document.body, { childList: true, subtree: true });
}

/* Broken image tripwire: a missing photo is logged and the card gets a
   class so CSS can show a graceful placeholder instead of an empty box. */
function watchImages() {
  document.addEventListener('error', e => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG' || img.dataset.imgRetried === 'true') return;
    img.dataset.imgRetried = 'true';
    console.warn('[DIHAIR] image gagal dimuat:', img.currentSrc || img.src);
    img.closest('.service-card, .pkg-card, .artist-card, .product-card, .location-card, .gallery-card, .catalog-card, .nail-image, .story-image, .acad-image, .hero-slide')
      ?.classList.add('is-img-missing');
  }, true);
}

function init() {
  initShell();
  renderHero();
  hero();
  renderHome();
  initCarousels();
  watchCarousels();
  watchImages();
}

document.addEventListener('DOMContentLoaded', init);

