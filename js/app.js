// app.js — boot: header greeting, theme, notes autosave, backup, feature modules.

import { initTodos } from './todos.js';
import { initJournal } from './journal.js';
import {
  loadNotes, saveNotes, loadTheme, saveTheme, exportData, importData,
} from './store.js';

const NAME = 'Katy';

// tidy up the token cache left behind by the removed calendar feature
localStorage.removeItem('dashboard.gcal');

/* ----- header: greeting + date, refreshed each minute ----- */

function updateHeader() {
  const now = new Date();
  const hour = now.getHours();
  const [jp, en] =
    hour >= 5 && hour < 12 ? ['おはよう', 'Good morning'] :
    hour >= 12 && hour < 18 ? ['こんにちは', 'Good afternoon'] :
    ['こんばんは', 'Good evening'];

  document.getElementById('jpGreeting').textContent = jp;
  document.getElementById('greeting').textContent = `${en}, ${NAME}`;
  document.getElementById('todayDate').textContent =
    now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

updateHeader();
setInterval(updateHeader, 60 * 1000);

/* ----- a daily proverb, rotating with the day of the year ----- */

const PROVERBS = [
  { jp: '七転び八起き', en: 'Fall seven times, rise eight.' },
  { jp: '継続は力なり', en: 'Continuing on is itself a strength.' },
  { jp: '塵も積もれば山となる', en: 'Even dust, piled up, becomes a mountain.' },
  { jp: '急がば回れ', en: 'When in a hurry, take the calmer road.' },
  { jp: '花より団子', en: 'Dumplings over flowers — substance first.' },
  { jp: '明日は明日の風が吹く', en: 'Tomorrow, tomorrow’s wind will blow.' },
  { jp: '石の上にも三年', en: 'Three years on a stone — patience warms it.' },
  { jp: '案ずるより産むが易し', en: 'Doing is easier than worrying about it.' },
  { jp: '千里の道も一歩から', en: 'A thousand-mile road begins with one step.' },
  { jp: '猿も木から落ちる', en: 'Even monkeys fall from trees.' },
  { jp: '温故知新', en: 'Visit the old to learn the new.' },
  { jp: '一期一会', en: 'One time, one meeting — treasure it.' },
  { jp: '笑う門には福来る', en: 'Fortune visits a laughing gate.' },
  { jp: '蒔かぬ種は生えぬ', en: 'Unsown seeds never sprout.' },
];

function setProverb() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const p = PROVERBS[dayOfYear % PROVERBS.length];
  document.getElementById('proverbJp').textContent = p.jp;
  document.getElementById('proverbEn').textContent = p.en;
}

setProverb();

/* ----- seasonal petals, drifting behind the cards ----- */

function driftPetals() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const month = new Date().getMonth() + 1;
  const season =
    month >= 3 && month <= 5 ? 'spring' :
    month >= 6 && month <= 8 ? 'summer' :
    month >= 9 && month <= 11 ? 'autumn' : 'winter';
  const box = document.getElementById('petals');
  box.replaceChildren(...Array.from({ length: 7 }, () => {
    const petal = document.createElement('span');
    petal.className = `petal petal-${season}`;
    const dur = 20 + Math.random() * 12;
    petal.style.setProperty('--left', `${2 + Math.random() * 96}vw`);
    petal.style.setProperty('--size', `${7 + Math.random() * 4}px`);
    petal.style.setProperty('--dur', `${dur}s`);
    petal.style.setProperty('--delay', `${-Math.random() * dur}s`); // start mid-drift
    petal.style.setProperty('--sway', `${18 + Math.random() * 40}px`);
    return petal;
  }));
}

driftPetals();

/* ----- theme toggle ----- */

const themeToggle = document.getElementById('themeToggle');
document.documentElement.dataset.theme = loadTheme();
themeToggle.addEventListener('click', () => {
  const next = loadTheme() === 'dark' ? 'light' : 'dark';
  saveTheme(next);
  document.documentElement.dataset.theme = next;
});

/* ----- notes: autosave, debounced ----- */

const notes = document.getElementById('notes');
notes.value = loadNotes();
let notesTimer;
notes.addEventListener('input', () => {
  clearTimeout(notesTimer);
  notesTimer = setTimeout(() => saveNotes(notes.value), 400);
});
// don't lose the last keystrokes if the tab closes inside the debounce window
window.addEventListener('beforeunload', () => saveNotes(notes.value));

/* ----- backup: export / import ----- */

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([exportData()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `katy-dashboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

const importInput = document.getElementById('importInput');
document.getElementById('importBtn').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  importInput.value = '';
  if (!file) return;
  if (!confirm(`Replace your current lists, tasks, and notes with “${file.name}”?`)) return;
  try {
    importData(await file.text());
    notes.value = loadNotes();
  } catch {
    alert('That file doesn’t look like a dashboard backup.');
  }
});

/* ----- features ----- */

initTodos();
initJournal();
