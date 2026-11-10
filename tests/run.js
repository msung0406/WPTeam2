/* Run: node tests/run.js   (from study-dashboard/) */
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');

function boot(store = {}) {
  const writes = [];
  const ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); writes.push(k); } };
  const ctx = { localStorage: ls, window: { addEventListener() {} }, console, Date, JSON, Math, Set, Object, Array, Number, String };
  vm.createContext(ctx);
  vm.runInContext(src('storage.js') + '\n' + src('planner.js') + '\nthis.SD = SD; this.Planner = Planner;', ctx);
  return { SD: ctx.SD, P: ctx.Planner, store, writes };
}
let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } }
const task = (o) => Object.assign({ id: Math.random(), title: 't', subject: '기타', priority: 'mid', type: 'general', completed: false,
  createdAt: '2026-11-09', sessions: [], archived: false, sourceEventId: null, plan: null }, o);
const sess = (...pairs) => pairs.map(([date, hours]) => ({ date, hours }));
// compact view: { 'MM-DD': '2h' | 'day' | '1h:catchup' ... }
function view(res, id, { main = false } = {}) {
  const out = {};
  Object.entries(res.days).forEach(([d, items]) => {
    const mine = items.filter(i => (id === undefined || i.taskId === id) && !(main && i.reason === 'early'));
    if (mine.length) out[d.slice(5)] = mine.map(i => (i.block === 'day' ? 'day' : i.hours + 'h') + (i.reason !== 'plan' ? ':' + i.reason : '')).join(',');
  });
  return out;
}
const hoursOf = (res, id, { main = false } = {}) => Object.values(res.days).flat().filter(i => i.taskId === id && !(main && i.reason === 'early')).reduce((s, i) => s + (i.block === 'day' ? 8 : i.hours), 0);
const early = (res, id) => Object.entries(res.days).flatMap(([d, items]) => items.filter(i => i.taskId === id && i.reason === 'early').map(() => d.slice(5)));
const WEEK = ['short', 'short', 'short', 'short', 'short', 'short', 'long'];
const S = { shortDayHours: 4, longDayHours: 8, restDays: [], week: WEEK };
const MON = '2026-11-09';

/* ---------------- planner: spread tasks ---------------- */
test("Zoe's example: big task due next Mon → Tue 1h, Thu 1h, Sat 종일", () => {
  const { P } = boot();
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ size: 4, date: '2026-11-16' })], settings: S, today: MON })), { '11-10': '1h', '11-12': '1h', '11-14': 'day' });
});
test('size 5 project: 6 × 2h spread + both Saturdays', () => {
  const { P } = boot();
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ type: 'project', size: 5, date: '2026-11-23' })], settings: S, today: MON })),
    { '11-09': '2h', '11-11': '2h', '11-13': '2h', '11-14': 'day', '11-16': '2h', '11-18': '2h', '11-20': '2h', '11-21': 'day' });
});
test('size 3: two 1h sessions over the last 4 days', () => {
  const { P } = boot();
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ size: 3, date: '2026-11-16' })], settings: S, today: MON })), { '11-13': '1h', '11-15': '1h' });
});
test('size 2: day before · size 1: 30 min on due date', () => {
  const { P } = boot();
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ size: 2, date: '2026-11-12' })], settings: S, today: MON })), { '11-11': '1h' });
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ size: 1, date: MON })], settings: S, today: MON })), { '11-09': '0.5h' });
});
test('my week: Tue/Thu 쉼, Sun 길게 → sessions avoid Tue/Thu, 종일 on Sunday', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ size: 4, date: '2026-11-16' })], settings: { ...S, week: ['long', 'short', 'off', 'short', 'off', 'short', 'long'] }, today: MON });
  assert.deepStrictEqual(view(r), { '11-11': '1h', '11-14': '1h', '11-15': 'day' });
});
test('per-task tuning: 3 days before, 3 × 2h, no 종일', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ size: 4, date: '2026-11-16', plan: { window: 3, short: 3, long: 0, hours: 2 } })], settings: S, today: MON });
  assert.deepStrictEqual(view(r), { '11-13': '2h', '11-14': '2h', '11-15': '2h' });
});
test('schedule on Saturday, Sunday 길게 → 종일 moves to Sunday', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ size: 4, date: '2026-11-16' })], events: [{ kind: 'schedule', date: '2026-11-14' }], settings: { ...S, week: ['long', ...WEEK.slice(1)] }, today: MON });
  assert.deepStrictEqual(view(r), { '11-10': '1h', '11-13': '1h', '11-15': 'day' });
});
test('missed Tuesday → 1h catch-up on Wednesday · done → none · extra early → next session cancelled', () => {
  const { P } = boot();
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ size: 4, date: '2026-11-16' })], settings: S, today: '2026-11-11' })), { '11-11': '1h:catchup', '11-12': '1h', '11-14': 'day' });
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ size: 4, date: '2026-11-16', sessions: sess(['2026-11-10', 1]) })], settings: S, today: '2026-11-11' })), { '11-12': '1h', '11-14': 'day' });
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ size: 4, date: '2026-11-16', sessions: sess(['2026-11-10', 2]) })], settings: S, today: '2026-11-11' })), { '11-14': 'day' });
});
test('overdue assignment → session today, first in the list (not forecast every day)', () => {
  const { P } = boot();
  const late = task({ id: 9, size: 3, date: '2026-11-08', createdAt: '2026-11-01' }), big = task({ id: 8, type: 'project', size: 5, date: '2026-11-23' });
  const r = P.plan({ tasks: [big, late], settings: S, today: MON, horizon: 3 });
  assert.strictEqual(r.days[MON][0].taskId, 9);
  assert.deepStrictEqual(view(r, 9), { '11-09': '1h:overdue' });
});
test('completed and archived tasks are not planned', () => {
  const { P } = boot();
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ size: 4, date: '2026-11-16', completed: true }), task({ size: 4, date: '2026-11-16', archived: true })], settings: S, today: MON })), {});
});

/* ---------------- planner: exams ---------------- */
test('midterm (exam, size 4): 2 · 3 · 3h, 종일 on Sat, 4h on Sun ≈ 20h', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ id: 1, type: 'exam', size: 4, date: '2026-11-16' })], settings: S, today: MON });
  assert.deepStrictEqual(view(r, 1, { main: true }), { '11-11': '2h', '11-12': '3h', '11-13': '3h', '11-14': 'day', '11-15': '4h' });
  assert.strictEqual(hoursOf(r, 1, { main: true }), 20);
  assert.deepStrictEqual(early(r, 1), ['11-10'], 'the one free day before the ramp gets a light review');
});
test('final (exam, size 5): 11 ramp days + 종일, heavier near the exam', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ id: 1, type: 'exam', size: 5, date: '2026-11-23' })], settings: S, today: MON });
  const v = view(r, 1, { main: true });
  assert.strictEqual(Object.keys(v).length, 12);
  assert.ok(v['11-21'] === 'day');
  assert.ok(parseFloat(v['11-11']) < parseFloat(v['11-22']));
  assert.ok(hoursOf(r, 1, { main: true }) >= 38);
});
test('exam ramp skips 쉼 days and never studies on exam day', () => {
  const { P } = boot();
  const week = ['short', 'short', 'off', 'short', 'off', 'short', 'long'];
  const v = view(P.plan({ tasks: [task({ type: 'exam', size: 3, date: '2026-11-16' })], settings: { ...S, week }, today: MON }), undefined, { main: true });
  assert.deepStrictEqual(Object.keys(v), ['11-13', '11-14', '11-15']);
  assert.strictEqual(v['11-16'], undefined);
});
test('exam tuning: 3 days of 6h, no 종일 → capped by 짧게-day hours, rest moved earlier', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ id: 1, type: 'exam', size: 4, date: '2026-11-16', plan: { window: 3, hours: 6, long: 0 } })], settings: S, today: MON });
  Object.entries(r.days).forEach(([d, items]) => items.forEach(i => assert.ok(i.block === 'day' || i.hours <= (d === '2026-11-14' ? 8 : 4), d)));
  assert.ok(hoursOf(r, 1) >= 14 && r.overflow.length === 0);
});
test('past exam not marked done → nothing planned', () => {
  const { P } = boot();
  assert.deepStrictEqual(view(P.plan({ tasks: [task({ type: 'exam', size: 4, date: '2026-11-08', createdAt: '2026-11-01' })], settings: S, today: MON })), {});
});
test('learned factor: last DCN exam took 1.4× the plan → next DCN exam hours ×1.4', () => {
  const { P } = boot();
  // past midterm planned 20h (see above), actually ticked 28h
  const past = task({ id: 1, type: 'exam', size: 4, subject: 'Networking', date: '2026-10-19', createdAt: '2026-10-12', completed: true,
    sessions: sess(['2026-10-14', 5], ['2026-10-15', 5], ['2026-10-16', 6], ['2026-10-17', 6], ['2026-10-18', 6]) });
  const next = task({ id: 2, type: 'exam', size: 4, subject: 'Networking', date: '2026-11-16' });
  const other = task({ id: 3, type: 'exam', size: 4, subject: 'Algorithms', date: '2026-11-16' });
  assert.strictEqual(P.subjectFactor([past, next], 'Networking', S), 1.4);
  assert.strictEqual(P.subjectFactor([past, next], 'Algorithms', S), null);
  const pv = P.preview(next, S, [], [past, next]);
  assert.strictEqual(pv.factor, 1.4);
  assert.strictEqual(pv.params.hours, 5.5);                       // 4h × 1.4 = 5.6 → 5.5
  const solo = P.preview(other, S, [], [past, other]);
  assert.strictEqual(solo.params.hours, 4);
});
test('factor is clamped to 0.5–2', () => {
  const { P } = boot();
  const past = task({ id: 1, type: 'exam', size: 4, subject: 'Cloud', date: '2026-10-19', createdAt: '2026-10-12', completed: true, sessions: sess(['2026-10-18', 16], ['2026-10-17', 16], ['2026-10-16', 16]) });
  assert.strictEqual(P.subjectFactor([past], 'Cloud', S), 2);
});


/* ---------------- planner: one exam at a time ---------------- */
test('exams a week apart: the second one starts after the first', () => {
  const { P } = boot();
  const a = task({ id: 1, type: 'exam', size: 4, date: '2026-11-16', priority: 'high' });
  const b = task({ id: 2, type: 'exam', size: 4, date: '2026-11-23' });
  const r = P.plan({ tasks: [a, b], settings: S, today: MON });
  Object.keys(view(r, 2)).forEach(d => assert.ok(d > '11-16', `B studied on ${d}`));
  assert.strictEqual(hoursOf(r, 2, { main: true }), 20);
});
test('final right after a midterm: keeps its full hours, packed into the days after', () => {
  const { P } = boot();
  const a = task({ id: 1, type: 'exam', size: 4, date: '2026-11-16', priority: 'high' });
  const b = task({ id: 2, type: 'exam', size: 5, date: '2026-11-23' });
  const big = { ...S, shortDayHours: 8 };
  const alone = hoursOf(P.plan({ tasks: [b], settings: big, today: MON, horizon: 16 }), 2, { main: true });
  const r = P.plan({ tasks: [a, b], settings: big, today: MON, horizon: 16 });
  Object.keys(view(r, 2)).forEach(d => assert.ok(d > '11-16', `B studied on ${d}`));
  assert.ok(Math.abs(hoursOf(r, 2, { main: true }) - alone) <= 1, `${hoursOf(r, 2, { main: true })} vs ${alone}`);
  assert.strictEqual(r.overflow.length, 0);
});
test('not enough room after the first exam → the rest goes before it, not lost', () => {
  const { P } = boot();
  const a = task({ id: 1, type: 'exam', size: 4, date: '2026-11-16', priority: 'high' });
  const b = task({ id: 2, type: 'exam', size: 5, date: '2026-11-23' });
  const r = P.plan({ tasks: [a, b], settings: S, today: MON, horizon: 16 });
  assert.ok(Object.keys(view(r, 2)).some(d => d <= '11-16'), 'some of B before A');
  assert.ok(Object.keys(view(r, 2)).filter(d => d > '11-16').length >= 6, 'but most after A');
});
test('exams one day apart: the second shares days before the first', () => {
  const { P } = boot();
  const a = task({ id: 1, type: 'exam', size: 4, date: '2026-11-16', priority: 'high' });
  const b = task({ id: 2, type: 'exam', size: 3, date: '2026-11-17' });
  const r = P.plan({ tasks: [a, b], settings: S, today: MON });
  assert.ok(hoursOf(r, 2, { main: true }) >= 7);
  assert.ok(Object.keys(view(r, 2)).some(d => d < '11-16'));
});
test('a finished first exam no longer blocks the second', () => {
  const { P } = boot();
  const a = task({ id: 1, type: 'exam', size: 4, date: '2026-11-16', completed: true });
  const b = task({ id: 2, type: 'exam', size: 5, date: '2026-11-23' });
  const r = P.plan({ tasks: [a, b], settings: S, today: MON });
  assert.ok(Object.keys(view(r, 2)).some(d => d <= '11-16'));
});

/* ---------------- planner: start early when there is time ---------------- */
test('exam 3 weeks away → 1h 미리 review every other free day before the ramp', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ id: 1, type: 'exam', size: 4, date: '2026-11-30' })], settings: S, today: MON });
  const e = early(r, 1);
  assert.deepStrictEqual(e, ['11-12', '11-14', '11-16', '11-18', '11-20', '11-22']);
  Object.values(r.days).flat().filter(i => i.reason === 'early').forEach(i => assert.strictEqual(i.hours, 1));
});
test('미리 off in settings → no early sessions', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ id: 1, type: 'exam', size: 4, date: '2026-11-30' })], settings: { ...S, startEarly: false }, today: MON });
  assert.strictEqual(early(r, 1).length, 0);
});
test('per-task: 미리 0 days → no early sessions for that exam', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ id: 1, type: 'exam', size: 4, date: '2026-11-30', plan: { early: 0 } })], settings: S, today: MON });
  assert.strictEqual(early(r, 1).length, 0);
});
test('skipped 미리 sessions never come back as 보충', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ id: 1, type: 'exam', size: 4, date: '2026-11-30' })], settings: S, today: '2026-11-21' });
  assert.ok(!Object.values(r.days).flat().some(i => i.reason === 'catchup'));
});
test('미리 hours done come off the heavy days at the end', () => {
  const { P } = boot();
  const fresh = task({ id: 1, type: 'exam', size: 4, date: '2026-11-30' });
  const ahead = task({ id: 1, type: 'exam', size: 4, date: '2026-11-30', sessions: sess(['2026-11-12', 1], ['2026-11-14', 1], ['2026-11-16', 1], ['2026-11-18', 1]) });
  const T = '2026-11-25';
  const before = hoursOf(P.plan({ tasks: [fresh], settings: S, today: T }), 1, { main: true });
  const after = hoursOf(P.plan({ tasks: [ahead], settings: S, today: T }), 1, { main: true });
  assert.strictEqual(before - after, 4);
});
test('미리 sessions only use spare time: they never push out required work', () => {
  const { P } = boot();
  const far = task({ id: 1, type: 'exam', size: 4, date: '2026-11-30' });
  const busy = [2, 3, 4, 5].map(i => task({ id: i, size: 2, date: '2026-11-13', plan: { hours: 1 } }));
  const r = P.plan({ tasks: [far, ...busy], settings: S, today: MON });
  assert.strictEqual(r.overflow.length, 0);
  assert.ok(!early(r, 1).includes('11-12'), 'no early session on the full day');
});
test('미리 review for a later exam waits until the earlier exam is over', () => {
  const { P } = boot();
  const a = task({ id: 1, type: 'exam', size: 4, date: '2026-11-16', priority: 'high' });
  const b = task({ id: 2, type: 'exam', size: 4, date: '2026-12-02' });
  const r = P.plan({ tasks: [a, b], settings: S, today: MON });
  early(r, 2).forEach(d => assert.ok(d > '11-16', d));
  assert.ok(early(r, 2).length > 0);
});

/* ---------------- planner: sharing days ---------------- */
test('daily hour limit: two midterms the same week share days, nothing over 4h on 짧게 days', () => {
  const { P } = boot();
  const a = task({ id: 1, type: 'exam', size: 4, date: '2026-11-16', priority: 'high' }), b = task({ id: 2, type: 'exam', size: 4, date: '2026-11-17' });
  const r = P.plan({ tasks: [a, b], settings: S, today: MON });
  Object.entries(r.days).forEach(([d, items]) => {
    const used = items.reduce((s, i) => s + (i.block === 'day' ? 8 : i.hours), 0);
    assert.ok(used <= (WEEK[new Date(d).getDay()] === 'long' ? 8 : 4) + 1e-9, `${d} uses ${used}h`);
  });
  assert.strictEqual(view(r, 1)['11-14'], 'day', 'urgent exam gets the 길게 day');
});
test('no room at all → overflow with the missing hours', () => {
  const { P } = boot();
  const ts = [1, 2, 3, 4, 5].map(i => task({ id: i, size: 1, date: MON, plan: { hours: 1 } }));
  const r = P.plan({ tasks: ts, settings: S, today: MON });
  assert.strictEqual(r.days[MON].reduce((s, i) => s + i.hours, 0), 4);
  assert.strictEqual(r.overflow.reduce((s, o) => s + o.hours, 0), 1);
});
test('short 2h days: an exam spreads over more days instead of overflowing', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ id: 1, type: 'exam', size: 3, date: '2026-11-15' })], settings: { ...S, shortDayHours: 2 }, today: MON });
  assert.strictEqual(r.overflow.length, 0);
  assert.strictEqual(hoursOf(r, 1, { main: true }), 8);
  Object.entries(r.days).forEach(([d, items]) => items.forEach(i => assert.ok(i.hours <= (new Date(d).getDay() === 6 ? 8 : 2), d)));
});
test('rest day is never used', () => {
  const { P } = boot();
  const r = P.plan({ tasks: [task({ type: 'exam', size: 4, date: '2026-11-16' })], settings: { ...S, restDays: ['2026-11-12'] }, today: MON });
  assert.strictEqual(view(r)['11-12'], undefined);
});
test('checked when hours ticked that day ≥ planned', () => {
  const { P } = boot();
  const t = task({ id: 1, type: 'exam', size: 4, date: '2026-11-16', sessions: sess(['2026-11-11', 2]) });
  const r = P.plan({ tasks: [t], settings: S, today: '2026-11-11' });
  assert.strictEqual(r.days['2026-11-11'][0].checked, true);
  assert.strictEqual(r.days['2026-11-12'][0].checked, false);
});

/* ---------------- storage ---------------- */
test('v2 data (minutes) loads as v3 with type default size', () => {
  const { SD } = boot({ tasks: JSON.stringify([{ id: 1, title: 'old', date: '2026-11-20', type: 'exam', estimatedMin: 600, doneMin: 60 }, { id: 'x' }]) });
  const t = SD.getTasks();
  assert.strictEqual(t.length, 1); assert.strictEqual(t[0].size, 4); assert.strictEqual(JSON.stringify(t[0].sessions), '[]');
  assert.ok(!('estimatedMin' in t[0]));
});
test('toggleSession records hours per day; v3 sessionDates migrate as 1h each', () => {
  const { SD } = boot({ tasks: JSON.stringify([{ id: 1, title: 'a', date: '2026-11-20', sessionDates: ['2026-11-01', '2026-11-02'] }]) });
  assert.strictEqual(SD.totalHours(SD.getTasks()[0]), 2);
  SD.toggleSession(1, MON, true, 3);
  assert.strictEqual(SD.hoursOn(SD.getTasks()[0], MON), 3);
  SD.toggleSession(1, MON, true, 1);                               // adds to that day
  assert.strictEqual(SD.hoursOn(SD.getTasks()[0], MON), 4);
  SD.toggleSession(1, MON, false);
  assert.strictEqual(SD.hoursOn(SD.getTasks()[0], MON), 0);
  assert.strictEqual(SD.hoursBefore(SD.getTasks()[0], MON), 2);
  SD.setCompleted(1, true); assert.strictEqual(SD.getTasks()[0].completed, true);
});
test('deadline sync: create with size, idempotent, edit wins, override kept, delete rules', () => {
  const ev = [{ id: 100, kind: 'deadline', title: '퀴즈 3', date: '2026-11-23', type: 'exam' }];
  const e = boot({ events: JSON.stringify(ev) });
  let t = e.SD.getTasks();
  assert.strictEqual(t.length, 1); assert.strictEqual(t[0].size, 4); assert.strictEqual(t[0].sourceEventId, 100);
  const w = e.writes.length; e.SD.syncDeadlines(); assert.strictEqual(e.writes.length, w, 'no extra write');
  t[0].size = 5; e.SD.saveTasks(t); e.SD.syncDeadlines(); assert.strictEqual(e.SD.getTasks()[0].size, 5, 'todo override kept');
  e.SD.saveEvents([{ ...ev[0], date: '2026-11-24', size: 3 }]); e.SD.syncDeadlines();
  t = e.SD.getTasks()[0]; assert.strictEqual(t.date, '2026-11-24'); assert.strictEqual(t.size, 3);
  e.SD.toggleSession(t.id, MON, true, 2); e.SD.saveEvents([]); const r = e.SD.syncDeadlines();
  assert.strictEqual(r.orphaned, 1); assert.strictEqual(e.SD.getTasks()[0].orphaned, true);
});
test('deadline deleted without progress / archived → task removed, archived never recreated', () => {
  const e = boot({ events: JSON.stringify([{ id: 1, kind: 'deadline', title: 'a', date: '2026-11-20' }, { id: 2, kind: 'deadline', title: 'b', date: '2026-11-21' }]) });
  const t = e.SD.getTasks(); t.find(x => x.sourceEventId === 2).archived = true; e.SD.saveTasks(t);
  e.SD.syncDeadlines(); assert.strictEqual(e.SD.getTasks().length, 2); assert.strictEqual(e.SD.activeTasks().length, 1);
  e.SD.saveEvents([]); assert.strictEqual(e.SD.syncDeadlines().removed, 2);
});
test('settings: cap clamped, rest days deduped', () => {
  const { SD } = boot();
  SD.saveSettings({ shortDayHours: 99, longDayHours: 10, restDays: [MON, MON, 'bad'] });
  const st = SD.getSettings();
  assert.strictEqual(st.shortDayHours, 4, 'out of range → default'); assert.strictEqual(st.longDayHours, 10);
  assert.strictEqual(JSON.stringify(st.restDays), JSON.stringify([MON]));
  assert.strictEqual(st.week.join(), 'short,short,short,short,short,short,long', 'default week');
  SD.saveSettings({ week: ['long', 'bad', 'off', 'short', 'off', 'short', 'long'] });
  assert.strictEqual(SD.getSettings().week.join(), 'long,short,off,short,off,short,long', 'invalid day → default');
  const t = boot({ tasks: JSON.stringify([{ id: 1, title: 'a', date: '2026-11-20', plan: { window: 99, short: '3', hours: 2.3 } }]) }).SD.getTasks()[0];
  assert.strictEqual(JSON.stringify(t.plan), JSON.stringify({ window: null, short: 3, long: null, hours: 2.5, early: null }), 'override clamped');
});
test('export / import roundtrip, foreign file rejected, corrupt storage safe', () => {
  const a = boot({ tasks: JSON.stringify([{ id: 1, title: 'a', date: '2026-11-20', size: 5 }]) });
  a.SD.addStudyLog({ subject: 'Cloud', minutes: 25 });
  const b = boot(); const r = b.SD.importAll(JSON.parse(JSON.stringify(a.SD.exportAll())));
  assert.ok(r.ok); assert.strictEqual(b.SD.getTasks()[0].size, 5); assert.strictEqual(b.SD.getStudyLogs().length, 1);
  assert.ok(!b.SD.importAll({ x: 1 }).ok);
  assert.strictEqual(boot({ tasks: '{bad', settings: '[1]' }).SD.getTasks().length, 0);
});
test('break-day notes: kept only for break days, trimmed to 20 chars', () => {
  const { SD } = boot();
  SD.saveSettings({ restDays: ['2026-11-14', '2026-11-15'], restNotes: { '2026-11-14': '  가족 여행  ', '2026-11-20': '없는 날', '2026-11-15': 'x'.repeat(30) } });
  const st = SD.getSettings();
  assert.strictEqual(st.restNotes['2026-11-14'], '가족 여행');
  assert.strictEqual(st.restNotes['2026-11-15'].length, 20);
  assert.ok(!('2026-11-20' in st.restNotes));
});
test('a break day moves that day\'s sessions elsewhere', () => {
  const { P } = boot();
  const t = { id: 1, title: 't', subject: '기타', priority: 'mid', type: 'exam', size: 4, date: '2026-11-16', completed: false, createdAt: MON, sessions: [], archived: false, sourceEventId: null, plan: null };
  const normal = P.plan({ tasks: [t], settings: S, today: MON });
  const r = P.plan({ tasks: [t], settings: { ...S, restDays: ['2026-11-13'] }, today: MON });
  assert.strictEqual(r.days['2026-11-13'].length, 0);
  const h = res => Object.values(res.days).flat().filter(i => i.reason !== 'early').reduce((s, i) => s + (i.block === 'day' ? 8 : i.hours), 0);
  assert.strictEqual(h(r), h(normal), 'same total hours, just on other days');
});
test('ids unique', () => {
  const { SD } = boot(); const s = new Set(); for (let i = 0; i < 1000; i++) s.add(SD.newId()); assert.strictEqual(s.size, 1000);
});

console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
