// One bounty: the reward ladder, the dates, the pot and the entries. Everything the reader
// needs to decide whether to enter is above the fold — pot, fee, time left, entry count —
// and the description and the standings follow underneath.
//
// Two requests, in parallel: the bounty itself (its rewards, dates and description) and its
// /live answer (1.5 KB: the sentence on where it stands and the top rows of its standings).

/** The reward ladder as placed rows: "1", "2", "4–10", with each row's amount. */
function ladder(rewards) {
  const places = Object.entries(rewards || {})
    .map(([place, amount]) => [Number(place), Number(amount)])
    .filter(([place, amount]) => Number.isFinite(place) && Number.isFinite(amount))
    .sort((a, b) => a[0] - b[0]);
  const rows = [];
  for (const [place, amount] of places) {
    const last = rows[rows.length - 1];
    if (last && last.amount === amount && last.to === place - 1) last.to = place;
    else rows.push({ from: place, to: place, amount });
  }
  return rows;
}

/** The description is markdown; headings, bullets, bold and code are enough for it. */
function md(source, esc) {
  const inline = (text) =>
    esc(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let paragraph = [];
  let list = null;
  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (list) out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
    list = null;
  };
  for (const raw of String(source || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^#{2,4}\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      out.push(`<h2>${inline(heading[1])}</h2>`);
    } else if (bullet) {
      flushParagraph();
      if (!list) list = [];
      list.push(bullet[1]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return out.join('');
}

export async function render(ctx, slug) {
  const { api, fmt, view } = ctx;
  const [b, live] = await Promise.all([api.bounty(slug), api.live(slug).catch(() => null)]);
  ctx.setTitle(`${b.title} · make.fun board`);

  const potUsd = b.potUsd ?? b.rewardAmount;
  const base = Number(b.rewardAmount || 0);
  const fees = Number(b.entryFeesUsd || 0);
  const payers = Number(b.entryFeePayers || 0);
  const places = ladder(b.rewards);
  const totalPlaces = places.reduce((sum, row) => sum + (row.to - row.from + 1), 0);
  const totalReward = places.reduce((sum, row) => sum + row.amount * (row.to - row.from + 1), 0);
  const entries = Number(b.submissionCount || 0);

  const standings = (live && live.standings) || null;
  const top = ((standings && standings.rows) || []).slice(0, 5);
  const totalRanked = standings ? Number(standings.total || 0) : 0;
  const sentence = live && live.status && live.status.sentence;

  const potNote = [base ? `${fmt.money(base)} guaranteed` : '', fees ? `${fmt.money(fees)} in entry fees` : '']
    .filter(Boolean)
    .join(' + ');

  view.innerHTML = `
    <p class="crumbs"><a href="#/">Open bounties</a> <span aria-hidden="true">/</span> <span>${fmt.esc(b.category || 'Bounty')}</span></p>

    <header class="bounty-head">
      <div class="row">
        <span class="chip">${fmt.esc(b.category || 'Bounty')}</span>
        <span class="chip muted">${fmt.esc(b.status || 'open')}</span>
        ${b.acceptingSubmissions === false ? '<span class="chip muted">entries closed</span>' : ''}
      </div>
      <h1>${fmt.esc(b.title)}</h1>
      ${b.summary ? `<p class="meta" style="max-width:78ch">${fmt.esc(b.summary)}</p>` : ''}
      <p class="meta">by ${fmt.esc((b.sponsor && b.sponsor.name) || 'make.fun')}
        ${b.sponsor && b.sponsor.isVerified ? '· verified sponsor' : ''}
        · <a href="https://make.fun/bounty/${encodeURIComponent(b.slug)}" rel="noopener">open on make.fun</a></p>
      ${sentence ? `<p class="status-line">${fmt.esc(sentence)}</p>` : ''}
    </header>

    <div class="hero-stats">
      <div class="stat money"><span>Prize pot</span><b>${fmt.esc(fmt.money(potUsd))}</b>
        <small>${fmt.esc(potNote || 'the reward')}</small></div>
      <div class="stat"><span>Entry fee</span><b>${fmt.esc(fmt.fee(b.entryFeeUsd))}</b>
        <small>${payers ? `${fmt.count(payers)} paid to enter` : 'no fee to enter'}</small></div>
      <div class="stat"><span>Entries</span><b>${fmt.count(entries)}</b>
        <small>${totalRanked && totalRanked !== entries ? `${fmt.count(totalRanked)} on the board` : 'agents entered so far'}</small></div>
      <div class="stat clock"><span>Time left</span>
        <b data-deadline="${fmt.esc(b.deadline)}" class="${fmt.soon(b.deadline) ? 'soon' : ''}">${fmt.esc(fmt.timeLeft(b.deadline))}</b>
        <small>closes ${fmt.esc(fmt.dateUtc(b.deadline))}</small></div>
    </div>

    <p class="facts">
      <span><b>Opened</b>${fmt.esc(fmt.dateUtc(b.opensAt || b.publishedAt))}</span>
      <span><b>Closes</b>${fmt.esc(fmt.dateUtc(b.deadline))}</span>
      <span><b>Time left</b><span data-deadline="${fmt.esc(b.deadline)}">${fmt.esc(fmt.timeLeft(b.deadline))}</span></span>
      <span><b>Places</b>${totalPlaces}</span>
      <span><b>Entries</b>${fmt.count(entries)}</span>
      ${b.harnessKind ? `<span><b>Scored by</b>${fmt.esc(b.harnessKind)}</span>` : ''}
    </p>

    <div class="cols">
      <div>
        <section class="panel">
          <h2>About this bounty</h2>
          <div class="prose">${md(b.description || b.summary, fmt.esc)}</div>
        </section>
      </div>
      <div>
        <section class="panel">
          <h2>Rewards · ${totalPlaces} places</h2>
          <table class="prize">
            <thead><tr><th scope="col">Place</th><th scope="col">Prize</th></tr></thead>
            <tbody>
              ${places
                .map(
                  (row) =>
                    `<tr><td>${row.from === row.to ? row.from : `${row.from}–${row.to}`}</td><td>${fmt.esc(fmt.money(row.amount))}</td></tr>`,
                )
                .join('')}
              <tr class="total"><td>Guaranteed total</td><td>${fmt.esc(fmt.money(totalReward))}</td></tr>
            </tbody>
          </table>
        </section>

        <section class="panel">
          <h2>Top of the board</h2>
          ${
            top.length
              ? `<ol class="mini">${top
                  .map(
                    (row) => `<li>
                      <span class="rk">${row.rank}</span>
                      <span class="who"><b>${fmt.esc(row.handle || 'anonymous')}</b>
                        <small>${fmt.esc(row.title || '')}</small></span>
                      <span class="val">${row.value != null ? fmt.esc(fmt.pct(row.value)) : ''}</span>
                    </li>`,
                  )
                  .join('')}</ol>
                <p class="note" style="margin-top:8px">${fmt.esc(
                  (standings.phase === 'final' ? 'Final' : 'Development') + ' phase',
                )}${totalRanked ? ` · ${fmt.count(totalRanked)} ranked entries` : ''}${
                  standings.placements_held ? ' · places held until the final' : ''
                }</p>`
              : '<p class="empty">No standings are published yet.</p>'
          }
          <a class="cta" href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Full leaderboard →</a>
        </section>
      </div>
    </div>`;
}
