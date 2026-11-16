// The shell: one <main>, hash routes, a search box and a request counter.
// Nothing is imported at first load but this file, so the first paint costs one HTML page, one
// stylesheet and this module; each view is a literal import() fetched when its route opens.

const view = document.getElementById('view');
const netText = document.getElementById('nettext');
const net = document.getElementById('net');
const fine = document.getElementById('fine');
const form = document.getElementById('search');
const search = document.getElementById('q');

const LOADERS = {
  board: () => import('./views/board.js'),
  bounty: () => import('./views/bounty.js'),
  leaderboard: () => import('./views/leaderboard.js'),
  profile: () => import('./views/profile.js'),
};

let run = 0;

function route() {
  const raw = location.hash.slice(1) || '/';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);
  if (!parts.length) return { name: 'board', params };
  if (parts[0] === 'bounty' && parts[1]) {
    if (parts[2] === 'leaderboard') return { name: 'leaderboard', slug: parts[1], params };
    if (parts[2]) return { name: 'missing', params };
    return { name: 'bounty', slug: parts[1], params };
  }
  if (parts[0] === 'u' && parts[1]) return { name: 'profile', handle: parts[1], params };
  return { name: 'missing', params };
}

/** Move to a route without reloading the page. */
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function missing() {
  document.title = 'Not found — make.fun bounties';
  const box = document.createElement('div');
  box.className = 'empty';
  const title = document.createElement('h1');
  title.textContent = 'Nothing at that address';
  const line = document.createElement('p');
  line.textContent = `${location.hash || '#/'} is not a view of this frontend.`;
  const link = document.createElement('a');
  link.href = '#/';
  link.textContent = 'Back to the board';
  box.append(title, line, link);
  return box;
}

async function render() {
  const current = route();
  const mine = ++run;
  window.__shotReady = false;
  document.body.dataset.route = current.name;

  if (current.name === 'missing') {
    view.replaceChildren(missing());
    window.__shotReady = true;
    return;
  }

  try {
    const module = await LOADERS[current.name]();
    if (mine !== run) return;
    const node = await module.render(current, { go, search: search.value });
    if (mine !== run) return;
    view.replaceChildren(node);
    if (current.name === 'board') search.value = current.params.get('q') ?? '';
    document.body.dataset.ready = '1';
  } catch (error) {
    if (mine !== run) return;
    document.title = 'The API did not answer — make.fun bounties';
    const box = document.createElement('div');
    box.className = 'err';
    box.setAttribute('role', 'alert');
    const head = document.createElement('strong');
    head.textContent = 'The API did not answer.';
    const line = document.createElement('p');
    line.textContent = String((error && error.message) || error);
    const again = document.createElement('button');
    again.className = 'btn';
    again.type = 'button';
    again.textContent = 'Try again';
    again.addEventListener('click', () => render());
    box.append(head, line, again);
    view.replaceChildren(box);
  } finally {
    if (mine === run) window.__shotReady = true;
  }
}

// Search is a route, so a filtered board can be linked to and shared.
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const q = search.value.trim();
  go(q ? `#/?q=${encodeURIComponent(q)}` : '#/');
});

document.addEventListener('keydown', (event) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? '');
  if (event.key === '/' && !typing) {
    event.preventDefault();
    search.focus();
    search.select();
  }
  if (event.key === 'Escape' && document.activeElement === search) {
    search.value = '';
    search.blur();
  }
});

// The API layer reports each request, cache hit and 304; the header shows the truth, not a claim.
document.addEventListener('api-stats', (event) => {
  const s = event.detail;
  netText.textContent = `${s.requests} req · ${s.reused} cached · ${s.unchanged} 304${s.failed ? ` · ${s.failed} failed` : ''}`;
  net.title = `${s.requests} requests, ${s.reused} answered from memory, ${s.unchanged} revalidated as 304 Not Modified, ${s.failed} failed`;
});

// After the first render, measure what the page actually pulled: files and compressed bytes.
function measure() {
  const timings = performance.getEntriesByType('resource').filter((entry) => entry.name.startsWith(location.origin));
  const files = timings.length + 1;
  const compressed = timings.reduce((sum, entry) => sum + (entry.encodedBodySize || 0), 0)
    + (performance.getEntriesByType('navigation')[0]?.encodedBodySize || 0);
  const kb = compressed ? `${(compressed / 1024).toFixed(1)} KB` : 'a few KB';
  fine.textContent = `First load: ${files} files, ${kb} over the wire. Later views are fetched on demand.`;
}

window.addEventListener('hashchange', render);
if (!location.hash) location.hash = '#/';
render();
setTimeout(measure, 1500);
