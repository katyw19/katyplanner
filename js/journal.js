// journal.js — private long-form writing. A list of entries in the rail, and a
// focused writing sheet with light formatting (bold, italic, bullets, links).
// Entries are stored as a small allowlisted set of HTML tags in localStorage.

import {
  subscribe, journal, addJournalEntry, updateJournalEntry, deleteJournalEntry,
  journalFolders, addJournalFolder, renameJournalFolder, deleteJournalFolder,
} from './store.js';

let list, empty, overlay, editor, titleInput, dateLabel, folderSelect;
let boldBtn, italicBtn, listBtn, checkBtn;
let linkPop, linkText, linkUrl, linkOpen, linkRemove;
let openId = null;
let saveTimer = null;
let savedRange = null;  // selection to restore when the link popover takes focus
let editingA = null;    // existing <a> being edited via the popover
const foldedFolders = new Set(); // folder ids currently collapsed in the list

export function initJournal() {
  list = document.getElementById('journalList');
  empty = document.getElementById('journalEmpty');
  overlay = document.getElementById('journalOverlay');
  editor = document.getElementById('journalBody');
  titleInput = document.getElementById('journalTitle');
  dateLabel = document.getElementById('journalDate');
  folderSelect = document.getElementById('journalFolder');
  boldBtn = document.getElementById('fmtBold');
  italicBtn = document.getElementById('fmtItalic');
  listBtn = document.getElementById('fmtList');
  checkBtn = document.getElementById('fmtCheck');
  linkPop = document.getElementById('linkPop');
  linkText = document.getElementById('linkText');
  linkUrl = document.getElementById('linkUrl');
  linkOpen = document.getElementById('linkOpen');
  linkRemove = document.getElementById('linkRemove');

  document.getElementById('journalNew').addEventListener('click', () => {
    openEntry(addJournalEntry().id);
  });
  document.getElementById('journalNewFolder').addEventListener('click', startNewFolder);
  folderSelect.addEventListener('change', () => {
    if (!openId) return;
    updateJournalEntry(openId, { folderId: folderSelect.value || null });
    renderList();
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

  titleInput.addEventListener('input', queueSave);
  editor.addEventListener('input', () => { normalizeChecklists(); updateEmptyHint(); queueSave(); });

  initFormatting();

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

function queueSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveOpenEntry, 400);
}

function initFormatting() {
  const exec = (cmd) => {
    editor.focus();
    document.execCommand(cmd, false, null);
    updateToolbar();
    queueSave();
  };
  // keep the editor's selection when pressing toolbar buttons
  for (const btn of [boldBtn, italicBtn, listBtn, checkBtn, document.getElementById('fmtLink')]) {
    btn.addEventListener('mousedown', (e) => e.preventDefault());
  }
  boldBtn.addEventListener('click', () => exec('bold'));
  italicBtn.addEventListener('click', () => exec('italic'));
  listBtn.addEventListener('click', () => {
    // bullet button on a checklist turns it into plain bullets
    const checklist = enclosingEl('ul.checklist');
    if (checklist) {
      checklist.querySelectorAll('input[type="checkbox"]').forEach((box) => box.remove());
      checklist.removeAttribute('class');
      updateToolbar();
      queueSave();
      return;
    }
    exec('insertUnorderedList');
  });
  checkBtn.addEventListener('click', toggleChecklist);
  // if the cursor sits inside an existing link, the button edits that link
  document.getElementById('fmtLink').addEventListener('click', () => openLinkPop(enclosingLink()));

  // ticking a box: mirror the property onto the attribute so it persists in saved HTML
  editor.addEventListener('change', (e) => {
    const box = e.target;
    if (box.matches?.('input[type="checkbox"]')) {
      box.toggleAttribute('checked', box.checked);
      queueSave();
    }
  });

  document.addEventListener('selectionchange', () => {
    if (!overlay.hidden) updateToolbar();
  });

  editor.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openLinkPop(enclosingLink());
    }
  });

  // paste as plain text — keeps entries calm and the stored HTML clean
  editor.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });

  // click a link to open it in a new tab; ⌘-click to edit it
  editor.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a || !editor.contains(a)) return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) openLinkPop(a);
    else if (a.href) window.open(a.href, '_blank', 'noopener');
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
  const inChecklist = inEditor && !!enclosingEl('ul.checklist');
  boldBtn.classList.toggle('active', inEditor && document.queryCommandState('bold'));
  italicBtn.classList.toggle('active', inEditor && document.queryCommandState('italic'));
  listBtn.classList.toggle('active', !inChecklist && inEditor && document.queryCommandState('insertUnorderedList'));
  checkBtn.classList.toggle('active', inChecklist);
}

/* ----- checklists ----- */

function makeCheckbox() {
  const box = document.createElement('input');
  box.type = 'checkbox';
  return box;
}

function ensureBoxes(ul) {
  const sel = getSelection();
  for (const li of ul.querySelectorAll(':scope > li')) {
    if (li.querySelector(':scope > input[type="checkbox"]')) continue;
    const box = makeCheckbox();
    li.prepend(box);
    // if the caret would sit before the new box, nudge it after — but leave a
    // caret that's already inside the line's text exactly where it is
    if (sel.rangeCount && li.contains(sel.anchorNode)) {
      const caret = sel.getRangeAt(0);
      const afterBox = document.createRange();
      afterBox.setStartAfter(box);
      afterBox.collapse(true);
      if (caret.compareBoundaryPoints(Range.START_TO_START, afterBox) < 0) {
        sel.removeAllRanges();
        sel.addRange(afterBox);
      }
    }
  }
}

// pressing Enter clones a bare <li>; give every checklist line its box back
function normalizeChecklists() {
  editor.querySelectorAll('ul.checklist').forEach(ensureBoxes);
}

// insertUnorderedList rebuilds the line and drops the caret at its start, so
// track the caret as "characters into the line" and re-find that spot after.
function caretTextOffset(block) {
  const sel = getSelection();
  if (!sel.rangeCount || !block.contains(sel.getRangeAt(0).startContainer)) return null;
  const range = sel.getRangeAt(0);
  const before = range.cloneRange();
  before.selectNodeContents(block);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function setCaretTextOffset(block, offset) {
  const sel = getSelection();
  const range = document.createRange();
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node;
  while ((node = walker.nextNode())) {
    if (remaining <= node.textContent.length) {
      range.setStart(node, remaining);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    remaining -= node.textContent.length;
  }
  range.selectNodeContents(block); // fallback: end of the line
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function toggleChecklist() {
  editor.focus();
  const offset = caretTextOffset(enclosingEl('li, div, p') ?? editor);
  const existing = enclosingEl('ul.checklist');
  if (existing) {
    // back to plain text: drop the boxes, then unwrap the list
    existing.querySelectorAll('input[type="checkbox"]').forEach((box) => box.remove());
    existing.removeAttribute('class');
    document.execCommand('insertUnorderedList');
  } else {
    // a plain bullet list converts in place; otherwise make a list first
    if (!enclosingEl('ul')) document.execCommand('insertUnorderedList');
    const ul = enclosingEl('ul');
    if (ul) {
      ul.setAttribute('class', 'checklist');
      ensureBoxes(ul);
    }
  }
  const line = enclosingEl('li, div, p');
  if (line && offset !== null) setCaretTextOffset(line, offset);
  updateToolbar();
  queueSave();
}

/* ----- link popover ----- */

// the element matching `selector` that the caret or selection sits inside, if any
function enclosingEl(selector) {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const match = node?.closest(selector);
  return match && editor.contains(match) ? match : null;
}

function enclosingLink() {
  return enclosingEl('a');
}

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
  DIV: [], P: [], BR: [], UL: ['class'], OL: [], LI: [], SPAN: [],
  INPUT: ['type', 'checked'], // checklist boxes only — anything else is removed below
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
    if (node.tagName === 'UL' && node.getAttribute('class') !== 'checklist') {
      node.removeAttribute('class');
    }
  }
  // inputs may only ever be checklist boxes
  for (const input of tpl.content.querySelectorAll('input')) {
    if (input.getAttribute('type') !== 'checkbox') input.remove();
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
  editor.classList.toggle('is-empty', !editor.textContent.trim() && !editor.querySelector('a, input'));
}

function isBlankOpenEntry() {
  return !titleInput.value.trim() && !editor.textContent.trim() && !editor.querySelector('a, input');
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
  refreshFolderSelect(entry);
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
  if (entry && !entry.title.trim() && !stripHtml(entry.body).trim()
      && !entry.body.includes('<a ') && !entry.body.includes('<input')) {
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

  empty.hidden = journal.length > 0 || journalFolders.length > 0;
  const sorted = [...journal].sort((a, b) => b.createdAt - a.createdAt);
  const knownFolder = (id) => journalFolders.some((f) => f.id === id);
  const items = [];

  for (const folder of journalFolders) {
    const filed = sorted.filter((e) => e.folderId === folder.id);
    items.push(folderRow(folder, filed.length));
    if (!foldedFolders.has(folder.id)) filed.forEach((e) => items.push(entryItem(e, true)));
  }

  const unfiled = sorted.filter((e) => !e.folderId || !knownFolder(e.folderId));
  if (unfiled.length && journalFolders.length) items.push(el('li', 'unfiled-label', 'Unfiled'));
  unfiled.forEach((e) => items.push(entryItem(e, false)));

  list.replaceChildren(...items);
}

function entryItem(entry, inFolder) {
  const item = el('li', `journal-item${inFolder ? ' in-folder' : ''}`);
  const btn = el('button');
  btn.append(
    el('span', 'journal-item-title', entryLabel(entry)),
    el('span', 'journal-item-date',
      new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
  );
  btn.addEventListener('click', () => openEntry(entry.id));
  item.append(btn);
  return item;
}

/* ----- folders ----- */

function refreshFolderSelect(entry) {
  folderSelect.hidden = journalFolders.length === 0;
  folderSelect.replaceChildren(
    new Option('No folder', ''),
    ...journalFolders.map((f) => new Option(f.name, f.id)),
  );
  folderSelect.value =
    entry.folderId && journalFolders.some((f) => f.id === entry.folderId) ? entry.folderId : '';
}

function folderRow(folder, count) {
  const row = el('li', 'journal-folder');
  const folded = foldedFolders.has(folder.id);

  const toggle = el('button', 'folder-toggle');
  toggle.setAttribute('aria-expanded', String(!folded));
  toggle.title = folded ? 'Open folder' : 'Fold folder';
  toggle.append(
    el('span', 'folder-chevron', folded ? '▸' : '▾'),
    el('span', 'folder-name', folder.name),
    el('span', 'folder-count', String(count)),
  );
  toggle.addEventListener('click', () => {
    if (folded) foldedFolders.delete(folder.id);
    else foldedFolders.add(folder.id);
    renderList();
  });

  const rename = el('button', 'ghost-btn folder-act', '✎');
  rename.title = 'Rename folder';
  rename.setAttribute('aria-label', `Rename folder ${folder.name}`);
  rename.addEventListener('click', () => beginFolderRename(row, folder));

  const del = el('button', 'ghost-btn folder-act', '×');
  del.title = 'Delete folder';
  del.setAttribute('aria-label', `Delete folder ${folder.name}`);
  del.addEventListener('click', () => {
    const keep = `Its ${count} entr${count === 1 ? 'y' : 'ies'} will stay in the journal, unfiled.`;
    if (count === 0 || confirm(`Delete “${folder.name}”? ${keep}`)) {
      deleteJournalFolder(folder.id);
      if (openId) refreshFolderSelect(journal.find((e) => e.id === openId) ?? { folderId: null });
      renderList();
    }
  });

  row.append(toggle, rename, del);
  return row;
}

function beginFolderRename(row, folder) {
  const input = el('input', 'add-input folder-input');
  input.value = folder.name;
  input.setAttribute('aria-label', 'Folder name');
  row.replaceChildren(input);
  input.focus();
  input.setSelectionRange(folder.name.length, folder.name.length);

  let closed = false;
  const close = (save) => {
    if (closed) return;
    closed = true;
    const name = input.value.trim();
    if (save && name && name !== folder.name) renameJournalFolder(folder.id, name);
    if (openId) refreshFolderSelect(journal.find((e) => e.id === openId) ?? { folderId: null });
    renderList();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') close(true);
    else if (e.key === 'Escape') close(false);
  });
  input.addEventListener('blur', () => close(true));
}

function startNewFolder() {
  if (list.querySelector('.folder-input')) return; // one at a time
  const row = el('li', 'journal-folder');
  const input = el('input', 'add-input folder-input');
  input.placeholder = 'Folder name…';
  input.setAttribute('aria-label', 'New folder name');
  row.append(input);
  list.prepend(row);
  input.focus();

  let closed = false;
  const close = (save) => {
    if (closed) return;
    closed = true;
    const name = input.value.trim();
    if (save && name) addJournalFolder(name);
    renderList();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') close(true);
    else if (e.key === 'Escape') close(false);
  });
  input.addEventListener('blur', () => close(true));
}
