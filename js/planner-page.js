/* =========================================================
   Planner — planner.html   담당 김주환
   Planned tasks (task.planned) → study sessions over the next 14 days.
   Data: SD (js/storage.js) · Plan: Planner (js/planner.js)
   Form: TodoForm (plannerOnly + editOnly) — the Planner only edits tasks that came from
         Calendar · Todo ("플래너에 추가" on, or a Calendar deadline). It can't create or delete;
         "플래너에서 빼기" turns a task back into a plain to-do.
   Today's list: Views (same rows as Dashboard)
   Writes: tasks (through TodoForm / Views / setCompleted), settings.
   ========================================================= */
(() => {
  'use strict';

  const D = SD.date;
  const DOW = Views.DOW;
  const PRIORITY_RANK = { high: 0, mid: 1, low: 2 };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  const el = {
    todayPlan: $('#todayPlan'), todayEmpty: $('#todayEmpty'), todayCount: $('#todayCount'), overflow: $('#overflowAlert'),
    list: $('#listView'), week: $('#weekView'), weekGrid: $('#weekGrid'), weekLabel: $('#weekLabel'),
    filters: $('#listFilters'), empty: $('#emptyState'), tplTask: $('#tplTask'),
    shortHours: $('#shortHours'), longHours: $('#longHours'), settingsSummary: $('#settingsSummary'),
    breakFrom: $('#breakFrom'), breakTo: $('#breakTo'), breakNote: $('#breakNote'), breakList: $('#breakList'), breakCount: $('#breakCount'),
    breakError: $('#breakError'), breakTodayNote: $('#breakTodayNote'), breakTodayText: $('#breakTodayText'),
    weekPick: $('#weekPick'), startEarly: $('#startEarly')
  };

  const state = { status: 'open', type: 'all', view: 'week', weekOffset: 0 };
  let ctx;

  const toast = new bootstrap.Toast('#toast', { delay: 2200 });
  const notify = msg => { if (!msg) return; $('#toastMsg').textContent = msg; toast.show(); };

  /* ---------- formatting ---------- */
  const md = ymd => { const d = D.parse(ymd); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`; };
  const fmtDate = ymd => { const d = D.parse(ymd); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`; };
  function relLabel(ymd) {
    const n = D.diff(ymd, D.today());
    if (n === 0) return { text: '오늘 마감', cls: 'is-today' };
    if (n === 1) return { text: '내일 마감', cls: '' };
    return n > 0 ? { text: `D-${n}`, cls: '' } : { text: `${-n}일 지남`, cls: 'is-late' };
  }
  const isLate = t => !t.completed && t.date < D.today();
  const fmtH = Views.fmtH;
  const hrs = it => Views.plannedHours(it, ctx);
  function sizeDots(node, size) {
    node.replaceChildren();
    for (let i = 1; i <= 5; i++) node.append(make('i', i <= size ? 'on' : ''));
    node.setAttribute('aria-label', `작업량 ${SD.SIZE_LABEL[size]}`);
    node.title = `작업량: ${SD.SIZE_LABEL[size]}`;
  }

  /* ---------- form (shared): edit-only, always planned here ---------- */
  const form = TodoForm.create($('#formRoot'), { plannerOnly: true, editOnly: true, onSaved: msg => render(msg) });
  const edit = id => form.edit(id);
  Views.bindDayList(el.todayPlan, () => ctx, msg => {
    render(msg);
    const today = ctx.plan.days[ctx.today] || [];
    if (today.length && today.every(i => i.checked)) notify('오늘 계획을 모두 끝냈습니다.');
  }, { onEdit: edit });

  /* ---------- list / week actions ---------- */
  el.list.addEventListener('change', e => {
    const box = e.target.closest('[data-action="complete"]');
    if (!box) return;
    SD.setCompleted(Number(box.closest('[data-id]').dataset.id), box.checked);
    render(box.checked ? '완료했습니다. 남은 세션이 계획에서 빠졌습니다.' : '다시 진행 중으로 바꿨습니다.');
  });
  document.addEventListener('click', e => {
    const btn = e.target.closest('#listView [data-action="edit"], #weekGrid [data-action="edit"]');
    if (btn) edit(Number(btn.closest('[data-id]').dataset.id));
  });

  /* ---------- toolbar ---------- */
  SD.TYPES.forEach(t => $('#filterType').add(new Option(SD.TYPE_LABEL[t], t)));
  $('#filterStatus').addEventListener('change', e => { state.status = e.target.value; render(); });
  $('#filterType').addEventListener('change', e => { state.type = e.target.value; render(); });
  $$('[data-view]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    $$('[data-view]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
    render();
  }));
  $$('input[name="weekPick"]').forEach(r => r.addEventListener('change', () => { state.weekOffset = Number(r.value); render(); }));

  /* ---------- settings ---------- */
  const settings = () => ctx.settings;
  const afterSettings = msg => { render(msg); form.refresh(); };
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];                       // Mon … Sun
  const DAY_NAME = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  WEEK_ORDER.forEach(dow => {
    const b = make('button', 'sd-avail');
    b.type = 'button';
    b.dataset.dow = dow;
    b.append(make('b', '', DOW[dow]), make('span', 'sd-avail-state'));
    el.weekPick.append(b);
  });
  el.weekPick.addEventListener('click', e => {
    const b = e.target.closest('[data-dow]');
    if (!b) return;
    const week = [...settings().week];
    const i = Number(b.dataset.dow);
    week[i] = SD.AVAIL[(SD.AVAIL.indexOf(week[i]) + 1) % SD.AVAIL.length];   // 쉼 → 짧게 → 길게 → 쉼
    SD.saveSettings({ ...settings(), week });
    afterSettings();
  });
  for (let n = 1; n <= 12; n++) el.shortHours.add(new Option(`${n}시간`, n));
  for (let n = 4; n <= 14; n++) el.longHours.add(new Option(`${n}시간`, n));
  [el.shortHours, el.longHours].forEach(sel => sel.addEventListener('change', () => {
    SD.saveSettings({ ...settings(), shortDayHours: Number(el.shortHours.value), longDayHours: Number(el.longHours.value) });
    afterSettings('설정을 저장했습니다.');
  }));
  $$('input[name="examOrder"]').forEach(r => r.addEventListener('change', () => {
    SD.saveSettings({ ...settings(), examOrder: r.value });
    afterSettings(r.value === 'spread' ? '시험을 골고루 나눠서 공부합니다.' : '시험을 하나씩 차례로 공부합니다.');
  }));
  el.startEarly.addEventListener('change', () => {
    SD.saveSettings({ ...settings(), startEarly: el.startEarly.checked });
    afterSettings(el.startEarly.checked ? '여유 있을 때 미리 시작합니다.' : '미리 시작을 껐습니다.');
  });

  /* ---------- 쉬는 날 (specific dates off) ---------- */
  const isBreak = ymd => settings().restDays.includes(ymd);
  function saveBreaks(add, remove, note, msg) {
    const s = settings();
    const restDays = [...new Set([...s.restDays.filter(d => !remove.includes(d)), ...add])];
    const restNotes = { ...s.restNotes };
    remove.forEach(d => delete restNotes[d]);
    if (note) add.forEach(d => { restNotes[d] = note; });
    SD.saveSettings({ ...s, restDays, restNotes });
    afterSettings(msg);
  }
  function toggleBreak(ymd) {
    if (isBreak(ymd)) saveBreaks([], [ymd], '', `${md(ymd)} 쉬는 날을 취소했습니다.`);
    else saveBreaks([ymd], [], '', `${md(ymd)} 쉬는 날로 정했습니다. 그 날 공부는 다른 날로 옮겼어요.`);
  }
  $('#breakToday').addEventListener('click', () => toggleBreak(D.today()));
  $('#breakTomorrow').addEventListener('click', () => toggleBreak(D.addDays(D.today(), 1)));
  $('#breakTodayUndo').addEventListener('click', () => toggleBreak(D.today()));
  $('#addBreak').addEventListener('click', () => {
    const showError = msg => { el.breakError.textContent = msg; el.breakError.classList.toggle('d-none', !msg); };
    let from = el.breakFrom.value, to = el.breakTo.value || from;
    if (!from) { showError('시작 날짜를 선택하세요.'); el.breakFrom.focus(); return; }
    if (to < from) [from, to] = [to, from];
    if (D.diff(to, from) > 30) { showError('한 번에 31일까지 추가할 수 있어요.'); return; }
    showError('');
    const dates = [];
    for (let d = from; d <= to; d = D.addDays(d, 1)) dates.push(d);
    const note = el.breakNote.value.trim();
    el.breakFrom.value = ''; el.breakTo.value = ''; el.breakNote.value = '';
    saveBreaks(dates, [], note, dates.length === 1 ? `${md(from)} 쉬는 날을 추가했습니다.` : `${md(from)} – ${md(to)} ${dates.length}일을 쉬는 날로 추가했습니다.`);
  });
  el.breakList.addEventListener('click', e => {
    const b = e.target.closest('[data-from]');
    if (!b) return;
    saveBreaks([], settings().restDays.filter(d => d >= b.dataset.from && d <= b.dataset.to), '', '쉬는 날을 삭제했습니다.');
  });
  el.weekGrid.addEventListener('click', e => {
    const b = e.target.closest('[data-break]');
    if (b) toggleBreak(b.dataset.break);
  });

  /* =========================================================
     Render
     ========================================================= */
  const plannedTasks = () => ctx.active.filter(t => t.planned);

  function renderToday() {
    const items = ctx.plan.days[ctx.today] || [];
    const rows = Views.renderDayList(el.todayPlan, ctx.today, ctx, { plannedOnly: true, onEdit: edit, finish: true });
    el.todayEmpty.classList.toggle('d-none', rows.length > 0 || isBreak(ctx.today));
    const plannedH = items.reduce((s, i) => s + hrs(i), 0);
    const doneH = items.reduce((s, i) => s + Math.min(i.done, hrs(i)), 0);
    el.todayCount.textContent = items.length ? `${fmtH(doneH)} / ${fmtH(plannedH)} 완료` : '';

    const missing = ctx.plan.overflow.reduce((s, o) => s + o.hours, 0);
    const who = [...new Set(ctx.plan.overflow.map(o => o.title))].join(', ');
    el.overflow.classList.toggle('d-none', missing === 0);
    if (missing) el.overflow.textContent = `${fmtH(missing)}을 계획에 넣지 못했습니다 (${who}). 짧게 날 최대 공부 시간을 늘리거나 쉼·쉬는 날을 줄여 보세요.`;
  }

  function taskNode(t) {
    const node = el.tplTask.content.firstElementChild.cloneNode(true);
    node.dataset.id = t.id;
    node.classList.add(`sd-p-${t.priority}`);
    node.classList.toggle('is-done', t.completed);
    node.classList.toggle('is-editing', form.editingId() === t.id);
    $('.form-check-input', node).checked = t.completed;
    $('.sd-task-title', node).textContent = t.title;
    const type = $('.sd-type', node);
    type.textContent = SD.TYPE_LABEL[t.type];
    type.classList.add(`sd-type-${t.type}`);
    sizeDots($('.sd-size', node), t.size);
    $('.sd-subj', node).textContent = t.subject;
    const studied = SD.totalHours(t);
    $('.sd-studied', node).textContent = studied ? `공부 ${fmtH(studied)}` : '';
    const when = $('.sd-when', node);
    when.textContent = t.completed ? `마감 ${md(t.date)}` : relLabel(t.date).text;
    when.classList.toggle('is-late', isLate(t));
    const custom = $('.sd-custom', node);
    custom.classList.toggle('d-none', !t.plan);
    if (t.plan) custom.title = Planner.describe(Planner.params(t));
    $('.sd-source', node).classList.toggle('d-none', t.sourceEventId === null);
    $('.sd-orphan', node).classList.toggle('d-none', !t.orphaned);
    return node;
  }

  function renderList() {
    const list = plannedTasks()
      .filter(t => state.status === 'all' || (state.status === 'done' ? t.completed : !t.completed))
      .filter(t => state.type === 'all' || t.type === state.type)
      .sort((a, b) => a.date.localeCompare(b.date) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

    el.list.replaceChildren();
    if (!list.length) {
      el.list.append(make('p', 'sd-empty mb-0', state.status === 'done' ? '완료한 할 일이 없습니다.' : '조건에 맞는 할 일이 없습니다.'));
      return;
    }
    const groups = new Map();
    list.forEach(t => { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); });
    groups.forEach((items, ymd) => {
      const section = make('section', 'sd-group');
      const head = make('h3', 'sd-group-head');
      const r = relLabel(ymd);
      head.append(`${fmtDate(ymd)} 마감`, make('span', `sd-rel ${r.cls}`, r.text.replace(' 마감', '')));
      const ul = make('ul', 'sd-tasks');
      items.forEach(t => ul.append(taskNode(t)));
      section.append(head, ul);
      el.list.append(section);
    });
  }

  function renderWeek() {
    const today = ctx.today;
    const s = settings();
    const start = D.addDays(today, state.weekOffset);
    el.weekLabel.textContent = `${md(start)} – ${md(D.addDays(start, 6))}`;
    el.weekGrid.replaceChildren();
    const open = plannedTasks().filter(t => !t.completed);

    for (let i = 0; i < 7; i++) {
      const ymd = D.addDays(start, i);
      const d = D.parse(ymd);
      const avail = s.week[D.dow(ymd)];
      const day = make('div', 'sd-day' + (ymd === today ? ' is-today' : '') + (isBreak(ymd) ? ' is-break' : avail === 'off' ? ' is-rest' : ''));
      const head = make('div', 'sd-day-head');
      head.append(make('b', '', DOW[d.getDay()]), make('span', '', `${d.getMonth() + 1}/${d.getDate()}`));
      day.append(head);
      const toggle = make('button', 'sd-break-toggle' + (isBreak(ymd) ? ' on' : ''), isBreak(ymd) ? '쉬는 날 ✕' : '쉬기');
      toggle.type = 'button';
      toggle.dataset.break = ymd;
      toggle.setAttribute('aria-label', isBreak(ymd) ? `${fmtDate(ymd)} 쉬는 날 취소` : `${fmtDate(ymd)} 쉬는 날로 정하기`);
      day.append(toggle);

      if (isBreak(ymd)) { if (s.restNotes[ymd]) day.append(make('span', 'sd-day-tag', s.restNotes[ymd])); }
      else if (avail === 'off') day.append(make('span', 'sd-day-tag', '쉼'));
      else if (avail === 'long') day.append(make('span', 'sd-day-tag', '길게'));
      SD.eventsOn(ymd, ctx.events).filter(e => e.kind === 'schedule').forEach(e => day.append(make('span', 'sd-day-tag', e.title)));

      (ctx.plan.days[ymd] || []).forEach(it => {
        const card = make('button', `sd-mini sd-block-${it.block}` + (it.checked ? ' is-done' : '') + (it.reason === 'early' ? ' is-early' : ''));
        card.type = 'button';
        card.dataset.id = it.taskId;
        card.dataset.action = 'edit';
        card.title = '클릭해서 수정';
        card.append(make('span', 'sd-mini-title', it.title), make('span', 'sd-mini-block', it.label + (it.reason === 'early' ? ' · 미리' : '')));
        day.append(card);
      });

      const dayHours = (ctx.plan.days[ymd] || []).reduce((sum, it) => sum + hrs(it), 0);
      const cap = avail === 'long' ? s.longDayHours : avail === 'short' ? s.shortDayHours : 0;
      if (dayHours) day.append(make('span', 'sd-day-total', `${fmtH(dayHours)} / ${fmtH(cap)}`));
      open.filter(t => t.date === ymd).forEach(t => day.append(make('span', 'sd-due', `${t.type === 'exam' ? '시험' : '마감'} · ${t.title}`)));
      if (day.children.length === 2) day.append(make('span', 'sd-day-empty', '없음'));
      el.weekGrid.append(day);
    }
  }

  function renderSettings() {
    const s = settings();
    el.shortHours.value = s.shortDayHours;
    el.startEarly.checked = s.startEarly !== false;
    $(s.examOrder === 'spread' ? '#examOrderSpread' : '#examOrderOne').checked = true;
    $('#examOrderHint').textContent = s.examOrder === 'spread'
      ? '골고루: 시험마다 원래 기간 동안 같이 공부해요. 하루에 여러 과목이 섞여요.'
      : '하나씩: 앞 시험이 끝난 뒤에 다음 시험 공부를 시작해요. 시험이 붙어 있으면 뒤 시험 시간이 모자랄 수 있어요.';
    el.longHours.value = s.longDayHours;
    $$('[data-dow]', el.weekPick).forEach(b => {
      const v = s.week[Number(b.dataset.dow)];
      b.className = `sd-avail sd-avail-${v}`;
      $('.sd-avail-state', b).textContent = SD.AVAIL_LABEL[v];
      b.setAttribute('aria-label', `${DAY_NAME[b.dataset.dow]}: ${SD.AVAIL_LABEL[v]}. 눌러서 변경`);
    });
    const longDays = WEEK_ORDER.filter(d => s.week[d] === 'long').map(d => DOW[d]).join('');
    const offDays = WEEK_ORDER.filter(d => s.week[d] === 'off').map(d => DOW[d]).join('');
    el.settingsSummary.textContent = `길게 ${longDays || '없음'}` + (offDays ? ` · 쉼 ${offDays}` : '') + ` · 짧게 최대 ${s.shortDayHours}시간 · 시험 ${s.examOrder === 'spread' ? '골고루' : '하나씩'}`;
  }

  // upcoming break days, consecutive dates with the same note shown as one range
  function renderBreaks() {
    const s = settings();
    const today = ctx.today;
    const upcoming = s.restDays.filter(d => d >= today);
    const ranges = [];
    upcoming.forEach(d => {
      const note = s.restNotes[d] || '';
      const last = ranges[ranges.length - 1];
      if (last && D.addDays(last.to, 1) === d && last.note === note) last.to = d;
      else ranges.push({ from: d, to: d, note });
    });
    el.breakList.replaceChildren();
    ranges.forEach(r => {
      const li = make('li', 'sd-break-item');
      const days = D.diff(r.to, r.from) + 1;
      li.append(make('span', 'sd-break-when', r.from === r.to ? fmtDate(r.from) : `${md(r.from)} – ${md(r.to)} · ${days}일`));
      if (r.note) li.append(make('span', 'sd-break-note', r.note));
      const del = make('button', 'btn btn-sm btn-link sd-break-del', '삭제');
      del.type = 'button';
      del.dataset.from = r.from;
      del.dataset.to = r.to;
      del.setAttribute('aria-label', `${r.from === r.to ? fmtDate(r.from) : `${md(r.from)}부터 ${md(r.to)}까지`} 쉬는 날 삭제`);
      li.append(del);
      el.breakList.append(li);
    });
    if (!ranges.length) el.breakList.append(make('li', 'sd-break-empty', '정해진 쉬는 날이 없어요.'));
    el.breakCount.textContent = upcoming.length ? `앞으로 ${upcoming.length}일` : '';
    $('#breakToday').textContent = isBreak(today) ? '오늘 쉬기 취소' : '오늘 쉬기';
    $('#breakTomorrow').textContent = isBreak(D.addDays(today, 1)) ? '내일 쉬기 취소' : '내일 쉬기';
    $('#breakToday').classList.toggle('active', isBreak(today));
    $('#breakTomorrow').classList.toggle('active', isBreak(D.addDays(today, 1)));

    el.breakTodayNote.classList.toggle('d-none', !isBreak(today));
    el.breakTodayText.textContent = `오늘은 쉬는 날이에요${s.restNotes[today] ? ` (${s.restNotes[today]})` : ''}. 오늘 공부는 다른 날로 옮겼어요.`;
  }

  function render(msg) {
    notify(msg);
    ctx = Views.load();
    const hasAny = plannedTasks().length > 0;
    el.empty.classList.toggle('d-none', hasAny);
    el.list.classList.toggle('d-none', !hasAny || state.view !== 'list');
    el.week.classList.toggle('d-none', !hasAny || state.view !== 'week');
    el.filters.classList.toggle('invisible', state.view !== 'list');
    renderToday();
    if (hasAny) { if (state.view === 'list') renderList(); else renderWeek(); }
    renderSettings();
    renderBreaks();
  }

  /* ---------- sample data (empty state button) ---------- */
  $('#seedBtn').addEventListener('click', () => {
    const t0 = D.today();
    const rows = [
      // title, type, subject, due (days from today), size, priority
      ['예시 팀 프로젝트', 'project', '예시 과목 A', 10, 5, 'high'],
      ['예시 퀴즈 2', 'exam', '예시 과목 B', 6, 3, 'high'],
      ['예시 복습', 'general', '예시 과목 A', 1, 2, 'mid'],
      ['예시 연습문제', 'assignment', '예시 과목 C', -1, 2, 'low'],
      ['예시 실습 보고서', 'assignment', '예시 과목 C', 9, 3, 'low']
    ];
    const base = r => ({ id: SD.newId(), title: r[0], type: r[1], subject: r[2], date: D.addDays(t0, r[3]), size: r[4], priority: r[5],
      completed: false, planned: true, createdAt: r[3] < 0 ? D.addDays(t0, r[3] - 3) : t0, sessions: [], plan: null, sourceEventId: null, sourceRev: null, archived: false, orphaned: false });
    const tasks = SD.getTasks().concat(rows.map(base));
    // a finished midterm that took longer than planned → the planner scales the same class's quiz (×1.4)
    const mid = base(['예시 중간고사', 'exam', '예시 과목 B', -19, 4, 'high']);
    mid.createdAt = D.addDays(t0, -26);
    mid.completed = true;
    mid.sessions = [-24, -23, -22, -21, -20].map((n, i) => ({ date: D.addDays(t0, n), hours: [5, 5, 6, 6, 6][i] }));
    tasks.push(mid);
    // two plain to-dos (no planner)
    tasks.push(SD.newTodo({ title: '도서관 책 반납', due: t0 }), SD.newTodo({ title: '회의 자료 출력', due: D.addDays(t0, 2), subject: '예시 과목 A' }),
      SD.newTodo({ title: '단어 30개', due: t0, repeat: 'daily' }));
    ['예시 과목 A', '예시 과목 B', '예시 과목 C', '예시 과목 D'].forEach(SD.addSubject);
    SD.saveTasks(tasks);
    // one Calendar deadline + one schedule, to show the automatic link (only if Calendar has nothing yet)
    if (!SD.getEvents().length) {
      SD.saveEvents([
        { id: SD.newId(), kind: 'deadline', title: '예시 퀴즈 3', date: D.addDays(t0, 7), type: 'exam', subject: '예시 과목 D', size: 4, priority: 'high', showDday: true },
        { id: SD.newId(), kind: 'schedule', title: '동아리 MT', date: D.addDays(t0, 4), start: '10:00', end: '18:00' }
      ]);
      SD.syncDeadlines();
    }
    render('예시 데이터를 불러왔습니다.');
  });

  /* ---------- other tabs (Calendar, Dashboard) changed data → refresh ---------- */
  SD.onChange([SD.KEYS.tasks, SD.KEYS.events, SD.KEYS.settings], () => render());

  /* ---------- init ---------- */
  $('#todayLabel').textContent = `오늘 ${fmtDate(D.today())}`;
  render();
})();
