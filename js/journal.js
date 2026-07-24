// journal.js — private long-form writing. A list of entries in the rail, and a
// focused writing sheet with light formatting (bold, italic, bullets, links).
// Entries are stored as a small allowlisted set of HTML tags in localStorage.

import {
  subscribe, journal, addJournalEntry, updateJournalEntry, deleteJournalEntry,
} from './store.js';

let list, empty, overlay, editor, titleInput, dateLabel;
let boldBtn, italicBtn, listBtn;
let linkPop, linkText, linkUrl, linkOpen, linkRemove;
let openId = null;
let saveTimer = null;
let savedRange = null;  // selection to restore when the link popover takes focus
let editingA = null;    // existing <a> being edited via the popover

export function initJournal() {
  list = document.getElementById('journalList');
  empty = document.getElementById('journalEmpty');
  overlay = document.getElementById('journalOverlay');
  editor = document.getElementById('journalBody');
  titleInput = document.getElementById('journalTitle');
  dateLabel = document.getElementById('journalDate');
  boldBtn = document.getElementById('fmtBold');
  italicBtn = document.getElementById('fmtItalic');
  listBtn = document.getElementById('fmtList');
  linkPop = document.getElementById('linkPop');
  linkText = document.getElementById('linkText');
  linkUrl = document.getElementById('linkUrl');
  linkOpen = document.getElementById('linkOpen');
  linkRemove = document.getElementById('linkRemove');

  document.getElementById('journalNew').addEventListener('click', () => {
    openEntry(addJournalEntry().id);
  });
  document.getElementById('journalBack').addEventListener('click', closeEntry);
  document.getElementById('journalDelete').addEventListener('click', () => {
    const entry = journal.find((e) => e.id === openId);
    if (!entry) { closeEntry(); return; }
    if (isBlankOpenEntry() || confirm('Delete this entry?')) {
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
  editor.addEventListener('input', () => { updateEmptyHint(); queueSave(); });

  initFormatting(queueSave);

  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEntry(); });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || overlay.hidden) return;
    if (!linkPop.hidden) closeLinkPop();
    else closeEntry();
  });
  window.addEventListener('beforeunload', saveOpenEntry);

  subscribe(renderList); // covers import/restore
  renderList();
}

/* ----- formatting toolbar ----- */

function initFormatting(queueSave) {
  const exec = (cmd) => {
    editor.focus();
    document.execCommand(cmd, false, null);
    updateToolbar();
    queueSave();
  };
  // keep the editor's selection when pressing toolbar buttons
  for (const btn of [boldBtn, italicBtn, listBtn, document.getElementById('fmtLink')]) {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  }
  boldBtn.addEventListener('click', () => exec('bold'));
  italicBtn.addEventListener('click', () => exec('italic'));
  listBtn.addEventListener('click', () => exec('insertUnorderedList'));
  document.getElementById('fmtLink').addEventListener('click', () => openLinkPop(null));

  document.addEventListener('selectionchange', () => {
    if (!overlay.hidden) updateToolbar();
  });

  editor.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openLinkPop(null);
    }
  });

  // paste as plain text — keeps entries calm and the stored HTML clean
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  // click a link to edit it; ⌘-click opens it
  editor.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || !editor.contains(a)) return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) window.open(a.href, '_blank', 'noopener');
    else openLinkPop(a);
  });

  linkPop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
  });
  document.getElementById('linkApply').addEventListener('click', applyLink);
  linkOpen.addEventListener('click', () => {
    if (editingA) window.open(editingA.href, '_blank', 'noopener');
  });
  linkRemove.addEventListener('click', () => {
    if (editingA) editingA.replaceWith(...editingA.childNodes);
    closeLinkPop();
    saveOpenEntry();
  });
}

function updateToolbar() {
  const inEditor = editor.contains(getSelection().anchorNode);
  boldBtn.classList.toggle('active', inEditor && document.queryCommandState('bold'));
  italicBtn.classList.toggle('active', inEditor && document.queryCommandState('italic'));
  listBtn.classList.toggle('active', inEditor && document.queryCommandState('insertUnorderedList'));
}

/* ----- link popover ----- */

function openLinkPop(existing) {
  editingA = existing;
  const sel = getSelection();
  savedRange = !existing && sel.rangeCount && editor.contains(sel.anchorNode)
    ? sel.getRangeAt(0).cloneRange()
    : null;
  const hasSelection = savedRange && !savedRange.collapsed;

  linkText.hidden = Boolean(existing || hasSelection); // name comes from the selected text
  linkText.value = '';
  linkUrl.value = existing ? (existing.getAttribute('href') ?? '') : '';
  linkOpen.hidden = linkRemove.hidden = !existing;
  linkPop.hidden = false;
  (linkText.hidden ? linkUrl : linkText).focus();
}

function closeLinkPop() {
  linkPop.hidden = true;
  editingA = null;
  savedRange = null;
  editor.focus();
}

function applyLink() {
  let url = linkUrl.value.trim();
  if (!url) { closeLinkPop(); return; }
  if (!/^(https?:|mailto:)/i.test(url)) url = `https://${url}`;

  if (editingA) {
    editingA.setAttribute('href', url);
  } else {
    editor.focus();
    const sel = getSelection();
    sel.removeAllRanges();
    if (savedRange) sel.addRange(savedRange);
    if (savedRange && !savedRange.collapsed) {
      document.execCommand('createLink', false, url);
    } else {
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const text = linkText.value.trim() || url;
      document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(text)}</a>&nbsp;`);
    }
  }
  closeLinkPop();
  saveOpenEntry();
}

/* ----- stored HTML: allowlist sanitizer + helpers ----- */

const ALLOWED = {
  A: ['href'], B: [], STRONG: [], I: [], EM: [], U: [],
  DIV: [], P: [], BR: [], UL: [], OL: [], LI: [], SPAN: [],
};

function sanitize(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  let unwrapped = true;
  while (unwrapped) {
    unwrapped = false;
    for (const node of tpl.content.querySelectorAll('*')) {
      if (!(node.tagName in ALLOWED)) {
        node.replaceWith(...node.childNodes); // keep the text, drop the tag
        unwrapped = true;
        break; // list is stale now — rescan
      }
    }
  }
  for (const node of tpl.content.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) {
      if (!ALLOWED[node.tagName].includes(attr.name)) node.removeAttribute(attr.name);
    }
    if (node.tagName === 'A' && !/^(https?:|mailto:)/i.test(node.getAttribute('href') ?? '')) {
      node.removeAttribute('href');
    }
  }
  return tpl.innerHTML;
}

function stripHtml(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return tpl.content.textContent;
}

// entries written before formatting existed hold plain text
function bodyToEditor(entry) {
  if (entry.rich) {
    editor.innerHTML = sanitize(entry.body);
    return;
  }
  editor.replaceChildren(...entry.body.split('\n').map((line) => {
    const div = document.createElement('div');
    if (line) div.textContent = line;
    else div.append(document.createElement('br'));
    return div;
  }));
}

function updateEmptyHint() {
  editor.classList.toggle('is-empty', !editor.textContent.trim() && !editor.querySelector('a'));
}

function isBlankOpenEntry() {
  return !titleInput.value.trim() && !editor.textContent.trim() && !editor.querySelector('a');
}

/* ----- saving ----- */

function saveOpenEntry() {
  clearTimeout(saveTimer);
  if (!openId) return;
  // sanitize on the way in too, so stored HTML never carries editor junk
  updateJournalEntry(openId, { title: titleInput.value, body: sanitize(editor.innerHTML), rich: true });
  renderList();
}

/* ----- open / close ----- */

function openEntry(id) {
  const entry = journal.find((e) => e.id === id);
  if (!entry) return;
  openId = id;
  titleInput.value = entry.title;
  bodyToEditor(entry);
  updateEmptyHint();
  dateLabel.textContent = new Date(entry.createdAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  linkPop.hidden = true;
  overlay.hidden = false;
  (entry.title ? editor : titleInput).focus();
}

function closeEntry() {
  if (!openId) { overlay.hidden = true; return; }
  saveOpenEntry();
  // a never-touched entry shouldn't linger as an empty "Untitled"
  const entry = journal.find((e) => e.id === openId);
  if (entry && !entry.title.trim() && !stripHtml(entry.body).trim() && !entry.body.includes('<a ')) {
    deleteJournalEntry(entry.id);
  }
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
  const html = entry.rich ? entry.body : '';
  if (html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    for (const block of tpl.content.querySelectorAll('div,p,li')) {
      const line = block.textContent.trim();
      if (line) return line.slice(0, 60);
    }
    const flat = tpl.content.textContent.trim();
    if (flat) return flat.slice(0, 60);
  } else {
    const firstLine = entry.body.split('\n').find((l) => l.trim());
    if (firstLine) return firstLine.trim().slice(0, 60);
  }
  return 'Untitled';
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
