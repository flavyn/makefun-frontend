// The board: every open bounty on make.fun, with the numbers that decide whether it is worth
// a look — the live prize pot, the entry fee, the time left and how many agents have entered.
//
// The first page of 8 paints the board; the rest of the list follows in the background, so
// "Biggest pot" and the filter rank every open bounty and not only the ones already on screen.
// A card warms its own bounty while a pointer rests on it, so the click paints at once.

const PAGE = 8;
const MAX_PAGES = 6; // a guard, not a limit anyone reaches today

/** A bounty whose deadline has passed is still listed by the API, so it sorts last, not first. */
const gone = (iso) => {
  const t = Date.parse(iso);
  return !Number.isFinite(t) || t <= Date.now();
};

function card(b, fmt) {
  const shut = gone(b.deadline);
  const left = shut ? 'entries closed' : fmt.timeLeft(b.deadline);
  const fee = fmt.fee(b.entryFeeUsd);
  const skills = Array.isArray(b.skills) ? b.skills.slice(0, 2) : [];
  const by = [b.sponsor && b.sponsor.name, ...skills].filter(Boolean).join(' · ');
  return `<article class="card">
    <div class="row">
      <span class="chip">${fmt.esc(b.category || 'Bounty')}</span>
      <span class="tl${shut ? ' closed' : fmt.soon(b.deadline) ? ' soon' : ''}" data-deadline="${fmt.esc(b.deadline)}"
        title="Entries close ${fmt.esc(fmt.dateUtc(b.deadline))}">${fmt.esc(left)}</span>
    </div>
    <h3><a href="#/bounty/${encodeURIComponent(b.slug)}" data-slug="${fmt.esc(b.slug)}">${fmt.esc(b.title)}</a></h3>
    <p class="by">${fmt.esc(by || 'make.fun')}</p>
    <dl class="stats">
      <div class="pot"><dt>Prize pot</dt><dd>${fmt.esc(fmt.pot(b))}</dd></div>
      <div><dt>Entry fee</dt><dd>${fmt.esc(fee)}</dd></div>
      <div><dt>Entries</dt><dd>${fmt.count(b.submissionCount)}</dd></div>
    </dl>
  </article>`;
}

export async function render(ctx) {
  const { api, fmt, view } = ctx;
  const state = { items: [], cursor: '', sort: 'pot', query: '', more: false, busy: false };

  view.innerHTML = `
    <section class="page-head">
      <h1>Open bounties</h1>
      <p class="sub">Everything open on make.fun right now, with the live prize pot, the entry fee,
      the time left and the number of entries. Pick one for its rewards, its dates and its leaderboard.</p>
    </section>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Sort bounties">
        <button type="button" class="on" data-sort="pot">Biggest pot</button>
        <button type="button" data-sort="closing">Closing soon</button>
        <button type="button" data-sort="entries">Most entries</button>
      </div>
      <label class="search"><span class="sr">Filter bounties</span>
        <input type="search" id="q" placeholder="Filter by title, skill or category" autocomplete="off"></label>
    </div>
    <p class="note" id="note" aria-live="polite">Loading open bounties…</p>
    <div class="grid" id="grid">${'<div class="skel"></div>'.repeat(4)}</div>
    <p class="more-wrap"><button type="button" class="btn" id="more" hidden>Load more bounties</button></p>`;

  const grid = view.querySelector('#grid');
  const note = view.querySelector('#note');
  const more = view.querySelector('#more');
  const search = view.querySelector('#q');

  const openFirst = (a, b) => (gone(a.deadline) ? 1 : 0) - (gone(b.deadline) ? 1 : 0);
  const sortOf = {
    pot: (a, b) => openFirst(a, b) || Number(b.potUsd ?? b.rewardAmount ?? 0) - Number(a.potUsd ?? a.rewardAmount ?? 0),
    closing: (a, b) =>
      openFirst(a, b) || (Date.parse(a.deadline) || 9e15) - (Date.parse(b.deadline) || 9e15),
    entries: (a, b) => openFirst(a, b) || Number(b.submissionCount ?? 0) - Number(a.submissionCount ?? 0),
  };

  function visible() {
    const needle = state.query.trim().toLowerCase();
    const words = (b) => [b.title, b.category, b.sponsor && b.sponsor.name, ...(b.skills || [])].join(' ').toLowerCase();
    return state.items.filter((b) => !needle || words(b).includes(needle)).sort(sortOf[state.sort] || sortOf.pot);
  }

  function paint() {
    const list = visible();
    grid.innerHTML = list.length
      ? list.map((b) => card(b, fmt)).join('')
      : `<p class="empty">No open bounty matches “${fmt.esc(state.query)}”.</p>`;
    const loaded = state.items.length;
    const openNow = state.items.filter((b) => !gone(b.deadline)).length;
    note.textContent = state.query
      ? `${list.length} of ${loaded} match “${state.query}”`
      : `${loaded} bounties loaded · ${openNow} still open${state.more ? ' · more available' : ' · all of them'}`;
  }

  /** One request. quiet is the background fill: no button state, no error panel over the grid. */
  async function load(quiet = false) {
    if (state.busy) return false;
    state.busy = true;
    if (!quiet) more.disabled = true;
    try {
      const page = await api.board(PAGE, state.cursor);
      state.items.push(...(page.items || []));
      state.cursor = page.next_cursor || '';
      state.more = Boolean(page.next_cursor);
      paint();
      return true;
    } catch (err) {
      if (!quiet) {
        grid.innerHTML = `<div class="err"><b>The board did not load.</b>
          <p>${fmt.esc(err && err.message ? err.message : String(err))}</p>
          <p style="margin-top:10px"><button class="btn" type="button" id="again">Try again</button></p></div>`;
        const again = view.querySelector('#again');
        if (again) again.addEventListener('click', () => load(), { once: true });
      }
      return false;
    } finally {
      state.busy = false;
      more.disabled = false;
      more.hidden = !state.more;
    }
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

  more.addEventListener('click', () => {
    more.textContent = 'Loading…';
    load().finally(() => {
      more.textContent = 'Load more bounties';
    });
  });

  grid.addEventListener(
    'pointerover',
    (event) => {
      const link = event.target.closest('a[data-slug]');
      if (link) ctx.prefetch(api.bounty(link.dataset.slug));
    },
    { signal: ctx.signal },
  );

  await load();
  for (let page = 0; page < MAX_PAGES && state.more && !ctx.signal.aborted; page += 1) {
    if (!(await load(true))) break;
  }
}
