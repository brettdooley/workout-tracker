import * as M from './model.js';
import * as B from './backup.js';
import { lineChart, barChart } from './charts.js';
import { STARTING_TEMPLATE, SEED_V1, EXERCISE_NOTES } from './seed.js';

const VERSION = '1.1.1';
const KEY = 'wt.data';
const app = document.getElementById('app');

let state = null;
let view = { tab: 'workout' };
let lastAutoAttempt = 0;
let wake = null;

// ---------------------------------------------------------------- helpers

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

let toastTimer;
function toast(msg, ms = 3000) {
  let t = document.getElementById('toast');
  if (!t) { t = h('div', { id: 'toast', role: 'status' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function sheet(title, ...content) {
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); };
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
    h('div', { class: 'sheet-body' }, ...content));
  const wrap = h('div', { class: 'sheet-wrap', onclick: (e) => { if (e.target === wrap) close(); } }, panel);
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  return { close, body: panel.querySelector('.sheet-body'), panel };
}

function confirmBox(title, text, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet(title, h('p', {}, text),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn', onclick: () => { done = true; s.close(); resolve(false); } }, 'Cancel'),
        h('button', { class: danger ? 'btn danger' : 'btn primary', 'data-ok': '1', onclick: () => { done = true; s.close(); resolve(true); } }, okLabel)));
    const obs = new MutationObserver(() => { if (!document.body.contains(s.panel) && !done) { obs.disconnect(); resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

function fmtDate(str, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  const d = M.dateObj(str);
  const o = { ...opts };
  if (d.getFullYear() !== new Date().getFullYear() && !o.year) o.year = 'numeric';
  return d.toLocaleDateString('en-US', o);
}
function agoIso(iso) {
  if (!iso) return 'never';
  const n = Math.max(0, M.daysBetween(M.localToday(new Date(iso)), M.localToday()));
  const t = new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (n === 0) return `today ${t}`;
  if (n === 1) return `yesterday ${t}`;
  return `${n} days ago`;
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const exName = (id) => (state.exercises[id] ? state.exercises[id].name : 'Unknown exercise');
const activeTpl = () => state.templates[state.activeTemplateId] || null;
function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function readFile(input) {
  return new Promise((resolve, reject) => {
    const f = input.files && input.files[0];
    if (!f) return reject(new Error('No file chosen.'));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsText(f);
  });
}
function errText(e) {
  if (e instanceof TypeError) return "Couldn't reach GitHub. Check your signal and try again.";
  return e.message || String(e);
}
function setsText(type, sets) {
  return sets.map((s) => {
    if (type === 'timed') return `${s.s || 0}s`;
    if (type === 'check') return 'done';
    if (type === 'distance') return `${s.d || 0}${s.w ? ` @ ${s.w} lb` : ''}`;
    if (type === 'bodyweight') return s.w ? `+${s.w} × ${s.r || 0}` : `${s.r || 0}`;
    return `${s.w || 0} × ${s.r || 0}`;
  }).join(', ');
}

// ---------------------------------------------------------------- storage

function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try { return M.migrate(JSON.parse(raw)); } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { toast('Could not save on this phone. Storage may be full.'); }
}

function seedState() {
  const s = M.emptyState();
  const parsed = M.parseTemplate(STARTING_TEMPLATE, s);
  const tpl = M.applyParsed(s, parsed);
  s.activeTemplateId = tpl.id;
  tpl.seed = 2;
  for (const [name, note] of Object.entries(EXERCISE_NOTES)) {
    const ex = M.findExercise(s, name);
    if (ex) ex.notes = note;
  }
  return s;
}

// Replaces an unedited copy of the first starting routine with the current one.
// Keeps the same template and day ids so history and "done today" still line up.
function upgradeSeed(s) {
  let changed = false;
  for (const t of Object.values(s.templates)) {
    if (t.seed >= 2 || M.exportTemplate(s, t) !== SEED_V1) continue;
    const old = M.findExercise(s, 'Supported Elevated Left-Leg Squat (mobility)');
    if (old && !M.findExercise(s, 'Unweighted Squat Mobility')) { old.name = 'Unweighted Squat Mobility'; old.type = 'timed'; old.notes = ''; }
    const nt = M.applyParsed(s, M.parseTemplate(STARTING_TEMPLATE, s));
    delete s.templates[nt.id];
    nt.id = t.id; nt.seed = 2;
    for (const d of nt.days) { const od = t.days.find((x) => x.weekday === d.weekday); if (od) d.id = od.id; }
    s.templates[t.id] = nt;
    for (const n of ['Wall Push-up Plus', 'Light Band Low Row']) { const e = M.findExercise(s, n); if (e) e.archived = true; }
    for (const [name, note] of Object.entries(EXERCISE_NOTES)) { const e = M.findExercise(s, name); if (e && !e.notes) e.notes = note; }
    if (s.current && !s.current.touched) s.current = null;
    changed = true;
  }
  return changed;
}

// ---------------------------------------------------------------- shell

let lastTabKey = null;
function renderMain() {
  const prev = app.querySelector('main');
  const key = JSON.stringify([view.tab, view.set, view.tplId, view.dayKey, view.exId, view.histId]);
  const keepScroll = prev && lastTabKey === key ? prev.scrollTop : 0;
  lastTabKey = key;
  const tabs = [['workout', 'Workout', '◉'], ['history', 'History', '☰'], ['progress', 'Progress', '↗'], ['settings', 'Settings', '⚙']];
  let content;
  if (view.tab === 'workout') content = workoutTab();
  else if (view.tab === 'history') content = historyTab();
  else if (view.tab === 'progress') content = progressTab();
  else content = settingsTab();
  app.replaceChildren(
    h('main', { class: 'with-tabs' }, banners(), content),
    h('nav', { class: 'tabs' }, tabs.map(([id, label, icon]) => h('button', {
      class: view.tab === id ? 'tab on' : 'tab', 'data-tab': id,
      onclick: () => { if (view.tab === id) { view = { tab: id }; } else { view = { ...view, tab: id }; } renderMain(); },
    }, h('span', { class: 'tab-ico', 'aria-hidden': 'true' }, icon), label))));
  app.querySelector('main').scrollTop = keepScroll;
  updateWake();
}

function banners() {
  const out = [];
  const bk = state.backup;
  const lasts = [bk.last.github, bk.last.manual].filter(Boolean).sort();
  const newest = lasts[lasts.length - 1];
  const age = newest ? M.daysBetween(M.localToday(new Date(newest)), M.localToday()) : null;
  if (state.workouts.length && (age === null || age > 7)) {
    out.push(h('div', { class: 'banner warn' },
      h('span', {}, newest ? `No backup in ${age} days.` : "You haven't backed up yet."),
      h('button', { class: 'btn small', onclick: () => { view = { tab: 'settings' }; renderMain(); } }, 'Back up')));
  }
  if (bk.github && bk.error) {
    out.push(h('div', { class: 'banner bad' }, h('span', {}, `Backup failed: ${bk.error}`),
      h('button', { class: 'btn small', onclick: () => runGithub(true) }, 'Retry')));
  }
  return h('div', { class: 'banners' }, out);
}

async function updateWake() {
  const on = view.tab === 'workout' && state && state.current && state.current.touched && document.visibilityState === 'visible';
  try {
    if (on && !wake && 'wakeLock' in navigator) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    } else if (!on && wake) { const w = wake; wake = null; await w.release(); }
  } catch { /* not supported or not allowed; fine */ }
}

// ---------------------------------------------------------------- workout tab

function doneToday(dayId, date) {
  return state.workouts.some((w) => w.date === date && w.dayId === dayId);
}

// Keeps state.current pointing at today's workout. Untouched drafts are rebuilt so template edits show up.
function ensureCurrent() {
  const today = M.localToday();
  const cur = state.current;
  if (cur && cur.touched) return;
  if (cur && cur.date !== today) state.current = null;
  const tpl = activeTpl();
  if (!tpl) { state.current = null; return; }
  let day = null;
  if (state.current) day = tpl.days.find((d) => d.id === state.current.dayId) || null;
  if (!day) {
    state.current = null;
    const td = M.dayForDate(tpl, today);
    if (td && !doneToday(td.id, today)) day = td;
  }
  state.current = day ? M.buildWorkout(state, tpl, day, today) : null;
}

function startDay(tpl, day) {
  state.current = M.buildWorkout(state, tpl, day, M.localToday());
  save();
  renderMain();
}

function pickDaySheet() {
  const tpl = activeTpl();
  if (!tpl) { toast('No active template. Add one in Settings.'); return; }
  const s = sheet('Choose a day', h('div', { class: 'list' }, tpl.days.map((d) => h('button', {
    class: 'list-row', onclick: async () => {
      if (state.current && state.current.touched) {
        if (!(await confirmBox('Replace this workout?', 'What you have logged so far in the current workout will be discarded.', 'Replace', true))) return;
      }
      s.close(); startDay(tpl, d);
    },
  }, h('span', { class: 'lr-title' }, M.dayTitle(d)), h('span', { class: 'lr-sub' }, lastDoneText(d.id))))));
}

function lastDoneText(dayId) {
  const ws = state.workouts.filter((w) => w.dayId === dayId).sort((a, b) => b.date.localeCompare(a.date));
  return ws.length ? `Last done ${fmtDate(ws[0].date)}` : 'Not done yet';
}

function workoutTab() {
  ensureCurrent();
  const cur = state.current;
  const today = M.localToday();
  const tpl = activeTpl();
  if (!cur) {
    const td = tpl ? M.dayForDate(tpl, today) : null;
    const done = td && doneToday(td.id, today);
    return h('div', {},
      h('div', { class: 'eyebrow' }, fmtDate(today, { weekday: 'long', month: 'long', day: 'numeric' })),
      done
        ? h('div', { class: 'status done' }, h('div', { class: 'status-main' }, 'Done for today ✓'), h('div', { class: 'status-sub' }, M.dayTitle(td)))
        : h('div', { class: 'status' }, h('div', { class: 'status-main' }, tpl ? 'Nothing scheduled today' : 'No active template'),
          h('div', { class: 'status-sub' }, tpl ? `${tpl.name} has no day set for ${M.WEEKDAYS[M.weekdayOf(today)]}.` : 'Add or pick a template in Settings.')),
      tpl ? h('button', { class: 'btn wide', onclick: pickDaySheet }, done ? 'Do another day' : 'Pick a day') : null,
      done ? h('button', { class: 'btn wide', onclick: () => { view = { tab: 'history' }; renderMain(); } }, 'See it in History') : null);
  }
  const old = cur.date !== today;
  return h('div', {},
    old ? h('div', { class: 'banner warn' }, h('span', {}, `This workout is from ${fmtDate(cur.date)}. Finish or discard it.`)) : null,
    h('div', { class: 'eyebrow' }, fmtDate(cur.date, { weekday: 'long', month: 'long', day: 'numeric' })),
    h('div', { class: 'title-row' }, h('h1', {}, cur.dayName), h('button', { class: 'btn small', onclick: pickDaySheet }, 'Change day')),
    tpl && tpl.note ? h('details', { class: 'card notes' }, h('summary', {}, 'Program notes'), h('p', { class: 'pre' }, tpl.note)) : null,
    cur.dayNote ? h('div', { class: 'card day-note' }, h('p', { class: 'pre' }, cur.dayNote)) : null,
    workoutBody(cur, { live: true }),
    h('button', { class: 'btn wide', onclick: () => addExerciseTo(cur, true) }, '+ Add exercise'),
    h('button', { class: 'btn primary wide', 'data-act': 'finish', onclick: finishWorkout }, 'Finish workout'),
    h('button', { class: 'link wide-link', onclick: discardWorkout }, 'Discard workout'));
}

function commit(w, live) {
  if (live) { w.touched = true; save(); updateWake(); }
}

function workoutBody(w, { live }) {
  const out = [];
  let group = null;
  const tpl = state.templates[w.templateId] || activeTpl();
  w.exercises.forEach((e, i) => {
    if (e.group !== group) {
      group = e.group;
      if (group) {
        const g = group;
        out.push(h('div', { class: 'group-head' }, h('h3', {}, g),
          h('button', { class: 'btn small', onclick: () => {
            const items = w.exercises.filter((x) => x.group === g && !x.skipped);
            const all = items.every((x) => x.sets.every((s) => s.done));
            items.forEach((x) => x.sets.forEach((s) => { s.done = !all; }));
            commit(w, live); renderMain();
          } }, w.exercises.filter((x) => x.group === g && !x.skipped).every((x) => x.sets.every((s) => s.done)) ? 'Undo all' : 'All done')));
      }
    }
    out.push(exerciseCard(w, e, i, { live, tpl }));
  });
  if (!w.exercises.length) out.push(h('p', { class: 'fine center-text' }, 'No exercises. Add one below.'));
  return h('div', { class: 'ex-list' }, out);
}

function numInput(val, { placeholder, decimal, label, onChange }) {
  return h('input', {
    type: 'text', inputmode: decimal ? 'decimal' : 'numeric', pattern: decimal ? null : '[0-9]*', class: 'num',
    value: val === null || val === undefined ? '' : String(val), placeholder, 'aria-label': label, autocomplete: 'off',
    oninput: (ev) => {
      let v = ev.target.value.replace(decimal ? /[^\d.]/g : /[^\d]/g, '');
      if (v !== ev.target.value) ev.target.value = v;
      onChange(v === '' ? null : Number(v));
    },
    onfocus: (ev) => { setTimeout(() => ev.target.select(), 0); },
  });
}

function exerciseCard(w, e, i, { live, tpl }) {
  const ex = state.exercises[e.exerciseId] || { name: 'Unknown', type: 'weight' };
  const type = ex.type;
  const allDone = e.sets.length && e.sets.every((s) => s.done);
  const lines = [];
  const tgt = M.targetLabel({ sets: e.targetSets, target: e.target, per: e.per });
  const sub = [tgt, e.note].filter(Boolean).join(' · ');
  if (sub) lines.push(h('div', { class: 'ex-sub' }, sub));
  if (e.rotation && e.rotation.length && tpl) {
    const ri = M.rotationIndex(tpl, e.rotation.length, w.date);
    lines.push(h('div', { class: 'ex-rot' }, h('b', {}, 'This week: '), e.rotation[ri]));
  }
  if (type !== 'check') {
    const last = M.lastEntryFor(state, e.exerciseId, w.date, w.id);
    if (last) lines.push(h('div', { class: 'ex-last' }, `Last (${fmtDate(last.workout.date, { month: 'short', day: 'numeric' })}): ${setsText(type, last.entry.sets.filter((s) => s.done))}`));
    if (live && state.settings.progression && (type === 'weight' || type === 'bodyweight') && M.topOfRange(state, e, w.date, w.id)) {
      lines.push(h('div', { class: 'ex-hint' }, 'Top of range on every set last time: add weight.'));
    }
  }
  const head = h('div', { class: 'ex-head' },
    h('button', { class: 'ex-name', onclick: () => exerciseInfo(e.exerciseId) }, ex.name),
    h('button', { class: 'icon-btn', 'aria-label': 'More', 'data-act': 'menu', onclick: () => exerciseMenu(w, e, i, live) }, '⋯'));
  if (e.skipped) {
    return h('div', { class: 'card ex skipped', 'data-ex': ex.name }, head, h('div', { class: 'ex-sub' }, 'Skipped today'),
      h('button', { class: 'btn small', onclick: () => { e.skipped = false; commit(w, live); renderMain(); } }, 'Unskip'));
  }
  let body;
  if (type === 'check') {
    const s = e.sets[0] || (e.sets[0] = { w: null, r: null, s: null, d: null, done: false });
    return h('div', { class: s.done ? 'card ex check-card complete' : 'card ex check-card', 'data-ex': ex.name },
      h('div', { class: 'ck-row' },
        h('div', { class: 'ck-text' }, h('button', { class: 'ex-name', onclick: () => exerciseInfo(e.exerciseId) }, ex.name), ...lines),
        h('button', { class: s.done ? 'chk on' : 'chk', 'aria-label': `${ex.name} done`, 'data-act': 'check', onclick: () => { s.done = !s.done; commit(w, live); renderMain(); } }, '✓'),
        h('button', { class: 'icon-btn', 'aria-label': 'More', 'data-act': 'menu', onclick: () => exerciseMenu(w, e, i, live) }, '⋯')));
  } else {
    const per = e.per ? ` / ${e.per}` : '';
    const cols = type === 'timed' ? ['sec' + per] : type === 'distance' ? [e.target && e.target.unit ? e.target.unit : 'dist', 'lb'] : [type === 'bodyweight' ? '+lb' : 'lb', 'reps' + per];
    const rows = e.sets.map((s, si) => {
      const fields = [];
      if (type === 'timed') fields.push(numInput(s.s, { placeholder: 'sec', label: `Set ${si + 1} seconds`, onChange: (v) => { s.s = v; commit(w, live); } }));
      else if (type === 'distance') {
        fields.push(numInput(s.d, { decimal: true, placeholder: 'dist', label: `Set ${si + 1} distance`, onChange: (v) => { s.d = v; commit(w, live); } }));
        fields.push(numInput(s.w, { placeholder: 'lb', label: `Set ${si + 1} weight`, onChange: (v) => { s.w = v; commit(w, live); } }));
      } else {
        fields.push(numInput(s.w, { placeholder: type === 'bodyweight' ? '0' : 'lb', label: `Set ${si + 1} weight`, onChange: (v) => { s.w = v; commit(w, live); } }));
        fields.push(numInput(s.r, { placeholder: 'reps', label: `Set ${si + 1} reps`, onChange: (v) => { s.r = v; commit(w, live); } }));
      }
      return h('div', { class: s.done ? 'set-row on' : 'set-row' },
        h('span', { class: 'set-n' }, si + 1), ...fields,
        h('button', { class: s.done ? 'chk on' : 'chk', 'aria-label': `Set ${si + 1} done`, 'data-act': 'set', onclick: () => {
          const row = document.activeElement; if (row && row.blur) row.blur();
          s.done = !s.done; commit(w, live); renderMain();
        } }, '✓'));
    });
    body = h('div', { class: `sets t-${type}` },
      h('div', { class: 'set-row set-head' }, h('span', { class: 'set-n' }, ''), ...cols.map((c) => h('span', { class: 'col' }, c)), h('span', { class: 'chk-sp' }, '')),
      ...rows);
  }
  return h('div', { class: allDone ? 'card ex complete' : 'card ex', 'data-ex': ex.name }, head, ...lines, body);
}

function exerciseInfo(id) {
  const ex = state.exercises[id];
  if (!ex) return;
  const s = sheet(ex.name,
    h('p', { class: 'fine' }, M.TYPES[ex.type]),
    ex.notes ? h('p', { class: 'pre' }, ex.notes) : h('p', { class: 'fine' }, 'No form notes. Add some in Settings › Exercise library.'),
    h('button', { class: 'btn wide', onclick: () => { s.close(); view = { tab: 'progress', exId: id, range: view.range || '3m' }; renderMain(); } }, 'View progress'));
}

function exerciseMenu(w, e, i, live) {
  const ex = state.exercises[e.exerciseId];
  const act = (fn) => () => { fn(); s.close(); commit(w, live); renderMain(); };
  const blank = () => ({ w: null, r: null, s: null, d: null, done: false });
  const btns = [];
  if (ex && ex.type !== 'check') {
    btns.push(h('button', { class: 'btn wide', onclick: act(() => { const l = e.sets[e.sets.length - 1]; e.sets.push(l ? { ...l, done: false } : blank()); }) }, 'Add a set'));
    if (e.sets.length > 1) btns.push(h('button', { class: 'btn wide', onclick: act(() => e.sets.pop()) }, 'Remove last set'));
  }
  if (i > 0) btns.push(h('button', { class: 'btn wide', onclick: act(() => { w.exercises.splice(i, 1); w.exercises.splice(i - 1, 0, e); }) }, 'Move up'));
  if (i < w.exercises.length - 1) btns.push(h('button', { class: 'btn wide', onclick: act(() => { w.exercises.splice(i, 1); w.exercises.splice(i + 1, 0, e); }) }, 'Move down'));
  btns.push(h('button', { class: 'btn wide', onclick: () => { s.close(); pickExercise('Swap for', (id) => {
    const fresh = M.makeEntry(state, { exerciseId: id, sets: e.targetSets, target: e.target, per: e.per, note: e.note }, e.group, w.date);
    w.exercises[i] = fresh; commit(w, live); renderMain();
  }); } }, 'Swap exercise'));
  btns.push(h('button', { class: 'btn wide', onclick: act(() => { e.skipped = !e.skipped; }) }, e.skipped ? 'Unskip' : 'Skip today'));
  btns.push(h('button', { class: 'btn wide danger', onclick: act(() => w.exercises.splice(i, 1)) }, 'Remove from this workout'));
  const s = sheet(ex ? ex.name : 'Exercise', h('p', { class: 'fine' }, live ? 'Changes apply to this workout only. Your template stays the same.' : 'Changes apply to this workout only.'), ...btns);
}

function addExerciseTo(w, live) {
  pickExercise('Add exercise', (id) => {
    w.exercises.push(M.blankEntry(state, id, w.date));
    commit(w, live); renderMain();
  });
}

// Library picker with search and "create new". Recently used first.
function pickExercise(title, onPick) {
  const used = {};
  for (const w of state.workouts) for (const e of w.exercises) if (!used[e.exerciseId] || used[e.exerciseId] < w.date) used[e.exerciseId] = w.date;
  const all = Object.values(state.exercises).filter((x) => !x.archived)
    .sort((a, b) => (used[b.id] || '').localeCompare(used[a.id] || '') || a.name.localeCompare(b.name));
  const list = h('div', { class: 'list' });
  const search = h('input', { type: 'text', class: 'field', placeholder: 'Search or type a new name', autocomplete: 'off', oninput: () => fill() });
  const s = sheet(title, search, list);
  function fill() {
    const q = search.value.trim().toLowerCase();
    const hits = all.filter((x) => !q || x.name.toLowerCase().includes(q));
    const rows = hits.slice(0, 60).map((x) => h('button', { class: 'list-row', onclick: () => { s.close(); onPick(x.id); } },
      h('span', { class: 'lr-title' }, x.name), h('span', { class: 'lr-sub' }, used[x.id] ? `Last ${fmtDate(used[x.id])}` : M.TYPES[x.type])));
    if (q && !all.some((x) => x.name.toLowerCase() === q)) {
      const typeSel = h('select', { class: 'field' }, Object.entries(M.TYPES).map(([k, v]) => h('option', { value: k }, v)));
      rows.unshift(h('div', { class: 'card' }, h('p', {}, `Create "${search.value.trim()}"`), typeSel,
        h('button', { class: 'btn primary wide', onclick: () => {
          const ex = M.addExercise(state, search.value.trim(), typeSel.value); save(); s.close(); onPick(ex.id);
        } }, 'Create and add')));
    }
    list.replaceChildren(...rows);
  }
  fill();
}

async function finishWorkout() {
  const cur = state.current;
  if (!cur) return;
  const any = cur.exercises.some((e) => !e.skipped && e.sets.some((s) => s.done));
  if (!any) { toast('Check off at least one set first.'); return; }
  const unchecked = cur.exercises.filter((e) => !e.skipped && !e.sets.some((s) => s.done)).length;
  if (unchecked && !(await confirmBox('Finish workout?', `${plural(unchecked, 'exercise')} with nothing checked off won't be saved.`, 'Finish'))) return;
  const rec = M.finalize(cur);
  state.workouts.push(rec);
  state.current = null;
  save();
  renderMain();
  showSummary(rec);
  autoBackup();
}

function showSummary(w) {
  const tot = M.workoutTotals(state, w);
  const prs = M.workoutPRs(state, w);
  sheet('Workout saved',
    h('div', { class: 'summary' },
      h('div', { class: 'sum-title' }, w.dayName),
      h('div', { class: 'sum-stats' },
        h('div', {}, h('b', {}, tot.sets), h('span', {}, 'sets')),
        h('div', {}, h('b', {}, Math.round(tot.volume).toLocaleString()), h('span', {}, 'lb volume')),
        h('div', {}, h('b', {}, prs.length), h('span', {}, prs.length === 1 ? 'PR' : 'PRs'))),
      prs.length ? h('div', { class: 'pr-list' }, h('h3', {}, 'New personal records'),
        prs.map((p) => h('div', { class: 'pr-row' }, h('span', { class: 'pr-badge' }, 'PR'), h('b', {}, exName(p.exerciseId)), h('span', { class: 'fine' }, ` ${p.kinds.map((k) => M.PR_LABEL[k]).join(', ')}`)))) : null));
}

async function discardWorkout() {
  if (!(await confirmBox('Discard workout?', 'Everything logged in this workout will be cleared.', 'Discard', true))) return;
  state.current = null;
  save();
  renderMain();
}

// ---------------------------------------------------------------- history tab

function historyTab() {
  if (view.histCopy) return historyEditor();
  const ws = [...state.workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  return h('div', {},
    h('h1', {}, 'History'),
    h('button', { class: 'btn wide', onclick: logPastSheet }, '+ Log a past workout'),
    ws.length ? null : h('p', { class: 'fine center-text' }, 'Finished workouts show up here.'),
    h('div', { class: 'list' }, ws.map((w) => {
      const tot = M.workoutTotals(state, w);
      const prs = M.workoutPRs(state, w);
      return h('button', { class: 'list-row hist-row', onclick: () => { view = { tab: 'history', histId: w.id, histCopy: JSON.parse(JSON.stringify(w)), histNew: false }; renderMain(); } },
        h('span', { class: 'lr-title' }, w.dayName, prs.length ? h('span', { class: 'pr-badge' }, `${prs.length} PR${prs.length > 1 ? 's' : ''}`) : null),
        h('span', { class: 'lr-sub' }, `${fmtDate(w.date)} · ${plural(tot.sets, 'set')}${tot.volume ? ` · ${Math.round(tot.volume).toLocaleString()} lb` : ''}`));
    })));
}

function logPastSheet() {
  const tpl = activeTpl();
  const date = h('input', { type: 'date', class: 'field', value: M.addDays(M.localToday(), -1), max: M.localToday() });
  const daySel = h('select', { class: 'field' },
    tpl ? tpl.days.map((d) => h('option', { value: d.id }, M.dayTitle(d))) : null,
    h('option', { value: '' }, 'Empty workout'));
  const sync = () => { const d = tpl && M.dayForDate(tpl, date.value); if (d) daySel.value = d.id; };
  date.addEventListener('change', sync); sync();
  const s = sheet('Log a past workout', h('label', {}, 'Date'), date, h('label', {}, 'Day'), daySel,
    h('button', { class: 'btn primary wide', onclick: () => {
      if (!date.value) return;
      const day = tpl && tpl.days.find((d) => d.id === daySel.value);
      const w = day ? M.buildWorkout(state, tpl, day, date.value)
        : { id: M.uid('w'), date: date.value, templateId: null, dayId: null, dayName: 'Workout', dayNote: '', exercises: [], note: '', createdAt: new Date().toISOString() };
      w.createdAt = `${date.value}T12:00:00.000Z`;
      s.close();
      view = { tab: 'history', histId: w.id, histCopy: w, histNew: true };
      renderMain();
    } }, 'Start logging'));
}

function historyEditor() {
  const w = view.histCopy;
  const dateIn = h('input', { type: 'date', class: 'field', value: w.date, max: M.localToday(), onchange: (e) => { if (e.target.value) w.date = e.target.value; } });
  const back = () => { view = { tab: 'history' }; renderMain(); };
  return h('div', {},
    h('div', { class: 'title-row' }, h('button', { class: 'link', onclick: back }, '‹ Back'),
      h('button', { class: 'btn primary small', 'data-act': 'save-hist', onclick: () => {
        const rec = M.finalize(w);
        rec.finishedAt = w.finishedAt || rec.finishedAt;
        if (!rec.exercises.length) { toast('Check off at least one set.'); return; }
        const idx = state.workouts.findIndex((x) => x.id === w.id);
        if (idx >= 0) state.workouts[idx] = rec; else state.workouts.push(rec);
        save(); toast('Saved'); back();
      } }, 'Save')),
    h('h1', {}, w.dayName),
    h('label', {}, 'Date'), dateIn,
    workoutBody(w, { live: false }),
    h('button', { class: 'btn wide', onclick: () => addExerciseTo(w, false) }, '+ Add exercise'),
    view.histNew ? null : h('button', { class: 'btn danger wide', onclick: async () => {
      if (!(await confirmBox('Delete this workout?', `${w.dayName} on ${fmtDate(w.date)} will be removed from history and charts.`, 'Delete', true))) return;
      state.workouts = state.workouts.filter((x) => x.id !== w.id); save(); back();
    } }, 'Delete workout'));
}

// ---------------------------------------------------------------- progress tab

function progressTab() {
  if (view.exId && state.exercises[view.exId]) return exercisePage(view.exId);
  const used = {};
  for (const w of state.workouts) for (const e of w.exercises) if (!used[e.exerciseId] || used[e.exerciseId] < w.date) used[e.exerciseId] = w.date;
  const all = Object.values(state.exercises).filter((x) => !x.archived && x.type !== 'check')
    .sort((a, b) => (used[b.id] || '').localeCompare(used[a.id] || '') || a.name.localeCompare(b.name));
  const list = h('div', { class: 'list' });
  const fill = (q) => list.replaceChildren(...all.filter((x) => !q || x.name.toLowerCase().includes(q)).map((x) => h('button', {
    class: 'list-row', onclick: () => { view = { tab: 'progress', exId: x.id, range: view.range || '3m' }; renderMain(); },
  }, h('span', { class: 'lr-title' }, x.name), h('span', { class: 'lr-sub' }, used[x.id] ? `Last ${fmtDate(used[x.id])}` : 'No data yet'))));
  fill('');
  const weeks = M.weeklyCounts(state, M.localToday(), 12);
  return h('div', {},
    h('h1', {}, 'Progress'),
    h('div', { class: 'card' }, h('div', { class: 'ch-title' }, 'Workouts per week, last 12 weeks'),
      barChart(weeks.map((w) => ({ label: fmtDate(w.start, { month: 'numeric', day: 'numeric' }), value: w.count })), { label: 'Workouts per week' })),
    h('h3', {}, 'Exercises'),
    h('input', { type: 'text', class: 'field', placeholder: 'Search exercises', autocomplete: 'off', oninput: (e) => fill(e.target.value.trim().toLowerCase()) }),
    list);
}

function exercisePage(id) {
  const ex = state.exercises[id];
  const range = view.range || '3m';
  const hist = M.exerciseHistory(state, id);
  const today = M.localToday();
  const from = range === '3m' ? M.addDays(today, -91) : range === '1y' ? M.addDays(today, -365) : '0000';
  const pts = hist.filter((x) => x.date >= from);
  const onTap = (p) => {
    const hpt = hist.find((x) => x.workout.id === p.id);
    if (!hpt) return;
    sheet(`${fmtDate(hpt.date)}`, h('p', { class: 'fine' }, hpt.workout.dayName), h('p', {}, setsText(ex.type, hpt.sets)),
      h('button', { class: 'btn wide', onclick: () => { document.querySelector('.sheet-wrap')?.remove(); view = { tab: 'history', histId: hpt.workout.id, histCopy: JSON.parse(JSON.stringify(hpt.workout)), histNew: false }; renderMain(); } }, 'Open workout'));
  };
  const chart = (title, key, unit, round = true) => h('div', { class: 'card' }, h('div', { class: 'ch-title' }, title),
    lineChart(pts.filter((x) => x.stats[key]).map((x) => ({ date: x.date, y: round ? Math.round(x.stats[key] * 10) / 10 : x.stats[key], id: x.workout.id })), { unit, onTap, label: title }));
  const charts = [];
  if (ex.type === 'weight') {
    charts.push(chart('Estimated 1-rep max', 'e1rm', 'lb'), chart('Heaviest set', 'heaviest', 'lb'), chart('Volume per workout', 'volume', 'lb'));
  } else if (ex.type === 'bodyweight') {
    charts.push(chart('Best set (reps)', 'bestReps', 'reps'), chart('Total reps per workout', 'totalReps', 'reps'));
    if (pts.some((x) => x.stats.heaviest)) charts.push(chart('Added weight', 'heaviest', 'lb'));
  } else if (ex.type === 'timed') {
    charts.push(chart('Longest set', 'longest', 'sec'));
  } else if (ex.type === 'distance') {
    charts.push(chart('Longest distance', 'longestDist', ''));
  }
  const recs = M.records(state, id);
  return h('div', {},
    h('button', { class: 'link', onclick: () => { view = { tab: 'progress', range }; renderMain(); } }, '‹ All exercises'),
    h('h1', {}, ex.name),
    h('div', { class: 'seg' }, [['3m', '3 months'], ['1y', '1 year'], ['all', 'All']].map(([k, l]) => h('button', {
      class: range === k ? 'seg-b on' : 'seg-b', onclick: () => { view.range = k; renderMain(); },
    }, l))),
    ...charts,
    h('h3', {}, 'Records'),
    recs.length ? h('div', { class: 'card' }, recs.map((r) => h('div', { class: 'rec-row' }, h('span', {}, r.label), h('b', {}, r.value), h('span', { class: 'fine' }, fmtDate(r.date))))) : h('p', { class: 'fine' }, 'No records yet.'),
    h('h3', {}, 'Recent'),
    h('div', { class: 'card' }, hist.slice(-8).reverse().map((x) => h('div', { class: 'rec-row' }, h('span', { class: 'fine' }, fmtDate(x.date)), h('span', {}, setsText(ex.type, x.sets))))));
}

// ---------------------------------------------------------------- settings tab

function settingsTab() {
  if (view.set === 'templates') return templatesPage();
  if (view.set === 'tpl' && state.templates[view.tplId]) return templateEditor(state.templates[view.tplId]);
  if (view.set === 'day' && state.templates[view.tplId]) return dayEditor(state.templates[view.tplId], view.dayKey);
  if (view.set === 'library') return libraryPage();
  if (view.set === 'import') return importPage();
  const tpl = activeTpl();
  const go = (set) => () => { view = { tab: 'settings', set }; renderMain(); };
  return h('div', {},
    h('h1', {}, 'Settings'),
    h('div', { class: 'list' },
      h('button', { class: 'list-row', onclick: go('templates') }, h('span', { class: 'lr-title' }, 'Templates ›'), h('span', { class: 'lr-sub' }, tpl ? `Active: ${tpl.name}` : 'None active')),
      h('button', { class: 'list-row', onclick: go('library') }, h('span', { class: 'lr-title' }, 'Exercise library ›'), h('span', { class: 'lr-sub' }, plural(Object.keys(state.exercises).length, 'exercise')))),
    h('div', { class: 'card' }, h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: state.settings.progression, onchange: (e) => { state.settings.progression = e.target.checked; save(); } }),
      'Progression hint'), h('p', { class: 'fine' }, 'Shows "add weight" on a card when you hit the top of the rep range on every set last time.')),
    backupSection(),
    h('h3', {}, 'Danger zone'),
    h('button', { class: 'btn danger wide', onclick: eraseAll }, 'Erase everything on this phone'),
    h('p', { class: 'fine about' }, `Workouts ${VERSION}. Data stays on this phone; backups go only to your private GitHub repo or a file you save.`));
}

function templatesPage() {
  const back = () => { view = { tab: 'settings' }; renderMain(); };
  const ts = Object.values(state.templates);
  return h('div', {},
    h('button', { class: 'link', onclick: back }, '‹ Settings'),
    h('h1', {}, 'Templates'),
    h('div', { class: 'list' }, ts.map((t) => h('button', { class: 'list-row', onclick: () => templateActions(t) },
      h('span', { class: 'lr-title' }, t.name, t.id === state.activeTemplateId ? h('span', { class: 'badge' }, 'Active') : null),
      h('span', { class: 'lr-sub' }, `${plural(t.days.length, 'day')}${t.blocks.length ? ` · ${plural(t.blocks.length, 'block')}` : ''}`)))),
    h('button', { class: 'btn wide', onclick: () => { view = { tab: 'settings', set: 'import' }; renderMain(); } }, 'Import from text'),
    h('button', { class: 'btn wide', onclick: () => {
      const t = { id: M.uid('t'), name: 'New program', note: '', start: M.mondayOf(M.localToday()), days: [], blocks: [] };
      state.templates[t.id] = t; if (!state.activeTemplateId) state.activeTemplateId = t.id; save();
      view = { tab: 'settings', set: 'tpl', tplId: t.id }; renderMain();
    } }, 'New blank template'));
}

function templateActions(t) {
  const s = sheet(t.name,
    t.id !== state.activeTemplateId ? h('button', { class: 'btn primary wide', onclick: () => { state.activeTemplateId = t.id; save(); s.close(); renderMain(); toast(`${t.name} is now active`); } }, 'Make active') : h('p', { class: 'fine' }, 'This is the active template.'),
    h('button', { class: 'btn wide', onclick: () => { s.close(); view = { tab: 'settings', set: 'tpl', tplId: t.id }; renderMain(); } }, 'Edit'),
    h('button', { class: 'btn wide', onclick: () => { s.close(); exportSheet(t); } }, 'Export as text'),
    h('button', { class: 'btn wide', onclick: () => {
      const copy = JSON.parse(JSON.stringify(t));
      copy.id = M.uid('t'); copy.name = `${t.name} (copy)`;
      const idMap = {};
      copy.blocks.forEach((b) => { const n = M.uid('b'); idMap[b.id] = n; b.id = n; });
      copy.days.forEach((d) => { d.id = M.uid('d'); d.items.forEach((it) => { if (it.kind === 'block') it.blockId = idMap[it.blockId]; }); });
      state.templates[copy.id] = copy; save(); s.close(); renderMain(); toast('Duplicated');
    } }, 'Duplicate'),
    h('button', { class: 'btn danger wide', onclick: async () => {
      s.close();
      if (!(await confirmBox('Delete template?', `"${t.name}" will be deleted. Your workout history and charts are not affected.`, 'Delete', true))) return;
      delete state.templates[t.id];
      if (state.activeTemplateId === t.id) state.activeTemplateId = Object.keys(state.templates)[0] || null;
      save(); renderMain();
    } }, 'Delete'));
}

function exportSheet(t) {
  const text = M.exportTemplate(state, t);
  const ta = h('textarea', { class: 'field mono', rows: 14, readonly: true }, text);
  sheet('Export template', h('p', { class: 'fine' }, 'Send this to Claude for a rewrite, then paste the result into Import.'), ta,
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn', onclick: async () => { try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { ta.select(); toast('Press and hold to copy'); } } }, 'Copy'),
      navigator.share ? h('button', { class: 'btn', onclick: () => navigator.share({ text }).catch(() => {}) }, 'Share') : null));
}

function templateEditor(t) {
  const back = () => { view = { tab: 'settings', set: 'templates' }; renderMain(); };
  const openDay = (key) => () => { view = { tab: 'settings', set: 'day', tplId: t.id, dayKey: key }; renderMain(); };
  const move = (arr, i, d) => { const [x] = arr.splice(i, 1); arr.splice(i + d, 0, x); save(); renderMain(); };
  return h('div', {},
    h('button', { class: 'link', onclick: back }, '‹ Templates'),
    h('h1', {}, 'Edit template'),
    h('label', {}, 'Name'), h('input', { type: 'text', class: 'field', value: t.name, onchange: (e) => { t.name = e.target.value.trim() || t.name; save(); } }),
    h('label', {}, 'Start date (week 1 of any "~" rotation)'), h('input', { type: 'date', class: 'field', value: t.start || '', onchange: (e) => { t.start = e.target.value || null; save(); } }),
    h('label', {}, 'Program notes'), h('textarea', { class: 'field', rows: 4, onchange: (e) => { t.note = e.target.value.trim(); save(); } }, t.note || ''),
    h('h3', {}, 'Days'),
    h('div', { class: 'list' }, t.days.map((d, i) => h('div', { class: 'list-row edit-row' },
      h('button', { class: 'er-main', onclick: openDay(d.id) }, h('span', { class: 'lr-title' }, M.dayTitle(d) || 'Untitled'), h('span', { class: 'lr-sub' }, plural(d.items.length, 'item'))),
      i > 0 ? h('button', { class: 'icon-btn sm', 'aria-label': 'Move up', onclick: () => move(t.days, i, -1) }, '↑') : null,
      i < t.days.length - 1 ? h('button', { class: 'icon-btn sm', 'aria-label': 'Move down', onclick: () => move(t.days, i, 1) }, '↓') : null))),
    h('button', { class: 'btn wide', onclick: () => { const d = { id: M.uid('d'), name: 'New day', weekday: null, note: '', items: [] }; t.days.push(d); save(); openDay(d.id)(); } }, '+ Add day'),
    h('h3', {}, 'Blocks (routines shared by several days)'),
    h('div', { class: 'list' }, t.blocks.map((b) => h('button', { class: 'list-row', onclick: openDay(b.id) }, h('span', { class: 'lr-title' }, b.name), h('span', { class: 'lr-sub' }, plural(b.items.length, 'exercise'))))),
    h('button', { class: 'btn wide', onclick: () => { const b = { id: M.uid('b'), name: 'New block', note: '', items: [] }; t.blocks.push(b); save(); openDay(b.id)(); } }, '+ Add block'),
    h('button', { class: 'btn wide', onclick: () => exportSheet(t) }, 'Export as text'));
}

function dayEditor(t, key) {
  const isBlock = t.blocks.some((b) => b.id === key);
  const d = (isBlock ? t.blocks : t.days).find((x) => x.id === key);
  const back = () => { view = { tab: 'settings', set: 'tpl', tplId: t.id }; renderMain(); };
  if (!d) { back(); return h('div'); }
  const move = (i, dir) => { const [x] = d.items.splice(i, 1); d.items.splice(i + dir, 0, x); save(); renderMain(); };
  return h('div', {},
    h('button', { class: 'link', onclick: back }, '‹ Template'),
    h('h1', {}, isBlock ? 'Edit block' : 'Edit day'),
    h('label', {}, 'Name'), h('input', { type: 'text', class: 'field', value: d.name, onchange: (e) => { d.name = e.target.value.trim(); save(); } }),
    isBlock ? null : [h('label', {}, 'Weekday'), h('select', { class: 'field', onchange: (e) => { d.weekday = e.target.value === '' ? null : Number(e.target.value); save(); } },
      h('option', { value: '' }, 'None'), M.WEEKDAYS.map((w, i) => h('option', { value: i, selected: d.weekday === i }, w)))],
    h('label', {}, isBlock ? 'Note' : 'Note (warm-up etc.)'), h('textarea', { class: 'field', rows: 2, onchange: (e) => { d.note = e.target.value.trim(); save(); } }, d.note || ''),
    h('h3', {}, 'Items'),
    h('div', { class: 'list' }, d.items.map((it, i) => {
      const label = it.kind === 'block' ? `Routine: ${(t.blocks.find((b) => b.id === it.blockId) || {}).name || '?'}` : exName(it.exerciseId);
      const sub = it.kind === 'block' ? 'Block' : [M.targetLabel(it), it.note].filter(Boolean).join(' · ');
      return h('div', { class: 'list-row edit-row' },
        h('button', { class: 'er-main', onclick: () => (it.kind === 'block' ? null : itemSheet(d, it)) }, h('span', { class: 'lr-title' }, label), h('span', { class: 'lr-sub' }, sub)),
        i > 0 ? h('button', { class: 'icon-btn sm', 'aria-label': 'Move up', onclick: () => move(i, -1) }, '↑') : null,
        i < d.items.length - 1 ? h('button', { class: 'icon-btn sm', 'aria-label': 'Move down', onclick: () => move(i, 1) }, '↓') : null,
        h('button', { class: 'icon-btn sm', 'aria-label': 'Remove', onclick: () => { d.items.splice(i, 1); save(); renderMain(); } }, '✕'));
    })),
    h('button', { class: 'btn wide', onclick: () => pickExercise('Add exercise', (id) => {
      const ex = state.exercises[id];
      const it = { kind: 'ex', exerciseId: id, sets: 3, target: ex.type === 'check' ? { kind: 'text', text: '' } : ex.type === 'timed' ? { kind: 'secs', min: 30, max: 30 } : { kind: 'reps', min: 8, max: 12 }, per: '', note: '' };
      d.items.push(it); save(); renderMain(); itemSheet(d, it);
    }) }, '+ Add exercise'),
    !isBlock && t.blocks.length ? h('button', { class: 'btn wide', onclick: () => {
      const s = sheet('Add a block', ...t.blocks.map((b) => h('button', { class: 'btn wide', onclick: () => { d.items.push({ kind: 'block', blockId: b.id }); save(); s.close(); renderMain(); } }, b.name)));
    } }, '+ Add block') : null,
    h('button', { class: 'btn danger wide', onclick: async () => {
      if (!(await confirmBox(isBlock ? 'Delete block?' : 'Delete day?', `"${d.name}" will be removed from this template. History is not affected.`, 'Delete', true))) return;
      if (isBlock) { t.blocks = t.blocks.filter((b) => b.id !== d.id); t.days.forEach((x) => { x.items = x.items.filter((it) => it.blockId !== d.id); }); } else t.days = t.days.filter((x) => x.id !== d.id);
      save(); back();
    } }, isBlock ? 'Delete block' : 'Delete day'));
}

function itemSheet(d, it) {
  const ex = state.exercises[it.exerciseId];
  const isCheck = ex && ex.type === 'check';
  const spec = h('input', { type: 'text', class: 'field', value: M.specText(it), autocomplete: 'off' });
  const note = h('input', { type: 'text', class: 'field', value: it.note || '', autocomplete: 'off' });
  const rot = h('textarea', { class: 'field', rows: 3 }, (it.rotation || []).join('\n'));
  const err = h('p', { class: 'bad' });
  const s = sheet(ex ? ex.name : 'Exercise',
    h('label', {}, isCheck ? 'Target (free text, e.g. 60-90 min)' : 'Sets × target (e.g. 3 x 8-12, 3 x 6-10/leg, 3 x 20-40s, 3 x AMRAP)'), spec,
    h('label', {}, 'Note'), note,
    h('label', {}, 'Weekly rotation (optional, one line per week)'), rot, err,
    h('button', { class: 'btn primary wide', onclick: () => {
      if (isCheck) { it.target = { kind: 'text', text: spec.value.trim() }; it.sets = 1; it.per = ''; } else {
        const p = M.parseSpec(spec.value);
        if (!p) { err.textContent = 'Use a format like 3 x 8-12 or 3 x 30s.'; return; }
        Object.assign(it, p);
      }
      it.note = note.value.trim();
      const r = rot.value.split('\n').map((x) => x.trim()).filter(Boolean);
      if (r.length) it.rotation = r; else delete it.rotation;
      save(); s.close(); renderMain();
    } }, 'Save'));
}

function importPage() {
  const back = () => { view = { tab: 'settings', set: 'templates' }; renderMain(); };
  const ta = h('textarea', { class: 'field mono', rows: 12, placeholder: '# Program: Name\n\n## Monday: Day name\nExercise | 3 x 8-12' });
  const out = h('div');
  const preview = () => {
    const p = M.parseTemplate(ta.value, state);
    const make = h('input', { type: 'checkbox', checked: true });
    out.replaceChildren(h('div', { class: 'card preview' },
      h('h2', {}, p.template.name),
      h('ul', { class: 'bullets' }, p.template.days.map((d) => h('li', {}, `${M.dayTitle(d) || 'Untitled'}: ${plural(d.items.length, 'item')}`)),
        p.template.blocks.map((b) => h('li', {}, `Block ${b.name}: ${plural(b.items.length, 'exercise')}`))),
      p.newExercises.length ? [h('p', {}, h('b', {}, `New exercises (${p.newExercises.length}). Check these for typos:`)), h('ul', { class: 'bullets new-ex' }, p.newExercises.map((x) => h('li', {}, `${x.name} (${M.TYPES[x.type]})`)))] : h('p', { class: 'fine' }, 'All exercises match your library.'),
      p.warnings.length ? h('div', { class: 'card warn' }, p.warnings.map((w) => h('p', {}, w))) : null,
      h('label', { class: 'check' }, make, 'Make it the active template'),
      h('button', { class: 'btn primary wide', 'data-act': 'import-save', disabled: !p.template.days.length, onclick: () => {
        const fresh = M.parseTemplate(ta.value, state);
        const t = M.applyParsed(state, fresh);
        if (make.checked || !state.activeTemplateId) state.activeTemplateId = t.id;
        save(); toast('Template saved'); view = { tab: 'settings', set: 'templates' }; renderMain();
      } }, 'Save as new template'),
      h('p', { class: 'fine' }, 'Your current templates are kept.')));
  };
  return h('div', {},
    h('button', { class: 'link', onclick: back }, '‹ Templates'),
    h('h1', {}, 'Import template'),
    h('p', { class: 'fine' }, 'Paste a template in the text format. You will see a preview before anything is saved.'),
    ta, h('button', { class: 'btn wide', 'data-act': 'preview', onclick: preview }, 'Preview'), out);
}

function libraryPage() {
  const back = () => { view = { tab: 'settings' }; renderMain(); };
  const all = Object.values(state.exercises).sort((a, b) => a.name.localeCompare(b.name));
  const list = h('div', { class: 'list' });
  const fill = (q) => list.replaceChildren(...all.filter((x) => !q || x.name.toLowerCase().includes(q)).map((x) => h('button', { class: 'list-row', onclick: () => exerciseEdit(x) },
    h('span', { class: 'lr-title' }, x.name, x.archived ? h('span', { class: 'badge muted' }, 'Archived') : null), h('span', { class: 'lr-sub' }, M.TYPES[x.type]))));
  fill('');
  return h('div', {},
    h('button', { class: 'link', onclick: back }, '‹ Settings'),
    h('h1', {}, 'Exercise library'),
    h('button', { class: 'btn wide', onclick: () => pickExercise('New exercise', (id) => exerciseEdit(state.exercises[id])) }, '+ Add exercise'),
    h('input', { type: 'text', class: 'field', placeholder: 'Search', autocomplete: 'off', oninput: (e) => fill(e.target.value.trim().toLowerCase()) }),
    list);
}

function exerciseEdit(x) {
  const name = h('input', { type: 'text', class: 'field', value: x.name });
  const type = h('select', { class: 'field' }, Object.entries(M.TYPES).map(([k, v]) => h('option', { value: k, selected: x.type === k }, v)));
  const notes = h('textarea', { class: 'field', rows: 4 }, x.notes || '');
  const arch = h('input', { type: 'checkbox', checked: !!x.archived });
  const others = Object.values(state.exercises).filter((o) => o.id !== x.id).sort((a, b) => a.name.localeCompare(b.name));
  const into = h('select', { class: 'field' }, h('option', { value: '' }, 'Merge into…'), others.map((o) => h('option', { value: o.id }, o.name)));
  const err = h('p', { class: 'bad' });
  const s = sheet('Edit exercise',
    h('label', {}, 'Name'), name, h('label', {}, 'Type'), type, h('label', {}, 'Form notes'), notes,
    h('label', { class: 'check' }, arch, 'Archived (hidden from pickers, history kept)'), err,
    h('button', { class: 'btn primary wide', onclick: () => {
      const n = name.value.trim();
      if (!n) { err.textContent = 'Name is required.'; return; }
      const clash = M.findExercise(state, n);
      if (clash && clash.id !== x.id) { err.textContent = `"${clash.name}" already exists. Use Merge instead.`; return; }
      x.name = n; x.type = type.value; x.notes = notes.value.trim(); x.archived = arch.checked;
      save(); s.close(); renderMain();
    } }, 'Save'),
    h('h3', {}, 'Merge duplicate'),
    h('p', { class: 'fine' }, 'Moves all of this exercise\'s history into another exercise, then removes this one.'),
    into,
    h('button', { class: 'btn wide', onclick: async () => {
      if (!into.value) return;
      const target = state.exercises[into.value];
      if (!(await confirmBox('Merge exercises?', `All history for "${x.name}" moves to "${target.name}", and "${x.name}" is removed.`, 'Merge', true))) return;
      M.mergeExercises(state, x.id, target.id); save(); s.close(); renderMain(); toast('Merged');
    } }, 'Merge'));
}

async function eraseAll() {
  if (!(await confirmBox('Erase everything?', 'All workouts, templates and settings on this phone will be deleted. Backups in GitHub are not touched.', 'Erase', true))) return;
  localStorage.removeItem(KEY);
  state = null;
  view = { tab: 'workout' };
  showWelcome();
}

// ---------------------------------------------------------------- backups

function backupText() {
  const data = JSON.parse(JSON.stringify(state));
  delete data.backup;
  return JSON.stringify({ app: 'workout-tracker', exportedAt: new Date().toISOString(), ...data }, null, 2);
}

function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('That file is not a readable backup.'); }
  if (obj.app !== 'workout-tracker') throw new Error('This is not a Workout Tracker backup.');
  const exportedAt = obj.exportedAt;
  delete obj.app; delete obj.exportedAt;
  return { data: M.migrate(obj), exportedAt };
}

async function restoreFrom(text, replacing) {
  const { data, exportedAt } = parseBackup(text);
  const msg = `Backup from ${exportedAt ? new Date(exportedAt).toLocaleString('en-US') : 'unknown date'} with ${plural(data.workouts.length, 'workout')}.`;
  if (!(await confirmBox('Restore this backup?', replacing ? `${msg} It replaces everything on this phone.` : msg, 'Restore', replacing))) return false;
  if (state) data.backup = state.backup;
  state = data;
  save();
  view = { tab: 'workout' };
  renderMain();
  toast('Restored');
  return true;
}

async function runGithub(manual) {
  const cfg = state.backup.github;
  if (!cfg) return;
  if (manual) toast('Backing up…');
  try {
    await B.githubUpload(cfg, backupText());
    state.backup.last.github = new Date().toISOString();
    state.backup.error = null;
    save();
    if (manual) toast('Backed up to GitHub');
  } catch (e) {
    state.backup.error = errText(e);
    save();
    if (manual) toast(state.backup.error, 5000);
  }
  if (document.querySelector('nav.tabs') && !document.querySelector('.sheet-wrap')) renderMain();
}

async function autoBackup() {
  if (!state || !state.backup.github || !navigator.onLine) return;
  const last = state.backup.last.github;
  if (last && M.localToday(new Date(last)) === M.localToday()) return;
  if (Date.now() - lastAutoAttempt < 3600 * 1000) return;
  lastAutoAttempt = Date.now();
  await runGithub(false);
}

async function saveBackupFile() {
  const text = backupText();
  const name = `workouts-${M.localToday()}.json`;
  const file = new File([text], name, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file] });
    else {
      const url = URL.createObjectURL(file);
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    state.backup.last.manual = new Date().toISOString();
    save(); toast('Backup file saved'); renderMain();
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast('Could not save the file.');
  }
}

function githubFields(cfg = {}) {
  const owner = h('input', { type: 'text', class: 'field', value: cfg.owner || 'brettdooley', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const repo = h('input', { type: 'text', class: 'field', value: cfg.repo || 'private-backup', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
  const token = h('input', { type: 'password', class: 'field', value: cfg.token || '', placeholder: 'github_pat_…', autocomplete: 'off' });
  return {
    nodes: [h('label', {}, 'GitHub username'), owner, h('label', {}, 'Private backup repo'), repo, h('label', {}, 'Fine-grained token (the one from the Cycle setup)'), token],
    read: () => ({ owner: owner.value.trim(), repo: repo.value.trim(), token: token.value.trim() }),
  };
}

function backupSection() {
  const bk = state.backup;
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden-file', onchange: async (e) => {
    try { const t = await readFile(e.target); await restoreFrom(t, true); } catch (err) { toast(errText(err), 5000); }
    e.target.value = '';
  } });
  const common = [
    h('button', { class: 'btn wide', onclick: saveBackupFile }, 'Save backup file'),
    h('label', { class: 'btn wide file-btn' }, 'Restore from file', file),
  ];
  if (!bk.github) {
    const f = githubFields();
    const err = h('p', { class: 'bad' });
    return h('div', {}, h('h3', {}, 'Backups'),
      h('div', { class: 'card' }, h('p', {}, `GitHub backup saves ${B.BACKUP_FILE} to your private repo once a day. It never touches the Cycle app's file.`), ...f.nodes, err,
        h('button', { class: 'btn primary wide', 'data-act': 'connect', onclick: async (e) => {
          const cfg = f.read();
          if (!cfg.owner || !cfg.repo || !cfg.token) { err.textContent = 'Fill in all three.'; return; }
          e.target.disabled = true; err.textContent = 'Checking…';
          try { await B.githubTest(cfg); bk.github = cfg; bk.error = null; save(); await runGithub(true); renderMain(); } catch (x) { err.textContent = errText(x); e.target.disabled = false; }
        } }, 'Connect GitHub')),
      h('p', { class: 'fine' }, `Last file backup: ${agoIso(bk.last.manual)}`), ...common);
  }
  return h('div', {}, h('h3', {}, 'Backups'),
    h('div', { class: 'card' },
      h('p', {}, h('b', {}, 'GitHub: '), `${bk.github.owner}/${bk.github.repo}/${B.BACKUP_FILE}`),
      h('p', { class: 'fine', 'data-last': 'github' }, `Last backup: ${agoIso(bk.last.github)}`),
      bk.error ? h('p', { class: 'bad' }, bk.error) : null,
      h('button', { class: 'btn primary wide', 'data-act': 'backup-now', onclick: () => runGithub(true) }, 'Back up now'),
      h('button', { class: 'btn wide', 'data-act': 'restore-gh', onclick: async () => {
        try { toast('Downloading…'); const t = await B.githubDownload(bk.github); await restoreFrom(t, true); } catch (e) { toast(errText(e), 5000); }
      } }, 'Restore from GitHub'),
      h('button', { class: 'btn wide', onclick: () => {
        const f = githubFields(bk.github);
        const err = h('p', { class: 'bad' });
        const s = sheet('GitHub backup', ...f.nodes, err,
          h('button', { class: 'btn primary wide', onclick: async () => {
            const cfg = f.read(); err.textContent = 'Checking…';
            try { await B.githubTest(cfg); bk.github = cfg; bk.error = null; save(); s.close(); renderMain(); toast('Saved'); } catch (x) { err.textContent = errText(x); }
          } }, 'Save'),
          h('button', { class: 'btn danger wide', onclick: () => { bk.github = null; bk.error = null; save(); s.close(); renderMain(); } }, 'Disconnect'));
      } }, 'Change token or repo')),
    h('p', { class: 'fine' }, `Last file backup: ${agoIso(bk.last.manual)}`), ...common);
}

// ---------------------------------------------------------------- welcome

function showWelcome() {
  const file = h('input', { type: 'file', accept: 'application/json,.json', class: 'hidden-file', onchange: async (e) => {
    try { const t = await readFile(e.target); const ok = await restoreFrom(t, false); if (!ok) state = null; } catch (err) { toast(errText(err), 5000); }
    e.target.value = '';
  } });
  app.replaceChildren(h('main', { class: 'center welcome' },
    h('div', { class: 'logo' }, h('img', { src: 'icons/icon-180.png', alt: '' })),
    h('h1', {}, 'Workouts'),
    h('p', { class: 'lead' }, 'Open the app, do the work, log the numbers.'),
    isStandalone() ? null : h('div', { class: 'card warn' }, h('p', {}, h('b', {}, 'Add this to your Home Screen first. '), 'In Safari tap Share, then Add to Home Screen, and open it from there. Data saved in a Safari tab is kept separately and can be wiped by iOS.')),
    h('button', { class: 'btn primary wide', 'data-act': 'start', onclick: () => { state = seedState(); save(); try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* ignore */ } view = { tab: 'workout' }; renderMain(); } }, 'Start with my routine'),
    h('button', { class: 'btn wide', onclick: () => {
      const f = githubFields();
      const err = h('p', { class: 'bad' });
      const s = sheet('Restore from GitHub', ...f.nodes, err, h('button', { class: 'btn primary wide', onclick: async () => {
        const cfg = f.read(); err.textContent = 'Downloading…';
        try {
          await B.githubTest(cfg);
          const t = await B.githubDownload(cfg);
          s.close();
          const ok = await restoreFrom(t, false);
          if (ok) { state.backup.github = cfg; save(); renderMain(); } else state = null;
        } catch (x) { err.textContent = errText(x); }
      } }, 'Restore'));
    } }, 'Restore from GitHub'),
    h('label', { class: 'btn wide file-btn' }, 'Restore from file', file)));
}

// ---------------------------------------------------------------- startup

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (state) {
    const editing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (!editing && !document.querySelector('.sheet-wrap') && document.querySelector('nav.tabs')) renderMain();
    else updateWake();
    autoBackup();
  }
});
window.addEventListener('online', () => autoBackup());

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === '127.0.0.1' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

state = load();
if (state && upgradeSeed(state)) save();
if (state) {
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch { /* ignore */ }
  renderMain();
  autoBackup();
} else showWelcome();

// For automated tests only.
window.__wt = { get state() { return state; }, M };
