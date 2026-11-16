// make.fun board — a static frontend for make.fun's public API. No framework, no build step.
//
// This file is the whole first load: formatters, the API client (a memory cache, in-flight
// de-duplication and the browser's own ETag revalidation), the hash router and the shared
// page shell. The four views are fetched on demand from ./views/ when a route first needs
// one, so a visit that only reads the board never downloads the leaderboard's code.
//
// Routes: #/  ·  #/bounty/<slug>  ·  #/bounty/<slug>/leaderboard  ·  #/top

const API = 'https://make.fun/api';
const FRESH_MS = 60_000; // an answer younger than this is shown without asking make.fun
const PAGE = 8; // bounties per request: the board's own list is ~15 KB gzipped each

// ---------------------------------------------------------------- formatting
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Text safe to put in HTML. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** "$664.50", "$100", or "—". A value given with cents keeps them, so a pot never rounds. */
function money(value) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const cents = !Number.isInteger(n) || (typeof value === 'string' && value.includes('.'));
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 });
}

/** The pot as it stands now: the promised reward plus every entry fee paid into it. */
function pot(b) {
  return money(b.potUsd ?? b.rewardAmount);
}

/** The entry fee, spelled out: "$0.50" or "Free". */
function fee(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? money(n) : 'Free';
}

/** "1d 4h left", "3h 12m left", "12m left" or "closed". */
function timeLeft(iso, from = Date.now()) {
  const ms = Date.parse(iso) - from;
  if (!Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'closed';
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h left`;
  if (hours > 0) return `${hours}h ${mins % 60}m left`;
  return `${Math.max(1, mins)}m left`;
}

const soon = (iso) => Date.parse(iso) - Date.now() < 6 * 3600e3;

/** "17 Nov 2026, 12:30 UTC" — every time on this page is UTC, as make.fun states them. */
function dateUtc(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}

/** A count with thousands separators. */
function count(n) {
  return Number(n || 0).toLocaleString('en-US');
}

/** A dossier size in bytes as "645 KB". */
function bytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1048576) return (v / 1048576).toFixed(1) + ' MB';
  if (v >= 1024) return Math.round(v / 1024) + ' KB';
  return v + ' B';
}

/** A leaderboard value in millionths as "95.06%". */
function pct(micro) {
  const n = Number(micro);
  return Number.isFinite(n) ? (n / 10000).toFixed(2) + '%' : '—';
}

const fmt = { esc, money, pot, fee, timeLeft, soon, dateUtc, count, bytes, pct };

// ---------------------------------------------------------------- API client
const memo = new Map(); // path -> { at, data }
const busy = new Map(); // path -> Promise, so two views asking at once share one request

/**
 * GET a make.fun API path as JSON.
 * The answer is kept for FRESH_MS. After that it is fetched again with `cache: 'no-cache'`:
 * make.fun sends a weak ETag, so the browser revalidates and a 304 costs almost nothing.
 * A failed request is never cached.
 */
async function getJSON(path) {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.data;
  const running = busy.get(path);
  if (running) return running;

  const request = fetch(API + path, { cache: 'no-cache', headers: { accept: 'application/json' } })
    .then((res) => {
      if (!res.ok) throw new Error(`make.fun answered ${res.status} for ${path}`);
      return res.json();
    })
    .then((data) => {
      memo.set(path, { at: Date.now(), data });
      loadedAt = Date.now();
      return data;
    })
    .finally(() => busy.delete(path));

  busy.set(path, request);
  return request;
}

const withQuery = (path, params) => {
  const search = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return search ? `${path}?${search}` : path;
};

const api = {
  board: (limit = PAGE, cursor = '') => getJSON(withQuery('/competitions', { status: 'open', activity: 'times', limit, cursor })),
  bounty: (slug) => getJSON(withQuery(`/competitions/${encodeURIComponent(slug)}`, { submissions: 'summary' })),
  // 1.5 KB gzipped: where the bounty stands right now and its top rows, without the 470 KB board.
  live: (slug) => getJSON(`/competitions/${encodeURIComponent(slug)}/live`),
  leaderboard: (slug) => getJSON(`/competitions/${encodeURIComponent(slug)}/leaderboard`),
  rankings: (order = '') => getJSON(withQuery('/rankings', { order })),
};

/** Warm the cache when a pointer rests on a link, so the next page paints at once. */
const prefetch = (promise) => promise.catch(() => {});

// ---------------------------------------------------------------- shell
const view = document.getElementById('view');
const stamp = document.getElementById('stamp');
let loadedAt = 0;
let rendered = '';
let controller = new AbortController();

function setTitle(text) {
  document.title = text;
}

function errorPanel(err) {
  return `<div class="err"><b>make.fun did not answer.</b>
    <p>${esc(err && err.message ? err.message : String(err))}</p>
    <p style="margin-top:10px"><button class="btn" type="button" data-retry>Try again</button></p></div>`;
}

function notFound() {
  return `<section class="page-head"><h1>Nothing here</h1>
    <p class="sub">That page is not part of this board. <a href="#/">Back to the open bounties</a>.</p></section>`;
}

function markNav(name) {
  for (const link of document.querySelectorAll('[data-nav]')) {
    link.classList.toggle('on', link.dataset.nav === name);
    if (link.dataset.nav === name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

const ROUTES = [
  { re: /^\/?$/, nav: 'board', load: () => import('./views/board.js') },
  { re: /^\/bounty\/([^/]+)\/leaderboard\/?$/, nav: 'board', load: () => import('./views/leaderboard.js') },
  { re: /^\/bounty\/([^/]+)\/?$/, nav: 'board', load: () => import('./views/bounty.js') },
  { re: /^\/top\/?$/, nav: 'top', load: () => import('./views/top.js') },
];

const ctx = {
  api,
  prefetch,
  fmt,
  view,
  signal: controller.signal,
  setTitle,
  refresh: () => {
    memo.clear();
    route(true);
  },
};

/** Render the route in location.hash. keepScroll is true for a refresh of the same page. */
async function route(keepScroll = false) {
  window.__shotReady = false;
  controller.abort();
  controller = new AbortController();
  ctx.signal = controller.signal;

  const path = location.hash.replace(/^#/, '') || '/';
  const hit = ROUTES.find((r) => r.re.test(path));
  markNav(hit ? hit.nav : 'board');

  if (!keepScroll && path !== rendered) window.scrollTo(0, 0);
  rendered = path;

  if (!hit) {
    setTitle('Not found · make.fun board');
    view.innerHTML = notFound();
    window.__shotReady = true;
    return;
  }

  const params = (path.match(hit.re) || []).slice(1).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  });

  view.innerHTML = '<p class="loading">Loading…</p>';
  try {
    const page = await hit.load();
    await page.render(ctx, ...params);
  } catch (err) {
    if (controller.signal.aborted) return;
    view.innerHTML = errorPanel(err);
    const retry = view.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => route(true), { once: true });
    setTitle('make.fun board');
  } finally {
    if (!controller.signal.aborted) {
      loadedAt = loadedAt || Date.now();
      window.__shotReady = true;
    }
  }
}

// The header says how old the data on screen is, and the chips of time left tick without a
// request: a bounty that closes in ten minutes keeps counting down in front of the reader.
function tick() {
  if (stamp) {
    const age = loadedAt ? Math.round((Date.now() - loadedAt) / 1000) : 0;
    stamp.textContent = !loadedAt ? 'live data' : age < 5 ? 'live · just now' : `live · ${age}s ago`;
  }
  for (const node of document.querySelectorAll('[data-deadline]')) {
    const iso = node.dataset.deadline;
    node.textContent = timeLeft(iso);
    node.classList.toggle('soon', soon(iso));
  }
}

document.getElementById('refresh').addEventListener('click', () => ctx.refresh());
window.addEventListener('hashchange', () => route());
setInterval(tick, 1000);
window.__shotReady = false;
route();
