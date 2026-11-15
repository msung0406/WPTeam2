/* =========================================================
   Study Dashboard — daily planner (load after storage.js)
   Pure functions: no localStorage access, nothing saved.
     Planner.plan({ tasks, events, settings, today }) → { days, overflow }
     Planner.planDay(...) → today's items only
   Used by Todo (full UI) and Main (today's list).
   Maintainer: 김주환
   ========================================================= */
const Planner = (() => {
  'use strict';

  const D = SD.date;
  const HORIZON = 14; // days planned ahead (today included)

  /* ---------- defaults per size (each task can override any field in 세부 조정) ----------
     SPREAD — assignments, projects, general tasks: sessions spread out before the due date
       window: start n days before due · short: number of sessions · hours: length of each · long: 종일 days
     EXAM — exams and quizzes: study every available day before the exam, getting longer toward it
       window: number of study days · hours: hours on the heaviest day · long: 1 = one 종일 day near the exam
       Exams go one at a time: while an earlier exam is still open, the next one starts after it (unless the gap is too short).
     weight: how much the task counts when two tasks want the same day                                     */
  const SPREAD = {
    1: { window: 0, short: 1, hours: 0.5, long: 0, weight: 1 },
    2: { window: 2, short: 1, hours: 1, long: 0, weight: 2 },
    3: { window: 4, short: 2, hours: 1, long: 0, weight: 3 },
    4: { window: 7, short: 2, hours: 1, long: 1, weight: 4 },
    5: { window: 14, short: 6, hours: 2, long: 2, weight: 5 }
  };
  const EXAM = {
    1: { window: 1, hours: 1, long: 0, early: 0, weight: 1 },    // small quiz: 1h the day before
    2: { window: 2, hours: 2, long: 0, early: 0, weight: 2 },    // 1h → 2h
    3: { window: 3, hours: 3, long: 0, early: 7, weight: 3 },    // 2h → 3h
    4: { window: 5, hours: 4, long: 1, early: 14, weight: 4 },   // midterm: 2 · 3 · 3 · 4h + 종일 ≈ 20h
    5: { window: 12, hours: 4, long: 1, early: 21, weight: 5 }   // final: 11 days 2→4h + 종일 ≈ 41h
  };
  // early: if there is time, light 1h review every other day during this many days before the main study days.
  //        Optional — missing one creates no 보충, and hours done early come off the heavy days at the end.
  const PRIORITY_WEIGHT = { high: 3, mid: 2, low: 1 };
  const REASON_LABEL = { plan: '', catchup: '보충', due: '마감일', overdue: '기한 지남', fallback: '대체', early: '미리' };
  const REASON_RANK = { overdue: 0, due: 1, catchup: 2, fallback: 3, plan: 3, early: 4 };
  const DEFAULT_SETTINGS = { shortDayHours: 4, longDayHours: 8, restDays: [], week: SD.DEFAULT_WEEK, startEarly: true };

  const range = (from, to) => { const out = []; for (let d = from; d <= to; d = D.addDays(d, 1)) out.push(d); return out; };
  const maxDate = (a, b) => (a > b ? a : b);
  const half = h => Math.round(h * 2) / 2;
  const spread = (list, n) => Array.from({ length: n }, (_, i) => list[Math.min(list.length - 1, Math.floor(((2 * i + 1) * list.length) / (2 * n)))]);

  function hoursLabel(item) {
    if (item.block === 'day') return '종일';
    if (item.hours < 1) return `${item.hours * 60}분`;
    return Number.isInteger(item.hours) ? `${item.hours}시간` : `${Math.floor(item.hours)}시간 30분`;
  }

  /* ---------- settings → helpers ---------- */
  function context(settings = DEFAULT_SETTINGS, events = []) {
    const s = { ...DEFAULT_SETTINGS, ...settings };
    const rest = new Set(s.restDays);
    const busy = new Set(events.filter(e => e.kind === 'schedule').map(e => e.date));
    const avail = d => (rest.has(d) ? 'off' : s.week[D.dow(d)]);
    return {
      s, avail,
      canLong: d => !rest.has(d) && !busy.has(d) && s.week[D.dow(d)] === 'long',
      cap: d => ({ off: 0, short: s.shortDayHours, long: s.longDayHours })[avail(d)]   // study hours available that day
    };
  }

  /* ---------- the effective pattern of one task ---------- */
  function params(task, factor = 1) {
    const isExam = task.type === 'exam';
    const L = (isExam ? EXAM : SPREAD)[task.size] || (isExam ? EXAM : SPREAD)[3];
    const o = task.plan || {};
    const hours = o.hours ?? half(Math.max(0.5, L.hours * (isExam ? factor : 1)));   // learned factor only scales default exam hours
    return { mode: isExam ? 'exam' : 'spread', window: o.window ?? L.window, short: o.short ?? L.short,
      long: o.long ?? L.long, early: isExam ? (o.early ?? L.early) : 0, hours, weight: L.weight };
  }

  function bounds(task, p) {
    const last = p.window === 0 ? task.date : D.addDays(task.date, -1);          // work ends the day before due (window 0: on due)
    const start = maxDate(D.addDays(task.date, -(p.mode === 'exam' ? p.window * 2 : p.window)), task.createdAt);
    return { start, last };
  }

  /* ---------- 1. where a task WANTS its sessions (independent of other tasks) ----------
     Anchored to the due date and createdAt, so the plan doesn't drift from day to day.
     Item: { date, block: 'h', hours } or { date, block: 'day' }                         */
  function desiredSessions(task, ctx, factor = 1, boundary = null) {
    const p = params(task, factor);
    const { start, last } = bounds(task, p);
    if (start > last) return [];
    const out = p.mode === 'exam' ? examSessions(task, p, start, last, ctx, boundary) : spreadSessions(p, start, last, ctx);
    return out.map(it => ({ from: start, to: last, min: start, reason: 'plan', ...it }));
  }

  function spreadSessions(p, start, last, ctx) {
    const days = range(start, last);
    const longCandidates = days.filter(ctx.canLong);
    const longs = p.long ? longCandidates.slice(-p.long) : [];                     // 길게 days closest to the due date
    const missingLong = p.long - longs.length;                                    // not enough 길게 days → 2 sessions each
    const free = days.filter(d => ctx.avail(d) !== 'off' && !longs.includes(d));
    const lastLong = longs[longs.length - 1];
    const n = p.short + 2 * missingLong;
    let pool = lastLong ? free.filter(d => d < lastLong) : free;                  // prep sessions come before the big day
    if (pool.length < n && free.length > pool.length) pool = free;
    if (!pool.length) pool = [last];
    return [
      ...longs.map(d => ({ date: d, block: 'day' })),
      ...(n ? spread(pool, n) : []).map(d => ({ date: d, block: 'h', hours: p.hours }))
    ].sort((a, b) => a.date.localeCompare(b.date));
  }

  // boundary = date of an earlier exam that is still open: study for this one only after it.
  // If fewer days are left after it, the same total hours are packed into them (days get longer);
  // what still doesn't fit is placed before the earlier exam as a last resort (see plan()).
  function examSessions(task, p, start, last, ctx, boundary) {
    const avail = range(start, last).filter(d => ctx.avail(d) !== 'off');
    const normalDays = avail.slice(-p.window);
    let days = normalDays;
    let from = start;
    if (boundary) {
      const after = avail.filter(d => d > boundary).slice(-p.window);
      if (after.length) { days = after; from = D.addDays(boundary, 1); }
    }
    if (!days.length) return [{ date: last, block: 'h', hours: p.hours }];

    const ramp = list => {
      const longDay = p.long ? [...list].reverse().find(ctx.canLong) : null;      // 종일 on the 길게 day closest to the exam
      const rampDays = list.filter(d => d !== longDay);
      const hi = p.hours, lo = Math.max(1, Math.ceil(hi / 2));
      const items = rampDays.map((d, i) => ({
        date: d, block: 'h',
        hours: rampDays.length === 1 ? hi : half(Math.round(lo + (hi - lo) * i / (rampDays.length - 1)))
      }));
      if (longDay) items.push({ date: longDay, block: 'day' });
      else if (p.long && items.length) items[items.length - 1].hours = Math.max(items[items.length - 1].hours, ctx.s.shortDayHours); // no 길게 day
      return items;
    };
    const total = items => items.reduce((s, it) => s + itemHours(it, ctx), 0);

    const out = ramp(days);
    if (days !== normalDays) {
      // fewer days after the earlier exam → keep the normal total by making each day longer (heavier days get more)
      let missing = total(ramp(normalDays)) - total(out);
      const hourItems = out.filter(it => it.block === 'h');
      const base = hourItems.reduce((s, it) => s + it.hours, 0) || 1;
      hourItems.forEach(it => { const add = half(missing * it.hours / base); it.hours = half(it.hours + add); });
      missing = half(total(ramp(normalDays)) - total(out));
      if (missing > 0 && hourItems.length) hourItems[hourItems.length - 1].hours = half(hourItems[hourItems.length - 1].hours + missing);
    }
    out.forEach(it => { it.from = from; });
    const rampStart = days[0];

    // early review: every other available day before the main study days, never before an earlier open exam
    if (p.early > 0 && ctx.s.startEarly !== false) {
      let earlyFrom = maxDate(task.createdAt, D.addDays(rampStart, -p.early));
      if (boundary && boundary < rampStart) earlyFrom = maxDate(earlyFrom, D.addDays(boundary, 1));
      const earlyTo = D.addDays(rampStart, -1);
      if (earlyFrom <= earlyTo) {
        range(earlyFrom, earlyTo).filter(d => ctx.avail(d) !== 'off').reverse()
          .filter((_, i) => i % 2 === 0)
          .forEach(d => out.push({ date: d, block: 'h', hours: 1, reason: 'early', from: earlyFrom, to: earlyTo, optional: true }));
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  const itemHours = (it, ctx) => (it.block === 'day' ? ctx.s.longDayHours : it.hours);

  /* ---------- your track record: how long exams in a subject really took ----------
     For finished exams with ticked sessions: actual hours ÷ planned hours. Average, limited to 0.5–2. */
  function subjectFactor(tasks, subject, ctx, excludeId) {
    const ratios = tasks
      .filter(t => t.type === 'exam' && t.completed && t.subject === subject && t.id !== excludeId && SD.totalHours(t) > 0)
      .map(t => {
        const planned = desiredSessions(t, ctx, 1).filter(it => it.reason !== 'early').reduce((s, it) => s + itemHours(it, ctx), 0);
        return planned > 0 ? SD.totalHours(t) / planned : null;
      })
      .filter(r => r !== null);
    if (!ratios.length) return null;
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    return Math.round(Math.min(2, Math.max(0.5, avg)) * 10) / 10;
  }

  /* ---------- 2. what is still needed from today, given what was done ---------- */
  function demandsFor(task, today, horizonEnd, ctx, factor, boundary) {
    const p = params(task, factor);
    const wanted = desiredSessions(task, ctx, factor, boundary);
    // optional early-review sessions never count as owed (no 보충 when skipped)
    const pastHours = wanted.filter(s => s.date < today && s.reason !== 'early').reduce((s, it) => s + itemHours(it, ctx), 0);
    const doneBefore = SD.hoursBefore(task, today);
    const future = wanted.filter(s => s.date >= today && s.date <= horizonEnd).map(s => ({ ...s }));

    // hours done beyond the plan (early review included) shorten the earliest main sessions (never a 종일 day)
    let surplus = Math.max(0, doneBefore - pastHours);
    future.forEach(s => {
      if (surplus <= 0 || s.block === 'day' || s.reason === 'early') return;
      const cut = Math.min(surplus, s.hours);
      s.hours = half(s.hours - cut);
      surplus -= cut;
    });
    const items = future.filter(s => s.block === 'day' || s.hours > 0);

    const missed = half(Math.max(0, pastHours - doneBefore));
    if (task.date < today) {
      // overdue: an assignment gets a session today (and again each day it's still open); a past exam gets nothing
      if (p.mode !== 'exam') items.push({ date: today, block: 'h', hours: Math.max(p.hours, 1), reason: 'overdue' });
    } else {
      if (task.date === today && p.mode !== 'exam' && !items.some(s => s.date === today)) items.push({ date: today, block: 'h', hours: p.hours, reason: 'due' });
      if (missed > 0 && task.date > today) items.push({ date: today, block: 'h', hours: Math.min(missed, Math.max(p.hours, 1)), reason: 'catchup' });
    }
    return items;
  }

  // latest date of another open exam before this one (that exam is studied for first)
  function examBoundary(tasks, task, today) {
    const before = tasks.filter(t => t.type === 'exam' && t.id !== task.id && !t.completed && !t.archived && t.date < task.date && t.date >= today);
    return before.length ? before.map(t => t.date).sort().pop() : null;
  }

  function urgency(task, today) {
    const daysLeft = D.diff(task.date, today);
    const base = params(task).weight * PRIORITY_WEIGHT[task.priority] / Math.max(daysLeft, 0.5);
    return daysLeft < 0 ? base * 10 : base;
  }

  /* ---------- 3. place everyone's sessions, within each day's hours ---------- */
  function plan({ tasks, events = [], settings = DEFAULT_SETTINGS, today = D.today(), horizon = HORIZON }) {
    const ctx = context(settings, events);
    const horizonEnd = D.addDays(today, horizon - 1);

    const days = {};
    range(today, horizonEnd).forEach(d => { days[d] = { items: [], used: 0, full: false }; });
    const overflow = [];

    const open = tasks.filter(t => !t.archived && !t.completed).sort((a, b) => urgency(b, today) - urgency(a, today));
    const factors = {};
    open.filter(t => t.type === 'exam').forEach(t => {
      if (!(t.subject in factors)) factors[t.subject] = subjectFactor(tasks, t.subject, ctx);
    });
    const factorOf = t => (t.type === 'exam' && factors[t.subject]) || 1;
    const boundaryOf = t => (t.type === 'exam' ? examBoundary(open, t, today) : null);
    const demands = open.flatMap(t => demandsFor(t, today, horizonEnd, ctx, factorOf(t), boundaryOf(t)).map(s => ({ ...s, task: t })));

    const addItem = (d, s, hours, block = 'h') => {
      const day = days[d];
      const same = day.items.find(i => i.taskId === s.task.id && i.block === block && (i.reason === 'early') === (s.reason === 'early'));
      if (same && block === 'h') {
        same.hours = half(same.hours + hours);
        if (REASON_RANK[s.reason] < REASON_RANK[same.reason]) same.reason = s.reason;
      } else {
        day.items.push({ taskId: s.task.id, title: s.task.title, type: s.task.type, size: s.task.size, block, hours, reason: s.reason });
      }
      day.used = half(day.used + hours);
    };

    // pass 1: 종일 days, most urgent first. Wanted day taken → another free 길게 day before the due date (closest first)
    //         → otherwise its hours are spread over the days before it
    const extra = [];
    demands.filter(s => s.block === 'day').forEach(s => {
      const others = range(maxDate(s.from, today), s.to).filter(d => d !== s.date && ctx.canLong(d)).reverse();
      const ok = [s.date, ...others].find(d => days[d] && ctx.canLong(d) && days[d].items.length === 0);
      if (ok) { addItem(ok, s, ctx.s.longDayHours, 'day'); days[ok].full = true; }
      else extra.push({ ...s, date: D.addDays(s.date, -1), block: 'h', hours: ctx.s.longDayHours / 2, reason: 'fallback' },
                      { ...s, date: D.addDays(s.date, -2), block: 'h', hours: ctx.s.longDayHours / 2, reason: 'fallback' });
    });

    // pass 2: hour sessions by urgency. If the wanted day can't hold all of it, the rest goes to the nearest
    //         earlier day in the window, then later days up to the due date. Leftover → overflow warning.
    const sessions = [...demands.filter(s => s.block !== 'day'), ...extra]
      .sort((a, b) => (a.optional ? 1 : 0) - (b.optional ? 1 : 0)                  // optional early review goes last
        || urgency(b.task, today) - urgency(a.task, today) || a.date.localeCompare(b.date));

    sessions.forEach(s => {
      const want = maxDate(s.date, today);
      let latest = s.task.date < today ? horizonEnd : (s.task.type === 'exam' ? D.addDays(s.task.date, -1) : s.task.date);
      if (s.optional) latest = s.to;
      const lowest = s.reason === 'catchup' || s.reason === 'overdue' ? today : maxDate(s.from || today, today);
      const earlier = lowest <= want ? range(lowest, want).reverse() : [want];
      const later = want < latest ? range(D.addDays(want, 1), latest) : [];
      let left = s.hours;
      for (const d of [...earlier, ...later]) {
        if (left <= 0) break;
        const day = days[d];
        if (!day || day.full) continue;
        if (s.optional && day.items.some(i => i.taskId === s.task.id)) continue;   // 미리 only on days without real work for it
        const free = half(ctx.cap(d) - day.used);
        const take = Math.min(left, free);
        if (take < Math.min(1, left)) continue;          // no slivers under 1 hour (unless that's all that's left)
        addItem(d, s, take);
        left = half(left - take);
      }
      // a later exam that doesn't fit after the earlier exam may use the days before it, as a last resort
      if (left > 0 && !s.optional && s.min && s.from > s.min) {
        for (const d of range(maxDate(s.min, today), D.addDays(s.from, -1)).reverse()) {
          if (left <= 0) break;
          const day = days[d];
          if (!day || day.full) continue;
          const take = Math.min(left, half(ctx.cap(d) - day.used));
          if (take < Math.min(1, left)) continue;
          addItem(d, s, take);
          left = half(left - take);
        }
      }
      if (left > 0 && !s.optional) overflow.push({ taskId: s.task.id, title: s.task.title, hours: left, wanted: s.date });
    });

    // order inside a day and checked state (hours ticked that day ≥ planned hours)
    const byId = Object.fromEntries(open.map(t => [t.id, t]));
    const out = {};
    Object.entries(days).forEach(([d, day]) => {
      day.items.sort((a, b) => REASON_RANK[a.reason] - REASON_RANK[b.reason] || urgency(byId[b.taskId], today) - urgency(byId[a.taskId], today));
      day.items.forEach(i => {
        i.label = hoursLabel(i);
        i.done = SD.hoursOn(byId[i.taskId], d);
        i.checked = i.done >= (i.block === 'day' ? ctx.s.longDayHours : i.hours) - 0.01;
      });
      out[d] = day.items;
    });

    return { today, days: out, overflow, factors };
  }

  const planDay = args => plan(args).days[args.today || D.today()] || [];

  /* ---------- for the form ---------- */
  function preview(task, settings, events, allTasks = []) {
    const ctx = context(settings, events);
    const factor = task.type === 'exam' ? subjectFactor(allTasks, task.subject, ctx, task.id) : null;
    const p = params(task, factor || 1);
    const boundary = task.type === 'exam' && task.date ? examBoundary(allTasks.filter(t => t.id !== task.id), task, D.today()) : null;
    const sessions = task.date ? desiredSessions(task, ctx, factor || 1, boundary) : [];
    const main = sessions.filter(it => it.reason !== 'early');
    const total = main.reduce((s, it) => s + itemHours(it, ctx), 0);
    const earlyHours = sessions.length - main.length;
    const after = boundary ? allTasks.find(t => t.type === 'exam' && t.date === boundary && !t.completed && !t.archived) : null;
    return { params: p, sessions: sessions.map(it => ({ ...it, label: hoursLabel(it) })), totalHours: total, earlyHours, factor, after: after ? after.title : null };
  }

  function describe(p) {
    if (p.mode === 'exam') {
      const lo = Math.max(1, Math.ceil(p.hours / 2));
      const ramp = lo === p.hours ? `${p.hours}시간` : `${lo}→${p.hours}시간`;
      return `시험 전 ${p.window}일 동안 매일 ${ramp}` + (p.long ? ' + 종일 하루' : '');
    }
    const len = p.hours < 1 ? `${p.hours * 60}분` : `${p.hours}시간`;
    const parts = [];
    if (p.short) parts.push(`${len} × ${p.short}`);
    if (p.long) parts.push(`종일 × ${p.long}`);
    return `${p.window === 0 ? '마감일에' : `마감 ${p.window}일 전부터`} ${parts.join(' + ') || '세션 없음'}`;
  }

  return { SPREAD, EXAM, REASON_LABEL, params, describe, preview, plan, planDay, subjectFactor: (tasks, subject, settings, events) => subjectFactor(tasks, subject, context(settings, events)) };
})();
