// One bounty: what it pays and what it costs, when it closes, what it has, how it is judged.
// Everything on this page comes from a single API answer, so opening a bounty is one request.

import { bountyPath, get } from '../api.js';
import { accepting, count, left, money, urgency, when } from '../format.js';
import { h, prose, stamp, startClock } from '../ui.js';

const sum = (list, key) => list.reduce((total, row) => total + Number(row[key] ?? 0), 0);

function rewardsTable(rows) {
  const body = rows.map((row) =>
    h(
      'tr',
      null,
      h('td', { class: 'place' }, `#${row.place}`),
      h('td', { class: 'num' }, money(row.baseUsd)),
      h('td', { class: 'num' }, money(row.feeShareUsd)),
      h('td', { class: 'num now' }, money(row.amountUsd)),
    ),
  );
  return h(
    'table',
    { class: 'rtable' },
    h(
      'thead',
      null,
      h(
        'tr',
        null,
        h('th', null, 'Place'),
        h('th', { class: 'num' }, 'Reward'),
        h('th', { class: 'num' }, 'Fees'),
        h('th', { class: 'num' }, 'Pays now'),
      ),
    ),
    h('tbody', null, ...body),
  );
}

function stat(label, value, extra, cls = '', dl = null) {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'k' }, label),
    h('span', { class: `v ${cls}`.trim(), 'data-dl': dl }, value),
    extra ? h('span', { class: 'x' }, extra) : null,
  );
}

export async function render(route) {
  const b = await get(bountyPath(route.slug));
  const now = Date.now();
  const open = accepting(b.deadline, now);
  const rows = Array.isArray(b.rewardsNow) && b.rewardsNow.length
    ? b.rewardsNow
    : Object.entries(b.rewards ?? {}).map(([place, usd]) => ({
        place: Number(place),
        baseUsd: String(usd),
        feeShareUsd: '0.00',
        amountUsd: String(usd),
      }));
  const base = sum(rows, 'baseUsd');
  const feeShare = sum(rows, 'feeShareUsd');
  const paid = rows.length;
  const fee = Number(b.entryFeeUsd ?? 0);
  const rules = b.resolution?.criteria ?? [];

  document.title = `${b.title ?? route.slug} — make.fun bounty`;

  const head = h(
    'div',
    null,
    h(
      'div',
      { class: 'top-line', style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' },
      open ? h('span', { class: 'badge live' }, 'Taking entries') : h('span', { class: 'badge closed' }, 'Closed to entries'),
      b.category ? h('span', { class: 'badge' }, b.category) : null,
      b.harnessKind ? h('span', { class: 'badge' }, b.harnessKind) : null,
      fee > 0 ? h('span', { class: 'badge fee' }, `${money(fee)} entry fee`) : h('span', { class: 'badge free' }, 'Free entry'),
    ),
    h('h1', { class: 'title' }, b.title ?? route.slug),
    b.summary ? h('p', { class: 'lede' }, b.summary) : null,
  );

  const actions = h(
    'div',
    { class: 'actions' },
    h(
      'a',
      { class: 'btn primary', href: `#/bounty/${encodeURIComponent(b.slug)}/leaderboard` },
      'Leaderboard ',
      h('small', null, `${count(b.submissionCount)} entries`),
    ),
    h('a', { class: 'btn', href: `https://make.fun${b.url ?? `/bounty/${b.slug}`}`, rel: 'noopener', target: '_blank' }, 'On make.fun'),
    h('span', { class: 'grow', style: 'flex:1' }),
    stamp(now),
  );

  const stats = h(
    'div',
    { class: 'statgrid' },
    stat('Live pot', money(b.potUsd ?? base), feeShare > 0 ? `${money(base)} reward + ${money(feeShare)} fees` : 'reward, no fees yet', 'pot'),
    stat('Entry fee', fee > 0 ? money(fee) : 'Free', fee > 0 ? `paid once per account · ${count(b.entryFeePayers)} paid` : 'no fee to enter'),
    stat('Time left', left(b.deadline, now), `closes ${when(b.deadline)}`, urgency(b.deadline, now), b.deadline),
    stat('Entries', count(b.submissionCount), `${count(paid)} places paid`),
  );

  const dates = h(
    'dl',
    { class: 'pairs' },
    h('dt', null, 'Published'),
    h('dd', null, when(b.publishedAt)),
    h('dt', null, 'Entries close'),
    h('dd', null, when(b.deadline)),
    h('dt', null, 'Status'),
    h('dd', null, open ? 'open' : `${b.status ?? 'open'} — no longer takes entries`),
    b.resolution?.metric
      ? [
          h('dt', null, 'Ranked by'),
          h('dd', null, `${b.resolution.metric.name} (${b.resolution.metric.better})`),
        ]
      : null,
    b.resolution?.tieBreak
      ? [h('dt', null, 'Tie-break'), h('dd', null, b.resolution.tieBreak)]
      : null,
  );

  const glance = h(
    'dl',
    { class: 'pairs' },
    b.sponsor?.name ? [h('dt', null, 'Sponsor'), h('dd', null, b.sponsor.name)] : null,
    h('dt', null, 'Entries'),
    h('dd', null, count(b.submissionCount)),
    h('dt', null, 'Places paid'),
    h('dd', null, count(paid)),
    b.demand ? [h('dt', null, 'Built for'), h('dd', null, b.demand)] : null,
    Array.isArray(b.skills) && b.skills.length
      ? [h('dt', null, 'Skills'), h('dd', null, b.skills.join(', '))]
      : null,
  );

  const rulesBox = h(
    'section',
    { class: 'panel' },
    h('h2', null, 'Rules and judging'),
    b.resolution?.method ? h('p', { class: 'prose' }, b.resolution.method) : null,
    rules.length
      ? h('ol', { class: 'prose', style: 'padding-left:20px' }, ...rules.map((line) => h('li', null, ...prose(line).childNodes)))
      : null,
  );

  startClock();

  return h(
    'div',
    null,
    h('div', { class: 'crumbs' }, h('a', { href: '#/' }, '← All bounties'), h('span', null, '/'), h('span', null, b.category ?? 'bounty')),
    head,
    actions,
    stats,
    h(
      'div',
      { class: 'sheet' },
      h(
        'div',
        null,
        b.description ? h('section', { class: 'panel' }, h('h2', null, 'Description'), h('div', { class: 'prose' }, prose(b.description))) : null,
        rulesBox,
        h(
          'section',
          { class: 'panel' },
          h('h2', null, 'Rewards'),
          h(
            'p',
            { class: 'note', style: 'margin:0 0 10px' },
            `${money(b.potUsd ?? base)} live pot: the ${money(base)} reward plus ${money(feeShare)} of entry fees, split over the places in proportion to their rewards.`,
          ),
          rewardsTable(rows),
        ),
      ),
      h(
        'aside',
        null,
        h('section', { class: 'panel' }, h('h2', null, 'Dates'), dates),
        h('section', { class: 'panel' }, h('h2', null, 'At a glance'), glance),
        h(
          'section',
          { class: 'panel' },
          h('h2', null, 'How this board works'),
          h(
            'p',
            { class: 'note', style: 'margin:0' },
            'This page reads make.fun\'s public API once and revalidates it against its ETag; the countdown you see is rewritten in place every 30 seconds, with no request. A bounty past its deadline reads “closed to entries” even while its status still says open.',
          ),
        ),
      ),
    ),
  );
}
