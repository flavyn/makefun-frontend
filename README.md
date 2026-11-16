# make.fun bounties — a small frontend for make.fun's public API

A board of every live make.fun bounty, a page for each bounty, its leaderboard and a public profile,
built as plain static files: no framework, no build step, no bundler, no dependency to install.
It reads make.fun's public API (`https://make.fun/api`, GET only) and writes nothing back.

## Run it

```sh
node serve.ts            # http://localhost:8080
node serve.ts --port 8123
```

`serve.ts` is a development static server: MIME types, gzip for text, and nothing outside `app/`.
Any static server with `app/` at its root works the same way — `app/index.html` is the entry point
and every reference inside it is relative.

## Hand it in

```sh
node main.ts                        # writes ./out when /output does not exist
MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `app/` and `screenshots/` to the output directory, then writes `dossier.json` with
the kit's vendored `buildDossier`. Two runs write the same bytes: the program reads no clock, no
random source and no network, and it empties the output's `app/` and `screenshots/` first, so a
stale file from an earlier run cannot survive.

## Routes

| URL | What it is |
| --- | --- |
| `#/` | the board: live pot, entry fee, time left, entries for every live bounty |
| `#/bounty/<slug>` | one bounty: summary, description, rules, rewards table, dates, status |
| `#/bounty/<slug>/leaderboard` | its entries ranked by the judge's win rate |
| `#/u/<handle>` | an account's public profile: record, links, solutions |

Filters live in the URL too (`#/?sort=pot`, `#/?q=code`, `#/?closed=1`), so a filtered board is a
link someone can share, and typing in the search box updates the board in place without a reload.

## What is fast, and why

- **First load is three files.** `index.html`, `style.css` and `main.js`: 1,751 + 15,799 + 5,447
  bytes raw, **6,800 bytes gzip-9 in total**. The four views are literal `import()`s fetched when
  their route is first opened, so a reader who only looks at the board never downloads the
  leaderboard's code. Nothing here is a framework.
- **Answers are cached and revalidated.** `api.js` keeps each answer with its `ETag`. A repeat visit
  within the minute is served from memory with no request; after that the call is revalidated with
  `If-None-Match`, and make.fun's minute-bound tags answer `304 Not Modified`, so the parsed answer
  is kept rather than rebuilt. Concurrent calls for the same path share one request, and a hover on
  a card or an entrant warms the next view before the click.
- **One request per view.** The board asks once (`/competitions?status=open&activity=times`), a
  bounty once, a leaderboard once, a profile once. A card reuses the board's own answer: no
  per-card request.
- **Long lists are virtual.** The leaderboard mounts only the rows on screen — 181 entries render as
  about 17 nodes — so scrolling a 300-entry board costs the same as scrolling a 20-entry one.
  Typing in its filter re-windows the same list instead of re-rendering the page.
- **Time passes without a request.** Countdowns are rewritten in place every 30 seconds from the
  deadline already on screen. Refreshing is an explicit button, and it patches the grid rather than
  rebuilding the page.
- **The header shows the truth.** `1 req · 0 cached · 0 304` is the API layer's own counter, not a
  claim: it reports requests made, answers served from memory, and answers the API left unchanged.

## Reading the data honestly

A bounty that is past its deadline can still read `status: open` until its results are published, so
the board decides whether a bounty still takes entries **by its deadline**, and says "closed to
entries" when it does not. The board also shows the live pot (`potUsd`, the reward plus the entry
fees paid into it), the entry fee where one is set, and the live count of entries.

Amounts, rates and counts are formatted from the API's own values; nothing is estimated. The
leaderboard shows the win rate to four decimals with its 90% interval and the dossier size, and
names the tie-break the API itself reports.

## Screenshots

`screenshots/` holds three renders of this app on live make.fun data at 1280×800, taken with
Chrome headless by `tools/shots.mjs` while the app was served on 127.0.0.1:

| file | route | mean brightness | text vs background |
| --- | --- | --- | --- |
| `1-board.jpg` | `#/` | 27.3 / 255 | 13.9 : 1 |
| `2-bounty.jpg` | `#/bounty/makefun-frontend-01` | 28.8 / 255 | 17.3 : 1 |
| `3-leaderboard.jpg` | `#/bounty/makefun-frontend-01/leaderboard` | 26.7 / 255 | 8.7 : 1 |

They are unedited screenshots of the running app: no compositing, no mock data, no placeholder.
`tools/shot-report.json` records what each render contained (cards, rows, request counter).

## Reading and writing the code

`app/ui.js` builds DOM nodes instead of concatenating HTML strings, so every API string reaches the
document as text; the markdown in a bounty's description is turned into headings, lists, quotes and
links by a small reader that never parses HTML. `app/api.js` is the only place that talks to the
network. `app/main.js` is the shell: routes, the search box, error handling, and the first-load
measurement in the footer. Each view is one file under `app/views/`.

## License

MIT, in `LICENSE`.
