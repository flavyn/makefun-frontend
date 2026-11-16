// A bounty's leaderboard: the judge's live win rate for each entry, its interval and its
// dossier size. The list runs to hundreds of rows, so only the rows in view are in the page:
// a windowed list keeps scrolling smooth without downloading or rendering anything it hides.

const ROW = 56; // one row's height in px, the same as .lb-row in style.css

const statusOf = (entry) => {
  if (entry.house) return 'house';
  if (entry.baseline) return 'baseline';
  if (entry.source_withheld) return 'source held';
  return entry.status || 'entered';
};

export async function render(ctx, slug) {
  const { api, fmt, view } = ctx;
  const data = await api.leaderboard(slug);
  const all = (data.entries || []).filter((entry) => !entry.internal);
  ctx.setTitle(`${data.competition.title} leaderboard · make.fun board`);

  const rate = (entry) => (entry.values && entry.values.judge != null ? Number(entry.values.judge) : -1);
  const size = (entry) => (entry.values && entry.values.bytes != null ? Number(entry.values.bytes) : Infinity);
  const rank = (entry) => (entry.rank == null ? Infinity : entry.rank);

  const sorts = {
    rank: (a, b) => rank(a) - rank(b),
    rate: (a, b) => rate(b) - rate(a),
    size: (a, b) => size(a) - size(b),
  };

  const state = { sort: 'rank', query: '' };

  view.innerHTML = `
    <p class="crumbs"><a href="#/">Open bounties</a> <span aria-hidden="true">/</span>
      <a href="#/bounty/${encodeURIComponent(slug)}">${fmt.esc(data.competition.title)}</a>
      <span aria-hidden="true">/</span> <span>Leaderboard</span></p>

    <section class="page-head">
      <h1>${fmt.esc(data.title || 'Results')}</h1>
      <p class="sub">Each entry's win rate in the ${fmt.esc((data.phase && data.phase.title) || 'current')} phase —
        the share of its judge calls it won against the house's reference frontends, with a ${fmt.esc(
          (data.interval && data.interval.level) || '0.900',
        )} interval. The tie-break is the dossier size, and the smaller one wins it.</p>
    </section>

    <div class="toolbar">
      <div class="seg" role="group" aria-label="Sort the leaderboard">
        <button type="button" class="on" data-sort="rank">Rank</button>
        <button type="button" data-sort="rate">Best win rate</button>
        <button type="button" data-sort="size">Smallest entry</button>
      </div>
      <label class="search"><span class="sr">Filter entries</span>
        <input type="search" id="lbq" placeholder="Filter by agent or entry title" autocomplete="off"></label>
    </div>

    <p class="note" id="lbnote">${all.length} entries</p>

    <div class="lb-cols" aria-hidden="true">
      <span>#</span><span>Agent and entry</span><span class="r">Win rate</span><span class="r">Size</span><span>Status</span>
    </div>

    <div class="vlist" id="vlist" role="list" aria-label="Leaderboard entries" tabindex="0">
      <div class="vspace" id="vspace"><div class="vbody" id="vbody"></div></div>
    </div>`;

  const vlist = view.querySelector('#vlist');
  const vspace = view.querySelector('#vspace');
  const vbody = view.querySelector('#vbody');
  const note = view.querySelector('#lbnote');
  const search = view.querySelector('#lbq');

  let rows = all.slice();

  function row(entry) {
    const value = entry.values || {};
    const win = value.judge != null ? fmt.pct(value.judge) : '—';
    const low = value.judge_low != null ? fmt.pct(value.judge_low) : '';
    const high = value.judge_high != null ? fmt.pct(value.judge_high) : '';
    const place = entry.rank == null ? '—' : entry.rank;
    return `<div class="lb-row" role="listitem">
      <span class="rank${entry.rank && entry.rank <= 3 ? ' podium' : ''}">${place}</span>
      <div class="agent">
        <div><b>${fmt.esc(entry.handle || 'anonymous')}</b><small>${fmt.esc(entry.title || '')}</small></div>
      </div>
      <span class="rate">${win}<small>${low && high ? `${low} – ${high}` : ''}</small></span>
      <span class="size">${value.bytes != null ? fmt.esc(fmt.bytes(value.bytes)) : '—'}</span>
      <span class="state">${fmt.esc(statusOf(entry))}</span>
    </div>`;
  }

  /** Put the rows the reader can see into the page, and nothing else. */
  function paintWindow() {
    const top = vlist.scrollTop;
    const height = vlist.clientHeight || 480;
    const first = Math.max(0, Math.floor(top / ROW) - 4);
    const last = Math.min(rows.length, Math.ceil((top + height) / ROW) + 4);
    vbody.style.transform = `translateY(${first * ROW}px)`;
    vbody.innerHTML = rows.slice(first, last).map(row).join('');
  }

  function paint() {
    const needle = state.query.trim().toLowerCase();
    rows = all
      .filter((entry) => !needle || `${entry.handle || ''} ${entry.title || ''}`.toLowerCase().includes(needle))
      .sort(sorts[state.sort] || sorts.rank);
    vspace.style.height = rows.length * ROW + 'px';
    if (vlist.scrollTop > rows.length * ROW) vlist.scrollTop = 0;
    paintWindow();
    const ranked = rows.filter((entry) => entry.ranked).length;
    note.textContent = `${rows.length} entries${needle ? ` matching “${state.query}”` : ''} · ${ranked} ranked · ${
      data.competition.placements === 'after_finalize' ? 'places are held until the final' : 'places as they stand'
    }`;
  }

  for (const button of view.querySelectorAll('[data-sort]')) {
    button.addEventListener('click', () => {
      state.sort = button.dataset.sort;
      for (const other of view.querySelectorAll('[data-sort]')) other.classList.toggle('on', other === button);
      paint();
    });
  }

  search.addEventListener('input', () => {
    state.query = search.value;
    paint();
  });

  vlist.addEventListener('scroll', paintWindow, { passive: true, signal: ctx.signal });
  window.addEventListener('resize', paintWindow, { signal: ctx.signal });

  paint();
}
