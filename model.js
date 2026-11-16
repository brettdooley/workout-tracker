// Data model, template text format, and progress math. No UI code here.

export const DATA_VERSION = 1;
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const TYPES = {
  weight: 'Weight × reps',
  bodyweight: 'Bodyweight reps (optional added weight)',
  timed: 'Timed (seconds)',
  distance: 'Distance',
  check: 'Check off (done / not done)',
};
const TYPE_TAG = { bodyweight: 'bodyweight', timed: 'timed', distance: 'distance', check: 'check' };
const E1RM_MAX_REPS = 12;

// ---------------------------------------------------------------- basics

export function uid(prefix = 'x') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
const pad2 = (n) => String(n).padStart(2, '0');
export function localToday(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
export function dateObj(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function weekdayOf(str) { return dateObj(str).getDay(); }
export function addDays(str, n) { const d = dateObj(str); d.setDate(d.getDate() + n); return localToday(d); }
export function mondayOf(str) { const wd = weekdayOf(str); return addDays(str, -((wd + 6) % 7)); }
export function daysBetween(a, b) { return Math.round((dateObj(b) - dateObj(a)) / 86400000); }

export function emptyState() {
  return {
    version: DATA_VERSION,
    exercises: {},
    templates: {},
    activeTemplateId: null,
    workouts: [],
    current: null,
    settings: { progression: true },
    backup: { github: null, last: { github: null, manual: null }, error: null },
  };
}

export function migrate(data) {
  if (!data || typeof data !== 'object' || typeof data.version !== 'number') throw new Error('This is not a Workout Tracker backup.');
  if (data.version > DATA_VERSION) throw new Error('This backup is from a newer version of the app. Update the app first.');
  const s = { ...emptyState(), ...data };
  s.settings = { ...emptyState().settings, ...(data.settings || {}) };
  s.backup = { ...emptyState().backup, ...(data.backup || {}) };
  s.backup.last = { ...emptyState().backup.last, ...((data.backup && data.backup.last) || {}) };
  s.workouts = Array.isArray(s.workouts) ? s.workouts : [];
  s.version = DATA_VERSION;
  return s;
}

// ---------------------------------------------------------------- exercise library

export function findExercise(state, name) {
  const key = name.trim().toLowerCase();
  return Object.values(state.exercises).find((e) => e.name.toLowerCase() === key) || null;
}

export function addExercise(state, name, type = 'weight', notes = '') {
  const ex = { id: uid('e'), name: name.trim(), type, notes, archived: false };
  state.exercises[ex.id] = ex;
  return ex;
}

// Moves all history and template references from one exercise to another, then removes the first.
export function mergeExercises(state, fromId, intoId) {
  if (fromId === intoId) return;
  const fix = (it) => { if (it.exerciseId === fromId) it.exerciseId = intoId; };
  for (const t of Object.values(state.templates)) {
    for (const d of [...t.days, ...t.blocks]) d.items.forEach(fix);
  }
  for (const w of state.workouts) w.exercises.forEach(fix);
  if (state.current) state.current.exercises.forEach(fix);
  delete state.exercises[fromId];
}

// ---------------------------------------------------------------- template text format

// "3 x 6-10/leg", "3 x 20-40s", "1 x 30s/side", "3 x AMRAP", "3 x 40yd", "2 x 5"
export function parseSpec(text) {
  const t = text.trim();
  const m = t.match(/^(\d+)\s*[x×]\s*(.+)$/i);
  let sets = 1;
  let rest = t;
  if (m) { sets = Number(m[1]); rest = m[2].trim(); }
  let per = '';
  const pm = rest.match(/\s*\/\s*(leg|side|arm)$/i);
  if (pm) { per = pm[1].toLowerCase(); rest = rest.slice(0, pm.index).trim(); }
  if (/^amrap$/i.test(rest)) return { sets, target: { kind: 'amrap' }, per };
  const r = rest.match(/^(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?\s*([a-z]*)$/i);
  if (!r) return null;
  const min = Number(r[1]);
  const max = r[2] !== undefined ? Number(r[2]) : min;
  const unit = (r[3] || '').toLowerCase();
  if (!unit) return { sets, target: { kind: 'reps', min, max }, per };
  if (['s', 'sec', 'secs'].includes(unit)) return { sets, target: { kind: 'secs', min, max }, per };
  if (['min', 'mins'].includes(unit)) return { sets, target: { kind: 'secs', min: min * 60, max: max * 60, unit: 'min' }, per };
  if (['yd', 'ft', 'm', 'mi', 'km'].includes(unit)) return { sets, target: { kind: 'dist', min, max, unit }, per };
  return null;
}

const rng = (a, b) => (a === b ? `${a}` : `${a}-${b}`);
export function specText(item) {
  const t = item.target || {};
  let s;
  if (t.kind === 'amrap') s = 'AMRAP';
  else if (t.kind === 'reps') s = rng(t.min, t.max);
  else if (t.kind === 'secs') s = t.unit === 'min' ? `${rng(t.min / 60, t.max / 60)}min` : `${rng(t.min, t.max)}s`;
  else if (t.kind === 'dist') s = `${rng(t.min, t.max)}${t.unit}`;
  else return t.text || '';
  return `${item.sets} x ${s}${item.per ? '/' + item.per : ''}`;
}

// Pretty version for cards: "3 × 6–10 / leg"
export function targetLabel(item) {
  const t = item.target || {};
  if (t.kind === 'text') return t.text || '';
  const d = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
  let s;
  if (t.kind === 'amrap') s = 'max reps';
  else if (t.kind === 'reps') s = d(t.min, t.max);
  else if (t.kind === 'secs') s = t.unit === 'min' ? `${d(t.min / 60, t.max / 60)} min` : `${d(t.min, t.max)} sec`;
  else if (t.kind === 'dist') s = `${d(t.min, t.max)} ${t.unit}`;
  else s = '';
  return `${item.sets} × ${s}${item.per ? ` / ${item.per}` : ''}`;
}

const WD_RE = /^(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:[a-z]*day)?\b\s*[:\-–]?\s*(.*)$/i;
const WD_PREFIX = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function blockShort(name) { return name.replace(/\s*\(.*\)\s*$/, '').trim(); }

// Returns { template, newExercises, warnings }. Does not change state; call applyParsed to save.
export function parseTemplate(text, state) {
  const warnings = [];
  const lines = text.replace(/\r/g, '').split('\n');
  const tpl = { id: uid('t'), name: 'Untitled program', note: '', start: null, days: [], blocks: [] };
  const newEx = new Map(); // lower name -> {name, type}
  const typeNotes = [];
  let cur = null; // current day or block
  let lastItem = null;
  let noteTarget = tpl;
  const includes = [];

  lines.forEach((raw, i) => {
    const line = raw.replace(/\\\[/g, '[').replace(/\\\]/g, ']').trim();
    if (!line) return;
    if (/^#\s/.test(line) && !/^##/.test(line)) {
      tpl.name = line.replace(/^#\s*/, '').replace(/^program\s*:\s*/i, '').trim() || tpl.name;
      noteTarget = tpl; lastItem = null; return;
    }
    if (/^start\s*:/i.test(line) && !cur) {
      const d = line.replace(/^start\s*:\s*/i, '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) tpl.start = d; else warnings.push(`Line ${i + 1}: start date must look like 2026-11-16.`);
      return;
    }
    if (/^##\s/.test(line)) {
      const head = line.replace(/^##\s*/, '').trim();
      lastItem = null;
      const bm = head.match(/^block\s*:\s*(.+)$/i);
      if (bm) {
        cur = { id: uid('b'), name: bm[1].trim(), note: '', items: [] };
        tpl.blocks.push(cur);
      } else {
        const wm = head.match(WD_RE);
        let weekday = null; let name = head;
        if (wm) { weekday = WD_PREFIX.indexOf(wm[1].slice(0, 3).toLowerCase()); name = wm[2].trim(); }
        cur = { id: uid('d'), name, weekday, note: '', items: [] };
        tpl.days.push(cur);
      }
      noteTarget = cur; return;
    }
    if (line.startsWith('>')) {
      const n = line.replace(/^>\s?/, '');
      noteTarget.note = noteTarget.note ? `${noteTarget.note}\n${n}` : n;
      return;
    }
    if (!cur) { warnings.push(`Line ${i + 1} is outside any day and was ignored.`); return; }
    if (line.startsWith('+')) {
      const ref = line.replace(/^\+\s*/, '').trim();
      const item = { kind: 'block', ref };
      cur.items.push(item); includes.push({ item, line: i + 1 }); lastItem = null; return;
    }
    if (line.startsWith('~')) {
      if (!lastItem) { warnings.push(`Line ${i + 1}: a "~" line must follow an exercise.`); return; }
      lastItem.rotation = lastItem.rotation || [];
      lastItem.rotation.push(line.replace(/^~\s*/, ''));
      return;
    }
    // exercise line
    const parts = line.split('|').map((p) => p.trim());
    const tags = [];
    const name = parts[0].replace(/\[([^\]]*)\]/g, (_, g) => { tags.push(...g.split(/[,\s]+/).filter(Boolean).map((x) => x.toLowerCase())); return ''; }).replace(/\s+/g, ' ').trim();
    if (!name) { warnings.push(`Line ${i + 1} has no exercise name.`); return; }
    let type = 'weight';
    for (const t of tags) {
      if (TYPE_TAG[t]) type = TYPE_TAG[t];
      else if (t !== 'lower') warnings.push(`Line ${i + 1}: unknown tag [${t}] ignored.`);
    }
    const item = { kind: 'ex', name, type, sets: 1, target: { kind: 'text', text: '' }, per: '', note: '' };
    let idx = 1;
    if (parts.length > 1 && parts[1] === '') idx = 2;
    else if (parts.length > 1 && !/^rest\b/i.test(parts[1])) {
      if (type === 'check') {
        item.target = { kind: 'text', text: parts[1] };
        idx = 2;
      } else {
        const spec = parseSpec(parts[1]);
        if (spec) { Object.assign(item, spec); idx = 2; } else warnings.push(`Line ${i + 1}: couldn't read "${parts[1]}" as sets × reps; kept it as a note.`);
      }
    }
    const notes = parts.slice(idx).filter((p) => !/^rest\s+\d/i.test(p));
    item.note = notes.join(' | ');
    const ex = state ? findExercise(state, name) : null;
    if (ex) {
      item.exerciseId = ex.id;
      if (ex.type !== type) typeNotes.push(`${ex.name} is "${TYPES[ex.type]}" in your library; that type is kept.`);
      item.type = ex.type;
    } else {
      const key = name.toLowerCase();
      if (!newEx.has(key)) newEx.set(key, { name, type });
    }
    cur.items.push(item); lastItem = item;
  });

  for (const { item, line } of includes) {
    const key = item.ref.toLowerCase();
    const b = tpl.blocks.find((x) => x.name.toLowerCase() === key || blockShort(x.name).toLowerCase() === key);
    if (b) { item.blockId = b.id; delete item.ref; } else warnings.push(`Line ${line}: no block named "${item.ref}".`);
  }
  if (!tpl.days.length) warnings.push('No days found. Each day starts with a "##" line.');
  return { template: tpl, newExercises: [...newEx.values()], warnings: [...warnings, ...typeNotes] };
}

// Adds the parsed template (and any new exercises) to state. Returns the template.
export function applyParsed(state, parsed) {
  const tpl = parsed.template;
  for (const d of [...tpl.days, ...tpl.blocks]) {
    d.items = d.items.filter((it) => it.kind !== 'block' || it.blockId);
    for (const it of d.items) {
      if (it.kind !== 'ex') continue;
      if (!it.exerciseId) {
        const ex = findExercise(state, it.name) || addExercise(state, it.name, it.type);
        it.exerciseId = ex.id;
      }
      delete it.name; delete it.type;
    }
  }
  state.templates[tpl.id] = tpl;
  return tpl;
}

export function exportTemplate(state, tpl) {
  const out = [`# Program: ${tpl.name}`];
  if (tpl.start) out.push(`Start: ${tpl.start}`);
  if (tpl.note) tpl.note.split('\n').forEach((n) => out.push(`> ${n}`));
  const items = (list) => {
    for (const it of list) {
      if (it.kind === 'block') {
        const b = tpl.blocks.find((x) => x.id === it.blockId);
        if (b) out.push(`+ ${blockShort(b.name)}`);
        continue;
      }
      const ex = state.exercises[it.exerciseId];
      if (!ex) continue;
      const tag = TYPE_TAG[ex.type] ? ` [${TYPE_TAG[ex.type]}]` : '';
      const fields = [`${ex.name}${tag}`];
      const spec = specText(it);
      if (spec || it.note) fields.push(spec);
      if (it.note) fields.push(it.note);
      out.push(fields.join(' | '));
      (it.rotation || []).forEach((r) => out.push(`~ ${r}`));
    }
  };
  for (const d of tpl.days) {
    out.push('');
    out.push(`## ${d.weekday !== null && d.weekday !== undefined ? WEEKDAYS[d.weekday] + (d.name ? `: ${d.name}` : '') : d.name}`);
    if (d.note) d.note.split('\n').forEach((n) => out.push(`> ${n}`));
    items(d.items);
  }
  for (const b of tpl.blocks) {
    out.push('');
    out.push(`## Block: ${b.name}`);
    if (b.note) b.note.split('\n').forEach((n) => out.push(`> ${n}`));
    items(b.items);
  }
  return out.join('\n') + '\n';
}

export function dayTitle(d) {
  if (d.weekday === null || d.weekday === undefined) return d.name;
  return d.name ? `${WEEKDAYS[d.weekday]} · ${d.name}` : WEEKDAYS[d.weekday];
}

// ---------------------------------------------------------------- workouts

export function lastEntryFor(state, exerciseId, beforeDate = '9999-99-99', excludeId = null) {
  const list = state.workouts
    .filter((w) => w.id !== excludeId && w.date <= beforeDate)
    .sort((a, b) => (a.date === b.date ? (a.createdAt || '') .localeCompare(b.createdAt || '') : a.date.localeCompare(b.date)));
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    const e = w.exercises.find((x) => x.exerciseId === exerciseId && x.sets.some((s) => s.done));
    if (e) return { workout: w, entry: e };
  }
  return null;
}

function emptySet() { return { w: null, r: null, s: null, d: null, done: false }; }

export function makeEntry(state, item, group, date) {
  const ex = state.exercises[item.exerciseId];
  const entry = {
    uid: uid('n'), exerciseId: item.exerciseId, targetSets: item.sets || 1,
    target: item.target, per: item.per || '', note: item.note || '', rotation: item.rotation || null,
    group: group || null, skipped: false, sets: [],
  };
  const n = ex && ex.type === 'check' ? 1 : entry.targetSets;
  const last = lastEntryFor(state, item.exerciseId, date);
  const lastSets = last ? last.entry.sets.filter((s) => s.done) : [];
  for (let i = 0; i < n; i++) {
    const s = emptySet();
    const ls = lastSets[i] || lastSets[lastSets.length - 1];
    const t = item.target || {};
    if (ls) { s.w = ls.w; s.r = ls.r; s.s = ls.s; s.d = ls.d; }
    else {
      if (t.kind === 'reps' && t.min === t.max) s.r = t.min;
      if (t.kind === 'secs' && t.min === t.max) s.s = t.min;
    }
    entry.sets.push(s);
  }
  return entry;
}

export function buildWorkout(state, tpl, day, date) {
  const w = {
    id: uid('w'), date, templateId: tpl.id, dayId: day.id, dayName: dayTitle(day),
    dayNote: day.note || '', exercises: [], note: '', touched: false, createdAt: new Date().toISOString(),
  };
  for (const it of day.items) {
    if (it.kind === 'block') {
      const b = tpl.blocks.find((x) => x.id === it.blockId);
      if (!b) continue;
      for (const bi of b.items) if (bi.kind === 'ex' && state.exercises[bi.exerciseId]) w.exercises.push(makeEntry(state, bi, b.name, date));
    } else if (state.exercises[it.exerciseId]) {
      w.exercises.push(makeEntry(state, it, null, date));
    }
  }
  return w;
}

export function blankEntry(state, exerciseId, date) {
  return makeEntry(state, { exerciseId, sets: 3, target: { kind: 'text', text: '' }, per: '' }, null, date);
}

export function dayForDate(tpl, date) {
  if (!tpl) return null;
  const wd = weekdayOf(date);
  return tpl.days.find((d) => d.weekday === wd) || null;
}

// Which line of a "~" rotation applies this week, counting weeks from the program's start date.
export function rotationIndex(tpl, len, date) {
  if (!len) return -1;
  const start = mondayOf(tpl.start || date);
  const weeks = Math.floor(daysBetween(start, mondayOf(date)) / 7);
  return ((weeks % len) + len) % len;
}

// The finished-workout record: keeps only exercises with at least one completed set.
export function finalize(w) {
  const out = JSON.parse(JSON.stringify(w));
  out.exercises = out.exercises.filter((e) => !e.skipped && e.sets.some((s) => s.done));
  out.exercises.forEach((e) => { e.sets = e.sets.filter((s) => s.done); });
  delete out.touched;
  out.finishedAt = new Date().toISOString();
  return out;
}

// ---------------------------------------------------------------- stats & PRs

export function e1rm(w, r) {
  if (!w || !r || r > E1RM_MAX_REPS) return null;
  return w * (1 + r / 30);
}

// Stats for one exercise inside one workout (all its done sets combined).
export function entryStats(type, sets, per) {
  const done = sets.filter((s) => s.done);
  const mult = per ? 2 : 1;
  const st = { sets: done.length };
  if (type === 'weight' || type === 'bodyweight') {
    let best = null; let heavy = null; let vol = 0; let bestReps = 0; let total = 0; const repsAt = {};
    for (const s of done) {
      const w = s.w || 0; const r = s.r || 0;
      const e = e1rm(w, r); if (e !== null && (best === null || e > best)) best = e;
      if (w > 0 && (heavy === null || w > heavy)) heavy = w;
      vol += w * r * mult; total += r * mult;
      if (r > bestReps) bestReps = r;
      if (r > 0) repsAt[w] = Math.max(repsAt[w] || 0, r);
    }
    Object.assign(st, { e1rm: best, heaviest: heavy, volume: vol, bestReps, totalReps: total, repsAt });
  } else if (type === 'timed') {
    st.longest = Math.max(0, ...done.map((s) => s.s || 0));
    st.totalSecs = done.reduce((a, s) => a + (s.s || 0), 0) * mult;
  } else if (type === 'distance') {
    st.longestDist = Math.max(0, ...done.map((s) => s.d || 0));
    st.heaviest = Math.max(0, ...done.map((s) => s.w || 0)) || null;
  }
  return st;
}

function sortedWorkouts(state) {
  return [...state.workouts].sort((a, b) => (a.date === b.date ? (a.createdAt || '').localeCompare(b.createdAt || '') : a.date.localeCompare(b.date)));
}

// One point per workout for an exercise, oldest first.
export function exerciseHistory(state, exerciseId) {
  const ex = state.exercises[exerciseId];
  if (!ex) return [];
  const out = [];
  for (const w of sortedWorkouts(state)) {
    const es = w.exercises.filter((e) => e.exerciseId === exerciseId);
    if (!es.length) continue;
    const sets = es.flatMap((e) => e.sets);
    if (!sets.some((s) => s.done)) continue;
    out.push({ workout: w, date: w.date, sets: sets.filter((s) => s.done), per: es[0].per, stats: entryStats(ex.type, sets, es[0].per) });
  }
  return out;
}

const PR_LABEL = { e1rm: 'Est. 1RM', heaviest: 'Heaviest', reps: 'Most reps', volume: 'Volume', longest: 'Longest', distance: 'Distance' };
export { PR_LABEL };

// PRs set in workout `w` compared with every earlier workout. First-ever performances are not PRs.
export function workoutPRs(state, w) {
  const all = sortedWorkouts(state).filter((x) => x.id !== w.id);
  const prior = all.filter((x) => x.date < w.date || (x.date === w.date && (x.createdAt || '') < (w.createdAt || '')));
  const out = [];
  const ids = [...new Set(w.exercises.map((e) => e.exerciseId))];
  for (const id of ids) {
    const ex = state.exercises[id];
    if (!ex || ex.type === 'check') continue;
    const es = w.exercises.filter((e) => e.exerciseId === id);
    const now = entryStats(ex.type, es.flatMap((e) => e.sets), es[0].per);
    if (!now.sets) continue;
    const before = prior.flatMap((x) => {
      const pe = x.exercises.filter((e) => e.exerciseId === id);
      if (!pe.length) return [];
      const st = entryStats(ex.type, pe.flatMap((e) => e.sets), pe[0].per);
      return st.sets ? [st] : [];
    });
    if (!before.length) continue;
    const max = (k) => Math.max(...before.map((b) => b[k] || 0));
    const kinds = [];
    if (ex.type === 'weight' || ex.type === 'bodyweight') {
      if (now.e1rm && now.e1rm > max('e1rm') + 1e-9) kinds.push('e1rm');
      if (now.heaviest && now.heaviest > max('heaviest')) kinds.push('heaviest');
      let repsPR = false;
      for (const [wt, r] of Object.entries(now.repsAt)) {
        const prev = before.map((b) => b.repsAt[wt]).filter((x) => x !== undefined);
        if (prev.length && r > Math.max(...prev)) repsPR = true;
      }
      if (repsPR) kinds.push('reps');
      if (ex.type === 'weight' && now.volume > max('volume')) kinds.push('volume');
      if (ex.type === 'bodyweight' && now.totalReps > max('totalReps')) kinds.push('volume');
    } else if (ex.type === 'timed') {
      if (now.longest > max('longest')) kinds.push('longest');
    } else if (ex.type === 'distance') {
      if (now.longestDist > max('longestDist')) kinds.push('distance');
    }
    if (kinds.length) out.push({ exerciseId: id, kinds });
  }
  return out;
}

// Current bests with the date each was set.
export function records(state, exerciseId) {
  const ex = state.exercises[exerciseId];
  const hist = exerciseHistory(state, exerciseId);
  const rec = [];
  const best = (key, label, fmtv) => {
    let top = null;
    for (const h of hist) { const v = h.stats[key]; if (v && (!top || v > top.v)) top = { v, date: h.date }; }
    if (top) rec.push({ label, value: fmtv(top.v), date: top.date });
  };
  if (!ex) return rec;
  if (ex.type === 'weight') {
    best('e1rm', 'Est. 1RM', (v) => `${Math.round(v)} lb`);
    best('heaviest', 'Heaviest set', (v) => `${v} lb`);
    best('volume', 'Best volume', (v) => `${Math.round(v).toLocaleString()} lb`);
  } else if (ex.type === 'bodyweight') {
    best('bestReps', 'Most reps in a set', (v) => `${v}`);
    best('totalReps', 'Most total reps', (v) => `${v}`);
    best('heaviest', 'Most added weight', (v) => `${v} lb`);
  } else if (ex.type === 'timed') {
    best('longest', 'Longest set', (v) => `${v} sec`);
  } else if (ex.type === 'distance') {
    best('longestDist', 'Longest distance', (v) => `${v}`);
  }
  return rec;
}

// Double progression: true when every done set last time reached the top of the rep range.
export function topOfRange(state, entry, date, excludeId) {
  const t = entry.target;
  if (!t || t.kind !== 'reps' || t.min === t.max) return false;
  const last = lastEntryFor(state, entry.exerciseId, date, excludeId);
  if (!last) return false;
  const done = last.entry.sets.filter((s) => s.done);
  return done.length > 0 && done.every((s) => (s.r || 0) >= t.max);
}

export function workoutTotals(state, w) {
  let sets = 0; let volume = 0;
  for (const e of w.exercises) {
    const ex = state.exercises[e.exerciseId];
    const done = e.sets.filter((s) => s.done);
    sets += done.length;
    if (ex && ex.type === 'weight') volume += done.reduce((a, s) => a + (s.w || 0) * (s.r || 0), 0) * (e.per ? 2 : 1);
  }
  return { sets, volume };
}

export function weeklyCounts(state, today, weeks = 12) {
  const thisMon = mondayOf(today);
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisMon, -7 * i);
    const end = addDays(start, 6);
    out.push({ start, count: state.workouts.filter((w) => w.date >= start && w.date <= end).length });
  }
  return out;
}
