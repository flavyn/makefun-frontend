// A public profile: who it is, what it has won, and the solutions it entered, each linked back to
// its bounty. The solution list is paged by a button so a prolific account does not render at once.

import { get, profilePath } from '../api.js';
import { count, money, rate, when } from '../format.js';
import { avatar, h, startClock } from '../ui.js';

const PAGE = 10;

function link(label, href) {
  return h('a', { href, rel: 'noopener noreferrer', target: '_blank' }, label);
}

export async function render(route) {
  const p = await get(profilePath(route.handle));
  const handle = p.handle ?? route.handle;
  const record = p.record ?? {};
  const solutions = Array.isArray(p.solutions) ? p.solutions : [];
  document.title = `${handle} — make.fun profile`;

  let shown = PAGE;

  const list = h('ul', { class: 'sols' });
  const more = h('button', { class: 'chip', type: 'button' }, `Show ${Math.max(0, solutions.length - PAGE)} more`);

  function paint() {
    list.replaceChildren(
      ...solutions.slice(0, shown).map((s) => {
        const comp = s.competition ?? {};
        const score = s.score?.display ?? (s.score?.value === undefined ? null : rate(s.score.value));
        return h(
          'li',
          null,
          h('span', { class: 'st' }, s.title ?? comp.title ?? 'untitled entry'),
          h(
            'span',
            { class: 'sm' },
            comp.slug
              ? h('a', { href: `#/bounty/${encodeURIComponent(comp.slug)}` }, comp.title ?? comp.slug)
              : (comp.title ?? 'a bounty'),
            s.placement ? h('b', null, `#${s.placement}`) : null,
            s.prize_usd && Number(s.prize_usd) > 0 ? h('b', null, money(s.prize_usd)) : null,
            score ? h('span', null, `win rate ${score}`) : null,
            s.entered_at ? h('span', null, `entered ${when(s.entered_at)}`) : null,
            comp.status ? h('span', null, comp.status) : null,
          ),
        );
      }),
    );
    const left = solutions.length - shown;
    more.textContent = left > 0 ? `Show ${Math.min(left, PAGE * 5)} more · ${left} left` : '';
    more.hidden = left <= 0;
  }

  more.addEventListener('click', () => {
    shown += PAGE * 5;
    paint();
  });
  paint();
  startClock();

  const links = [];
  if (p.github_login) links.push(link(`GitHub ${p.github_login}`, `https://github.com/${p.github_login}`));
  if (p.wallet?.explorer_url) {
    const address = String(p.wallet.address ?? '');
    links.push(link(`wallet ${address.slice(0, 6)}…${address.slice(-4)}`, p.wallet.explorer_url));
  }
  if (p.x) links.push(link('X', `https://x.com/${p.x}`));

  return h(
    'div',
    null,
    h(
      'div',
      { class: 'crumbs' },
      h('a', { href: '#/' }, '← All bounties'),
      h('span', null, '/'),
      h('span', null, 'profile'),
    ),
    h(
      'div',
      { class: 'phead' },
      avatar(p.avatar?.url ?? p.image ?? null, 'avatar'),
      h(
        'div',
        { style: 'min-width:0' },
        h('h1', null, p.display_name || handle),
        p.bio ? h('p', { class: 'bio' }, p.bio) : null,
        h(
          'p',
          { class: 'meta' },
          `@${handle}`,
          p.joined_at ? ` · joined ${when(p.joined_at)}` : '',
          p.house ? ' · house account' : '',
          links.length ? ' · ' : '',
          ...links.flatMap((node, i) => (i ? [h('span', null, ' · '), node] : [node])),
        ),
      ),
    ),
    h(
      'div',
      { class: 'rec' },
      h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Entered'), h('span', { class: 'v' }, count(record.competitions_entered ?? 0))),
      h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Placed'), h('span', { class: 'v' }, count(record.competitions_placed ?? 0))),
      h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Won'), h('span', { class: 'v' }, count(record.competitions_won ?? 0))),
      h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Best place'), h('span', { class: 'v' }, record.best_placement ? `#${record.best_placement}` : '—')),
      h('div', { class: 'stat' }, h('span', { class: 'k' }, 'Prize won'), h('span', { class: 'v pot' }, money(record.prize_usd ?? 0))),
    ),
    h(
      'section',
      { class: 'panel' },
      h('h2', null, `Solutions (${count(solutions.length)})`),
      solutions.length ? list : h('p', { class: 'note', style: 'margin:0' }, 'No entries yet.'),
      more,
    ),
  );
}
