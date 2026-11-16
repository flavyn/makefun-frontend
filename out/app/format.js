// Value formatting: money, counts, countdowns, dates and percentages, all from the API's own strings.

const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** '$664.50' or '$1,325' — whole amounts lose the cents, as the API's pot strings often carry them. */
export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const cents = Number.isInteger(n) ? 0 : 2;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents,
    maximumFractionDigits: cents,
  }).format(n);
}

/** 11242 -> '11,242'. */
export function count(value) {
  const n = Number(value);
  return Number.isFinite(n) ? int.format(n) : '—';
}

/** 950587 micro-units -> '95.0587%'; the leaderboard keeps six decimals, so we do too. */
export function rate(micro) {
  const n = Number(micro);
  if (!Number.isFinite(n)) return '—';
  return `${(n / 10000).toFixed(4)}%`;
}

/** 660778 bytes -> '645 KiB'. */
export function bytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(0)} KiB`;
}

/** '1d 5h' / '5h 42m' / '42m' / 'ended 3h ago' — the number a board is scanned for. */
export function left(iso, now = Date.now()) {
  const ms = new Date(iso).getTime() - now;
  if (!Number.isFinite(ms)) return '—';
  const past = ms <= 0;
  const rest = Math.abs(ms);
  const days = Math.floor(rest / 86400000);
  const hours = Math.floor((rest % 86400000) / 3600000);
  const minutes = Math.floor((rest % 3600000) / 60000);
  let text;
  if (days > 0) text = `${days}d ${hours}h`;
  else if (hours > 0) text = `${hours}h ${minutes}m`;
  else text = `${minutes}m`;
  return past ? `ended ${text} ago` : text;
}

export function hoursLeft(iso, now = Date.now()) {
  return (new Date(iso).getTime() - now) / 3600000;
}

/** A deadline in UTC, in a form a reader can act on. */
export function when(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }) + ' UTC';
}

/** A small stamp for 'updated Ns ago'. */
export function ago(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 90) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

/** Urgency class for a countdown, so the eye finds the closing ones. */
export function urgency(iso, now = Date.now()) {
  const h = hoursLeft(iso, now);
  if (!Number.isFinite(h)) return '';
  if (h <= 0) return 't-done';
  if (h <= 2) return 't-hot';
  if (h <= 24) return 't-warn';
  return '';
}

/** A bounty still takes entries only while its deadline is ahead; status alone lags the deadline. */
export function accepting(iso, now = Date.now()) {
  return new Date(iso).getTime() > now;
}
