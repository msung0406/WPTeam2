/* =========================================================
   Study Dashboard — shared views (load after storage.js + planner.js)
   One "day list" and one "week strip" used by several pages, so a day
   looks the same everywhere:
     Main            → today's list + this week
     Calendar · Todo → the clicked day's list
     Planner         → today's list (planned only)
   Writes only through SD.setCompleted / SD.toggleSession.
   Maintainer: 김주환
   ========================================================= */
const Views = (() => {
  'use strict';

  const D = SD.date;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const fmtH = h => (h === 0 ? '0시간' : h < 1 ? `${Math.round(h * 60)}분` : Number.isInteger(h) ? `${h}시간` : `${Math.floor(h)}시간 30분`);
  const md = ymd => { const d = D.parse(ymd); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const mdDow = ymd => { const d = D.parse(ymd); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
  const weekStart = ymd => D.addDays(ymd, -((D.dow(ymd) + 6) % 7));       // Monday

  /* ---------- everything a page needs, read once per render ---------- */
  function load(today = D.today()) {
    const tasks = SD.getTasks();
    const events = SD.getEvents();
    const settings = SD.getSettings();
    const plan = Planner.plan({ tasks, events, settings, today });
    return { today, tasks, active: SD.activeTasks(tasks), events, settings, plan, ddays: SD.allDdays() };
  }
  const plannedHours = (it, ctx) => (it.block === 'day' ? ctx.settings.longDayHours : it.hours);

  /* ---------- rows of one day ----------
     kind: 'todo'    plain to-do due that day (today also shows overdue ones)
           'due'     planned task due that day (exam day / deadline)
           'session' planner session (today and later = forecast; only today can be ticked)
           'studied' past day: hours ticked that day                                      */
  function dayRows(ymd, ctx, { plannedOnly = false } = {}) {
    const rows = [];
    const isToday = ymd === ctx.today;
    const past = ymd < ctx.today;

    if (!plannedOnly) {
      ctx.active.filter(t => !t.planned && (t.date === ymd || (isToday && t.date < ymd && !t.completed)))
        .sort((a, b) => a.completed - b.completed || a.date.localeCompare(b.date))
        .forEach(t => rows.push({ kind: 'todo', task: t, checked: t.completed, late: !t.completed && t.date < ctx.today }));
    }

    ctx.active.filter(t => t.planned && t.date === ymd)
      .forEach(t => rows.push({ kind: 'due', task: t, checked: t.completed }));

    if (past) {
      ctx.tasks.filter(t => t.planned && SD.hoursOn(t, ymd) > 0)
        .forEach(t => rows.push({ kind: 'studied', task: t, hours: SD.hoursOn(t, ymd), checked: true }));
    } else {
      const byId = Object.fromEntries(ctx.tasks.map(t => [t.id, t]));
      (ctx.plan.days[ymd] || []).forEach(it => rows.push({ kind: 'session', task: byId[it.taskId], item: it, checked: it.checked, canTick: isToday }));
    }
    return rows;
  }

  // progress of a day's list (Main header + stat)
  function dayProgress(rows) {
    const doable = rows.filter(r => r.kind !== 'studied' && !(r.kind === 'session' && !r.canTick));
    return { done: doable.filter(r => r.checked).length, total: doable.length };
  }

  /* ---------- render the day list ----------
     opts.onEdit(taskId) → titles become buttons (Calendar · Todo, Planner)
     opts.finish         → '완료' button on today's sessions (finish the whole task)   */
  let rowSeq = 0;
  function renderDayList(ul, ymd, ctx, opts = {}) {
    const rows = dayRows(ymd, ctx, opts);
    ul.replaceChildren(...rows.map(r => rowNode(r, ctx, opts)));
    ul.dataset.ymd = ymd;
    return rows;
  }

  function rowNode(r, ctx, opts) {
    const t = r.task;
    const li = make('li', `sd-row sd-row-${r.kind}`);
    li.dataset.id = t.id;
    li.dataset.kind = r.kind;
    li.classList.toggle('is-done', r.checked);

    const id = `row-${++rowSeq}`;
    if (r.kind === 'studied' || (r.kind === 'session' && !r.canTick)) {
      li.append(make('span', 'sd-row-mark', r.kind === 'studied' ? '✓' : '·'));
    } else {
      const cb = make('input', 'form-check-input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.checked = r.checked;
      if (r.kind === 'session') cb.dataset.block = r.item.block;
      cb.setAttribute('aria-label', `${t.title} ${r.kind === 'session' ? '세션 완료' : '완료'}`);
      li.append(cb);
    }

    const body = make('div', 'sd-row-body');
    let title;
    if (opts.onEdit) {
      title = make('button', 'sd-row-title sd-row-edit', t.title);
      title.type = 'button';
      title.dataset.edit = t.id;
      title.title = '눌러서 수정';
    } else if (li.querySelector('input')) {
      title = make('label', 'sd-row-title', t.title);
      title.htmlFor = id;
    } else {
      title = make('span', 'sd-row-title', t.title);
    }
    body.append(title);

    const meta = make('div', 'sd-row-meta');
    const badge = (cls, text) => meta.append(make('span', `badge ${cls}`, text));
    if (r.kind === 'todo') {
      badge('sd-kind sd-kind-todo', '할 일');
      if (r.late) badge('sd-reason sd-reason-overdue', `${md(t.date)} 마감 · 지남`);
    } else if (r.kind === 'due') {
      badge('sd-kind sd-kind-due', t.type === 'exam' ? '시험일' : '마감');
      badge('sd-type', SD.TYPE_LABEL[t.type]);
    } else if (r.kind === 'session') {
      const it = r.item;
      badge('sd-kind sd-kind-session', '공부');
      badge(`sd-block sd-block-${it.block}`, it.label + (it.done > 0 && !it.checked ? ` 중 ${fmtH(it.done)}` : ''));
      const reason = Planner.REASON_LABEL[it.reason];
      if (reason) badge(`sd-reason sd-reason-${it.reason}`, reason);
      if (t) meta.append(make('span', 'sd-row-due', `${t.type === 'exam' ? '시험' : '마감'} ${md(t.date)}`));
    } else {
      badge('sd-kind sd-kind-session', '공부함');
      badge('sd-block', fmtH(r.hours));
    }
    if (t.subject && t.subject !== '기타') badge('sd-subj', t.subject);
    body.append(meta);
    li.append(body);
    if (opts.finish && r.kind === 'session' && r.canTick) {
      const fin = make('button', 'btn btn-sm btn-outline-secondary sd-row-finish', '완료');
      fin.type = 'button';
      fin.dataset.finish = t.id;
      fin.title = '할 일 전체를 완료 (남은 세션 삭제)';
      fin.setAttribute('aria-label', `${t.title} 전체 완료`);
      li.append(fin);
      li.classList.add('has-finish');
    }
    return li;
  }

  // one delegated listener per list; after() re-renders the page
  function bindDayList(ul, getCtx, after, opts = {}) {
    ul.addEventListener('change', e => {
      const cb = e.target.closest('input[type="checkbox"]');
      const li = cb && cb.closest('.sd-row');
      if (!li) return;
      const id = Number(li.dataset.id);
      const ctx = getCtx();
      if (li.dataset.kind === 'session') {
        const it = (ctx.plan.days[ctx.today] || []).find(i => i.taskId === id && i.block === cb.dataset.block);
        const planned = it ? plannedHours(it, ctx) : 1;
        SD.toggleSession(id, ctx.today, cb.checked, Math.max(0.5, planned - (it ? it.done : 0)));
        after(cb.checked ? '세션을 체크했어요.' : '세션 체크를 풀었어요.');
      } else {
        SD.setCompleted(id, cb.checked);
        after(cb.checked ? (li.dataset.kind === 'due' ? '완료했어요. 남은 세션이 계획에서 빠졌어요.' : '완료했어요.') : '다시 진행 중으로 바꿨어요.');
      }
    });
    ul.addEventListener('click', e => {
      const fin = e.target.closest('[data-finish]');
      if (fin) { SD.setCompleted(Number(fin.dataset.finish), true); after('할 일을 완료했어요. 남은 세션이 계획에서 빠졌어요.'); return; }
      const b = e.target.closest('[data-edit]');
      if (b && opts.onEdit) opts.onEdit(Number(b.dataset.edit));
    });
  }

  /* ---------- week strip: Mon–Sun, events + study sessions ----------
     click a day → opts.onPick(ymd), or a link to calendar.html?date=     */
  function renderWeekStrip(root, ctx, opts = {}) {
    const start = weekStart(opts.ymd || ctx.today);
    root.replaceChildren();
    for (let i = 0; i < 7; i++) {
      const ymd = D.addDays(start, i);
      const d = D.parse(ymd);
      const col = make('a', 'sd-wday');
      col.href = `calendar.html?date=${ymd}`;
      col.classList.toggle('is-today', ymd === ctx.today);
      col.classList.toggle('is-past', ymd < ctx.today);
      col.classList.toggle('is-break', ctx.settings.restDays.includes(ymd));
      col.setAttribute('aria-label', `${mdDow(ymd)} 캘린더에서 보기`);

      const head = make('div', 'sd-wday-head');
      head.append(make('b', '', DOW[d.getDay()]), make('span', 'sd-wday-num', String(d.getDate())));
      col.append(head);

      const chips = make('div', 'sd-wday-chips');
      ctx.events.filter(e => e.date === ymd).forEach(e => {
        const chip = make('span', `sd-chip-ev sd-chip-${e.kind}`, e.title);
        if (e.kind === 'schedule' && e.start) chip.prepend(make('i', '', e.start + ' '));
        chips.append(chip);
      });
      ctx.ddays.filter(x => x.source === 'dday' && x.targetDate === ymd).forEach(x => chips.append(make('span', 'sd-chip-ev sd-chip-dday', x.title)));
      ctx.active.filter(t => t.planned && t.sourceEventId === null && t.date === ymd && !t.completed)
        .forEach(t => chips.append(make('span', 'sd-chip-ev sd-chip-deadline', `${t.type === 'exam' ? '시험' : '마감'} · ${t.title}`)));

      let hours = 0;
      dayRows(ymd, ctx, { plannedOnly: true }).forEach(r => {
        if (r.kind === 'session') {
          hours += plannedHours(r.item, ctx);
          const chip = make('span', `sd-chip-st sd-block-${r.item.block}` + (r.checked ? ' is-done' : '') + (r.item.reason === 'early' ? ' is-early' : ''));
          chip.append(make('span', 'sd-chip-st-title', r.task ? r.task.title : ''), make('span', 'sd-chip-st-h', r.item.label));
          chips.append(chip);
        } else if (r.kind === 'studied') {
          hours += r.hours;
          const chip = make('span', 'sd-chip-st is-done');
          chip.append(make('span', 'sd-chip-st-title', r.task.title), make('span', 'sd-chip-st-h', fmtH(r.hours)));
          chips.append(chip);
        }
      });
      if (ctx.settings.restDays.includes(ymd)) chips.append(make('span', 'sd-wday-tag', ctx.settings.restNotes[ymd] || '쉬는 날'));
      if (!chips.children.length) chips.append(make('span', 'sd-wday-empty', '–'));
      col.append(chips);
      if (hours) col.append(make('span', 'sd-wday-total', `공부 ${fmtH(hours)}`));
      root.append(col);
    }
    return { start, end: D.addDays(start, 6) };
  }

  return { DOW, fmtH, md, mdDow, weekStart, load, plannedHours, dayRows, dayProgress, renderDayList, bindDayList, renderWeekStrip };
})();
