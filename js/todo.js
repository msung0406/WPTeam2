/* =========================================================
   Todo · Planner — todo.html   담당 김주환
   Data: SD (js/storage.js) · Plan: Planner (js/planner.js)
   The plan is recalculated on every change; only tasks/settings are saved.
   ========================================================= */
(() => {
  'use strict';

  const D = SD.date;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const PRIORITY_RANK = { high: 0, mid: 1, low: 2 };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  const el = {
    form: $('#taskForm'), title: $('#taskTitle'), type: $('#taskType'), subject: $('#taskSubject'), date: $('#taskDate'),
    sizeGroup: $('#sizeGroup'), sizeHint: $('#sizeHint'), formTitle: $('#formTitle'), editingBadge: $('#editingBadge'),
    submit: $('#submitBtn'), cancel: $('#cancelBtn'),
    todayPlan: $('#todayPlan'), todayEmpty: $('#todayEmpty'), todayCount: $('#todayCount'), overflow: $('#overflowAlert'),
    list: $('#listView'), week: $('#weekView'), weekGrid: $('#weekGrid'), weekLabel: $('#weekLabel'),
    filters: $('#listFilters'), empty: $('#emptyState'),
    tplTask: $('#tplTask'), tplPlan: $('#tplPlan'),
    shortHours: $('#shortHours'), longHours: $('#longHours'), settingsSummary: $('#settingsSummary'),
    breakFrom: $('#breakFrom'), breakTo: $('#breakTo'), breakNote: $('#breakNote'), breakList: $('#breakList'), breakCount: $('#breakCount'),
    breakError: $('#breakError'), breakTodayNote: $('#breakTodayNote'), breakTodayText: $('#breakTodayText'),
    weekPick: $('#weekPick'),
    tuneWindow: $('#tuneWindow'), tuneShort: $('#tuneShort'), tuneLong: $('#tuneLong'), tuneHours: $('#tuneHours'), tuneEarly: $('#tuneEarly'), tuneEarlyCol: $('#tuneEarlyCol'),
    startEarly: $('#startEarly'),
    tuneWindowLabel: $('#tuneWindowLabel'), tuneHoursLabel: $('#tuneHoursLabel'), tuneLongLabel: $('#tuneLongLabel'), tuneShortCol: $('#tuneShortCol')
  };
  const tuneCollapse = bootstrap.Collapse.getOrCreateInstance('#tuneBody', { toggle: false });

  const state = { status: 'open', type: 'all', view: 'list', weekOffset: 0, editingId: null, deleteId: null, sizeTouched: false };
  let tasks = [], events = [], settings = SD.getSettings(), plan = { days: {}, overflow: [] };

  const deleteModal = new bootstrap.Modal('#deleteModal');
  const toast = new bootstrap.Toast('#toast', { delay: 2200 });
  const notify = msg => { $('#toastMsg').textContent = msg; toast.show(); };

  /* ---------- data ---------- */
  function reload() {
    tasks = SD.getTasks();
    events = SD.getEvents();
    settings = SD.getSettings();
    plan = Planner.plan({ tasks, events, settings, today: D.today() });
  }
  function saveAndRender(msg) {
    if (!SD.saveTasks(tasks)) { notify('저장하지 못했습니다. 브라우저의 사이트 데이터 설정을 확인하세요.'); return; }
    if (msg) notify(msg);
    reload(); render();
  }
  const findTask = id => tasks.find(t => t.id === id);

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
  const fmtH = h => (h === 0 ? '0시간' : h < 1 ? `${h * 60}분` : Number.isInteger(h) ? `${h}시간` : `${Math.floor(h)}시간 30분`);
  function sizeDots(node, size) {
    node.replaceChildren();
    for (let i = 1; i <= 5; i++) node.append(make('i', i <= size ? 'on' : ''));
    node.setAttribute('aria-label', `작업량 ${SD.SIZE_LABEL[size]}`);
    node.title = `작업량: ${SD.SIZE_LABEL[size]}`;
  }

  /* =========================================================
     Form: add / edit
     ========================================================= */
  SD.TYPES.forEach(t => el.type.add(new Option(SD.TYPE_LABEL[t], t)));
  SD.TYPES.forEach(t => $('#filterType').add(new Option(SD.TYPE_LABEL[t], t)));
  SD.SUBJECTS.forEach(s => el.subject.add(new Option(s, s)));
  SD.SIZES.forEach(n => {
    const input = make('input', 'btn-check');
    Object.assign(input, { type: 'radio', name: 'size', id: `size${n}`, value: n, autocomplete: 'off' });
    const label = make('label', 'btn btn-outline-secondary sd-size-btn', SD.SIZE_LABEL[n]);
    label.htmlFor = input.id;
    el.sizeGroup.append(input, label);
  });

  const currentSize = () => Number(($('input[name="size"]:checked') || {}).value || 3);
  const setSize = n => { $(`#size${n}`).checked = true; updateHint(); };

  // 세부 조정: empty field = size default
  function readOverride() {
    const num = (input, lo, hi) => { if (input.value === '') return null; const n = parseInt(input.value, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
    const hours = el.tuneHours.value === '' ? null : Math.min(12, Math.max(0.5, Math.round(parseFloat(el.tuneHours.value) * 2) / 2)) || null;
    const isExam = el.type.value === 'exam';
    const o = { window: num(el.tuneWindow, 0, 30), short: isExam ? null : num(el.tuneShort, 0, 20), long: num(el.tuneLong, 0, 4), hours,
      early: isExam ? num(el.tuneEarly, 0, 30) : null };
    return Object.values(o).every(v => v === null) ? null : o;
  }
  function fillOverride(o) {
    el.tuneWindow.value = o && o.window !== null ? o.window : '';
    el.tuneShort.value = o && o.short !== null ? o.short : '';
    el.tuneLong.value = o && o.long !== null ? o.long : '';
    el.tuneHours.value = o && o.hours !== null ? o.hours : '';
    el.tuneEarly.value = o && o.early != null ? o.early : '';
  }

  // Live preview of where the sessions will land (uses your week, rest days and Calendar schedule)
  function updateHint() {
    const size = currentSize();
    const isExam = el.type.value === 'exam';
    const editing = state.editingId !== null ? findTask(state.editingId) : null;
    const draft = { id: editing ? editing.id : null, type: el.type.value, subject: el.subject.value, size, date: el.date.value,
      createdAt: editing ? editing.createdAt : D.today(), plan: readOverride() };
    const pv = Planner.preview(draft, settings, events, tasks);
    const defaults = Planner.preview({ ...draft, plan: null }, settings, events, tasks).params;   // placeholders = size defaults

    el.tuneShortCol.classList.toggle('d-none', isExam);
    el.tuneEarlyCol.classList.toggle('d-none', !isExam);
    el.tuneEarly.placeholder = defaults.early ?? '';
    el.tuneWindowLabel.textContent = isExam ? '공부할 날 수' : '시작 (마감 n일 전)';
    el.tuneHoursLabel.textContent = isExam ? '가장 긴 날 (시간)' : '세션 길이 (시간)';
    el.tuneLongLabel.textContent = isExam ? '종일 (0 또는 1)' : '종일 (일)';
    el.tuneLong.max = isExam ? 1 : 4;
    el.tuneWindow.placeholder = defaults.window;
    el.tuneShort.placeholder = defaults.short ?? '';
    el.tuneHours.placeholder = defaults.hours;
    el.tuneLong.placeholder = defaults.long;

    const total = pv.totalHours ? ` · 총 약 ${Math.round(pv.totalHours)}시간` : '';
    el.sizeHint.replaceChildren(make('span', 'sd-hint-rule', Planner.describe(pv.params) + total + (draft.plan ? ' (맞춤)' : '')));
    if (pv.earlyHours) el.sizeHint.append(make('span', 'sd-hint-early', `여유 있으면 그 전에 미리 복습 1시간 × ${pv.earlyHours} (선택)`));
    if (pv.after) el.sizeHint.append(make('span', 'sd-hint-after', `'${pv.after}' 시험이 끝난 뒤에 시작합니다`));
    if (pv.factor && pv.factor !== 1 && !(draft.plan && draft.plan.hours !== null)) {
      el.sizeHint.append(make('span', 'sd-hint-factor',
        `${draft.subject} 지난 시험은 계획의 ${pv.factor}배 걸렸어요 → 공부 시간에 반영했습니다`));
    }
    if (!el.date.value) return;
    const today = D.today();
    const sessions = pv.sessions.filter(s => s.date >= today && s.reason !== 'early').map(s => `${md(s.date)} ${s.label}`);
    el.sizeHint.append(make('span', 'sd-hint-dates', sessions.length ? sessions.join(' · ') : '남은 기간이 짧아 오늘 바로 진행합니다'));
  }

  el.type.addEventListener('change', () => { if (!state.sizeTouched) setSize(SD.TYPE_DEFAULT_SIZE[el.type.value]); else updateHint(); });
  el.sizeGroup.addEventListener('change', () => { state.sizeTouched = true; updateHint(); });
  el.date.addEventListener('change', updateHint);
  el.subject.addEventListener('change', updateHint);
  [el.tuneWindow, el.tuneShort, el.tuneLong, el.tuneHours, el.tuneEarly].forEach(i => i.addEventListener('input', updateHint));
  $('#tuneReset').addEventListener('click', () => { fillOverride(null); updateHint(); });

  function lockLinkedFields(locked) {
    [el.title, el.date, el.type].forEach(i => { i.disabled = locked; });
  }

  function resetForm() {
    state.editingId = null;
    state.sizeTouched = false;
    el.form.reset();
    el.form.classList.remove('was-validated');
    lockLinkedFields(false);
    el.date.value = D.addDays(D.today(), 7);
    el.type.value = 'assignment';
    fillOverride(null);
    tuneCollapse.hide();
    setSize(SD.TYPE_DEFAULT_SIZE.assignment);
    el.formTitle.textContent = '할 일 추가';
    el.submit.textContent = '추가';
    el.editingBadge.classList.add('d-none');
    el.cancel.classList.add('d-none');
  }

  function startEdit(id) {
    const t = findTask(id);
    if (!t) return;
    state.editingId = id;
    state.sizeTouched = true;
    el.form.classList.remove('was-validated');
    el.title.value = t.title;
    el.type.value = t.type;
    if (![...el.subject.options].some(o => o.value === t.subject)) el.subject.add(new Option(t.subject, t.subject));
    el.subject.value = t.subject;
    el.date.value = t.date;
    $(`input[name="priority"][value="${t.priority}"]`).checked = true;
    fillOverride(t.plan);
    if (t.plan) tuneCollapse.show(); else tuneCollapse.hide();
    setSize(t.size);
    lockLinkedFields(t.sourceEventId !== null);
    el.formTitle.textContent = t.sourceEventId !== null ? '할 일 수정 (제목·종류·마감일은 캘린더에서)' : '할 일 수정';
    el.submit.textContent = '수정 저장';
    el.editingBadge.classList.remove('d-none');
    el.cancel.classList.remove('d-none');
    (t.sourceEventId !== null ? $('#size' + t.size) : el.title).focus();
    render();
  }

  el.form.addEventListener('submit', e => {
    e.preventDefault();
    el.title.value = el.title.value.trim();
    if (!el.form.checkValidity()) { el.form.classList.add('was-validated'); return; }

    const data = { subject: el.subject.value, size: currentSize(), priority: $('input[name="priority"]:checked').value, plan: readOverride() };
    if (!el.title.disabled) Object.assign(data, { title: el.title.value, type: el.type.value, date: el.date.value });

    if (state.editingId !== null) {
      Object.assign(findTask(state.editingId) || {}, data);
      resetForm();
      saveAndRender('수정했습니다. 계획을 다시 계산했습니다.');
    } else {
      tasks.push({ id: SD.newId(), ...data, completed: false, createdAt: D.today(), sessions: [],
        sourceEventId: null, sourceRev: null, archived: false, orphaned: false });
      resetForm();
      saveAndRender('추가했습니다. 계획에 반영했습니다.');
    }
  });

  el.cancel.addEventListener('click', () => { resetForm(); render(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.editingId !== null && !document.querySelector('.modal.show')) { resetForm(); render(); }
  });

  /* =========================================================
     Actions (one delegated listener each)
     ========================================================= */
  document.addEventListener('change', e => {
    const box = e.target;
    const host = box.closest('[data-id]');
    if (!host) return;
    const id = Number(host.dataset.id);
    if (box.matches('[data-action="complete"]')) {
      SD.setCompleted(id, box.checked);
      notify(box.checked ? '완료했습니다. 남은 세션이 계획에서 빠졌습니다.' : '다시 진행 중으로 바꿨습니다.');
      reload(); render();
    } else if (box.matches('[data-action="session"]')) {
      const it = (plan.days[D.today()] || []).find(i => i.taskId === id && i.block === box.dataset.block);
      const planned = it ? (it.block === 'day' ? settings.longDayHours : it.hours) : 1;
      SD.toggleSession(id, D.today(), box.checked, Math.max(0.5, planned - (it ? it.done : 0)));
      reload(); render();
      const today = plan.days[D.today()] || [];
      if (box.checked && today.length && today.every(i => i.checked)) notify('오늘 계획을 모두 끝냈습니다.');
    }
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-action="edit"], [data-action="delete"], [data-action="finish"]');
    if (!btn) return;
    const id = Number(btn.closest('[data-id]').dataset.id);
    if (btn.dataset.action === 'edit') startEdit(id);
    else if (btn.dataset.action === 'finish') {
      SD.setCompleted(id, true);
      notify('할 일을 완료했습니다. 남은 세션이 계획에서 빠졌습니다.');
      reload(); render();
    } else {
      const t = findTask(id);
      if (!t) return;
      state.deleteId = id;
      $('#deleteTitle').textContent = t.title;
      deleteModal.show();
    }
  });

  $('#confirmDelete').addEventListener('click', () => {
    const t = findTask(state.deleteId);
    // linked to a Calendar deadline → hide instead of delete, or the next sync recreates it
    if (t && t.sourceEventId !== null) t.archived = true;
    else tasks = tasks.filter(x => x.id !== state.deleteId);
    if (state.editingId === state.deleteId) resetForm();
    state.deleteId = null;
    deleteModal.hide();
    saveAndRender('삭제했습니다.');
  });

  /* ---------- toolbar ---------- */
  $('#filterStatus').addEventListener('change', e => { state.status = e.target.value; render(); });
  $('#filterType').addEventListener('change', e => { state.type = e.target.value; render(); });
  $$('[data-view]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    $$('[data-view]').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
    render();
  }));
  $$('input[name="weekPick"]').forEach(r => r.addEventListener('change', () => { state.weekOffset = Number(r.value); render(); }));

  /* ---------- settings ---------- */
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
    const week = [...settings.week];
    const i = Number(b.dataset.dow);
    week[i] = SD.AVAIL[(SD.AVAIL.indexOf(week[i]) + 1) % SD.AVAIL.length];   // 쉼 → 짧게 → 길게 → 쉼
    SD.saveSettings({ ...settings, week });
    reload(); render(); updateHint();
  });
  for (let n = 1; n <= 12; n++) el.shortHours.add(new Option(`${n}시간`, n));
  for (let n = 4; n <= 14; n++) el.longHours.add(new Option(`${n}시간`, n));
  [el.shortHours, el.longHours].forEach(sel => sel.addEventListener('change', () => {
    SD.saveSettings({ ...settings, shortDayHours: Number(el.shortHours.value), longDayHours: Number(el.longHours.value) });
    reload(); render(); updateHint(); notify('설정을 저장했습니다.');
  }));
  el.startEarly.addEventListener('change', () => {
    SD.saveSettings({ ...settings, startEarly: el.startEarly.checked });
    reload(); render(); updateHint();
    notify(el.startEarly.checked ? '여유 있을 때 미리 시작합니다.' : '미리 시작을 껐습니다.');
  });
  /* ---------- 쉬는 날 (specific dates off) ---------- */
  const isBreak = ymd => settings.restDays.includes(ymd);
  function saveBreaks(add, remove, note) {
    const restDays = [...new Set([...settings.restDays.filter(d => !remove.includes(d)), ...add])];
    const restNotes = { ...settings.restNotes };
    remove.forEach(d => delete restNotes[d]);
    if (note) add.forEach(d => { restNotes[d] = note; });
    SD.saveSettings({ ...settings, restDays, restNotes });
    reload(); render(); updateHint();
  }
  function toggleBreak(ymd) {
    if (isBreak(ymd)) { saveBreaks([], [ymd]); notify(`${md(ymd)} 쉬는 날을 취소했습니다.`); }
    else { saveBreaks([ymd], []); notify(`${md(ymd)} 쉬는 날로 정했습니다. 그 날 공부는 다른 날로 옮겼어요.`); }
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
    saveBreaks(dates, [], el.breakNote.value.trim());
    el.breakFrom.value = ''; el.breakTo.value = ''; el.breakNote.value = '';
    notify(dates.length === 1 ? `${md(from)} 쉬는 날을 추가했습니다.` : `${md(from)} – ${md(to)} ${dates.length}일을 쉬는 날로 추가했습니다.`);
  });
  el.breakList.addEventListener('click', e => {
    const b = e.target.closest('[data-from]');
    if (!b) return;
    const remove = settings.restDays.filter(d => d >= b.dataset.from && d <= b.dataset.to);
    saveBreaks([], remove);
    notify('쉬는 날을 삭제했습니다.');
  });
  el.weekGrid.addEventListener('click', e => {
    const b = e.target.closest('[data-break]');
    if (b) toggleBreak(b.dataset.break);
  });

  /* =========================================================
     Render
     ========================================================= */
  function renderToday() {
    const today = D.today();
    const items = plan.days[today] || [];
    el.todayPlan.replaceChildren();
    el.todayEmpty.classList.toggle('d-none', items.length > 0);
    const plannedH = items.reduce((s, i) => s + (i.block === 'day' ? settings.longDayHours : i.hours), 0);
    const doneH = items.reduce((s, i) => s + Math.min(i.done, i.block === 'day' ? settings.longDayHours : i.hours), 0);
    el.todayCount.textContent = items.length ? `${fmtH(doneH)} / ${fmtH(plannedH)} 완료` : '';

    items.forEach((it, idx) => {
      const node = el.tplPlan.content.firstElementChild.cloneNode(true);
      node.dataset.id = it.taskId;
      node.classList.toggle('is-done', it.checked);
      const cb = $('.form-check-input', node);
      cb.id = `plan-${idx}`;
      cb.checked = it.checked;
      const title = $('.sd-plan-title', node);
      title.htmlFor = cb.id;
      title.textContent = it.title;
      const block = $('.sd-block', node);
      block.textContent = it.label + (it.done > 0 && !it.checked ? ` 중 ${fmtH(it.done)}` : '');
      block.classList.add(`sd-block-${it.block}`);
      cb.dataset.block = it.block;
      const reason = Planner.REASON_LABEL[it.reason];
      if (reason) {
        const r = $('.sd-reason', node);
        r.textContent = reason;
        r.classList.remove('d-none');
        r.classList.add(`sd-reason-${it.reason}`);
      }
      el.todayPlan.append(node);
    });

    const missing = plan.overflow.reduce((s, o) => s + o.hours, 0);
    const who = [...new Set(plan.overflow.map(o => o.title))].join(', ');
    el.overflow.classList.toggle('d-none', missing === 0);
    if (missing) el.overflow.textContent = `${fmtH(missing)}을 계획에 넣지 못했습니다 (${who}). 짧게 날 최대 공부 시간을 늘리거나 쉼·쉬는 날을 줄여 보세요.`;
  }

  function taskNode(t) {
    const node = el.tplTask.content.firstElementChild.cloneNode(true);
    node.dataset.id = t.id;
    node.classList.add(`sd-p-${t.priority}`);
    node.classList.toggle('is-done', t.completed);
    node.classList.toggle('is-editing', state.editingId === t.id);
    $('.form-check-input', node).checked = t.completed;
    $('.sd-task-title', node).textContent = t.title;                 // textContent → stored HTML never runs
    const type = $('.sd-type', node);
    type.textContent = SD.TYPE_LABEL[t.type];
    type.classList.add(`sd-type-${t.type}`);
    sizeDots($('.sd-size', node), t.size);
    $('.sd-subj', node).textContent = t.subject;
    const studied = SD.totalHours(t);
    $('.sd-studied', node).textContent = studied ? `공부 ${fmtH(studied)}` : '';
    const r = relLabel(t.date);
    const when = $('.sd-when', node);
    when.textContent = t.completed ? `마감 ${md(t.date)}` : r.text;
    when.classList.toggle('is-late', isLate(t));
    const custom = $('.sd-custom', node);
    custom.classList.toggle('d-none', !t.plan);
    if (t.plan) custom.title = Planner.describe(Planner.params(t));
    $('.sd-source', node).classList.toggle('d-none', t.sourceEventId === null);
    $('.sd-orphan', node).classList.toggle('d-none', !t.orphaned);
    return node;
  }

  function renderList() {
    const list = SD.activeTasks(tasks)
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
    const today = D.today();
    const start = D.addDays(today, state.weekOffset);
    el.weekLabel.textContent = `${md(start)} – ${md(D.addDays(start, 6))}`;
    el.weekGrid.replaceChildren();
    const active = SD.activeTasks(tasks).filter(t => !t.completed);

    for (let i = 0; i < 7; i++) {
      const ymd = D.addDays(start, i);
      const d = D.parse(ymd);
      const day = make('div', 'sd-day' + (ymd === today ? ' is-today' : '') + (isBreak(ymd) ? ' is-break' : settings.week[D.dow(ymd)] === 'off' ? ' is-rest' : ''));
      const head = make('div', 'sd-day-head');
      head.append(make('b', '', DOW[d.getDay()]), make('span', '', `${d.getMonth() + 1}/${d.getDate()}`));
      day.append(head);
      const toggle = make('button', 'sd-break-toggle' + (isBreak(ymd) ? ' on' : ''), isBreak(ymd) ? '쉬는 날 ✕' : '쉬기');
      toggle.type = 'button';
      toggle.dataset.break = ymd;
      toggle.setAttribute('aria-label', isBreak(ymd) ? `${fmtDate(ymd)} 쉬는 날 취소` : `${fmtDate(ymd)} 쉬는 날로 정하기`);
      day.append(toggle);

      if (isBreak(ymd)) { if (settings.restNotes[ymd]) day.append(make('span', 'sd-day-tag', settings.restNotes[ymd])); }
      else if (settings.week[D.dow(ymd)] === 'off') day.append(make('span', 'sd-day-tag', '쉼'));
      else if (settings.week[D.dow(ymd)] === 'long') day.append(make('span', 'sd-day-tag', '길게'));
      SD.eventsOn(ymd, events).filter(e => e.kind === 'schedule').forEach(e => day.append(make('span', 'sd-day-tag', e.title)));

      (plan.days[ymd] || []).forEach(it => {
        const card = make('button', `sd-mini sd-block-${it.block}` + (it.checked ? ' is-done' : '') + (it.reason === 'early' ? ' is-early' : ''));
        card.type = 'button';
        card.dataset.id = it.taskId;
        card.dataset.action = 'edit';
        card.title = '클릭해서 수정';
        card.append(make('span', 'sd-mini-title', it.title), make('span', 'sd-mini-block', it.label + (it.reason === 'early' ? ' · 미리' : '')));
        day.append(card);
      });

      const dayHours = (plan.days[ymd] || []).reduce((s, it) => s + (it.block === 'day' ? settings.longDayHours : it.hours), 0);
      if (dayHours) day.append(make('span', 'sd-day-total', `${fmtH(dayHours)} / ${fmtH(settings.week[D.dow(ymd)] === 'long' ? settings.longDayHours : settings.week[D.dow(ymd)] === 'short' ? settings.shortDayHours : 0)}`));
      active.filter(t => t.date === ymd).forEach(t => day.append(make('span', 'sd-due', `${t.type === 'exam' ? '시험' : '마감'} · ${t.title}`)));
      if (day.children.length === 1) day.append(make('span', 'sd-day-empty', '없음'));
      el.weekGrid.append(day);
    }
  }

  function renderSummary() {
    const today = D.today();
    const items = plan.days[today] || [];
    const hrs = i => (i.block === 'day' ? settings.longDayHours : i.hours);
    const planned = items.reduce((s, i) => s + hrs(i), 0);
    const done = items.reduce((s, i) => s + Math.min(i.done, hrs(i)), 0);
    const pct = planned ? Math.round((done / planned) * 100) : 0;
    $('#statToday').replaceChildren(fmtH(done), make('small', '', ` / ${fmtH(planned)}`));
    $('#statTodayBar').style.width = `${pct}%`;
    $('#statTodayBarWrap').setAttribute('aria-valuenow', pct);

    const active = SD.activeTasks(tasks);
    $('#statOpen').textContent = active.filter(t => !t.completed).length;
    const late = active.filter(isLate).length;
    $('#statLate').textContent = late;
    $('#statLateCard').classList.toggle('sd-stat-late', late > 0);
    let week = 0;
    for (let i = 0; i < 7; i++) week += (plan.days[D.addDays(today, i)] || []).reduce((s, it) => s + hrs(it), 0);
    $('#statWeek').textContent = fmtH(week);
  }

  function renderSettings() {
    el.shortHours.value = settings.shortDayHours;
    el.startEarly.checked = settings.startEarly !== false;
    el.longHours.value = settings.longDayHours;
    $$('[data-dow]', el.weekPick).forEach(b => {
      const v = settings.week[Number(b.dataset.dow)];
      b.className = `sd-avail sd-avail-${v}`;
      $('.sd-avail-state', b).textContent = SD.AVAIL_LABEL[v];
      b.setAttribute('aria-label', `${DAY_NAME[b.dataset.dow]}: ${SD.AVAIL_LABEL[v]}. 눌러서 변경`);
    });
    const longDays = WEEK_ORDER.filter(d => settings.week[d] === 'long').map(d => DOW[d]).join('');
    const offDays = WEEK_ORDER.filter(d => settings.week[d] === 'off').map(d => DOW[d]).join('');
    el.settingsSummary.textContent = `길게 ${longDays || '없음'}` + (offDays ? ` · 쉼 ${offDays}` : '') + ` · 짧게 최대 ${settings.shortDayHours}시간`;
  }

  // upcoming break days, consecutive dates with the same note shown as one range
  function renderBreaks() {
    const today = D.today();
    const upcoming = settings.restDays.filter(d => d >= today);
    const ranges = [];
    upcoming.forEach(d => {
      const note = settings.restNotes[d] || '';
      const last = ranges[ranges.length - 1];
      if (last && D.addDays(last.to, 1) === d && last.note === note) last.to = d;
      else ranges.push({ from: d, to: d, note });
    });
    el.breakList.replaceChildren();
    ranges.forEach(r => {
      const li = make('li', 'sd-break-item');
      const days = D.diff(r.to, r.from) + 1;
      const when = make('span', 'sd-break-when', r.from === r.to ? fmtDate(r.from) : `${md(r.from)} – ${md(r.to)} · ${days}일`);
      li.append(when);
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

    const todayOff = isBreak(today);
    el.breakTodayNote.classList.toggle('d-none', !todayOff);
    el.breakTodayText.textContent = `오늘은 쉬는 날이에요${settings.restNotes[today] ? ` (${settings.restNotes[today]})` : ''}. 오늘 공부는 다른 날로 옮겼어요.`;
    if (todayOff) el.todayEmpty.classList.add('d-none');
  }

  function render() {
    const hasAny = SD.activeTasks(tasks).length > 0;
    el.empty.classList.toggle('d-none', hasAny);
    el.list.classList.toggle('d-none', !hasAny || state.view !== 'list');
    el.week.classList.toggle('d-none', !hasAny || state.view !== 'week');
    el.filters.classList.toggle('invisible', state.view !== 'list');
    renderToday();
    if (hasAny) { if (state.view === 'list') renderList(); else renderWeek(); }
    renderSummary();
    renderSettings();
    renderBreaks();
  }

  /* ---------- sample data (empty state button) ---------- */
  $('#seedBtn').addEventListener('click', () => {
    const t0 = D.today();
    const rows = [
      // title, type, subject, due (days from today), size, priority
      ['팀프로젝트 Todo · Planner 구현', 'project', 'Web Programming', 18, 5, 'high'],
      ['데통네 퀴즈 2', 'exam', 'Networking', 6, 3, 'high'],
      ['JS DOM · 이벤트 복습', 'general', 'Web Programming', 1, 2, 'mid'],
      ['알고리즘 연습문제 3장', 'assignment', 'Algorithms', -1, 2, 'low'],
      ['K-PaaS 실습 보고서', 'assignment', 'Cloud', 9, 3, 'low']
    ];
    const base = r => ({ id: SD.newId(), title: r[0], type: r[1], subject: r[2], date: D.addDays(t0, r[3]), size: r[4], priority: r[5],
      completed: false, createdAt: r[3] < 0 ? D.addDays(t0, r[3] - 3) : t0, sessions: [], plan: null, sourceEventId: null, sourceRev: null, archived: false, orphaned: false });
    tasks = rows.map(base);
    // a finished DCN midterm that took longer than planned → the planner scales the DCN quiz (×1.4)
    const mid = base(['데통네 중간고사', 'exam', 'Networking', -19, 4, 'high']);
    mid.createdAt = D.addDays(t0, -26);
    mid.completed = true;
    mid.sessions = [-24, -23, -22, -21, -20].map((n, i) => ({ date: D.addDays(t0, n), hours: [5, 5, 6, 6, 6][i] }));
    tasks.push(mid);
    SD.saveTasks(tasks);
    // one Calendar deadline, to show the automatic link (only if Calendar has nothing yet)
    if (!SD.getEvents().length) {
      SD.saveEvents([{ id: SD.newId(), kind: 'deadline', title: '자율주행 퀴즈 3', date: D.addDays(t0, 7), type: 'exam',
        subject: 'Autonomous Driving', size: 4, priority: 'high', showDday: true }]);
      SD.syncDeadlines();
    }
    reload(); render();
    notify('예시 데이터를 불러왔습니다.');
  });

  /* ---------- other tabs (Calendar, Main) changed data → refresh ---------- */
  SD.onChange([SD.KEYS.tasks, SD.KEYS.events, SD.KEYS.settings], () => { reload(); render(); });

  /* ---------- init ---------- */
  $('#todayLabel').textContent = `오늘 ${fmtDate(D.today())}`;
  reload();
  resetForm();
  render();
})();
