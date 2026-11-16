// A bounty's leaderboard: every entry ranked by the judge's win rate, on one screen, with only the
// rows on screen mounted. 350 entries cost the same as 30, and typing in the filter never re-renders
// the page: it re-windows the same list.

import { bountyPath, get, leaderboardPath, prefetch, profilePath } from '../api.js';
import { bytes, count, rate, when } from '../format.js';
import { avatar, h, stamp, startClock, virtualList } from '../ui.js';

const ROW = 56;

function interval(entry) {
  const low = entry.values?.judge_low;
  const high = entry.values?.judge_high;
  if (low === null || low === undefined || high === null || high === undefined) return '—';
  return `${rate(low)} – ${rate(high)}`;
}

function row(entry) {
  const place = Number(entry.rank) || 0;
  const handle = entry.handle ?? 'anonymous';
  const node = h(
    'a',
    {
      class: `lrow${place <= 3 ? ` top${place}` : ''}`,
      href: `#/u/${encodeURIComponent(handle)}`,
      title: entry.title ? `${handle} — ${entry.title}` : handle,
      'on:pointerenter': () => prefetch(profilePath(handle)),
      'on:focus': () => prefetch(profilePath(handle)),
    },
    h('span', { class: 'rank' }, `${place}`),
    h(
      'span',
      { class: 'row-main' },
      avatar(entry.image ?? null),
      h(
        'span',
        { class: 'who' },
        h('span', { class: 'handle' }, handle),
        h('span', { class: 'title' }, entry.title ?? (entry.house ? 'house entry' : '')),
      ),
    ),
    h('span', { class: 'rate' }, entry.values?.judge === undefined ? '—' : rate(entry.values.judge)),
    h('span', { class: 'iv' }, interval(entry)),
    h('span', { class: 'size' }, bytes(entry.values?.bytes)),
  );
  return node;
}

export async function render(route) {
  const data = await get(leaderboardPath(route.slug));
  const all = (data.entries ?? []).filter((entry) => entry && (entry.handle || entry.values));
  const title = data.competition?.title ?? route.slug;
  document.title = `Leaderboard — ${title}`;

  const state = { q: '', top: all.length > 20 };
  let rows = all;

  const list = virtualList({ count: rows.length, rowHeight: ROW, render: (index) => row(rows[index]) });

  const search = h('input', {
    type: 'search',
    placeholder: 'Filter by handle or entry',
    'aria-label': 'Filter the leaderboard',
    style: 'padding:8px 11px;border-radius:10px;border:1px solid var(--line);background:var(--panel);color:var(--ink);font:inherit;font-size:14px;width:min(260px,100%)',
  });

  const topBtn = h(
    'button',
    { class: 'chip', type: 'button', 'aria-pressed': String(state.top) },
    all.length > 20 ? 'Top 20' : 'All',
  );

  const countLine = h('span', { class: 'stamp' });

  function window_() {
    const q = state.q.trim().toLowerCase();
    let next = q ? all.filter((entry) => `${entry.handle ?? ''} ${entry.title ?? ''}`.toLowerCase().includes(q)) : all;
    if (state.top && !q) next = next.slice(0, 20);
    rows = next;
    list.setCount(rows.length);
    countLine.textContent = q
      ? `${count(rows.length)} of ${count(all.length)} entries match`
      : `showing ${count(rows.length)} of ${count(all.length)} entries`;
  }

  search.addEventListener('input', () => {
    state.q = search.value;
    window_();
  });
  topBtn.addEventListener('click', () => {
    state.top = !state.top;
    topBtn.setAttribute('aria-pressed', String(state.top));
    window_();
  });

  const cols = h(
    'div',
    { class: 'lb-colhead' },
    h('span', null, 'Rank'),
    h('span', null, 'Entrant'),
    h('span', { class: 'num' }, 'Win rate'),
    h('span', { class: 'num' }, '90% interval'),
    h('span', { class: 'num' }, 'Dossier'),
  );

  const tie = data.tie_break;
  const sub = h(
    'p',
    { class: 'sub' },
    'Judge win rate, higher is better',
    tie ? ` · an exact tie goes to the smaller dossier (${tie.key}, ${tie.better})` : '',
    data.phase?.ends_at ? ` · this phase closes ${when(data.phase.ends_at)}` : '',
    ' · ',
    stamp(Date.now()),
  );

  window_();
  startClock();

  return h(
    'div',
    null,
    h(
      'div',
      { class: 'crumbs' },
      h('a', { href: '#/' }, '← All bounties'),
      h('span', null, '/'),
      h('a', { href: `#/bounty/${encodeURIComponent(route.slug)}` }, title),
      h('span', null, '/'),
      h('span', null, 'leaderboard'),
    ),
    h('div', { class: 'head', style: 'margin-bottom:0' }, h('div', null, h('h1', null, 'Leaderboard'), sub)),
    h(
      'div',
      { class: 'lb-head' },
      h('a', { class: 'btn', href: `#/bounty/${encodeURIComponent(route.slug)}` }, 'Bounty page'),
      search,
      topBtn,
      h('span', { class: 'grow' }),
      countLine,
    ),
    cols,
    list.el,
    h(
      'p',
      { class: 'note' },
      'Rows mount as you scroll; the list is one virtualised column, so a 300-entry board opens as fast as a 20-entry one. Hover an entrant to warm their profile.',
    ),
  );
}
