// journal.js — private long-form writing. A list of entries in the rail, and a
// focused full-screen writing sheet. Everything stays in localStorage.

import {
  subscribe, journal, addJournalEntry, updateJournalEntry, deleteJournalEntry,
} from './store.js';

let list, empty, overlay, sheet, titleInput, bodyInput, dateLabel;
let openId = null;
let saveTimer = null;

export function initJournal() {
  list = document.getElementById('journalList');
  empty = document.getElementById('journalEmpty');
  overlay = document.getElementById('journalOverlay');
  sheet = overlay.querySelector('.journal-sheet');
  titleInput = document.getElementById('journalTitle');
  bodyInput = document.getElementById('journalBody');
  dateLabel = document.getElementById('journalDate');

  document.getElementById('journalNew').addEventListener('click', () => {
    openEntry(addJournalEntry().id);
  });
  document.getElementById('journalBack').addEventListener('click', closeEntry);
  document.getElementById('journalDelete').addEventListener('click', () => {
    const entry = journal.find((e) => e.id === openId);
    if (!entry) { closeEntry(); return; }
    const blank = !entry.title.trim() && !entry.body.trim() && !titleInput.value.trim() && !bodyInput.value.trim();
    if (blank || confirm('Delete this entry?')) {
      deleteJournalEntry(entry.id);
      openId = null;
      overlay.hidden = true;
      renderList();
    }
  });

  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveOpenEntry, 400);
  };
  titleInput.addEventListener('input', queueSave);
  bodyInput.addEventListener('input', queueSave);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEntry(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.hidden) closeEntry();
  });
  window.addEventListener('beforeunload', saveOpenEntry);

  subscribe(renderList); // covers import/restore
  renderList();
}

/* ----- saving ----- */

function saveOpenEntry() {
  clearTimeout(saveTimer);
  if (!openId) return;
  updateJournalEntry(openId, { title: titleInput.value, body: bodyInput.value });
  renderList();
}

/* ----- open / close ----- */

function openEntry(id) {
  const entry = journal.find((e) => e.id === id);
  if (!entry) return;
  openId = id;
  titleInput.value = entry.title;
  bodyInput.value = entry.body;
  dateLabel.textContent = new Date(entry.createdAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  overlay.hidden = false;
  (entry.title ? bodyInput : titleInput).focus();
}

function closeEntry() {
  if (!openId) { overlay.hidden = true; return; }
  saveOpenEntry();
  // a never-touched entry shouldn't linger as an empty "Untitled"
  const entry = journal.find((e) => e.id === openId);
  if (entry && !entry.title.trim() && !entry.body.trim()) deleteJournalEntry(entry.id);
  openId = null;
  overlay.hidden = true;
  renderList();
}

/* ----- list ----- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function entryLabel(entry) {
  if (entry.title.trim()) return entry.title.trim();
  const firstLine = entry.body.split('\n').find((l) => l.trim());
  return firstLine ? firstLine.trim().slice(0, 60) : 'Untitled';
}

function renderList() {
  if (openId && !journal.some((e) => e.id === openId)) {
    openId = null;
    overlay.hidden = true;
  }

  empty.hidden = journal.length > 0;
  const sorted = [...journal].sort((a, b) => b.createdAt - a.createdAt);
  list.replaceChildren(...sorted.map((entry) => {
    const item = el('li', 'journal-item');
    const btn = el('button');
    btn.append(
      el('span', 'journal-item-title', entryLabel(entry)),
      el('span', 'journal-item-date',
        new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
    );
    btn.addEventListener('click', () => openEntry(entry.id));
    item.append(btn);
    return item;
  }));
}
