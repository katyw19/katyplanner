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
