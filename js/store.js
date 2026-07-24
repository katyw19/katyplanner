// store.js — one source of truth: state, localStorage persistence, tiny pub/sub.

const KEYS = {
  todos: 'dashboard.todos',
  categories: 'dashboard.categories',
  notes: 'dashboard.notes',
  journal: 'dashboard.journal',
  theme: 'dashboard.theme',
};

export const RANKS = ['urgent', 'soon', 'upcoming', 'someday'];
export const RANK_LABELS = { urgent: 'Urgent', soon: 'Soon', upcoming: 'Upcoming', someday: 'Someday' };

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function persist(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function uid() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// Seed three starter lists on the very first open only. An empty array means
// Katy deleted them all on purpose — don't re-seed.
const storedCategories = load(KEYS.categories, null);
export const state = {
  categories: storedCategories ?? [
    { id: uid(), name: 'Work' },
    { id: uid(), name: 'Home' },
    { id: uid(), name: 'Personal' },
  ],
  todos: load(KEYS.todos, []),
};
if (storedCategories === null) persist(KEYS.categories, state.categories);

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); }
function notify() { listeners.forEach((fn) => fn()); }

function saveTodos() { persist(KEYS.todos, state.todos); notify(); }
function saveCategories() { persist(KEYS.categories, state.categories); notify(); }

/* ----- todos ----- */

export function addTodo(categoryId, text, id = uid()) {
  const todo = { id, text, categoryId, rank: 'upcoming', dueDate: null, done: false, createdAt: Date.now() };
  state.todos.push(todo);
  saveTodos();
  return todo;
}

export function updateTodo(id, patch) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  Object.assign(todo, patch);
  saveTodos();
}

export function deleteTodo(id) {
  state.todos = state.todos.filter((t) => t.id !== id);
  saveTodos();
}

export function cycleRank(id) {
  const todo = state.todos.find((t) => t.id === id);
  if (!todo) return;
  todo.rank = RANKS[(RANKS.indexOf(todo.rank) + 1) % RANKS.length];
  saveTodos();
}

/* ----- categories ----- */

export function addCategory(name) {
  state.categories.push({ id: uid(), name });
  saveCategories();
}

export function renameCategory(id, name) {
  const cat = state.categories.find((c) => c.id === id);
  if (!cat) return;
  cat.name = name;
  saveCategories();
}

export function deleteCategory(id) {
  state.categories = state.categories.filter((c) => c.id !== id);
  state.todos = state.todos.filter((t) => t.categoryId !== id);
  persist(KEYS.todos, state.todos);
  saveCategories();
}

// Move a category to another category's position (drag & drop).
export function moveCategory(id, targetId) {
  const from = state.categories.findIndex((c) => c.id === id);
  const to = state.categories.findIndex((c) => c.id === targetId);
  if (from < 0 || to < 0 || from === to) return;
  const [cat] = state.categories.splice(from, 1);
  state.categories.splice(to, 0, cat);
  saveCategories();
}

// Nudge a category one step left/right (keyboard reordering).
export function shiftCategory(id, delta) {
  const from = state.categories.findIndex((c) => c.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= state.categories.length) return;
  const [cat] = state.categories.splice(from, 1);
  state.categories.splice(to, 0, cat);
  saveCategories();
}

/* ----- notes ----- */

export function loadNotes() { return load(KEYS.notes, ''); }
export function saveNotes(text) { persist(KEYS.notes, text); }

/* ----- theme ----- */

export function loadTheme() { return load(KEYS.theme, 'light'); }
export function saveTheme(theme) { persist(KEYS.theme, theme); }

/* ----- journal ----- */

export const journal = load(KEYS.journal, []);

function persistJournal() { persist(KEYS.journal, journal); }

export function addJournalEntry() {
  const entry = { id: uid(), title: '', body: '', createdAt: Date.now(), updatedAt: Date.now() };
  journal.unshift(entry);
  persistJournal();
  return entry;
}

export function updateJournalEntry(id, patch) {
  const entry = journal.find((e) => e.id === id);
  if (!entry) return;
  Object.assign(entry, patch, { updatedAt: Date.now() });
  persistJournal();
}

export function deleteJournalEntry(id) {
  const i = journal.findIndex((e) => e.id === id);
  if (i < 0) return;
  journal.splice(i, 1);
  persistJournal();
}

/* ----- backup ----- */

export function exportData() {
  return JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    categories: state.categories,
    todos: state.todos,
    notes: loadNotes(),
    journal,
  }, null, 2);
}

export function importData(json) {
  const data = JSON.parse(json);
  if (!Array.isArray(data.categories) || !Array.isArray(data.todos)) {
    throw new Error('Not a dashboard backup file.');
  }
  state.categories = data.categories;
  state.todos = data.todos;
  persist(KEYS.categories, state.categories);
  persist(KEYS.todos, state.todos);
  if (typeof data.notes === 'string') saveNotes(data.notes);
  if (Array.isArray(data.journal)) {
    journal.length = 0;
    journal.push(...data.journal);
    persistJournal();
  }
  notify();
}
