// The board: every live bounty as a card, each showing its live pot, its entry fee, the time left
// and how many entries it has. Sorting and filtering patch the grid in place and keep the URL current,
// so a filtered board is shareable and no click rebuilds the page.

import { boardPath, bountyPath, get, prefetch } from '../api.js';
import { accepting, count, money, urgency } from '../format.js';
import { countdown, h, stamp, startClock } from '../ui.js';

const SORTS = [
  ['closing', 'Closing soon'],
  ['pot', 'Biggest pot'],
  ['entries', 'Most entries'],
  ['first', 'Top prize'],
];

const fee = (b) => (Number(b.entryFeeUsd) > 0 ? money(b.entryFeeUsd) : 'Free');

const firstPrize = (b) => {
  const row = b.rewardsNow?.[0];
  if (row) return Number(row.amountUsd);
  const base = b.rewards ? Object.values(b.rewards)[0] : null;
  return Number(base ?? 0);
};

const paidPlaces = (b) => (Array.isArray(b.rewardsNow) && b.rewardsNow.length)
  ? b.rewardsNow.length
  : (b.rewards ? Object.keys(b.rewards).length : 0);

function card(b, now) {
  const open = accepting(b.deadline, now);
  return h(
    'a',
    {
      class: 'card',
      href: `#/bounty/${encodeURIComponent(b.slug)}`,
      'on:pointerenter': () => prefetch(bountyPath(b.slug)),
      'on:focus': () => prefetch(bountyPath(b.slug)),
    },
    h(
      'div',
      { class: 'top-line' },
      b.category ? h('span', { class: 'badge' }, b.category) : null,
      open ? h('span', { class: 'badge live' }, 'Taking entries') : h('span', { class: 'badge closed' }, 'Closed to entries'),
      Number(b.entryFeeUsd) > 0 ? h('span', { class: 'badge fee' }, `${money(b.entryFeeUsd)} fee`) : null,
    ),
    h('h2', null, b.title || b.slug),
    h(
      'div',
      { class: 'stats' },
      h('div', null, h('span', { class: 'k' }, 'Live pot'), h('span', { class: 'v pot' }, money(b.potUsd ?? b.rewardAmount))),
      h('div', null, h('span', { class: 'k' }, 'Entry fee'), h('span', { class: 'v' }, fee(b))),
      h(
        'div',
        null,
        h('span', { class: 'k' }, 'Time left'),
        h('span', { class: 'v' }, countdown(b.deadline, urgency(b.deadline, now))),
      ),
      h('div', null, h('span', { class: 'k' }, 'Entries'), h('span', { class: 'v' }, count(b.submissionCount))),
    ),
    h(
      'div',
      { class: 'cfoot' },
      h('span', null, '1st place ', h('span', { class: 'first' }, money(firstPrize(b)))),
      h('span', null, `${count(paidPlaces(b))} places paid`),
    ),
  );
}

export async function render(route) {
  const data = await get(boardPath());
  const all = (data.items ?? []).filter((item) => item && item.slug);
  const updated = Date.now();

  const state = {
    sort: SORTS.some(([key]) => key === route.params.get('sort')) ? route.params.get('sort') : 'closing',
    q: (route.params.get('q') ?? '').trim(),
    closed: route.params.get('closed') === '1',
  };

  const grid = h('div', { class: 'board' });
  const sub = h('p', { class: 'sub' });
  const sortBar = h('div', { class: 'toolbar-row' });
  const closedBtn = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, 'Include closed');
  const stampNode = stamp(updated);
  const refresh = h('button', { class: 'chip', type: 'button', title: 'Revalidate with the API now' }, 'Refresh');

  function matches(b, now) {
    if (!state.closed && !accepting(b.deadline, now)) return false;
    if (!state.q) return true;
    const q = state.q.toLowerCase();
    const skills = Array.isArray(b.skills) ? b.skills.join(' ') : '';
    return `${b.title} ${b.slug} ${b.category ?? ''} ${skills}`.toLowerCase().includes(q);
  }

  function order(rows, now) {
    const by = {
      closing: (a, b) => {
        const openA = accepting(a.deadline, now) ? 0 : 1;
        const openB = accepting(b.deadline, now) ? 0 : 1;
        if (openA !== openB) return openA - openB;
        return openA === 0
          ? new Date(a.deadline) - new Date(b.deadline)
          : new Date(b.deadline) - new Date(a.deadline);
      },
      pot: (a, b) => Number(b.potUsd ?? b.rewardAmount) - Number(a.potUsd ?? a.rewardAmount),
      entries: (a, b) => Number(b.submissionCount) - Number(a.submissionCount),
      first: (a, b) => firstPrize(b) - firstPrize(a),
    };
    return rows.sort(by[state.sort]);
  }

  function paint() {
    const now = Date.now();
    const rows = order(all.filter((b) => matches(b, now)), now);
    const taking = all.filter((b) => accepting(b.deadline, now));
    const pot = taking.reduce((sum, b) => sum + Number(b.potUsd ?? b.rewardAmount ?? 0), 0);

    sub.replaceChildren(
      h('b', null, count(taking.length)),
      ' taking entries of ',
      h('b', null, count(all.length)),
      ' live, ',
      h('b', null, money(pot)),
      ' on the table',
      state.q ? ` · matching “${state.q}”` : '',
      ' · ',
      stampNode,
    );

    for (const [key, label] of SORTS) {
      const chip = sortBar.querySelector(`[data-sort="${key}"]`);
      if (chip) chip.setAttribute('aria-pressed', String(state.sort === key));
      else {
        sortBar.append(
          h(
            'button',
            {
              class: 'chip',
              type: 'button',
              'data-sort': key,
              'aria-pressed': String(state.sort === key),
              'on:click': () => {
                state.sort = key;
                paint();
                sync();
              },
            },
            label,
          ),
        );
      }
    }
    closedBtn.setAttribute('aria-pressed', String(state.closed));

    if (!rows.length) {
      grid.replaceChildren(
        h(
          'div',
          { class: 'empty' },
          h('p', null, state.q ? `No live bounty matches “${state.q}”.` : 'No bounty is taking entries right now.'),
          h(
            'button',
            {
              class: 'chip',
              type: 'button',
              'on:click': () => {
                state.closed = true;
                state.q = '';
                paint();
                sync();
              },
            },
            'Show every bounty, closed ones too',
          ),
        ),
      );
      return;
    }
    grid.replaceChildren(...rows.map((b) => card(b, now)));
  }

  // The URL follows the controls, so the current board can be linked to without a second render.
  function sync() {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.sort !== 'closing') params.set('sort', state.sort);
    if (state.closed) params.set('closed', '1');
    const hash = `#/${params.toString() ? `?${params}` : ''}`;
    history.replaceState(null, '', hash);
  }

  closedBtn.addEventListener('click', () => {
    state.closed = !state.closed;
    paint();
    sync();
  });

  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    refresh.textContent = 'Refreshing…';
    try {
      const fresh = await get(boardPath(), { force: true });
      all.splice(0, all.length, ...(fresh.items ?? []).filter((item) => item && item.slug));
      stampNode.dataset.stamp = String(Date.now());
      paint();
    } finally {
      refresh.disabled = false;
      refresh.textContent = 'Refresh';
    }
  });

  document.title = 'Live make.fun bounties — pot, fee, time left, entries';
  paint();
  startClock();

  return h(
    'div',
    { class: 'page-board' },
    h(
      'div',
      { class: 'head' },
      h('div', null, h('h1', null, 'Live bounties'), sub),
      h(
        'a',
        { class: 'note', href: '#/bounty/makefun-frontend-01', style: 'text-decoration:none' },
        'This board is an entry in makefun-frontend-01 →',
      ),
    ),
    h('div', { class: 'toolbar' }, h('span', { class: 'label' }, 'Sort'), sortBar, h('span', { class: 'grow' }), closedBtn, refresh),
    grid,
  );
}
