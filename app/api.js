// make.fun's public API, GET only, open to any origin (CORS).
//
// Two things matter for speed here, and both are the API's own rules:
//   * its ETags are bound to the minute: revalidating in the same minute answers 304 Not Modified,
//     so a revisit costs a few hundred bytes and nothing is re-parsed;
//   * every answer is cached here with its tag, so going back to a view never refetches.
//
// A call is served from memory while it is younger than FRESH. After that it is revalidated with
// If-None-Match: a 304 keeps the parsed answer and moves its timestamp, a 200 replaces both.

const BASE = 'https://make.fun/api';
const FRESH = 60_000;   // the API's ETag minute
const TIMEOUT = 20_000;

const cache = new Map();     // path -> { body, tag, at }
const inflight = new Map();  // path -> Promise
const waiters = new Set();   // listeners for the header counter

export const stats = { requests: 0, reused: 0, unchanged: 0, failed: 0 };

export function onStats(fn) {
  waiters.add(fn);
  fn(stats);
  return () => waiters.delete(fn);
}

function announce() {
  for (const fn of waiters) fn(stats);
  // The shell shows the live counters without importing this module at first load.
  document.dispatchEvent(new CustomEvent('api-stats', { detail: { ...stats } }));
}

/** The board: open bounties with each one's times, so a card needs no second request. */
export const boardPath = () => '/competitions?status=open&activity=times&limit=100';

export const bountyPath = (slug) => `/competitions/${encodeURIComponent(slug)}`;

export const leaderboardPath = (slug) => `/competitions/${encodeURIComponent(slug)}/leaderboard`;

export const profilePath = (handle) => `/profiles/${encodeURIComponent(handle)}`;

/** What is already known about a path, without asking the network. */
export function known(path) {
  return cache.get(path)?.body;
}

async function load(path) {
  const hit = cache.get(path);
  const now = Date.now();

  if (hit && !hit.stale && now - hit.at < FRESH) {
    stats.reused += 1;
    announce();
    return hit.body;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  const headers = { accept: 'application/json' };
  if (hit?.tag) headers['if-none-match'] = hit.tag;

  try {
    stats.requests += 1;
    announce();
    const res = await fetch(BASE + path, { headers, signal: controller.signal, cache: 'no-store' });
    if (res.status === 304 && hit) {
      hit.at = Date.now();
      hit.stale = false;
      stats.unchanged += 1;
      announce();
      return hit.body;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
    const body = await res.json();
    cache.set(path, { body, tag: res.headers.get('etag'), at: Date.now(), stale: false });
    announce();
    return body;
  } catch (error) {
    stats.failed += 1;
    announce();
    // A failed refresh still beats a blank page: hand back what was already parsed.
    if (hit) return hit.body;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Cache-first, revalidated after a minute, one request per path at a time. */
export function get(path, options = {}) {
  const hit = cache.get(path);
  if (options.force) {
    if (hit) hit.stale = true;
    inflight.delete(path);
  }
  const running = inflight.get(path);
  if (running) return running;
  const job = load(path).finally(() => inflight.delete(path));
  inflight.set(path, job);
  return job;
}

/** Warm a path on hover or on idle, so opening a bounty feels instant. */
export function prefetch(path) {
  if (cache.has(path) || inflight.has(path)) return;
  const job = load(path).catch(() => {}).finally(() => inflight.delete(path));
  inflight.set(path, job);
}
