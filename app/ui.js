// The page's only DOM helpers: build nodes, keep a long list virtual, tick the countdowns in place,
// and turn the API's markdown into escaped DOM.

import { ago, left, urgency } from './format.js';

const AVATARS = 'https://make.fun';

/** Build an element. Children are text nodes unless they are already nodes, so nothing is parsed as HTML. */
export function h(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key.startsWith('on:')) node.addEventListener(key.slice(3), value);
      else if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'style') node.style.cssText = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const kid of kids.flat(4)) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

/** The API's image paths are root-relative on make.fun; the tag must carry crossorigin before its src. */
export function avatar(path, cls = 'mini') {
  const img = document.createElement('img');
  img.className = cls;
  img.alt = '';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.crossOrigin = 'anonymous';
  if (path) img.src = path.startsWith('http') ? path : AVATARS + path;
  return img;
}

/** A countdown span: the text is rewritten by the clock, never by a refetch. */
export function countdown(iso, cls = '') {
  return h('span', { class: `v ${cls}`.trim(), 'data-dl': iso, text: left(iso) });
}

export function stamp(at, cls = 'stamp') {
  return h('span', { class: cls, 'data-stamp': String(at), text: `updated ${ago(at)}` });
}

/** A small markdown reader for descriptions: headings, lists, quotes, paragraphs, `code`, **bold**, links. */
export function prose(source) {
  const out = document.createDocumentFragment();
  const lines = String(source ?? '').replace(/\r\n/g, '\n').split('\n');
  let para = [];
  let list = null;

  const flushPara = () => {
    if (!para.length) return;
    out.append(h('p', null, ...inline(para.join(' '))));
    para = [];
  };
  const flushList = () => {
    if (list) out.append(list);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushPara();
      flushList();
      out.append(h('h3', null, ...inline(heading[2])));
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      if (!list) list = h('ul');
      list.append(h('li', null, ...inline(bullet[1])));
      continue;
    }
    const quote = /^>\s+(.*)$/.exec(line);
    if (quote) {
      flushPara();
      flushList();
      out.append(h('blockquote', null, ...inline(quote[1])));
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return out;
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;

function inline(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const [whole] = match;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (whole.startsWith('`')) {
      nodes.push(h('code', null, whole.slice(1, -1)));
    } else if (whole.startsWith('**')) {
      nodes.push(h('strong', null, whole.slice(2, -2)));
    } else {
      const label = whole.slice(1, whole.indexOf(']'));
      nodes.push(h('a', { href: match[2], rel: 'noopener noreferrer', target: '_blank' }, label));
    }
    last = match.index + whole.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes.length ? nodes : [text];
}

/** A list that mounts only the rows on screen: 350 entries cost the same as 30. */
export function virtualList({ count, rowHeight, render }) {
  const body = h('div', { class: 'lb-body' });
  const scroll = h('div', { class: 'lb-scroll', tabindex: '0', role: 'group' }, body);
  const mounted = new Map();
  let frame = 0;
  let total = count;

  function paint() {
    frame = 0;
    const view = scroll.clientHeight || 600;
    const first = Math.max(0, Math.floor(scroll.scrollTop / rowHeight) - 3);
    const last = Math.min(total, Math.ceil((scroll.scrollTop + view) / rowHeight) + 3);
    for (const [index, node] of mounted) {
      if (index < first || index >= last) {
        node.remove();
        mounted.delete(index);
      }
    }
    for (let index = first; index < last; index += 1) {
      if (mounted.has(index)) continue;
      const node = render(index);
      node.style.top = `${index * rowHeight}px`;
      body.append(node);
      mounted.set(index, node);
    }
  }

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };

  scroll.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });

  return {
    el: scroll,
    paint() {
      body.style.height = `${total * rowHeight}px`;
      for (const node of mounted.values()) node.remove();
      mounted.clear();
      paint();
    },
    setCount(next) {
      total = next;
      body.style.height = `${total * rowHeight}px`;
      for (const node of mounted.values()) node.remove();
      mounted.clear();
      paint();
    },
  };
}

/** Rewrite every countdown and stamp on screen, so time passes without a request or a rebuild. */
let clock = null;

export function startClock(interval = 30_000) {
  if (clock) return clock;
  const tick = () => {
    const now = Date.now();
    for (const node of document.querySelectorAll('[data-dl]')) {
      const iso = node.dataset.dl;
      node.textContent = left(iso, now);
      const level = urgency(iso, now);
      node.classList.remove('t-warn', 't-hot', 't-done');
      if (level) node.classList.add(level);
    }
    for (const node of document.querySelectorAll('[data-stamp]')) {
      node.textContent = `updated ${ago(Number(node.dataset.stamp), now)}`;
    }
  };
  tick();
  clock = setInterval(tick, interval);
  return clock;
}
