(function () {
  if (window.__modernGamerLoaded) return;   // Marketplace may load this twice
  window.__modernGamerLoaded = true;

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

waitForElement([MG_TOP], ([top]) => {
  let refs = tagPanels(top);

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
