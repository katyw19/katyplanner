// todos.js — category cards, tasks, and the "Today" strip.

import {
  state, subscribe, uid,
  addTodo, updateTodo, deleteTodo, cycleRank,
  addCategory, renameCategory, deleteCategory,
  RANK_LABELS,
} from './store.js';

const RANK_ORDER = { urgent: 0, soon: 1, upcoming: 2, someday: 3 };
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const CAL_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/></svg>';

let grid, strip, stripList;
let lastAdded = null;            // { todoId, categoryId } — animate + refocus after render
const collapsedDone = new Set(); // category ids whose Done section is folded

export function initTodos() {
  grid = document.getElementById('todoGrid');
  strip = document.getElementById('todayStrip');
  stripList = document.getElementById('todayStripList');
  subscribe(render);
  render();
}

/* ----- helpers ----- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDue(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Rank first; within a rank, dated tasks first (soonest first), then undated
// oldest-first so new tasks land at the end of their group.
function compareTasks(a, b) {
  if (RANK_ORDER[a.rank] !== RANK_ORDER[b.rank]) return RANK_ORDER[a.rank] - RANK_ORDER[b.rank];
  if (a.dueDate && b.dueDate) {
    if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    return a.createdAt - b.createdAt;
  }
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return a.createdAt - b.createdAt;
}

function completeGently(row, id) {
  if (reducedMotion.matches) {
    updateTodo(id, { done: true });
    return;
  }
  row.classList.add('leaving');
  setTimeout(() => updateTodo(id, { done: true }), 180);
}

/* ----- render ----- */

function render() {
  renderStrip();
  grid.replaceChildren(...state.categories.map(categoryCard), newListCard());

  if (lastAdded) {
    const row = grid.querySelector(`[data-id="${lastAdded.todoId}"]`);
    if (row) row.classList.add('enter');
    const input = grid.querySelector(`[data-cat="${lastAdded.categoryId}"] .add-input`);
    if (input) input.focus();
    lastAdded = null;
  }
}

function renderStrip() {
  const urgent = state.todos.filter((t) => t.rank === 'urgent' && !t.done).sort(compareTasks);
  strip.hidden = urgent.length === 0;
  if (strip.hidden) return;

  const catName = (id) => state.categories.find((c) => c.id === id)?.name ?? '';
  stripList.replaceChildren(...urgent.map((t) => {
    const row = el('li', 'strip-task');
    const check = el('button', 'check');
    check.setAttribute('aria-label', `Mark “${t.text}” done`);
    check.addEventListener('click', () => updateTodo(t.id, { done: true }));
    row.append(check, el('span', 'strip-text', t.text), el('span', 'strip-cat', catName(t.categoryId)));
    return row;
  }));
}

function categoryCard(cat) {
  const card = el('section', 'card');
  card.dataset.cat = cat.id;

  const head = el('header', 'card-head');
  const title = el('h2', 'card-title', cat.name);
  title.tabIndex = 0;
  title.title = 'Rename';
  const startRename = () => beginInlineEdit(title, cat.name, (v) => renameCategory(cat.id, v), 'title-edit');
  title.addEventListener('click', startRename);
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') startRename(); });

  const del = el('button', 'card-del', '×');
  del.setAttribute('aria-label', `Delete list ${cat.name}`);
  del.addEventListener('click', () => {
    const count = state.todos.filter((t) => t.categoryId === cat.id).length;
    if (count === 0 || confirm(`Delete “${cat.name}” and its ${count} task${count === 1 ? '' : 's'}?`)) {
      deleteCategory(cat.id);
    }
  });
  head.append(title, del);

  const add = el('input', 'add-input');
  add.placeholder = 'Add a task…';
  add.setAttribute('aria-label', `Add a task to ${cat.name}`);
  add.addEventListener('keydown', (e) => {
    const text = add.value.trim();
    if (e.key === 'Enter' && text) {
      const id = uid();
      lastAdded = { todoId: id, categoryId: cat.id };
      addTodo(cat.id, text, id); // triggers re-render; focus + animation restored there
    }
  });

  const tasks = state.todos.filter((t) => t.categoryId === cat.id);
  const open = tasks.filter((t) => !t.done).sort(compareTasks);
  const done = tasks.filter((t) => t.done).sort(compareTasks);

  const list = el('ul', 'tasks');
  open.forEach((t) => list.append(taskRow(t)));

  card.append(head, add, list);

  if (done.length) {
    const folded = collapsedDone.has(cat.id);
    const toggle = el('button', 'done-toggle', `${folded ? '▸' : '▾'} Done · ${done.length}`);
    toggle.setAttribute('aria-expanded', String(!folded));
    toggle.addEventListener('click', () => {
      if (folded) collapsedDone.delete(cat.id);
      else collapsedDone.add(cat.id);
      render();
    });
    card.append(toggle);
    if (!folded) {
      const doneList = el('ul', 'tasks done-tasks');
      done.forEach((t) => doneList.append(taskRow(t)));
      card.append(doneList);
    }
  }

  return card;
}

function taskRow(t) {
  const row = el('li', 'task');
  row.dataset.id = t.id;

  const check = el('button', 'check');
  check.setAttribute('aria-label', t.done ? 'Mark as not done' : 'Mark as done');
  check.addEventListener('click', () => {
    if (t.done) updateTodo(t.id, { done: false });
    else completeGently(row, t.id);
  });

  const text = el('span', 'task-text', t.text);
  if (!t.done) {
    text.title = 'Edit';
    text.addEventListener('click', () => beginInlineEdit(text, t.text, (v) => updateTodo(t.id, { text: v })));
  }

  const meta = el('span', 'task-meta');

  if (t.dueDate) {
    const due = el('button', 'due', formatDue(t.dueDate));
    if (!t.done && t.dueDate < todayIso()) due.classList.add('overdue');
    due.title = 'Change due date';
    due.addEventListener('click', () => openDatePicker(meta, t));
    meta.append(due);
  }

  const rank = el('button', 'rank-chip');
  rank.dataset.rank = t.rank;
  rank.title = 'Change urgency';
  rank.setAttribute('aria-label', `Urgency: ${RANK_LABELS[t.rank]}. Click to change.`);
  rank.append(el('span', 'dot'), el('span', 'rank-label', RANK_LABELS[t.rank]));
  rank.addEventListener('click', () => cycleRank(t.id));
  meta.append(rank);

  const actions = el('span', 'task-actions');
  if (!t.done && !t.dueDate) {
    const dateBtn = el('button', 'ghost-btn');
    dateBtn.innerHTML = CAL_ICON; // static markup, no user data
    dateBtn.title = 'Add due date';
    dateBtn.setAttribute('aria-label', 'Add due date');
    dateBtn.addEventListener('click', () => openDatePicker(meta, t));
    actions.append(dateBtn);
  }
  const del = el('button', 'ghost-btn', '×');
  del.title = 'Delete';
  del.setAttribute('aria-label', `Delete “${t.text}”`);
  del.addEventListener('click', () => deleteTodo(t.id));
  actions.append(del);

  row.append(check, text, meta, actions);
  return row;
}

/* ----- inline editors ----- */

function beginInlineEdit(node, current, commit, extraClass = '') {
  const input = el('input', `inline-edit ${extraClass}`.trim());
  input.value = current;
  node.replaceWith(input);
  input.focus();
  input.setSelectionRange(current.length, current.length);

  let closed = false;
  const close = (save) => {
    if (closed) return;
    closed = true;
    const value = input.value.trim();
    if (save && value && value !== current) commit(value); // commit re-renders
    else render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') close(true);
    else if (e.key === 'Escape') close(false);
  });
  input.addEventListener('blur', () => close(true));
}

function openDatePicker(meta, t) {
  const input = el('input', 'date-input');
  input.type = 'date';
  input.value = t.dueDate ?? '';
  input.setAttribute('aria-label', 'Due date');
  meta.prepend(input);
  input.focus();
  try { input.showPicker?.(); } catch { /* needs a user gesture in some browsers — typing works */ }

  let closed = false;
  const close = (save) => {
    if (closed) return;
    closed = true;
    if (save && input.value !== (t.dueDate ?? '')) {
      updateTodo(t.id, { dueDate: input.value || null }); // re-renders
    } else {
      render();
    }
  };
  input.addEventListener('change', () => close(true));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(false); });
  input.addEventListener('blur', () => close(true));
}

function newListCard() {
  const btn = el('button', 'card new-list', '＋ New list');
  btn.addEventListener('click', () => {
    const wrap = el('section', 'card new-list-editing');
    const input = el('input', 'add-input');
    input.placeholder = 'List name…';
    input.setAttribute('aria-label', 'New list name');
    wrap.append(input);
    btn.replaceWith(wrap);
    input.focus();

    let closed = false;
    const close = (save) => {
      if (closed) return;
      closed = true;
      const name = input.value.trim();
      if (save && name) addCategory(name); // re-renders
      else render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(true);
      else if (e.key === 'Escape') close(false);
    });
    input.addEventListener('blur', () => close(true));
  });
  return btn;
}
