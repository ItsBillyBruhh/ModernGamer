(function () {
  if (window.__modernGamerLoaded) return;   // Marketplace may load this twice
  window.__modernGamerLoaded = true;

  // ---- settings you can edit ----
  const MG_VIZ_ENABLED = true;        // false = no visualizer
  const MG_COLORS_ENABLED = true;     // false = no Colors page (the rainbow stays)
  const MG_LYRICS_ENABLED = true;     // false = no Lyrics page

// Modern Gamer — finds Spotify's panels and player parts WITHOUT relying on
// class names (Spotify's are randomized), then tags them with mg-* classes
// so user.css can lay them out.

const MG_TOP = '.Root__top-container, div:has(> .Root__lyrics-cinema)';

const MG_AREAS = {
  'left-sidebar': 'mg-ls',
  'main-view': 'mg-main',
  'right-sidebar': 'mg-rs',
  'now-playing-bar': 'mg-npb',
  'global-nav': 'mg-gn',
};

function waitForElement(els, func, timeout = 100) {
  const queries = els.map((el) => document.querySelector(el));
  if (queries.every((a) => a)) {
    func(queries);
  } else if (timeout > 0) {
    setTimeout(waitForElement, 300, els, func, --timeout);
  }
}

function debounce(fn, ms) {
  let t;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

function singleArea(el) {
  const parts = getComputedStyle(el).gridArea.split('/').map((s) => s.trim());
  return parts.every((p) => p === parts[0]) ? parts[0] : '';
}

/* add a class only if it's missing (avoids needless DOM writes / observer loops) */
function mgAdd(el, cls) {
  if (el && !el.classList.contains(cls)) el.classList.add(cls);
}

/* ================= SHARED HELPERS: artwork, track data, pages, top gap ================= */

/* Spotify serves each cover at several sizes; the size is encoded in the first 16 hex
   characters of the image id. Albums: 4851 = 64px, 1e02 = 300px, b273 = 640px.
   Artists: f178 = 160px, 5174 = 320px, e5eb = 640px. We always ask for the largest. */
const MG_ART_UP = {
  'ab67616d00004851': 'ab67616d0000b273',
  'ab67616d00001e02': 'ab67616d0000b273',
  'ab6761610000f178': 'ab6761610000e5eb',
  'ab67616100005174': 'ab6761610000e5eb',
};

function mgImgUrl(u) {
  if (!u) return '';
  return u.indexOf('spotify:image:') === 0 ? 'https://i.scdn.co/image/' + u.slice(14) : u;
}

function mgHiRes(u) {
  u = mgImgUrl(u);
  // playlist mosaics put the size in the path: .../300/<ids> -> .../640/<ids>
  if (/^https:\/\/mosaic\.scdn\.co\/(60|64|120|128|300)\//.test(u)) return u.replace(/\/(60|64|120|128|300)\//, '/640/');
  // any Spotify image host (i.scdn.co, image-cdn-*.spotifycdn.com, ...): .../image/<40 hex>
  const m = /^(https:\/\/[^/]+\/image\/)([0-9a-f]{16})([0-9a-f]{24})(\?.*)?$/i.exec(u);
  if (!m) return u;
  const up = MG_ART_UP[m[2].toLowerCase()];
  return up ? m[1] + up + m[3] : u;
}

/* the largest cover Spotify's player data offers for an item */
function mgPickArt(it) {
  if (!it) return '';
  const md = it.metadata || {};
  const list = [];
  const push = (x, w) => {
    const url = x && (typeof x === 'string' ? x : x.url);
    if (url) list.push({ url, w: w || (x && x.width) || 0 });
  };
  ((it.album && it.album.images) || []).forEach((i) => push(i));
  (it.images || []).forEach((i) => push(i, { small: 64, standard: 300, large: 640, xlarge: 640 }[i.label] || 0));
  push(md.image_xlarge_url, 640);
  push(md.image_large_url, 300);
  push(md.image_url, 300);
  push(md.image_small_url, 64);
  list.sort((a, b) => b.w - a.w);
  return mgHiRes(list.length ? list[0].url : '');
}

/* everything the pages need to know about the playing track */
function mgTrack() {
  const sp = window.Spicetify;
  const d = sp && sp.Player && sp.Player.data;
  const it = (d && (d.item || d.track)) || {};
  const md = it.metadata || {};
  const arr = Array.isArray(it.artists) ? it.artists : [];
  let dur = it.duration && typeof it.duration === 'object' ? it.duration.milliseconds : it.duration;
  dur = Number(dur) || Number(md.duration) || (sp && sp.Player && sp.Player.getDuration ? sp.Player.getDuration() : 0) || 0;
  return {
    uri: it.uri || '',
    name: it.name || md.title || '',
    artists: arr.length ? arr.map((a) => a.name).join(', ') : md.artist_name || '',
    artist1: (arr[0] && arr[0].name) || md.artist_name || '',
    album: (it.album && it.album.name) || md.album_title || '',
    duration: dur,
    art: mgPickArt(it),
  };
}

/* Swap a low-resolution <img> for the large version of the same cover, once it has loaded.
   If the large file can't be loaded the original stays - no flicker, no broken image. */
function mgUpgradeImg(img) {
  const cur = img.currentSrc || img.src;
  const hi = mgHiRes(cur);
  if (!hi || hi === cur || img._mgPending === hi) return;
  img._mgPending = hi;
  const t = new Image();
  t.decoding = 'async';
  t.onload = () => {
    img._mgPending = '';
    if (img.isConnected && (img.currentSrc || img.src) === cur) {
      img.removeAttribute('srcset');
      img.src = hi;
    }
  };
  t.onerror = () => { img._mgPending = ''; };
  t.src = hi;
}

/* The docked cover: take the large image straight from the player data, whatever host or
   size Spotify put in the <img>. Falls back to upgrading the <img>'s own URL. */
function mgApplyTrackArt(img) {
  const art = mgTrack().art;
  const cur = img.currentSrc || img.src;
  if (!art || cur === art || img._mgArt === art) { if (!art) mgUpgradeImg(img); return; }
  img._mgArt = art;
  const t = new Image();
  t.decoding = 'async';
  t.onload = () => {
    if (img._mgArt === art && img.isConnected) { img.removeAttribute('srcset'); img.src = art; }
  };
  t.onerror = () => { img._mgArt = ''; mgUpgradeImg(img); };
  t.src = art;
}

/* page headers / cards that are shown larger than their file: upgrade those too */
function mgUpgradeMain(main) {
  if (!main) return;
  const dpr = window.devicePixelRatio || 1;
  for (const img of main.querySelectorAll('img[src*="/image/ab67"], img[src*="mosaic.scdn.co"]')) {
    if (img._mgSeen === img.src || img.clientWidth < 100) continue;
    img._mgSeen = img.src;
    if (img.naturalWidth && img.clientWidth * dpr <= img.naturalWidth * 1.05) continue;
    mgUpgradeImg(img);
  }
}

/* run fn(Spicetify) as soon as the Player and Platform APIs exist */
function mgWhenSpicetify(fn, tries) {
  const sp = window.Spicetify;
  if (sp && sp.Player && sp.Player.addEventListener && sp.Platform) fn(sp);
  else if ((tries === undefined ? 300 : tries) > 0) setTimeout(mgWhenSpicetify, 300, fn, (tries === undefined ? 300 : tries) - 1);
}

/* ---------- pages: one fade in/out for every page (Visualizer, Lyrics, Colors) ---------- */
const MG_PAGE_CSS = `
.mg-page{opacity:0;transition:opacity .18s ease;pointer-events:none}
.mg-page.open{opacity:1;pointer-events:auto}
@media (prefers-reduced-motion:reduce){.mg-page{transition:none}}
`;
function mgInjectPageCss() {
  if (document.getElementById('mg-page-style')) return;
  const st = document.createElement('style');
  st.id = 'mg-page-style';
  st.textContent = MG_PAGE_CSS;
  const where = [document.head, document.documentElement].find((h) => h && h.appendChild);
  if (where) where.appendChild(st);
}
function mgShow(page) {
  clearTimeout(page._mgT);
  page.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => page.classList.add('open')));
}
function mgHide(page) {
  page.classList.remove('open');
  clearTimeout(page._mgT);
  page._mgT = setTimeout(() => { if (!page.classList.contains('open')) page.style.display = 'none'; }, 220);
}

/* keep a page exactly over the main view, even if the sidebars are dragged while it is open */
function mgFollowMain(top, place) {
  const main = top.querySelector(':scope > .mg-main');
  let ro = null;
  if (main && window.ResizeObserver) { ro = new ResizeObserver(place); ro.observe(main); }
  return () => { if (ro) ro.disconnect(); };
}

/* ---------- player background: the blurred cover (never the main cover) ---------- */
function mgEnsurePlayerBg(bar) {
  if (!bar) return;
  let bg = bar.querySelector(':scope > .mg-npb-bg');
  if (!bg) {
    bg = document.createElement('div');
    bg.className = 'mg-npb-bg';
    bg.setAttribute('aria-hidden', 'true');
    bg.innerHTML = '<i></i><i></i>';
    bar.insertBefore(bg, bar.firstChild);
  }
  mgSetPlayerBg(bg);
}

function mgSetPlayerBg(bg) {
  const url = mgTrack().art;
  if (bg._url === url) return;
  bg._url = url;
  const a = bg.children[0], b = bg.children[1];
  if (!url) { a.classList.remove('on'); b.classList.remove('on'); return; }
  const im = new Image();
  im.onload = () => {
    if (bg._url !== url) return;                       // a newer song already took over
    const nxt = bg._flip ? a : b, prv = bg._flip ? b : a;
    bg._flip = !bg._flip;
    nxt.style.backgroundImage = 'url("' + url + '")';
    nxt.classList.add('on');
    prv.classList.remove('on');
  };
  im.src = url;
}

/* soft fade/slide of the whole player block when the track changes */
function mgTrackSwap() {
  document.querySelectorAll('.mg-widget').forEach((w) => {
    w.classList.remove('mg-trackin');
    void w.offsetWidth;
    w.classList.add('mg-trackin');
  });
  const bg = document.querySelector('.mg-npb-bg');
  if (bg) mgSetPlayerBg(bg);
  document.querySelectorAll('.mg-cimg').forEach(mgApplyTrackArt);
}

/* spin the cover while music plays. Uses the player state, not the (translated) button label */
function mgSpinSync() {
  const sp = window.Spicetify;
  let on = false;
  if (sp && sp.Player && sp.Player.isPlaying) on = !!sp.Player.isPlaying();
  else {
    const b = document.querySelector('[data-testid="control-button-playpause"]');
    on = !!b && /pause/i.test(b.getAttribute('aria-label') || '');
  }
  document.querySelectorAll('.mg-cimg').forEach((img) => img.classList.toggle('running-animation', on));
}

/* ---------- the empty space above every page ----------
   Spotify wraps page content in spacer / padded containers whose names change between versions.
   Rather than hard-coding them, measure how far the first real content sits below the top of the
   main view and zero out only the empty spacers and oversized top paddings in between. */
const MG_GAP_LIMIT = 24;

function mgVisibleContent(el) {
  if (/^(IMG|SVG|BUTTON|INPUT|CANVAS|VIDEO)$/i.test(el.tagName)) return true;
  for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return true;
  return false;
}

/* top bars, sticky play buttons and hidden helpers sit on top of the page; they are not content */
function mgOffFlow(el, main) {
  for (let n = el; n && n !== main; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.position === 'sticky' || cs.position === 'fixed' || cs.position === 'absolute') return true;
    if (parseFloat(cs.opacity) === 0 || cs.visibility === 'hidden' || n.getAttribute('aria-hidden') === 'true') return true;
  }
  return false;
}

function mgMeasureGap(main) {
  const mr = main.getBoundingClientRect();
  const topBar = main.querySelector('[class*="topBar-container"], [class*="topBar-topbar"]');
  let allowed = MG_GAP_LIMIT;
  if (topBar && topBar.offsetHeight && topBar.querySelector('button, a, [role="button"]')) {
    allowed = Math.max(allowed, topBar.getBoundingClientRect().height + 8);
  }
  for (const el of main.querySelectorAll('*')) {
    if (topBar && topBar.contains(el)) continue;
    if (el.closest('.mg-page') || !mgVisibleContent(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom <= mr.top) continue;
    if (mgOffFlow(el, main)) continue;
    return { el, gap: r.top - mr.top, allowed, mr };
  }
  return null;
}

function mgFixTopGap(main, log) {
  if (!main || !main.getBoundingClientRect) return;
  // forget old fixes that now wrap real content (React can reuse nodes between pages)
  main.querySelectorAll('.mg-gapkill').forEach((n) => {
    if (n.querySelector('img, svg, button, input') || n.textContent.trim()) n.classList.remove('mg-gapkill');
  });
  for (let pass = 0; pass < 4; pass++) {
    const m = mgMeasureGap(main);
    if (!m || m.gap <= m.allowed) return;
    let changed = false;
    for (let n = m.el; n && n !== main.parentElement; n = n.parentElement) {
      for (let s = n.previousElementSibling; s; s = s.previousElementSibling) {   // empty spacers above
        const cs = getComputedStyle(s);
        if (cs.position === 'absolute' || cs.position === 'fixed' || s.classList.contains('mg-gapkill')) continue;
        if (s.offsetHeight >= 8 && !s.textContent.trim() && !s.querySelector('img, svg, button, input, canvas')) {
          s.classList.add('mg-gapkill'); changed = true;
          if (log) console.debug('[Modern Gamer] removed empty spacer', s);
        }
      }
      if (n === m.el) continue;
      const cs = getComputedStyle(n);
      if (parseFloat(cs.paddingTop) > 12 || parseFloat(cs.marginTop) > 12) {
        if (!n.classList.contains('mg-padkill')) {
          n.classList.add('mg-padkill'); changed = true;
          if (log) console.debug('[Modern Gamer] trimmed top padding on', n);
        }
      }
    }
    if (!changed) {                    // nothing to trim: a tall header box with its content pushed to the bottom
      const top = m.el.getBoundingClientRect().top;
      for (let n = m.el.parentElement; n && n !== main; n = n.parentElement) {
        if (top - n.getBoundingClientRect().top > 12 && !n.classList.contains('mg-heightkill')) {
          n.classList.add('mg-heightkill'); changed = true;
          if (log) console.debug('[Modern Gamer] released fixed height on', n);
        }
      }
    }
    if (!changed) return;
  }
}

/* console helper: ModernGamer.debugGap() prints what sits above the page content */
function mgDebugGap() {
  const main = document.querySelector('.mg-main');
  if (!main) return console.warn('[Modern Gamer] main view not found');
  const m = mgMeasureGap(main);
  if (!m) return console.warn('[Modern Gamer] no content found');
  const rows = [];
  for (let n = m.el; n && n !== main.parentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    rows.push({ el: n.tagName.toLowerCase() + '.' + String(n.className).split(' ').slice(0, 2).join('.'), paddingTop: cs.paddingTop, marginTop: cs.marginTop, height: cs.height, minHeight: cs.minHeight, position: cs.position, top: Math.round(n.getBoundingClientRect().top - m.mr.top) });
  }
  console.log('[Modern Gamer] gap above first content: ' + Math.round(m.gap) + 'px (allowed ' + Math.round(m.allowed) + 'px)', m.el);
  console.table(rows);
}

/* ---------- the page grid ---------- */
function tagPanels(top) {
  mgAdd(top, 'mg-top');
  for (const child of top.children) {
    const cls = MG_AREAS[singleArea(child)];
    if (cls) mgAdd(child, cls);
    // the top nav wrapper spans "top-banner / 1 / global-nav / -1"
    if (/^top-banner\s*\/\s*1\s*\/\s*global-nav/.test(getComputedStyle(child).gridArea)) {
      mgAdd(child, 'mg-gn');
    }
  }

  const bar = top.querySelector(':scope > .mg-npb');
  const rightbar = top.querySelector(':scope > .mg-rs');
  return { bar, rightbar };
}

/* ---------- the player (top of the right column) ---------- */
function ancestorContaining(start, target, stop) {
  let n = start;
  while (n && n !== stop && !n.contains(target)) n = n.parentElement;
  return n && n !== stop ? n : null;
}

function childContaining(parent, target) {
  return [...parent.children].find((k) => k.contains(target));
}

function tagPlayer(bar) {
  if (!bar) return;
  const widget = bar.querySelector(
    '[data-testid^="now-playing-widget"], .main-nowPlayingWidget-nowPlaying'
  );
  const play = bar.querySelector(
    '[data-testid="control-button-playpause"], [data-testid="control-button-play"], .main-playPauseButton-button'
  );
  if (!widget || !play) return;

  // the row that holds [track info] [controls] [volume etc.]
  const container = ancestorContaining(play, widget, bar.parentElement);
  if (container) {
    // every wrapper from the container up to the player root
    for (let n = container; n && n !== bar; n = n.parentElement) {
      mgAdd(n, 'mg-wrap');
    }
    mgAdd(container, 'mg-pc');
    const L = childContaining(container, widget);
    const M = childContaining(container, play);
    if (L) mgAdd(L, 'mg-pl');
    if (M) mgAdd(M, 'mg-pm');
    [...container.children].forEach((k) => {
      if (k !== L && k !== M) mgAdd(k, 'mg-pr');
    });
  }

  // cover: make every wrapper from the <img> up to the widget flexible
  mgAdd(widget, 'mg-widget');
  const imgs = [...widget.querySelectorAll('img')];
  const covers = imgs.filter((i) => /scdn\.co|spotify:image|\/image\//.test(i.currentSrc || i.src || ''));
  (covers.length ? covers : imgs).forEach((img) => {
    mgAdd(img, 'mg-cimg');
    img.decoding = 'async';
    mgApplyTrackArt(img);
    if (img.parentElement && img.parentElement !== widget) mgAdd(img.parentElement, 'mg-cwrap');
    for (let n = img.parentElement; n && n !== widget; n = n.parentElement) {
      mgAdd(n, 'mg-cchain');
    }
  });

  // progress bar above the transport buttons
  const prog = bar.querySelector(
    '[data-testid="playback-progressbar"], [data-testid="progress-bar"], .playback-bar'
  );
  if (prog) {
    const pcm = ancestorContaining(play, prog, bar.parentElement);
    if (pcm && pcm !== play) {
      mgAdd(pcm, 'mg-pcm');
      const btns = childContaining(pcm, play);
      const pg = childContaining(pcm, prog);
      if (btns) {
        mgAdd(btns, 'mg-btns');
        // [left group] [play] [right group] -> centre the play button exactly
        const kids = [...btns.children];
        const pi = kids.findIndex((k) => k.contains(play));
        if (pi >= 0) mgAdd(kids[pi], 'mg-playwrap');
        if (kids.length === 3 && pi === 1) {
          mgAdd(btns, 'mg-btns3');
          mgAdd(kids[0], 'mg-bl');
          mgAdd(kids[2], 'mg-br');
        }
      }
      if (pg && pg !== btns) mgAdd(pg, 'mg-prog');
    }
  }

  // volume row: let the slider stretch between the icons
  const vol = bar.querySelector('[data-testid="volume-bar"], .volume-bar');
  if (vol) {
    const right = vol.closest('.mg-pr');
    for (let n = vol; n && n !== right && n !== bar; n = n.parentElement) {
      if (n.parentElement && n.parentElement !== right) {
        mgAdd(n, 'mg-vol');
      } else {
        mgAdd(n, 'mg-vol');
        if (n.parentElement) mgAdd(n.parentElement, 'mg-row');
        break;
      }
    }
    if (right && !right.querySelector('.mg-row')) mgAdd(right, 'mg-row');
  }

  tagFill(bar.querySelector('.mg-prog'));
  tagFill(bar.querySelector('.mg-vol'));
  mgEnsurePlayerBg(bar);
}

/* ---------- no panels: flatten boxed cards in the right sidebar ---------- */
function flatten(root) {
  if (!root) return;
  for (const el of root.querySelectorAll('*')) {
    if (el.classList.contains('mg-flat')) continue;
    if (/^(BUTTON|INPUT|IMG|SVG|A|PATH)$/i.test(el.tagName)) continue;
    if (el.offsetWidth < 150 || el.offsetHeight < 56) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
    if (parseFloat(cs.borderTopLeftRadius) < 6) continue;
    mgAdd(el, 'mg-flat');
  }
}


/* ---------- RGB fills: tag the bright "filled" part of progress/volume bars ---------- */
function lum(c) {
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return -1;
  const [r, g, b, a = 1] = m[1].split(',').map(parseFloat);
  return (0.299 * r + 0.587 * g + 0.114 * b) * a;
}

function tagFill(scope) {
  if (!scope || scope.querySelector('.mg-fill')) return;
  const leaves = [];
  for (const el of scope.querySelectorAll('div, span')) {
    if (el.childElementCount) continue;
    const l = lum(getComputedStyle(el).backgroundColor);
    if (l > 0) leaves.push([el, l]);
  }
  if (!leaves.length) return;
  const max = Math.max(...leaves.map((x) => x[1]));
  if (max < 120) return;
  leaves.forEach(([el, l]) => { if (l >= max * 0.9) mgAdd(el, 'mg-fill'); });
}

/* ---------- tinted header backdrops (random class names) ---------- */
function killBackdrops(root) {
  if (!root) return;
  const rw = root.clientWidth;
  for (const el of root.querySelectorAll('div')) {
    if (el.classList.contains('mg-bgkill')) continue;
    if (el.offsetWidth < rw * 0.6 || el.offsetHeight < 80) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute') continue;
    const clear = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
    if (clear && cs.backgroundImage === 'none') continue;
    if (el.childElementCount > 3) continue;   // real content containers have many children
    mgAdd(el, 'mg-bgkill');
  }
}


/* ---------- top nav: clear any full-width solid bar inside it ---------- */
function clearBars(root) {
  if (!root) return;
  const rw = root.offsetWidth;
  if (!rw) return;
  for (const el of root.querySelectorAll('*')) {
    if (el.classList.contains('mg-bgkill')) continue;
    if (el.offsetWidth < rw * 0.6 || el.offsetHeight < 24) continue;
    const cs = getComputedStyle(el);
    const clear = cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
    if (clear && cs.backgroundImage === 'none') continue;
    mgAdd(el, 'mg-bgkill');
  }
}

/* ================= COLORS: palettes + shared helpers =================
   The rainbow used all over the theme (top bar line, dividers, cover ring,
   play-button ring, progress bars, visualizer) is ONE active palette.
   The Colors page swaps it for any gradient or solid color.            */

const MG_PAGES = {};      // open/close handles, so only one page is open at a time

/* ---------- small color helpers ---------- */
function mgHex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mgToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function mgLighten(h) {
  const [r, g, b] = mgHex(h);
  return mgToHex(r + (255 - r) * 0.3, g + (255 - g) * 0.3, b + (255 - b) * 0.3);
}
const mgSlug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/* ---------- the palettes: [name, colors..., [accent 1, accent 2]] ---------- */
const MG_GRADIENTS = [
  ['Rainbow',        ['#FF2D55', '#FF9500', '#FFE600', '#2BFF88', '#00E5FF', '#7C4DFF', '#FF2BD6'], ['#7C4DFF', '#00E5FF']],
  ['Neon Nights',    ['#FF00C8', '#7C4DFF', '#00E5FF'], ['#FF00C8', '#00E5FF']],
  ['Sunset',         ['#FF512F', '#F09819', '#FFD452'], ['#FF512F', '#FFD452']],
  ['Ocean',          ['#00C6FF', '#0072FF', '#5B2EFF'], ['#0072FF', '#00C6FF']],
  ['Aurora',         ['#00FFA3', '#00E5FF', '#7C4DFF', '#FF2BD6'], ['#7C4DFF', '#00FFA3']],
  ['Cyberpunk',      ['#FFEE00', '#FF2A6D', '#05D9E8'], ['#FF2A6D', '#05D9E8']],
  ['Vaporwave',      ['#FF71CE', '#B967FF', '#01CDFE', '#05FFA1'], ['#B967FF', '#01CDFE']],
  ['Lava',           ['#FF0000', '#FF5A00', '#FFC400'], ['#FF5A00', '#FFC400']],
  ['Toxic',          ['#B6FF00', '#00FF85', '#00B3FF'], ['#00FF85', '#B6FF00']],
  ['Ice',            ['#E0F7FF', '#7DD3FC', '#38BDF8', '#818CF8'], ['#38BDF8', '#818CF8']],
  ['Candy',          ['#FF9A9E', '#FBC2EB', '#A6C1EE'], ['#FF9A9E', '#A6C1EE']],
  ['Forest',         ['#0F9B0F', '#52C234', '#B8E986'], ['#52C234', '#B8E986']],
  ['Galaxy',         ['#4B2BFF', '#9D4EDD', '#FF2BD6', '#00E5FF'], ['#9D4EDD', '#00E5FF']],
  ['Inferno',        ['#FFE600', '#FF8A00', '#FF2D55', '#7A00FF'], ['#FF8A00', '#FF2D55']],
  ['Mint',           ['#00F5A0', '#00D9F5'], ['#00F5A0', '#00D9F5']],
  ['Peach',          ['#FFB88C', '#FF6B9D'], ['#FF6B9D', '#FFB88C']],
  ['Miami',          ['#FF2E97', '#00F0FF'], ['#FF2E97', '#00F0FF']],
  ['Synthwave',      ['#F72585', '#7209B7', '#3A0CA3', '#4CC9F0'], ['#F72585', '#4CC9F0']],
  ['Matrix',         ['#00FF41', '#00B82E', '#B6FFB6'], ['#00FF41', '#B6FFB6']],
  ['Gold',           ['#F7971E', '#FFD200', '#FFF3B0'], ['#F7971E', '#FFD200']],
  ['Rose Gold',      ['#FFC3A0', '#FFAFBD', '#FF6F91'], ['#FF6F91', '#FFC3A0']],
  ['Steel',          ['#8EA7BF', '#C9D6E3', '#5C7A99'], ['#8EA7BF', '#C9D6E3']],
  ['Blood Moon',     ['#FF0844', '#FF3D00', '#B3000F'], ['#FF0844', '#FF3D00']],
  ['Deep Space',     ['#00D2FF', '#3A47D5', '#8E2DE2'], ['#8E2DE2', '#00D2FF']],
  ['Tropical',       ['#00F260', '#0575E6', '#FFE000'], ['#00F260', '#0575E6']],
  ['Lemonade',       ['#F9D423', '#FF4E50'], ['#F9D423', '#FF4E50']],
  ['Berry',          ['#8E2DE2', '#FF2BD6', '#FF6A88'], ['#FF2BD6', '#FF6A88']],
  ['Emerald Sea',    ['#11998E', '#38EF7D', '#00B4DB'], ['#38EF7D', '#00B4DB']],
  ['Cotton Candy',   ['#FFC0E3', '#C0E3FF', '#E3C0FF'], ['#FFC0E3', '#C0E3FF']],
  ['Fire & Ice',     ['#FF3D00', '#FF8A00', '#00E5FF', '#2979FF'], ['#FF3D00', '#00E5FF']],
  ['Northern Lights', ['#43E97B', '#38F9D7', '#4FACFE', '#C471F5'], ['#43E97B', '#C471F5']],
  ['Bubblegum',      ['#FF6AC1', '#FF9BDC', '#8AD4FF'], ['#FF6AC1', '#8AD4FF']],
  ['Sakura',         ['#FFD1DC', '#FF9EB5', '#FF6F91'], ['#FF9EB5', '#FF6F91']],
  ['Midnight City',  ['#00C9FF', '#7C4DFF', '#FF2BD6'], ['#7C4DFF', '#00C9FF']],
  ['Gamer Green',    ['#39FF14', '#00FFC8', '#00B8FF'], ['#39FF14', '#00B8FF']],
  ['Ultraviolet',    ['#6A00F4', '#B100E8', '#FF00C8', '#00E5FF'], ['#B100E8', '#00E5FF']],
];

const MG_SOLIDS = [
  ['Red', '#FF3B30'], ['Crimson', '#DC143C'], ['Orange', '#FF9500'], ['Amber', '#FFB300'],
  ['Yellow', '#FFE600'], ['Lime', '#C6FF00'], ['Green', '#30D158'], ['Spotify Green', '#1ED760'],
  ['Emerald', '#10B981'], ['Mint', '#00F5A0'], ['Teal', '#14B8A6'], ['Cyan', '#00E5FF'],
  ['Sky', '#38BDF8'], ['Blue', '#2979FF'], ['Royal', '#3B5BFF'], ['Indigo', '#5E5CE6'],
  ['Violet', '#7C4DFF'], ['Purple', '#A855F7'], ['Magenta', '#FF2BD6'], ['Hot Pink', '#FF4FA3'],
  ['Pink', '#FF9EC4'], ['Rose', '#FF4D6D'], ['White', '#F2F2F5'], ['Silver', '#A8B0BC'],
];

const MG_PALETTES = [].concat(
  MG_GRADIENTS.map(([name, stops, a]) => ({ id: 'g-' + mgSlug(name), name, kind: 'gradient', stops, a })),
  MG_SOLIDS.map(([name, c]) => ({ id: 's-' + mgSlug(name), name, kind: 'solid', stops: [c, c], a: [c, mgLighten(c)] }))
);

let MG_PAL = null;       // the active palette

/* make a palette the active one: sets the CSS variables the whole theme uses */
function mgApply(p, save) {
  const loop = p.stops.concat(p.stops[0]);        // loops back to the first color -> seamless flow
  p.rgb = loop.map(mgHex);
  MG_PAL = p;
  if (!document.documentElement) {       // script ran before the page exists: apply once it does
    document.addEventListener('DOMContentLoaded', () => mgApply(p, false), { once: true });
    return;
  }
  const st = document.documentElement.style;
  const r1 = mgHex(p.a[0]).join(', ');
  const r2 = mgHex(p.a[1]).join(', ');
  st.setProperty('--mg-stops', loop.join(', '));
  st.setProperty('--mg-a1', p.a[0]);
  st.setProperty('--mg-a2', p.a[1]);
  st.setProperty('--mg-a1-rgb', r1);
  st.setProperty('--mg-a2-rgb', r2);
  // Spotify's own accents follow the palette too
  st.setProperty('--spice-button', p.a[0]);
  st.setProperty('--spice-rgb-button', r1);
  st.setProperty('--spice-button-active', p.a[1]);
  st.setProperty('--spice-rgb-button-active', r2);
  st.setProperty('--spice-selected-row', p.a[1]);
  st.setProperty('--spice-rgb-selected-row', r2);
  if (save) mgSaveId(p.id);
}

/* your pick is remembered across restarts: stored in two places, in case one is cleared */
function mgSaveId(id) {
  try { localStorage.setItem('mg-palette', id); } catch (e) {}
  try {
    const sp = window.Spicetify;
    if (sp && sp.LocalStorage && sp.LocalStorage.set) sp.LocalStorage.set('mg-palette', id);
  } catch (e) {}
}
function mgLoadId() {
  let id = null;
  try { id = localStorage.getItem('mg-palette'); } catch (e) {}
  if (!id) {
    try {
      const sp = window.Spicetify;
      if (sp && sp.LocalStorage && sp.LocalStorage.get) id = sp.LocalStorage.get('mg-palette');
    } catch (e) {}
  }
  return id;
}

/* color at position t (0..1, wraps) along the active gradient -> [r, g, b] */
function mgSample(t) {
  const s = MG_PAL.rgb;
  const x = (((t % 1) + 1) % 1) * (s.length - 1);
  const i = Math.floor(x), f = x - i;
  const a = s[i], b = s[Math.min(s.length - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

/* Every rainbow spot in the theme, re-pointed at the active palette. Injected by the script
   (with !important) so it works even if an older user.css is still cached by Spicetify/Marketplace. */
const MG_THEME_COLOR_CSS = `
html:root{--mg-rgb:linear-gradient(90deg,var(--mg-stops)) !important;--mg-rgb-v:linear-gradient(180deg,var(--mg-stops)) !important}
@property --mg-a{syntax:"<angle>";inherits:false;initial-value:0deg}
@keyframes mg-angle{to{--mg-a:360deg}}
html body .mg-widget > .mg-cchain:not(:has(.mg-cimg))::before{display:none !important}
html body .mg-widget > .mg-cchain:has(.mg-cimg)::before{background:conic-gradient(from 0deg,var(--mg-stops)) !important;box-shadow:0 0 36px rgba(var(--mg-a1-rgb),.6) !important}
html body .mg-pm [data-testid="control-button-playpause"],
html body .main-playButton-PlayButton,
html body [data-testid="play-button"],
html body .main-card-PlayButtonContainer button{
  background:linear-gradient(135deg,var(--mg-a1),var(--mg-a2)) padding-box,conic-gradient(from var(--mg-a),var(--mg-stops)) border-box !important;
  box-shadow:0 6px 24px rgba(var(--mg-a1-rgb),.55) !important}
html body .mg-gn::after{box-shadow:0 0 12px rgba(var(--mg-a1-rgb),.6) !important}
html body .main-trackList-trackListRow:hover,html body .main-trackList-trackListRow:focus-within{box-shadow:inset 3px 0 0 var(--mg-a2) !important}
html body .main-trackList-trackListRow[aria-selected="true"]{box-shadow:inset 3px 0 0 var(--mg-a1) !important}
html body .main-card-card:hover{box-shadow:0 0 0 1px rgba(var(--mg-a2-rgb),.55),0 12px 40px rgba(var(--mg-a1-rgb),.35) !important}
`;

function mgInjectThemeColors() {
  if (document.getElementById('mg-theme-colors')) return;
  const st = document.createElement('style');
  st.id = 'mg-theme-colors';
  st.textContent = MG_THEME_COLOR_CSS;
  const where = [document.head, document.documentElement].find((h) => h && h.appendChild);
  if (where) where.appendChild(st);
}

function mgInitPalette() {
  const id = mgLoadId();
  mgApply(MG_PALETTES.find((x) => x.id === id) || MG_PALETTES[0], false);
  mgInjectThemeColors();
}
mgInitPalette();           // restore the saved palette immediately, before anything is drawn

/* ---------- palette-driven rules, injected by the script ----------
   user.css may be an older cached copy with the rainbow hard-coded. These rules are
   injected with the script, so they always win and every rainbow spot follows the palette. */
const MG_THEME_CSS = `
@property --mg-a{syntax:"<angle>";inherits:false;initial-value:0deg}
@keyframes mg-angle{to{--mg-a:360deg}}
@keyframes mg-flow{from{background-position:0% 0}to{background-position:200% 0}}
@keyframes mg-flowv{from{background-position:0 0%}to{background-position:0 200%}}
html:root{--mg-rgb:linear-gradient(90deg,var(--mg-stops)) !important;--mg-rgb-v:linear-gradient(180deg,var(--mg-stops)) !important}
html body .mg-widget > .mg-cchain::before{background:conic-gradient(from 0deg,var(--mg-stops)) !important;box-shadow:0 0 36px rgba(var(--mg-a1-rgb),.6) !important}
html body .mg-widget > .mg-cchain:has(.mg-cimg)::before{background:conic-gradient(from 0deg,var(--mg-stops)) !important;box-shadow:0 0 36px rgba(var(--mg-a1-rgb),.6) !important}
html body .mg-pm [data-testid="control-button-playpause"],
html body .main-playButton-PlayButton,
html body [data-testid="play-button"],
html body .main-card-PlayButtonContainer button{box-sizing:border-box !important;border:3px solid transparent !important;background:linear-gradient(135deg,var(--mg-a1),var(--mg-a2)) padding-box,conic-gradient(from var(--mg-a),var(--mg-stops)) border-box !important;animation:mg-angle 4s linear infinite !important;box-shadow:0 6px 24px rgba(var(--mg-a1-rgb),.55) !important;filter:none !important}
html body .mg-fill{background-color:transparent !important;background-image:var(--mg-rgb) !important;background-size:200% 100% !important}
html body .mg-gn::after{background:var(--mg-rgb) !important;background-size:200% 100% !important;box-shadow:0 0 12px rgba(var(--mg-a1-rgb),.6) !important}
html body .mg-ls::after,html body .mg-main::after{background:var(--mg-rgb-v) !important;background-size:100% 200% !important}
html body .main-trackList-trackListRow:hover,html body .main-trackList-trackListRow:focus-within{box-shadow:inset 3px 0 0 var(--mg-a2) !important;background-color:rgba(var(--mg-a1-rgb),.10) !important}
html body .main-trackList-trackListRow[aria-selected="true"]{box-shadow:inset 3px 0 0 var(--mg-a1) !important;background-color:rgba(var(--mg-a1-rgb),.20) !important}
html body .main-card-card:hover{box-shadow:0 0 0 1px rgba(var(--mg-a2-rgb),.55),0 12px 40px rgba(var(--mg-a1-rgb),.35) !important}
html body input:focus{outline-color:rgba(var(--mg-a2-rgb),.72) !important}
html body ::-webkit-scrollbar-thumb:hover{background:rgba(var(--mg-a2-rgb),.6) !important}
`;

function mgInjectThemeCss() {
  if (document.getElementById('mg-pal-theme-css')) return;
  const st = document.createElement('style');
  st.id = 'mg-pal-theme-css';
  st.textContent = MG_THEME_CSS;
  const host = [document.head, document.documentElement].find((h) => h && h.appendChild);
  if (host) host.appendChild(st);
  else document.addEventListener('DOMContentLoaded', mgInjectThemeCss, { once: true });
}
mgInjectThemeCss();         // ...and the rules that make every rainbow spot follow it


/* ---------- line the top-bar buttons up with the bell / avatar row ---------- */
function mgAlignButtons(top) {
  if (document.hidden) return;
  const nav = top.querySelector(':scope > .mg-gn');
  if (!nav || !nav.querySelectorAll) return;
  const vw = window.innerWidth;
  let best = null;
  for (const el of nav.querySelectorAll('button, a, [role="button"]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 18 || r.width > 56 || r.height < 18 || r.height > 56) continue;
    if (r.right < vw - 400 || r.right > vw - 130) continue;   // the right-hand icon group only
    if (!best || r.left < best.left) best = r;                 // leftmost of them = the bell
  }
  const size = 32, gap = 6;
  const setPos = (b, t, r) => {       // only touch the DOM when something actually moved
    if (b.style.top !== t + 'px') b.style.top = t + 'px';
    if (b.style.right !== r + 'px') b.style.right = r + 'px';
  };
  const btns = [...top.querySelectorAll('.mg-topbtn')].sort((a, b) => (a._mgOrder || 0) - (b._mgOrder || 0));
  if (!best) {            // bell not found (Spotify changed its top bar): keep the buttons in a tidy row
    btns.forEach((b, i) => setPos(b, 12, 300 + i * (size + gap)));
    return;
  }
  btns.forEach((b, i) => setPos(b, Math.round(best.top + best.height / 2 - size / 2), Math.round(vw - best.left + 8 + i * (size + gap))));
}

function mgCloseOthers(me) {
  Object.keys(MG_PAGES).forEach((k) => { if (k !== me) MG_PAGES[k].close(); });
}

/* ================= THE COLORS PAGE ================= */
const MG_PAL_CSS = `
#mg-pal-btn{position:fixed;top:12px;right:340px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;border-radius:50%;border:0;background:transparent;color:#B3B3C0;cursor:pointer;z-index:60;-webkit-app-region:no-drag;transition:color .15s ease,background-color .15s ease,box-shadow .15s ease}
#mg-pal-btn:hover{color:#fff;background:rgba(255,255,255,.10)}
#mg-pal-btn.on{color:#fff;background:linear-gradient(135deg,var(--mg-a1,#7C4DFF),var(--mg-a2,#00E5FF));box-shadow:0 0 14px rgba(var(--mg-a1-rgb,124,77,255),.6)}
#mg-palpage{position:fixed;overflow:hidden;margin:0;padding:0;z-index:30;background:#141416;color:#fff}
#mg-palpage .mg-pal-scroll{position:absolute;inset:0;overflow-y:auto;overflow-x:hidden}
#mg-palpage .mg-pal-wrap{max-width:1100px;margin:0 auto;padding:30px 36px 56px}
#mg-palpage .mg-pal-title{font-size:34px;font-weight:800;letter-spacing:-.01em;line-height:1.15}
#mg-palpage .mg-pal-sub{margin:8px 0 22px;font-size:15px;color:#BDBDCB}
#mg-palpage .mg-pal-preview{height:10px;border-radius:999px;margin-bottom:6px;background:linear-gradient(90deg,var(--mg-stops,#FF2D55,#FF9500,#FFE600,#2BFF88,#00E5FF,#7C4DFF,#FF2BD6,#FF2D55));background-size:200% 100%;animation:mgp-flow 6s linear infinite;box-shadow:0 0 18px rgba(var(--mg-a1-rgb,124,77,255),.5)}
#mg-palpage .mg-pal-h{margin:30px 0 14px;font-size:13px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#A8A8B3}
#mg-palpage .mg-pal-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
#mg-palpage .mg-pal-card{display:block;width:100%;padding:10px;margin:0;border-radius:14px;border:2px solid transparent;background:#1C1C20;color:#fff;text-align:left;cursor:pointer;transition:background-color .15s ease,transform .15s ease,border-color .15s ease,box-shadow .15s ease}
#mg-palpage .mg-pal-card:hover{background:#25252B;transform:translateY(-2px)}
#mg-palpage .mg-pal-card.sel{border-color:var(--mg-a2,#00E5FF);box-shadow:0 0 16px rgba(var(--mg-a2-rgb,0,229,255),.45)}
#mg-palpage .mg-pal-sw{height:54px;border-radius:9px;background-size:200% 100%}
#mg-palpage .mg-pal-sw.flow{animation:mgp-flow 6s linear infinite}
#mg-palpage .mg-pal-name{margin-top:9px;font-size:13px;font-weight:600;color:#F2F2F5}
#mg-palpage .mg-pal-reset{margin-top:34px}
#mg-palpage .mg-pal-act{padding:10px 18px;border-radius:999px;border:0;font-size:13px;font-weight:700;cursor:pointer;color:#fff;background:linear-gradient(135deg,var(--mg-a1,#7C4DFF),var(--mg-a2,#00E5FF))}
#mg-palpage .mg-pal-act.ghost{background:rgba(255,255,255,.08);color:#E4E4EE}
#mg-palpage .mg-pal-act:hover{filter:brightness(1.12)}
#mg-palpage .mg-pal-close{position:absolute;top:14px;right:16px;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#F2F2F5;font-size:14px;cursor:pointer;z-index:2}
#mg-palpage .mg-pal-close:hover{color:var(--mg-a2,#00E5FF);border-color:var(--mg-a2,#00E5FF)}
@keyframes mgp-flow{from{background-position:0% 0}to{background-position:200% 0}}
@media (prefers-reduced-motion:reduce){#mg-palpage .mg-pal-preview,#mg-palpage .mg-pal-sw.flow{animation:none!important}}
`;

function startPalette(top) {
  if (!MG_COLORS_ENABLED || document.getElementById('mg-palpage')) return;
  mgInjectThemeCss();

  const style = document.createElement('style');
  style.id = 'mg-pal-style';
  style.textContent = MG_PAL_CSS;
  const host = [document.head, document.documentElement, top].find((h) => h && h.appendChild);
  if (host) host.appendChild(style);

  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };

  /* top-bar button */
  const btn = document.createElement('button');
  btn.id = 'mg-pal-btn';
  btn.className = 'mg-topbtn';
  btn._mgOrder = 2;
  btn.style.cssText = 'position:fixed;top:12px;right:376px;width:32px;height:32px;';
  btn.setAttribute('aria-label', 'Colors');
  btn.title = 'Colors (Ctrl+Alt+C)';
  btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">'
    + '<path d="M8 1a7 7 0 1 0 0 14c1.1 0 1.6-.8 1.3-1.7-.3-.9.2-1.8 1.2-1.8H12a3 3 0 0 0 3-3C15 4 12 1 8 1z'
    + 'M4.5 8.2a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm2-3a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm3.5 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2z'
    + 'm2.5 3a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/></svg>';
  top.appendChild(btn);

  /* page */
  const page = document.createElement('div');
  page.id = 'mg-palpage';
  page.className = 'mg-page';
  page.style.cssText = 'position:fixed;display:none;';   // out of the page grid even before any CSS loads
  const scroll = mk('div', 'mg-pal-scroll');
  const wrap = mk('div', 'mg-pal-wrap');
  const closeBtn = mk('button', 'mg-pal-close', '\u2715');
  closeBtn.setAttribute('aria-label', 'Close colors');

  wrap.appendChild(mk('div', 'mg-pal-title', 'Colors'));
  wrap.appendChild(mk('div', 'mg-pal-sub', 'Pick a gradient or a solid color to use instead of the rainbow. It applies everywhere in the theme, and your choice is saved.'));
  wrap.appendChild(mk('div', 'mg-pal-preview'));

  const cards = [];
  const addGrid = (heading, list) => {
    wrap.appendChild(mk('div', 'mg-pal-h', heading));
    const grid = mk('div', 'mg-pal-grid');
    list.forEach((p) => {
      const card = mk('button', 'mg-pal-card');
      card.setAttribute('data-id', p.id);
      const sw = mk('div', 'mg-pal-sw' + (p.kind === 'gradient' ? ' flow' : ''));
      if (p.kind === 'gradient') sw.style.backgroundImage = 'linear-gradient(90deg,' + p.stops.concat(p.stops[0]).join(',') + ')';
      else sw.style.backgroundColor = p.stops[0];
      card.appendChild(sw);
      card.appendChild(mk('div', 'mg-pal-name', p.name));
      card.addEventListener('click', () => { mgApply(p, true); refreshSel(); });
      grid.appendChild(card);
      cards.push(card);
    });
    wrap.appendChild(grid);
  };
  addGrid('Gradients', MG_PALETTES.filter((p) => p.kind === 'gradient'));
  addGrid('Solid colors', MG_PALETTES.filter((p) => p.kind === 'solid'));

  const reset = mk('div', 'mg-pal-reset');
  const resetBtn = mk('button', 'mg-pal-act ghost', 'Reset to rainbow');
  reset.appendChild(resetBtn);
  wrap.appendChild(reset);

  scroll.appendChild(wrap);
  page.appendChild(scroll);
  page.appendChild(closeBtn);
  top.appendChild(page);

  function refreshSel() {
    cards.forEach((c) => c.classList.toggle('sel', c.getAttribute('data-id') === MG_PAL.id));
  }

  resetBtn.addEventListener('click', () => { mgApply(MG_PALETTES[0], true); refreshSel(); });

  /* open / close */
  let isOpen = false, stopFollow = null;
  function place() {
    const main = top.querySelector(':scope > .mg-main');
    const r = main && main.getBoundingClientRect
      ? main.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    page.style.left = r.left + 'px';
    page.style.top = r.top + 'px';
    page.style.width = Math.max(200, Math.round(r.width)) + 'px';
    page.style.height = Math.max(200, Math.round(r.height)) + 'px';
  }
  function open() {
    mgCloseOthers('pal');
    place();
    refreshSel();
    isOpen = true;
    mgShow(page);
    btn.classList.add('on');
    if (stopFollow) stopFollow();
    stopFollow = mgFollowMain(top, () => { if (isOpen) place(); });
  }
  function close() {
    isOpen = false;
    mgHide(page);
    btn.classList.remove('on');
    if (stopFollow) { stopFollow(); stopFollow = null; }
  }
  const toggle = () => (isOpen ? close() : open());
  MG_PAGES.pal = { close };

  btn.addEventListener('click', toggle);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { close(); return; }
    if (e.ctrlKey && e.altKey && String(e.key).toLowerCase() === 'c') toggle();
  });
  window.addEventListener('resize', () => { if (isOpen) place(); });

  (function whenReady(tries) {
    const sp = window.Spicetify;
    if (sp && sp.Platform && sp.Platform.History && sp.Platform.History.listen) {
      try { sp.Platform.History.listen(close); } catch (e) {}   // opening any other page closes ours
    } else if (tries > 0) {
      setTimeout(whenReady, 300, tries - 1);
    }
  })(100);

  // Spicetify's storage becomes available a moment after load: re-check the saved choice
  setTimeout(() => { const id = mgLoadId(); const p = MG_PALETTES.find((x) => x.id === id); if (p && p.id !== MG_PAL.id) { mgApply(p, false); refreshSel(); } }, 1500);

  refreshSel();
}

/* ================= VISUALIZER PAGE =================
   A page over the main area (top-bar button or Ctrl+Alt+V, Esc closes):
   cover, song info, progress bar and a neon radial visualizer.
   It follows Spotify's analysis of the playing track (beats, loudness,
   pitch) in time with playback; it does not hear your speakers. Tracks
   without analysis get a generated beat animation.                      */
const MG_VIZ_CSS = `
#mg-viz-btn{position:fixed;top:12px;right:300px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;border-radius:50%;border:0;background:transparent;color:#B3B3C0;cursor:pointer;z-index:60;-webkit-app-region:no-drag;transition:color .15s ease,background-color .15s ease,box-shadow .15s ease}
#mg-viz-btn:hover{color:#fff;background:rgba(255,255,255,.10)}
#mg-viz-btn.on{color:#fff;background:linear-gradient(135deg,var(--mg-a1,#7C4DFF),var(--mg-a2,#00E5FF));box-shadow:0 0 14px rgba(var(--mg-a1-rgb,124,77,255),.6)}
#mg-vizpage{position:fixed;overflow:hidden;margin:0;padding:0;z-index:30;background:#141416;color:#fff}
#mg-vizpage canvas{position:absolute;inset:0;width:100%;height:100%}
#mg-vizpage .mg-vp-bg{position:absolute;inset:-60px;background-size:cover;background-position:center;filter:blur(46px) saturate(1.3);opacity:0;transform:scale(1.1);transition:opacity .6s ease}
#mg-vizpage .mg-vp-bg.on{opacity:.30}
#mg-vizpage .mg-vp-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,20,22,.55),rgba(20,20,22,.86))}
#mg-vizpage .mg-vp-cover{position:absolute;left:50%;border-radius:50%;object-fit:cover;image-rendering:auto;will-change:transform;background:#141416;box-shadow:0 0 0 3px #141416,0 0 0 8px rgba(var(--mg-a1-rgb,124,77,255),.55),0 0 60px rgba(var(--mg-a1-rgb,124,77,255),.45);animation:mgv-spin 28s linear infinite;animation-play-state:paused}
#mg-vizpage .mg-vp-info{position:absolute;left:50%;transform:translateX(-50%);width:min(560px,80%);text-align:center}
#mg-vizpage .mg-vp-title{font-size:36px;font-weight:800;letter-spacing:-.01em;line-height:1.15;color:#fff;text-shadow:0 2px 18px rgba(0,0,0,.85)}
#mg-vizpage .mg-vp-artist{font-size:19px;font-weight:600;margin-top:8px;color:#E4E4EE;text-shadow:0 1px 12px rgba(0,0,0,.85)}
#mg-vizpage .mg-vp-album{font-size:14px;margin-top:4px;color:#BDBDCB;text-shadow:0 1px 10px rgba(0,0,0,.85)}
#mg-vizpage .mg-vp-prog{display:flex;align-items:center;gap:12px;margin-top:24px;font-size:13px;font-weight:600;color:#D6D6E2;font-variant-numeric:tabular-nums}
#mg-vizpage .mg-vp-bar{flex:1;height:6px;border-radius:999px;background:rgba(255,255,255,.24);overflow:hidden}
#mg-vizpage .mg-vp-fill{height:100%;width:0;background:linear-gradient(90deg,var(--mg-stops,#FF2D55,#FF9500,#FFE600,#2BFF88,#00E5FF,#7C4DFF,#FF2BD6,#FF2D55));background-size:200% 100%;animation:mgv-flow 5s linear infinite}
#mg-vizpage .mg-vp-close{position:absolute;top:14px;right:16px;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#F2F2F5;font-size:14px;cursor:pointer;z-index:2}
#mg-vizpage .mg-vp-close:hover{color:var(--mg-a2,#00E5FF);border-color:var(--mg-a2,#00E5FF)}
@keyframes mgv-spin{to{transform:rotate(360deg)}}
@keyframes mgv-flow{from{background-position:0% 0}to{background-position:200% 0}}
@media (prefers-reduced-motion:reduce){#mg-vizpage .mg-vp-cover,#mg-vizpage .mg-vp-fill{animation:none!important}}
`;

// The visualizer styles itself, so it can never show up unstyled (or leak into
// the page grid) even if an older user.css is still cached by Spicetify/Marketplace.
function mgInjectVizStyle(host) {
  if (document.getElementById('mg-viz-style')) return;
  const st = document.createElement('style');
  st.id = 'mg-viz-style';
  st.textContent = MG_VIZ_CSS;
  const where = [document.head, document.documentElement, host].find((h) => h && h.appendChild);
  if (where) where.appendChild(st);
}

function startVisualizer(top) {
  if (!MG_VIZ_ENABLED || document.getElementById('mg-vizpage')) return;

  const N = 56;                          // bars
  const PAGE_CY = 0.34;                  // vertical centre of the cover on the page (fraction of height)
  const levels = new Float32Array(N);
  const target = new Float32Array(N);
  const cache = new Map();
  let analysis = null, analysisUri = '';
  let playing = false, beatPulse = 0, loud = 0, peak = 0;
  let raf = 0, lastStep = 0, lastKey = '', stopFollow = null;
  let pageOpen = false;

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const fmt = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  function findIdx(arr, t) {             // last index whose .start <= t
    let lo = 0, hi = arr.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  /* ---------- visualizer page ---------- */
  mgInjectVizStyle(top);
  const page = document.createElement('div');
  page.id = 'mg-vizpage';
  page.className = 'mg-page';
  page.style.cssText = 'position:fixed;display:none;';   // out of the page grid even before any CSS loads
  const pc = document.createElement('canvas');
  const vbg = document.createElement('div');
  vbg.className = 'mg-vp-bg';
  const vshade = document.createElement('div');
  vshade.className = 'mg-vp-shade';
  const cover = document.createElement('img');
  cover.className = 'mg-vp-cover';
  const info = document.createElement('div');
  info.className = 'mg-vp-info';
  const title = document.createElement('div');
  title.className = 'mg-vp-title';
  const artist = document.createElement('div');
  artist.className = 'mg-vp-artist';
  const album = document.createElement('div');
  album.className = 'mg-vp-album';
  const prog = document.createElement('div');
  prog.className = 'mg-vp-prog';
  const tNow = document.createElement('span');
  const bar = document.createElement('div');
  bar.className = 'mg-vp-bar';
  const fill = document.createElement('div');
  fill.className = 'mg-vp-fill';
  const tEnd = document.createElement('span');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'mg-vp-close';
  closeBtn.setAttribute('aria-label', 'Close visualizer');
  closeBtn.textContent = '\u2715';
  bar.appendChild(fill);
  prog.appendChild(tNow); prog.appendChild(bar); prog.appendChild(tEnd);
  info.appendChild(title); info.appendChild(artist); info.appendChild(album); info.appendChild(prog);
  page.appendChild(vbg); page.appendChild(vshade); page.appendChild(pc); page.appendChild(cover); page.appendChild(info); page.appendChild(closeBtn);
  top.appendChild(page);
  const pCtx = pc.getContext('2d');
  let P_SCALE = 1;                      // canvas pixels per CSS pixel (device-sharp, capped for speed)
  let pW = 2, pH = 2, pageR = 120, cw = 800, ch = 600;
  const LOOKAHEAD = 70;                 // ms: bars are drawn slightly ahead to hide display latency

  // top-bar button
  const btn = document.createElement('button');
  btn.id = 'mg-viz-btn';
  btn.className = 'mg-topbtn';
  btn._mgOrder = 0;                    // nearest the bell
  btn.style.cssText = 'position:fixed;top:12px;right:300px;width:32px;height:32px;';
  btn.setAttribute('aria-label', 'Visualizer');
  btn.title = 'Visualizer (Ctrl+Alt+V)';
  btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">'
    + '<rect x="1" y="8" width="3" height="7" rx="1"/><rect x="6.5" y="1.5" width="3" height="13.5" rx="1"/>'
    + '<rect x="12" y="5" width="3" height="10" rx="1"/></svg>';
  top.appendChild(btn);

  function placePage() {
    const main = top.querySelector(':scope > .mg-main');
    const r = main && main.getBoundingClientRect
      ? main.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    cw = Math.max(200, Math.round(r.width));
    ch = Math.max(200, Math.round(r.height));
    page.style.left = r.left + 'px';
    page.style.top = r.top + 'px';
    page.style.width = cw + 'px';
    page.style.height = ch + 'px';
    P_SCALE = Math.min(1.5, window.devicePixelRatio || 1);
    pW = Math.max(2, Math.floor(cw * P_SCALE));
    pH = Math.max(2, Math.floor(ch * P_SCALE));
    pc.width = pW;
    pc.height = pH;
    pageR = Math.max(70, Math.min(130, ch * 0.17));
    cover.style.width = cover.style.height = pageR * 2 + 'px';
    cover.style.marginLeft = cover.style.marginTop = -pageR + 'px';
    cover.style.top = ch * PAGE_CY + 'px';
    // song info sits BELOW the longest bars / expanding beat ring so nothing crosses the text
    info.style.top = ch * PAGE_CY + pageR + 14 + Math.min(cw, ch) * 0.15 * 1.45 + 14 + 'px';
  }

  /* ---------- track info ---------- */
  function readTrack() {
    const t = mgTrack();
    let src = t.art;
    if (!src) {                          // nothing in the player data: fall back to the docked cover
      const img = document.querySelector('.mg-cimg');
      src = img ? mgHiRes(img.currentSrc || img.src) : '';
    }
    return { uri: t.uri, name: t.name, artists: t.artists, albumName: t.album, src };
  }

  function setBg(src) {
    if (!src) { vbg.classList.remove('on'); return; }
    if (vbg._src === src) return;
    vbg._src = src;
    vbg.style.backgroundImage = 'url("' + src + '")';
    vbg.classList.add('on');
  }

  function updateInfo(force) {
    const t = readTrack();
    const key = t.uri + '|' + t.name + '|' + t.src;
    if (!force && key === lastKey) return;
    lastKey = key;
    title.textContent = t.name;
    artist.textContent = t.artists;
    album.textContent = t.albumName;
    if (t.src && cover.src !== t.src) cover.src = t.src;
    setBg(t.src);
  }

  function updateProgress() {
    const sp = window.Spicetify;
    if (!sp || !sp.Player) return;
    const p = sp.Player.getProgress ? sp.Player.getProgress() : 0;
    const dur = sp.Player.getDuration ? sp.Player.getDuration() : 0;
    tNow.textContent = fmt(p);
    tEnd.textContent = fmt(dur);
    fill.style.width = dur > 0 ? clamp01(p / dur) * 100 + '%' : '0%';
  }

  async function loadAnalysis() {
    const sp = window.Spicetify;
    if (!sp || !sp.getAudioData) return;
    const uri = readTrack().uri;
    if (!uri || uri === analysisUri) return;
    analysisUri = uri;
    if (cache.has(uri)) { analysis = cache.get(uri); return; }
    analysis = null;
    try {
      const data = await sp.getAudioData(uri);
      const ok = data && Array.isArray(data.segments) && data.segments.length ? data : null;
      cache.set(uri, ok);
      if (analysisUri === uri) analysis = ok;
    } catch (e) {
      console.debug('[Modern Gamer] no audio analysis for this track, using generated animation', e);
      cache.set(uri, null);
    }
  }

  /* ---------- audio engine ---------- */
  function computeTargets(now) {
    const sp = window.Spicetify;
    const progS = sp && sp.Player && sp.Player.getProgress ? (sp.Player.getProgress() + LOOKAHEAD) / 1000 : 0;
    let pulse = 0, level = 0;
    target.fill(playing ? 0.03 : 0);     // paused: bars sink to nothing so the loop can stop

    if (!playing) { beatPulse *= 0.9; loud *= 0.9; return; }

    if (analysis) {
      const segs = analysis.segments;
      const s = segs[findIdx(segs, progS)];
      const into = progS - s.start;
      const pk = s.loudness_max_time || 0;
      const decay = clamp01((into - pk) / Math.max(s.duration - pk, 0.05));
      level = clamp01(((s.loudness_max || -30) + 50) / 50) * (1 - 0.3 * decay);
      const p = s.pitches || [];
      const tb = s.timbre || [];
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 11;
        const a = Math.floor(x), b = Math.min(11, a + 1), f = x - a;
        const pv = (p[a] ?? 0.5) * (1 - f) + (p[b] ?? 0.5) * f;
        const wob = 0.12 * Math.sin(i * 1.7 + progS * 9 + (tb[1] || 0) * 0.02);
        target[i] = clamp01(level * (0.35 + 0.75 * pv) + wob * level + 0.03);
      }
      const beats = analysis.beats;
      if (beats && beats.length) {
        const bt = beats[findIdx(beats, progS)];
        const since = progS - bt.start;
        pulse = since >= 0 ? Math.exp(-since * 7) * (0.5 + 0.5 * (bt.confidence ?? 1)) : 0;
      }
    } else {
      const ph = ((now / 1000) * 2) % 1;  // generated: steady 120 bpm
      pulse = Math.exp(-ph * 6);
      level = 0.55 + 0.2 * Math.sin(now / 1700);
      for (let i = 0; i < N; i++) {
        const n = (Math.sin(i * 0.7 + now / 260) + Math.sin(i * 1.9 - now / 410) + 2) / 4;
        target[i] = clamp01(level * (0.3 + 0.8 * n) + 0.03);
      }
    }

    beatPulse = Math.max(pulse, beatPulse * 0.8);
    loud = level;
    for (let i = 0; i < N; i++) target[i] = clamp01(target[i] * (1 + 0.35 * pulse));
  }

  function step(now) {
    const sp = window.Spicetify;
    playing = !!(sp && sp.Player && sp.Player.isPlaying && sp.Player.isPlaying());
    computeTargets(now);
    const dt = Math.min(64, lastStep ? now - lastStep : 16);   // same feel at 30, 60 or 144 fps
    lastStep = now;
    const up = 1 - Math.exp(-dt / 38), down = 1 - Math.exp(-dt / 150);
    peak = 0;
    for (let i = 0; i < N; i++) {
      const t = target[i];
      levels[i] += (t - levels[i]) * (t > levels[i] ? up : down);
      if (levels[i] > peak) peak = levels[i];
    }
  }

  /* ---------- painting ---------- */
  function paintRadial(ctx, W, H, hue0) {
    const M = 120, S = P_SCALE;
    const cx = W / 2, cy = H * PAGE_CY;
    const r0 = pageR * S + 14 * S;
    const maxLen = Math.min(W, H) * 0.15;
    ctx.lineCap = 'round';
    for (let pass = 0; pass < 2; pass++) {        // pass 0 = soft glow, pass 1 = crisp bar
      const glow = pass === 0;
      ctx.lineWidth = (glow ? 9 : 3.2) * S;
      for (let k = 0; k < M; k++) {
        const m = Math.abs((k / M) * 2 - 1) * (N - 1);   // mirrored left/right
        const i0 = Math.floor(m), i1 = Math.min(N - 1, i0 + 1), f = m - i0;
        const v = levels[i0] * (1 - f) + levels[i1] * f;
        const len = 4 * S + v * maxLen * (1 + 0.4 * beatPulse);
        const a = (k / M) * Math.PI * 2 - Math.PI / 2;
        const cs = Math.cos(a), sn = Math.sin(a);
        const c = mgSample(k / M + hue0 / 360);          // active palette, flowing around the ring
        ctx.strokeStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${glow ? 0.16 : 0.95})`;
        ctx.beginPath();
        ctx.moveTo(cx + cs * r0, cy + sn * r0);
        ctx.lineTo(cx + cs * (r0 + len), cy + sn * (r0 + len));
        ctx.stroke();
      }
    }
    // shock ring that expands on every beat
    const c0 = mgSample(hue0 / 360);
    ctx.strokeStyle = `rgba(${c0[0] | 0},${c0[1] | 0},${c0[2] | 0},${clamp01(beatPulse * 0.6)})`;
    ctx.lineWidth = 2 * S;
    ctx.beginPath();
    ctx.arc(cx, cy, r0 + (1 - beatPulse) * maxLen * 1.3, 0, Math.PI * 2);
    ctx.stroke();
  }

  function draw(now) {
    step(now);
    const hue0 = (now / 45) % 360;

    if (pageOpen) {
      pCtx.setTransform(1, 0, 0, 1, 0, 0);
      pCtx.clearRect(0, 0, pW, pH);
      pCtx.globalCompositeOperation = 'lighter';
      paintRadial(pCtx, pW, pH, hue0);
      pCtx.globalCompositeOperation = 'source-over';
      cover.style.animationPlayState = playing ? 'running' : 'paused';
      updateInfo(false);
      updateProgress();
    }
  }

  function loop(now) {
    raf = 0;
    if (!pageOpen) return;
    draw(now);
    const idle = !playing && peak < 0.012 && beatPulse < 0.01;
    if (!idle && !document.hidden) raf = requestAnimationFrame(loop);
  }

  function kick() {
    if (!raf && pageOpen && !document.hidden) { lastStep = 0; raf = requestAnimationFrame(loop); }
  }

  /* ---------- open / close ---------- */
  function openPage() {
    mgCloseOthers('viz');
    placePage();
    updateInfo(true);
    updateProgress();
    pageOpen = true;
    mgShow(page);
    btn.classList.add('on');
    if (stopFollow) stopFollow();
    stopFollow = mgFollowMain(top, () => { if (pageOpen) placePage(); });
    loadAnalysis();
    kick();
  }

  function closePage() {
    pageOpen = false;
    mgHide(page);
    btn.classList.remove('on');
    if (stopFollow) { stopFollow(); stopFollow = null; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  MG_PAGES.viz = { close: closePage };

  function togglePage() { if (pageOpen) closePage(); else openPage(); }

  btn.addEventListener('click', togglePage);
  closeBtn.addEventListener('click', closePage);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pageOpen) { closePage(); return; }
    if (e.ctrlKey && e.altKey && String(e.key).toLowerCase() === 'v') togglePage();
  });

  window.addEventListener('resize', () => { if (pageOpen) placePage(); kick(); });
  document.addEventListener('visibilitychange', kick);

  // hook into the player once Spicetify is ready
  (function whenReady(tries) {
    const sp = window.Spicetify;
    if (sp && sp.Player && sp.Player.addEventListener) {
      sp.Player.addEventListener('songchange', () => { analysis = null; loadAnalysis(); if (pageOpen) updateInfo(true); kick(); });
      sp.Player.addEventListener('onplaypause', kick);
      try {
        if (sp.Platform && sp.Platform.History && sp.Platform.History.listen) {
          sp.Platform.History.listen(closePage);   // opening any other page closes ours
        }
      } catch (e) {}
      loadAnalysis();
      kick();
    } else if (tries > 0) {
      setTimeout(whenReady, 300, tries - 1);
    }
  })(100);

  kick();
}

/* ================= LYRICS PAGE =================
   A page over the main area (top-bar button or Ctrl+Alt+L, Esc closes). Lyrics come from LRCLIB
   (https://lrclib.net), matched by title, artist, album and track length. Timed lyrics follow the
   playback position; lyrics without timestamps are shown as plain text and labelled as untimed.
   If nothing is found, the page says so - it never invents or guesses lyrics.                    */
const MG_LOGO = 'https://itsbillybruhh.github.io/ModernGamer/Icon.png';

const MG_LYR_CSS = `
#mg-lyr-btn{position:fixed;top:12px;right:338px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;margin:0;border-radius:50%;border:0;background:transparent;color:#B3B3C0;cursor:pointer;z-index:60;-webkit-app-region:no-drag;transition:color .15s ease,background-color .15s ease,box-shadow .15s ease}
#mg-lyr-btn:hover{color:#fff;background:rgba(255,255,255,.10)}
#mg-lyr-btn.on{color:#fff;background:linear-gradient(135deg,var(--mg-a1,#7C4DFF),var(--mg-a2,#00E5FF));box-shadow:0 0 14px rgba(var(--mg-a1-rgb,124,77,255),.6)}
#mg-lyrpage{position:fixed;overflow:hidden;margin:0;padding:0;z-index:30;background:#141416;color:#fff}
#mg-lyrpage .mg-lp-bg{position:absolute;inset:-60px;background-size:cover;background-position:center;filter:blur(50px) saturate(1.3);opacity:0;transform:scale(1.1);transition:opacity .6s ease}
#mg-lyrpage .mg-lp-bg.on{opacity:.28}
#mg-lyrpage .mg-lp-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,20,22,.6),rgba(20,20,22,.9))}
#mg-lyrpage .mg-lp-head{position:absolute;left:0;right:56px;top:0;display:flex;align-items:center;gap:16px;padding:16px 24px;z-index:2;min-width:0}
#mg-lyrpage .mg-lp-cover{width:64px;height:64px;flex:none;border-radius:50%;object-fit:cover;background:#1C1C20;box-shadow:0 0 0 2px #141416,0 0 0 4px rgba(var(--mg-a1-rgb,124,77,255),.6),0 0 22px rgba(var(--mg-a1-rgb,124,77,255),.4);image-rendering:auto}
#mg-lyrpage .mg-lp-cover:not([src]){visibility:hidden}
#mg-lyrpage .mg-lp-meta{min-width:0}
#mg-lyrpage .mg-lp-title{font-size:20px;font-weight:800;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#mg-lyrpage .mg-lp-artist{font-size:14px;color:#BDBDCB;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#mg-lyrpage .mg-lp-scroll{position:absolute;left:0;right:0;top:96px;bottom:34px;overflow-y:auto;overflow-x:hidden;scrollbar-width:none;-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 14%,#000 86%,transparent 100%);mask-image:linear-gradient(180deg,transparent 0,#000 14%,#000 86%,transparent 100%)}
#mg-lyrpage .mg-lp-scroll::-webkit-scrollbar{display:none}
#mg-lyrpage .mg-lp-lines{max-width:760px;margin:0 auto;padding:30vh 32px;box-sizing:border-box}
#mg-lyrpage .mg-lp-line{display:block;width:100%;margin:0;padding:8px 0;border:0;background:none;text-align:left;font:inherit;font-size:clamp(22px,2.6vw,34px);font-weight:800;line-height:1.28;letter-spacing:-.01em;color:#fff;opacity:.62;cursor:pointer;transition:opacity .35s ease,transform .35s ease;transform-origin:left center}
#mg-lyrpage .mg-lp-line:hover{opacity:.9}
#mg-lyrpage .mg-lp-line.past{opacity:.32}
#mg-lyrpage .mg-lp-line.gap{font-size:20px;opacity:.28;cursor:default}
#mg-lyrpage .mg-lp-line.now{opacity:1;transform:scale(1.03)}
#mg-lyrpage .mg-lp-line.now span{background:linear-gradient(90deg,var(--mg-stops,#FF2D55,#FF9500,#FFE600,#2BFF88,#00E5FF,#7C4DFF,#FF2BD6,#FF2D55));background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;animation:mgl-flow 6s linear infinite;filter:drop-shadow(0 0 14px rgba(var(--mg-a1-rgb,124,77,255),.5))}
#mg-lyrpage .mg-lp-plain{max-width:760px;margin:0 auto;padding:12px 32px 30vh;box-sizing:border-box;font-size:20px;font-weight:600;line-height:1.55;color:#E4E4EE;white-space:pre-wrap}
#mg-lyrpage .mg-lp-note{max-width:760px;margin:0 auto;padding:0 32px 6px;font-size:13px;color:#A8A8B3}
#mg-lyrpage .mg-lp-status{position:absolute;left:0;right:0;top:96px;bottom:34px;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:0 32px}
#mg-lyrpage .mg-lp-status img{width:96px;height:96px;border-radius:18px;margin-bottom:10px;opacity:.95}
#mg-lyrpage .mg-lp-status b{font-size:24px;font-weight:800}
#mg-lyrpage .mg-lp-status span{font-size:15px;color:#BDBDCB;max-width:420px}
#mg-lyrpage .mg-lp-src{position:absolute;left:0;right:0;bottom:10px;text-align:center;font-size:12px;color:#8E8E9A;z-index:2}
#mg-lyrpage .mg-lp-close{position:absolute;top:14px;right:16px;width:34px;height:34px;padding:0;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#F2F2F5;font-size:14px;cursor:pointer;z-index:3}
#mg-lyrpage .mg-lp-close:hover{color:var(--mg-a2,#00E5FF);border-color:var(--mg-a2,#00E5FF)}
@keyframes mgl-flow{from{background-position:0% 0}to{background-position:200% 0}}
@media (prefers-reduced-motion:reduce){#mg-lyrpage .mg-lp-line.now span{animation:none!important}#mg-lyrpage .mg-lp-line{transition:none}}
`;

/* "[01:23.45] text" lines -> [{t: ms, text}] sorted by time. Metadata tags ([ar:...]) are skipped. */
function mgParseLrc(txt) {
  const out = [];
  const re = /\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of String(txt || '').split(/\r?\n/)) {
    re.lastIndex = 0;
    const stamps = [];
    let m, end = 0;
    while ((m = re.exec(raw)) && m.index === end) {
      stamps.push(+m[1] * 60000 + +m[2] * 1000 + (m[3] ? Math.round(+('0.' + m[3]) * 1000) : 0));
      end = re.lastIndex;
    }
    if (!stamps.length) continue;
    const text = raw.slice(end).replace(/<\d+:\d+(?:[.:]\d+)?>/g, '').trim();   // drop word-level stamps
    stamps.forEach((t) => out.push({ t, text }));
  }
  return out.sort((a, b) => a.t - b.t);
}

/* index of the last line that has started at position ms (-1 before the first line) */
function mgLineAt(lines, ms) {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].t <= ms) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

async function mgGetJson(url) {
  try {
    const r = await fetch(url);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) {
    const sp = window.Spicetify;
    if (sp && sp.CosmosAsync && sp.CosmosAsync.get) {     // Spotify's own request channel, if plain fetch is blocked
      try { return await sp.CosmosAsync.get(url); }
      catch (e2) { if (/404/.test(String((e2 && (e2.message || e2.status)) || ''))) return null; throw e2; }
    }
    throw e;
  }
}

/* -> { kind: 'synced'|'plain'|'instrumental'|'none', lines?, text? }   (throws on network failure) */
async function mgFindLyrics(t) {
  const secs = Math.round((t.duration || 0) / 1000);
  const shape = (d) => {
    if (!d) return null;
    if (d.instrumental) return { kind: 'instrumental' };
    if (d.syncedLyrics) {
      const lines = mgParseLrc(d.syncedLyrics);
      if (lines.length) return { kind: 'synced', lines };
    }
    if (d.plainLyrics && d.plainLyrics.trim()) return { kind: 'plain', text: d.plainLyrics.trim() };
    return null;
  };
  const q = { track_name: t.name, artist_name: t.artist1 };
  if (t.album) q.album_name = t.album;
  if (secs) q.duration = secs;
  let r = shape(await mgGetJson('https://lrclib.net/api/get?' + new URLSearchParams(q)));
  if (r) return r;

  // fallback search; only accept a version whose length matches, so timestamps line up
  const clean = t.name.replace(/\s*[\(\[][^)\]]*[\)\]]/g, '').replace(/\s+-\s+.*$/, '').trim() || t.name;
  const list = await mgGetJson('https://lrclib.net/api/search?' + new URLSearchParams({ track_name: clean, artist_name: t.artist1 }));
  if (Array.isArray(list)) {
    const near = list.filter((x) => !secs || Math.abs((x.duration || 0) - secs) <= 4);
    near.sort((a, b) => (b.syncedLyrics ? 2 : 0) - (a.syncedLyrics ? 2 : 0) + Math.abs((a.duration || 0) - secs) / 100 - Math.abs((b.duration || 0) - secs) / 100);
    for (const x of near) { r = shape(x); if (r) return r; }
  }
  return { kind: 'none' };
}

function startLyrics(top) {
  if (!MG_LYRICS_ENABLED || document.getElementById('mg-lyrpage')) return;

  const style = document.createElement('style');
  style.id = 'mg-lyr-style';
  style.textContent = MG_LYR_CSS;
  const host = [document.head, document.documentElement, top].find((h) => h && h.appendChild);
  if (host) host.appendChild(style);

  const mk = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  };

  /* ---------- DOM ---------- */
  const page = mk('div', 'mg-page');
  page.id = 'mg-lyrpage';
  page.style.cssText = 'position:fixed;display:none;';
  const bg = mk('div', 'mg-lp-bg');
  const shade = mk('div', 'mg-lp-shade');
  const head = mk('div', 'mg-lp-head');
  const cover = mk('img', 'mg-lp-cover');
  cover.alt = '';
  const meta = mk('div', 'mg-lp-meta');
  const title = mk('div', 'mg-lp-title');
  const artist = mk('div', 'mg-lp-artist');
  meta.appendChild(title); meta.appendChild(artist);
  head.appendChild(cover); head.appendChild(meta);
  const scroll = mk('div', 'mg-lp-scroll');
  const status = mk('div', 'mg-lp-status');
  const src = mk('div', 'mg-lp-src', 'Lyrics from LRCLIB');
  const closeBtn = mk('button', 'mg-lp-close', '\u2715');
  closeBtn.setAttribute('aria-label', 'Close lyrics');
  [bg, shade, head, scroll, status, src, closeBtn].forEach((e) => page.appendChild(e));
  top.appendChild(page);

  const btn = document.createElement('button');
  btn.id = 'mg-lyr-btn';
  btn.className = 'mg-topbtn';
  btn._mgOrder = 1;
  btn.style.cssText = 'position:fixed;top:12px;right:338px;width:32px;height:32px;';
  btn.setAttribute('aria-label', 'Lyrics');
  btn.title = 'Lyrics (Ctrl+Alt+L)';
  btn.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">'
    + '<rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="6" width="9" height="2" rx="1"/>'
    + '<rect x="1" y="10" width="12" height="2" rx="1"/><rect x="1" y="14" width="7" height="2" rx="1" opacity=".55"/></svg>';
  top.appendChild(btn);

  /* ---------- state ---------- */
  const cache = new Map();           // uri -> result (capped)
  let isOpen = false, raf = 0, stopFollow = null, unlisten = null;
  let curKey = '', token = 0;
  let res = null, lineEls = [], active = -2, userUntil = 0;

  function place() {
    const main = top.querySelector(':scope > .mg-main');
    const r = main && main.getBoundingClientRect ? main.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    page.style.left = r.left + 'px';
    page.style.top = r.top + 'px';
    page.style.width = Math.max(240, Math.round(r.width)) + 'px';
    page.style.height = Math.max(240, Math.round(r.height)) + 'px';
  }

  /* ---------- rendering ---------- */
  function showStatus(head1, sub, logo) {
    scroll.style.display = 'none';
    status.style.display = 'flex';
    status.textContent = '';
    if (logo) {
      const im = mk('img');
      im.alt = '';
      im.src = MG_LOGO;
      im.onerror = () => { im.style.display = 'none'; };
      status.appendChild(im);
    }
    status.appendChild(mk('b', '', head1));
    if (sub) status.appendChild(mk('span', '', sub));
  }

  function showScroll() {
    status.style.display = 'none';
    scroll.style.display = 'block';
  }

  function render(t, r) {
    res = r; lineEls = []; active = -2;
    scroll.textContent = '';
    scroll.scrollTop = 0;
    if (r.kind === 'synced') {
      showScroll();
      const box = mk('div', 'mg-lp-lines');
      r.lines.forEach((l, i) => {
        const el = mk('button', 'mg-lp-line' + (l.text ? '' : ' gap'));
        el.type = 'button';
        el.appendChild(mk('span', '', l.text || '\u266A'));
        if (l.text) el.addEventListener('click', () => {
          const sp = window.Spicetify;
          if (sp && sp.Player && sp.Player.seek) { sp.Player.seek(l.t); tick(true); }
        });
        el.dataset.i = i;
        box.appendChild(el);
        lineEls.push(el);
      });
      scroll.appendChild(box);
      tick(true);
    } else if (r.kind === 'plain') {
      showScroll();
      scroll.appendChild(mk('div', 'mg-lp-note', 'These lyrics have no timing, so they don\u2019t follow the song.'));
      scroll.appendChild(mk('div', 'mg-lp-plain', r.text));
    } else if (r.kind === 'instrumental') {
      showStatus('Instrumental', 'This track has no lyrics.', true);
    } else {
      showStatus('No lyrics found', 'LRCLIB has no lyrics that match this track.', true);
    }
  }

  /* ---------- sync ---------- */
  function tick(force) {
    if (!res || res.kind !== 'synced' || !lineEls.length) return;
    const sp = window.Spicetify;
    const pos = sp && sp.Player && sp.Player.getProgress ? sp.Player.getProgress() : 0;
    const idx = mgLineAt(res.lines, pos + 90);          // small look-ahead for display latency
    if (idx === active && !force) return;
    const prev = active;
    active = idx;
    const all = force || prev < -1;                    // first paint / forced: restyle every line
    const lo = all ? 0 : Math.max(0, Math.min(prev, idx) - 1);
    const hi = all ? lineEls.length - 1 : Math.min(lineEls.length - 1, Math.max(prev, idx) + 1);
    for (let i = lo; i <= hi; i++) {
      const cls = 'mg-lp-line' + (res.lines[i].text ? '' : ' gap') + (i < idx ? ' past' : i === idx ? ' now' : '');
      if (lineEls[i].className !== cls) lineEls[i].className = cls;
    }
    if (idx >= 0 && (force || Date.now() > userUntil)) centre(lineEls[idx], force);
  }

  function centre(el, instant) {
    const y = el.offsetTop - scroll.clientHeight / 2 + el.offsetHeight / 2;
    scroll.scrollTo({ top: Math.max(0, y), behavior: instant ? 'auto' : 'smooth' });
  }

  function loop() {
    raf = 0;
    if (!isOpen || document.hidden) return;
    tick(false);
    const sp = window.Spicetify;
    if (sp && sp.Player && sp.Player.isPlaying && sp.Player.isPlaying()) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && isOpen && !document.hidden) raf = requestAnimationFrame(loop); }

  // the person is reading ahead / scrolling: don't fight them for a few seconds
  const hold = () => { userUntil = Date.now() + 3500; };
  scroll.addEventListener('wheel', hold, { passive: true });
  scroll.addEventListener('touchstart', hold, { passive: true });
  scroll.addEventListener('pointerdown', hold);

  /* ---------- loading ---------- */
  function paintHead(t) {
    title.textContent = t.name;
    artist.textContent = t.artists;
    if (t.art && cover.src !== t.art) cover.src = t.art;
    if (!t.art) cover.removeAttribute('src');
    if (t.art) { if (bg._u !== t.art) { bg._u = t.art; bg.style.backgroundImage = 'url("' + t.art + '")'; } bg.classList.add('on'); }
    else bg.classList.remove('on');
  }

  async function load(force) {
    const t = mgTrack();
    const key = t.uri + '|' + t.name;
    if (!force && key === curKey) return;
    curKey = key;
    const my = ++token;
    paintHead(t);
    res = null; lineEls = []; active = -2;
    if (!t.name) { showStatus('Nothing is playing', 'Play a song and its lyrics show up here.', true); return; }
    if (/^spotify:(episode|show|ad)/.test(t.uri)) { showStatus('No lyrics for this', 'Lyrics are available for songs, not podcasts or ads.', true); return; }
    if (cache.has(key)) { render(t, cache.get(key)); kick(); return; }
    showStatus('Finding lyrics\u2026', '', false);
    try {
      const r = await mgFindLyrics(t);
      if (my !== token) return;                      // the song changed while we were waiting
      cache.set(key, r);
      if (cache.size > 40) cache.delete(cache.keys().next().value);
      render(t, r);
      kick();
    } catch (e) {
      if (my !== token) return;
      console.debug('[Modern Gamer] lyrics lookup failed', e);
      curKey = '';                                   // let the next open / song change retry
      showStatus('Couldn\u2019t load lyrics', 'Check your connection. Spotify may also be blocking requests to lrclib.net.', true);
    }
  }

  /* ---------- open / close ---------- */
  function open() {
    mgCloseOthers('lyr');
    place();
    isOpen = true;
    mgShow(page);
    btn.classList.add('on');
    if (stopFollow) stopFollow();
    stopFollow = mgFollowMain(top, () => { if (isOpen) place(); });
    load(false);
    kick();
  }
  function close() {
    isOpen = false;
    mgHide(page);
    btn.classList.remove('on');
    if (stopFollow) { stopFollow(); stopFollow = null; }
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  const toggle = () => (isOpen ? close() : open());
  MG_PAGES.lyr = { close };

  btn.addEventListener('click', toggle);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) { close(); return; }
    if (e.ctrlKey && e.altKey && String(e.key).toLowerCase() === 'l') toggle();
  });
  window.addEventListener('resize', () => { if (isOpen) place(); });
  document.addEventListener('visibilitychange', kick);

  mgWhenSpicetify((sp) => {
    sp.Player.addEventListener('songchange', () => { if (isOpen) load(true); });
    sp.Player.addEventListener('onplaypause', () => { tick(true); kick(); });
    sp.Player.addEventListener('onprogress', () => { if (isOpen) tick(false); });   // also catches seeks while paused
    try { if (sp.Platform.History && sp.Platform.History.listen) unlisten = sp.Platform.History.listen(close); } catch (e) {}
  });
}

/* console helper: ModernGamer.debugArt() shows where the cover comes from and what we asked for */
function mgDebugArt() {
  const img = document.querySelector('.mg-cimg');
  const t = mgTrack();
  console.log('[Modern Gamer] cover <img>:', img && (img.currentSrc || img.src), '| natural width:', img && img.naturalWidth,
    '| shown at:', img && img.offsetWidth + 'px', '\nplayer data art:', t.art, '\nhi-res of <img>:', img && mgHiRes(img.currentSrc || img.src));
}

window.ModernGamer = { hiRes: mgHiRes, parseLrc: mgParseLrc, lineAt: mgLineAt, debugGap: mgDebugGap, debugArt: mgDebugArt };

waitForElement([MG_TOP], ([top]) => {
  let refs = tagPanels(top);
  mgInjectPageCss();
  startVisualizer(top);
  startLyrics(top);
  startPalette(top);
  mgAlignButtons(top);                // lines the top-bar buttons up with the bell
  setInterval(() => mgAlignButtons(top), 1500);
  window.addEventListener('resize', () => mgAlignButtons(top));

  const refresh = () => {
    refs = tagPanels(top);
    tagPlayer(refs.bar);
  };
  const slowRefresh = () => {
    flatten(refs.rightbar);
    const main = top.querySelector(':scope > .mg-main');
    killBackdrops(main);
    clearBars(top.querySelector(':scope > .mg-gn'));
    mgFixTopGap(main, false);
    mgUpgradeMain(main);
  };
  const refreshSoon = debounce(refresh, 250);
  const slowSoon = debounce(slowRefresh, 700);

  refresh();
  slowRefresh();
  new MutationObserver(() => { refreshSoon(); slowSoon(); }).observe(top, { childList: true, subtree: true });

  // Spotify's re-renders can overwrite an element's class attribute and wipe our tags
  // (the cover then loses its styling). Watch class changes around the panels/player and re-tag.
  const reTag = debounce(() => { refs = tagPanels(top); tagPlayer(refs.bar); }, 80);
  new MutationObserver((muts) => {
    for (const m of muts) {
      const t = m.target;
      if (t === top || t.parentElement === top || (t.closest && t.closest('.mg-npb'))) { reTag(); break; }
    }
  }).observe(top, { attributes: true, attributeFilter: ['class'], subtree: true });

  // Spotify mounts things over time; keep retrying for a while
  let tries = 0;
  const retry = setInterval(() => {
    refresh();
    slowRefresh();
    if (++tries > 40) clearInterval(retry);
  }, 500);

  // Spicetify events: cover spin, track-change transition, hi-res art, and the top gap after navigation
  let navT = 0;
  const afterNav = () => {
    clearTimeout(navT);
    navT = setTimeout(() => { slowRefresh(); setTimeout(slowRefresh, 900); }, 350);
  };
  mgWhenSpicetify((sp) => {
    sp.Player.addEventListener('songchange', () => { mgTrackSwap(); mgSpinSync(); });
    sp.Player.addEventListener('onplaypause', mgSpinSync);
    try { if (sp.Platform.History && sp.Platform.History.listen) sp.Platform.History.listen(afterNav); } catch (e) {}
    mgTrackSwap();
    mgSpinSync();
  });
  document.addEventListener('visibilitychange', mgSpinSync);
  mgSpinSync();

  // art swaps: Spotify rewrites the cover's src on every track change, so upgrade it again
  new MutationObserver((muts) => {
    for (const m of muts) if (m.target.classList && m.target.classList.contains('mg-cimg')) mgApplyTrackArt(m.target);
  }).observe(top, { attributes: true, attributeFilter: ['src', 'srcset'], subtree: true });
});

})();
