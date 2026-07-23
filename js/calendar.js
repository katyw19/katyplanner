// calendar.js — read-only Google Calendar agenda (today + next few days).
//
// Three states, all graceful:
//   1. No config.js / placeholder keys  → quiet setup hint, rest of app unaffected.
//   2. Configured but not connected     → calm "Connect Google Calendar" button.
//   3. Connected                        → styled agenda; token cached in localStorage.
//
// Zero-setup fallback: set  calendarMode: 'iframe'  in config.js (one line) and
// paste your calendar's embed URL — no API keys needed.

import { loadGcal, saveGcal, clearGcal } from './store.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const DAYS_AHEAD = 5;               // today + next 4 days
const STALE_MS = 10 * 60 * 1000;    // refetch when returning after 10+ minutes

let cfg = null;
let body, refreshBtn;
let tokenClient = null;
let lastFetched = 0;

export function initCalendar() {
  cfg = window.DASHBOARD_CONFIG ?? null;
  body = document.getElementById('calendarBody');
  refreshBtn = document.getElementById('calendarRefresh');

  refreshBtn.addEventListener('click', () => refresh());
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && lastFetched && Date.now() - lastFetched > STALE_MS) refresh();
  });

  if (cfg?.calendarMode === 'iframe' && cfg.calendarEmbedSrc) {
    renderIframe();
    return;
  }

  const clientId = cfg?.googleClientId;
  if (!clientId || clientId.startsWith('YOUR_')) {
    renderNote('To see your calendar here, copy config.example.js to config.js and add your Google keys — the README walks through it.');
    return;
  }

  start();
}

/* ----- flow ----- */

async function start() {
  const cached = loadGcal();
  if (cached?.token && cached.expiresAt > Date.now()) {
    renderNote('Loading calendar…');
    await fetchAndRender(cached.token);
    return;
  }
  if (cached?.connected) {
    // Connected before — try a silent token refresh first.
    renderNote('Loading calendar…');
    try {
      const token = await getToken('');
      await fetchAndRender(token);
      return;
    } catch { /* fall through to the connect button */ }
  }
  renderConnect();
}

async function connect() {
  renderNote('Waiting for Google…');
  try {
    const token = await getToken('consent');
    await fetchAndRender(token);
  } catch {
    renderConnect('Couldn’t connect. Give it another try?');
  }
}

async function refresh() {
  const cached = loadGcal();
  try {
    const token = cached?.token && cached.expiresAt > Date.now()
      ? cached.token
      : await getToken('');
    await fetchAndRender(token);
  } catch {
    renderConnect();
  }
}

/* ----- google identity services ----- */

function loadGis() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Google sign-in script failed to load'));
    document.head.append(s);
  });
}

async function getToken(prompt) {
  await loadGis();
  return new Promise((resolve, reject) => {
    tokenClient ??= google.accounts.oauth2.initTokenClient({
      client_id: cfg.googleClientId,
      scope: SCOPE,
      callback: () => {},
    });
    tokenClient.callback = (resp) => {
      if (resp.error) { reject(new Error(resp.error)); return; }
      saveGcal({
        token: resp.access_token,
        expiresAt: Date.now() + (resp.expires_in - 60) * 1000,
        connected: true,
      });
      resolve(resp.access_token);
    };
    tokenClient.error_callback = (err) => reject(new Error(err?.type ?? 'auth failed'));
    tokenClient.requestAccessToken({ prompt });
  });
}

/* ----- events ----- */

async function fetchAndRender(token) {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + DAYS_AHEAD);

  const params = new URLSearchParams({
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
  });
  if (cfg.googleApiKey && !cfg.googleApiKey.startsWith('YOUR_')) {
    params.set('key', cfg.googleApiKey);
  }

  let resp;
  try {
    resp = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {
    renderNote('Couldn’t reach Google Calendar.', { retry: true });
    return;
  }

  if (resp.status === 401 || resp.status === 403) {
    saveGcal({ connected: true }); // token no good — keep the connected flag for silent retry
    renderConnect();
    return;
  }
  if (!resp.ok) {
    renderNote('Couldn’t reach Google Calendar.', { retry: true });
    return;
  }

  const data = await resp.json();
  lastFetched = Date.now();
  renderAgenda(data.items ?? []);
}

/* ----- rendering ----- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderNote(message, { retry = false } = {}) {
  refreshBtn.hidden = true;
  const note = el('p', 'cal-note', message);
  body.replaceChildren(note);
  if (retry) {
    const btn = el('button', 'cal-connect', 'Try again');
    btn.addEventListener('click', () => refresh());
    body.append(btn);
  }
}

function renderConnect(message) {
  refreshBtn.hidden = true;
  const note = el('p', 'cal-note', message ?? 'See your week alongside your lists.');
  const btn = el('button', 'cal-connect', 'Connect Google Calendar');
  btn.addEventListener('click', connect);
  body.replaceChildren(note, btn);
}

function renderIframe() {
  refreshBtn.hidden = true;
  const frame = el('iframe', 'cal-iframe');
  frame.src = cfg.calendarEmbedSrc;
  frame.title = 'Google Calendar';
  body.replaceChildren(frame);
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function renderAgenda(events) {
  refreshBtn.hidden = false;

  // Group by local start date. All-day events carry a plain date string.
  const byDay = new Map();
  for (const ev of events) {
    const allDay = Boolean(ev.start?.date);
    const key = allDay ? ev.start.date : localDateKey(new Date(ev.start.dateTime));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push({ allDay, ev });
  }

  const days = [];
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const key = localDateKey(cursor);
    const dayEvents = byDay.get(key);
    if (dayEvents?.length) {
      const label = i === 0 ? 'Today'
        : i === 1 ? 'Tomorrow'
        : cursor.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      days.push(renderDay(label, dayEvents));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  if (days.length === 0) {
    renderNote('Nothing scheduled — enjoy the quiet.');
    refreshBtn.hidden = false;
    return;
  }
  body.replaceChildren(...days);
}

function renderDay(label, dayEvents) {
  const day = el('div', 'cal-day');
  day.append(el('p', 'cal-day-label', label));
  const list = el('ul', 'cal-events');
  for (const { allDay, ev } of dayEvents) {
    const item = el('li', 'cal-event');
    const time = allDay
      ? 'All day'
      : new Date(ev.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    item.append(el('span', 'cal-time', time), el('span', 'cal-title', ev.summary ?? '(no title)'));
    list.append(item);
  }
  day.append(list);
  return day;
}
