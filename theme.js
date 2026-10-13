(function () {
  if (window.__modernGamerLoaded) return;   // Marketplace may load this twice
  window.__modernGamerLoaded = true;

  // ---- settings you can edit ----
  const MG_VIZ_ENABLED = true;        // false = no visualizer
  const MG_NAME = 'ItsBillyBruhh';    // neon text in the visualizer ('' = none)
  const MG_NAME_Y = 0.8;              // vertical position of the name (0 = top, 1 = bottom)

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

/* ---------- the page grid ---------- */
function tagPanels(top) {
  top.classList.add('mg-top');
  for (const child of top.children) {
    const cls = MG_AREAS[singleArea(child)];
    if (cls) child.classList.add(cls);
    // the top nav wrapper spans "top-banner / 1 / global-nav / -1"
    if (/^top-banner\s*\/\s*1\s*\/\s*global-nav/.test(getComputedStyle(child).gridArea)) {
      child.classList.add('mg-gn');
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
    '[data-testid="now-playing-widget"], .main-nowPlayingWidget-nowPlaying'
  );
  const play = bar.querySelector('[data-testid="control-button-playpause"]');
  if (!widget || !play) return;

  // the row that holds [track info] [controls] [volume etc.]
  const container = ancestorContaining(play, widget, bar.parentElement);
  if (container) {
    // every wrapper from the container up to the player root
    for (let n = container; n && n !== bar; n = n.parentElement) {
      n.classList.add('mg-wrap');
    }
    container.classList.add('mg-pc');
    const L = childContaining(container, widget);
    const M = childContaining(container, play);
    if (L) L.classList.add('mg-pl');
    if (M) M.classList.add('mg-pm');
    [...container.children].forEach((k) => {
      if (k !== L && k !== M) k.classList.add('mg-pr');
    });
  }

  // cover: make every wrapper from the <img> up to the widget flexible
  widget.classList.add('mg-widget');
  const img = widget.querySelector('img');
  if (img) {
    img.classList.add('mg-cimg');
    for (let n = img.parentElement; n && n !== widget; n = n.parentElement) {
      n.classList.add('mg-cchain');
    }
  }

  // progress bar above the transport buttons
  const prog = bar.querySelector(
    '[data-testid="playback-progressbar"], .playback-bar'
  );
  if (prog) {
    const pcm = ancestorContaining(play, prog, bar.parentElement);
    if (pcm && pcm !== play) {
      pcm.classList.add('mg-pcm');
      const btns = childContaining(pcm, play);
      const pg = childContaining(pcm, prog);
      if (btns) {
        btns.classList.add('mg-btns');
        // [left group] [play] [right group] -> centre the play button exactly
        const kids = [...btns.children];
        const pi = kids.findIndex((k) => k.contains(play));
        if (pi >= 0) kids[pi].classList.add('mg-playwrap');
        if (kids.length === 3 && pi === 1) {
          btns.classList.add('mg-btns3');
          kids[0].classList.add('mg-bl');
          kids[2].classList.add('mg-br');
        }
      }
      if (pg && pg !== btns) pg.classList.add('mg-prog');
    }
  }

  // volume row: let the slider stretch between the icons
  const vol = bar.querySelector('[data-testid="volume-bar"], .volume-bar');
  if (vol) {
    const right = vol.closest('.mg-pr');
    for (let n = vol; n && n !== right && n !== bar; n = n.parentElement) {
      if (n.parentElement && n.parentElement !== right) {
        n.classList.add('mg-vol');
      } else {
        n.classList.add('mg-vol');
        if (n.parentElement) n.parentElement.classList.add('mg-row');
        break;
      }
    }
    if (right && !right.querySelector('.mg-row')) right.classList.add('mg-row');
  }

  tagFill(bar.querySelector('.mg-prog'));
  tagFill(bar.querySelector('.mg-vol'));
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
    el.classList.add('mg-flat');
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
  leaves.forEach(([el, l]) => { if (l >= max * 0.9) el.classList.add('mg-fill'); });
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
    el.classList.add('mg-bgkill');
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
    el.classList.add('mg-bgkill');
  }
}

/* ================= NEON VISUALIZER =================
   Reacts to Spotify's own analysis of the playing track (beats, loudness,
   pitch) in time with playback. It does NOT hear your speakers.
   Tracks without analysis get a generated beat animation instead.
   Toggle on/off: Ctrl + Alt + V                                         */
function startVisualizer(top) {
  if (!MG_VIZ_ENABLED || document.getElementById('mg-viz')) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'mg-viz';
  top.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  const SCALE = 0.5;               // render at half resolution (fast, glow stays soft)
  const N = 56;                    // number of bars
  const levels = new Float32Array(N);
  const target = new Float32Array(N);
  const cache = new Map();
  let W = 2, H = 2, raf = 0, last = 0;
  let analysis = null, analysisUri = '';
  let playing = false, beatPulse = 0, loud = 0, peak = 0;
  let enabled = true;
  try { enabled = localStorage.getItem('mg-viz-off') !== '1'; } catch (e) {}
  canvas.style.display = enabled ? '' : 'none';

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // last index whose .start <= t
  function findIdx(arr, t) {
    let lo = 0, hi = arr.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  function resize() {
    W = Math.max(2, Math.floor(window.innerWidth * SCALE));
    H = Math.max(2, Math.floor(window.innerHeight * SCALE));
    canvas.width = W;
    canvas.height = H;
  }

  async function loadAnalysis() {
    const sp = window.Spicetify;
    if (!sp || !sp.getAudioData) return;
    const item = sp.Player && sp.Player.data && (sp.Player.data.item || sp.Player.data.track);
    const uri = item && item.uri;
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

  function computeTargets(now) {
    const sp = window.Spicetify;
    const prog = sp && sp.Player && sp.Player.getProgress ? sp.Player.getProgress() / 1000 : 0;
    let pulse = 0, level = 0;
    target.fill(playing ? 0.03 : 0);   // paused: bars sink to nothing so the loop can stop

    if (!playing) {
      beatPulse *= 0.9;
      loud *= 0.9;
      return;
    }

    if (analysis) {
      const segs = analysis.segments;
      const s = segs[findIdx(segs, prog)];
      const into = prog - s.start;
      const pk = s.loudness_max_time || 0;
      const decay = clamp01((into - pk) / Math.max(s.duration - pk, 0.05));
      level = clamp01(((s.loudness_max || -30) + 50) / 50) * (1 - 0.3 * decay);
      const p = s.pitches || [];
      const tb = s.timbre || [];
      for (let i = 0; i < N; i++) {
        const x = (i / (N - 1)) * 11;
        const a = Math.floor(x), b = Math.min(11, a + 1), f = x - a;
        const pv = (p[a] ?? 0.5) * (1 - f) + (p[b] ?? 0.5) * f;
        const wob = 0.12 * Math.sin(i * 1.7 + prog * 9 + (tb[1] || 0) * 0.02);
        target[i] = clamp01(level * (0.35 + 0.75 * pv) + wob * level + 0.03);
      }
      const beats = analysis.beats;
      if (beats && beats.length) {
        const bt = beats[findIdx(beats, prog)];
        const since = prog - bt.start;
        pulse = since >= 0 ? Math.exp(-since * 7) * (0.5 + 0.5 * (bt.confidence ?? 1)) : 0;
      }
    } else {
      // generated: steady 120 bpm pulse with moving bars
      const ph = ((now / 1000) * 2) % 1;
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

  function draw(now) {
    const sp = window.Spicetify;
    playing = !!(sp && sp.Player && sp.Player.isPlaying && sp.Player.isPlaying());
    computeTargets(now);

    peak = 0;
    for (let i = 0; i < N; i++) {
      const t = target[i];
      levels[i] += (t - levels[i]) * (t > levels[i] ? 0.5 : 0.12);
      if (levels[i] > peak) peak = levels[i];
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const hue0 = (now / 45) % 360;

    // ---- neon bars ----
    const bw = W / N, maxH = H * 0.5;
    for (let i = 0; i < N; i++) {
      const h = Math.max(3, levels[i] * maxH);
      const x = i * bw + bw * 0.5;
      const hue = (hue0 + (i / N) * 300) % 360;
      ctx.shadowBlur = 0;
      ctx.fillStyle = `hsla(${hue},100%,55%,0.16)`;
      ctx.fillRect(x - bw * 0.45, H - h, bw * 0.9, h);
      ctx.shadowColor = `hsl(${hue},100%,60%)`;
      ctx.shadowBlur = 12;
      ctx.fillStyle = `hsla(${hue},100%,62%,0.9)`;
      ctx.fillRect(x - bw * 0.2, H - h, bw * 0.4, h);
      ctx.fillStyle = `hsla(${hue},100%,88%,1)`;
      ctx.fillRect(x - bw * 0.2, H - h - 3, bw * 0.4, 2);
    }
    ctx.shadowBlur = 0;

    // ---- neon wave line ----
    const baseY = H * 0.62;
    const amp = H * (0.03 + 0.07 * loud);
    const grad = ctx.createLinearGradient(0, 0, W, 0);
    for (let s = 0; s <= 6; s++) grad.addColorStop(s / 6, `hsl(${(hue0 + s * 60) % 360},100%,60%)`);
    ctx.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const y = baseY
        + Math.sin(x * 0.011 + now / 520) * amp
        + Math.sin(x * 0.027 - now / 340) * amp * 0.5 * (0.4 + beatPulse);
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = grad;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.18;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.95;
    ctx.shadowColor = `hsl(${hue0},100%,60%)`;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    // ---- your name in neon, pulsing on the beat ----
    if (MG_NAME) {
      const size = Math.min(W * 0.1, 140);
      ctx.font = `800 ${size}px "Segoe UI", Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${size * 0.08}px`;
      const a = clamp01(0.28 + 0.55 * beatPulse + 0.15 * loud);
      ctx.save();
      ctx.translate(W / 2, H * MG_NAME_Y);
      const sc = 1 + beatPulse * 0.035;
      ctx.scale(sc, sc);
      ctx.lineJoin = 'round';
      ctx.shadowColor = `hsl(${hue0},100%,60%)`;
      ctx.shadowBlur = 24;
      ctx.lineWidth = size * 0.06;
      ctx.strokeStyle = `hsla(${hue0},100%,62%,${a})`;
      ctx.strokeText(MG_NAME, 0, 0);
      ctx.shadowBlur = 8;
      ctx.lineWidth = size * 0.018;
      ctx.strokeStyle = `hsla(${(hue0 + 40) % 360},100%,86%,${clamp01(a + 0.25)})`;
      ctx.strokeText(MG_NAME, 0, 0);
      ctx.restore();
      ctx.shadowBlur = 0;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function loop(now) {
    raf = 0;
    if (!enabled) return;
    if (now - last >= 20) { last = now; draw(now); }
    const idle = !playing && peak < 0.012 && beatPulse < 0.01;
    if (!idle && !document.hidden) raf = requestAnimationFrame(loop);
  }

  function kick() {
    if (!raf && enabled && !document.hidden) raf = requestAnimationFrame(loop);
  }

  resize();
  window.addEventListener('resize', () => { resize(); kick(); });
  document.addEventListener('visibilitychange', kick);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.altKey && String(e.key).toLowerCase() === 'v') {
      enabled = !enabled;
      try { localStorage.setItem('mg-viz-off', enabled ? '0' : '1'); } catch (err) {}
      canvas.style.display = enabled ? '' : 'none';
      if (enabled) kick();
    }
  });

  // hook into the player once Spicetify is ready
  (function whenReady(tries) {
    const sp = window.Spicetify;
    if (sp && sp.Player && sp.Player.addEventListener) {
      sp.Player.addEventListener('songchange', () => { loadAnalysis(); kick(); });
      sp.Player.addEventListener('onplaypause', kick);
      loadAnalysis();
      kick();
    } else if (tries > 0) {
      setTimeout(whenReady, 300, tries - 1);
    }
  })(100);

  kick();
}

waitForElement([MG_TOP], ([top]) => {
  let refs = tagPanels(top);
  startVisualizer(top);

  const refresh = () => {
    refs = tagPanels(top);
    tagPlayer(refs.bar);
  };
  const slowRefresh = () => {
    flatten(refs.rightbar);
    killBackdrops(top.querySelector(':scope > .mg-main'));
    clearBars(top.querySelector(':scope > .mg-gn'));
  };
  const refreshSoon = debounce(refresh, 250);
  const slowSoon = debounce(slowRefresh, 700);

  refresh();
  slowRefresh();
  new MutationObserver(() => { refreshSoon(); slowSoon(); }).observe(top, { childList: true, subtree: true });

  // Spotify mounts things over time; keep retrying for a while
  let tries = 0;
  const retry = setInterval(() => {
    refresh();
    slowRefresh();
    if (++tries > 40) clearInterval(retry);
  }, 500);

  // spin the cover while music plays, pause when paused
  waitForElement(['[data-testid="control-button-playpause"]'], ([btn]) => {
    const update = () => {
      const img = document.querySelector('.mg-cimg');
      if (!img) return;
      img.classList.toggle('running-animation', btn.getAttribute('aria-label') === 'Pause');
    };
    new MutationObserver(update).observe(btn, {
      attributes: true,
      attributeFilter: ['aria-label'],
    });
    setInterval(update, 1000);
    update();
  });
});

})();
