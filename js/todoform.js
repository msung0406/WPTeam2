/* =========================================================
   Study Dashboard — shared to-do form (load after storage.js + planner.js)
   Calendar · Todo: plain to-do by default, "플래너에 추가" switch (off) reveals
                    type · size · 세부 조정 → the task gets study sessions.
   Planner:         same form with the switch forced on (plannerOnly).
     const form = TodoForm.create(rootEl, { plannerOnly, onSaved(msg) })
     form.edit(id) · form.reset() · form.setDate(ymd)
   Owner of writes: tasks (SD.saveTasks).
   Maintainer: 김주환
   ========================================================= */
const TodoForm = (() => {
  'use strict';

  const D = SD.date;
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  // static markup only (no user text) → innerHTML is safe here
  const MARKUP = `
  <form class="sd-tform" novalidate>
    <h2 class="h6 fw-bold d-flex justify-content-between align-items-center mb-3">
      <span data-f="heading">할 일 추가</span>
      <span class="badge rounded-pill sd-editing-badge d-none" data-f="badge">수정 중</span>
    </h2>
    <div class="mb-2">
      <label class="form-label small text-secondary" data-for="title">제목</label>
      <input type="text" class="form-control" data-f="title" maxlength="80" required placeholder="예: 자료구조 과제 제출" autocomplete="off">
      <div class="invalid-feedback">제목을 입력하세요.</div>
    </div>
    <div class="row g-2 mb-2">
      <div class="col-6">
        <label class="form-label small text-secondary" data-for="date" data-f="dateLabel">날짜</label>
        <input type="date" class="form-control" data-f="date" required>
        <div class="invalid-feedback">날짜를 선택하세요.</div>
      </div>
      <div class="col-6">
        <label class="form-label small text-secondary" data-for="subject">과목</label>
        <select class="form-select" data-f="subject"></select>
      </div>
    </div>
    <div class="mb-3">
      <span class="form-label small text-secondary d-block" data-f="priLabel">우선순위</span>
      <div class="btn-group w-100" role="group" data-f="priGroup"></div>
    </div>

    <div class="form-check form-switch mb-2" data-f="plannedWrap">
      <input class="form-check-input" type="checkbox" role="switch" data-f="planned">
      <label class="form-check-label small" data-for="planned">플래너에 추가 <span class="sd-hint">· 마감 전에 공부 시간을 나눠서 잡아 줘요</span></label>
    </div>

    <div class="sd-tform-plan d-none" data-f="planBox">
      <div class="mb-2">
        <label class="form-label small text-secondary" data-for="type">종류</label>
        <select class="form-select" data-f="type"></select>
      </div>
      <div class="mb-3">
        <span class="form-label small text-secondary d-block" data-f="sizeLabel">작업량 <span class="sd-hint">· 정확한 시간은 몰라도 됩니다</span></span>
        <div class="btn-group w-100 sd-size-group" role="group" data-f="sizeGroup"></div>
        <p class="sd-size-hint mt-2 mb-1" data-f="hint" aria-live="polite"></p>
        <button class="btn btn-link btn-sm p-0 sd-tune-toggle" type="button" data-f="tuneToggle" aria-expanded="false">세부 조정</button>
        <div class="sd-tune pt-2 d-none" data-f="tuneBody">
          <div class="row g-2">
            <div class="col-6">
              <label class="form-label small text-secondary" data-for="tuneWindow" data-f="tuneWindowLabel">시작 (마감 n일 전)</label>
              <input type="number" class="form-control form-control-sm" data-f="tuneWindow" min="0" max="30" inputmode="numeric">
            </div>
            <div class="col-6" data-f="tuneShortCol">
              <label class="form-label small text-secondary" data-for="tuneShort">세션 수</label>
              <input type="number" class="form-control form-control-sm" data-f="tuneShort" min="0" max="20" inputmode="numeric">
            </div>
            <div class="col-6">
              <label class="form-label small text-secondary" data-for="tuneHours" data-f="tuneHoursLabel">세션 길이 (시간)</label>
              <input type="number" class="form-control form-control-sm" data-f="tuneHours" min="0.5" max="12" step="0.5" inputmode="decimal">
            </div>
            <div class="col-6">
              <label class="form-label small text-secondary" data-for="tuneLong" data-f="tuneLongLabel">종일 (일)</label>
              <input type="number" class="form-control form-control-sm" data-f="tuneLong" min="0" max="4" inputmode="numeric">
            </div>
            <div class="col-6" data-f="tuneEarlyCol">
              <label class="form-label small text-secondary" data-for="tuneEarly">미리 복습 (그 전 n일)</label>
              <input type="number" class="form-control form-control-sm" data-f="tuneEarly" min="0" max="30" inputmode="numeric">
            </div>
          </div>
          <p class="small text-secondary mt-1 mb-0">비워 두면 작업량 기본값. <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-f="tuneReset">기본값으로</button></p>
        </div>
      </div>
    </div>

    <p class="sd-tform-lock small mb-2 d-none" data-f="lockNote">캘린더 마감에서 온 할 일이에요. 제목·날짜·종류는 Calendar의 마감에서 바꿔 주세요.</p>
    <div class="d-flex flex-wrap gap-2">
      <button type="submit" class="btn btn-primary flex-grow-1" data-f="submit">추가</button>
      <button type="button" class="btn btn-outline-secondary d-none" data-f="cancel">취소</button>
      <button type="button" class="btn btn-outline-danger d-none" data-f="del">삭제</button>
    </div>
  </form>`;

  let formSeq = 0;

  function create(root, { plannerOnly = false, onSaved = () => {} } = {}) {
    const uid = `tf${++formSeq}`;
    root.innerHTML = MARKUP;
    const f = {};
    root.querySelectorAll('[data-f]').forEach(n => { f[n.dataset.f] = n; });
    // unique ids so labels work
    root.querySelectorAll('[data-for]').forEach(l => {
      const input = f[l.dataset.for];
      input.id = `${uid}-${l.dataset.for}`;
      l.htmlFor = input.id;
    });
    const form = root.querySelector('form');
    const make = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
    const md = ymd => { const d = D.parse(ymd); return `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})`; };

    SD.SUBJECTS.forEach(s => f.subject.add(new Option(s, s)));
    SD.TYPES.forEach(t => f.type.add(new Option(SD.TYPE_LABEL[t], t)));
    SD.PRIORITIES.forEach(p => {
      const input = make('input', 'btn-check');
      Object.assign(input, { type: 'radio', name: `${uid}-pri`, id: `${uid}-pri-${p}`, value: p, autocomplete: 'off' });
      const label = make('label', `btn btn-outline-secondary sd-pri-btn sd-pri-${p}`, SD.PRIORITY_LABEL[p]);
      label.htmlFor = input.id;
      f.priGroup.append(input, label);
    });
    f.priGroup.setAttribute('aria-label', '우선순위');
    SD.SIZES.forEach(n => {
      const input = make('input', 'btn-check');
      Object.assign(input, { type: 'radio', name: `${uid}-size`, id: `${uid}-size-${n}`, value: n, autocomplete: 'off' });
      const label = make('label', 'btn btn-outline-secondary sd-size-btn', SD.SIZE_LABEL[n]);
      label.htmlFor = input.id;
      f.sizeGroup.append(input, label);
    });
    f.sizeGroup.setAttribute('aria-label', '작업량');
    if (plannerOnly) f.plannedWrap.classList.add('d-none');

    const state = { editingId: null, sizeTouched: false, confirmDelete: false };
    const tuneInputs = [f.tuneWindow, f.tuneShort, f.tuneLong, f.tuneHours, f.tuneEarly];
    const findTask = id => SD.getTasks().find(t => t.id === id);

    const priority = () => (form.querySelector(`input[name="${uid}-pri"]:checked`) || {}).value || 'mid';
    const setPriority = p => { form.querySelector(`#${uid}-pri-${p}`).checked = true; };
    const currentSize = () => Number((form.querySelector(`input[name="${uid}-size"]:checked`) || {}).value || 3);
    const setSize = n => { form.querySelector(`#${uid}-size-${n}`).checked = true; updateHint(); };
    const isPlanned = () => plannerOnly || f.planned.checked;

    function showTune(open) {
      f.tuneBody.classList.toggle('d-none', !open);
      f.tuneToggle.setAttribute('aria-expanded', String(open));
    }

    function showPlanBox() {
      const on = isPlanned();
      f.planBox.classList.toggle('d-none', !on);
      const exam = f.type.value === 'exam';
      f.dateLabel.textContent = on ? (exam ? '시험일' : '마감일') : '날짜';
      f.title.placeholder = on ? (exam ? '예: 자율주행 중간고사' : '예: 자료구조 과제 제출') : '예: 교재 반납';
      updateHint();
    }

    // 세부 조정: empty field = size default
    function readOverride() {
      const num = (input, lo, hi) => { if (input.value === '') return null; const n = parseInt(input.value, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
      const hours = f.tuneHours.value === '' ? null : Math.min(12, Math.max(0.5, Math.round(parseFloat(f.tuneHours.value) * 2) / 2)) || null;
      const exam = f.type.value === 'exam';
      const o = { window: num(f.tuneWindow, 0, 30), short: exam ? null : num(f.tuneShort, 0, 20), long: num(f.tuneLong, 0, 4), hours,
        early: exam ? num(f.tuneEarly, 0, 30) : null };
      return Object.values(o).every(v => v === null) ? null : o;
    }
    function fillOverride(o) {
      f.tuneWindow.value = o && o.window !== null ? o.window : '';
      f.tuneShort.value = o && o.short !== null ? o.short : '';
      f.tuneLong.value = o && o.long !== null ? o.long : '';
      f.tuneHours.value = o && o.hours !== null ? o.hours : '';
      f.tuneEarly.value = o && o.early != null ? o.early : '';
    }

    // live preview: where the sessions will land (your week, rest days, Calendar schedule)
    function updateHint() {
      if (!isPlanned()) return;
      const tasks = SD.getTasks(), events = SD.getEvents(), settings = SD.getSettings();
      const size = currentSize();
      const exam = f.type.value === 'exam';
      const editing = state.editingId !== null ? tasks.find(t => t.id === state.editingId) : null;
      const draft = { id: editing ? editing.id : null, type: f.type.value, subject: f.subject.value, size, date: f.date.value,
        createdAt: editing ? editing.createdAt : D.today(), plan: readOverride(), planned: true };
      const pv = Planner.preview(draft, settings, events, tasks);
      const defaults = Planner.preview({ ...draft, plan: null }, settings, events, tasks).params;

      f.tuneShortCol.classList.toggle('d-none', exam);
      f.tuneEarlyCol.classList.toggle('d-none', !exam);
      f.tuneEarly.placeholder = defaults.early ?? '';
      f.tuneWindowLabel.textContent = exam ? '공부할 날 수' : '시작 (마감 n일 전)';
      f.tuneHoursLabel.textContent = exam ? '가장 긴 날 (시간)' : '세션 길이 (시간)';
      f.tuneLongLabel.textContent = exam ? '종일 (0 또는 1)' : '종일 (일)';
      f.tuneLong.max = exam ? 1 : 4;
      f.tuneWindow.placeholder = defaults.window;
      f.tuneShort.placeholder = defaults.short ?? '';
      f.tuneHours.placeholder = defaults.hours;
      f.tuneLong.placeholder = defaults.long;

      const total = pv.totalHours ? ` · 총 약 ${Math.round(pv.totalHours)}시간` : '';
      f.hint.replaceChildren(make('span', 'sd-hint-rule', Planner.describe(pv.params) + total + (draft.plan ? ' (맞춤)' : '')));
      if (pv.earlyHours) f.hint.append(make('span', 'sd-hint-early', `여유 있으면 그 전에 미리 복습 1시간 × ${pv.earlyHours} (선택)`));
      if (pv.after) f.hint.append(make('span', 'sd-hint-after', `'${pv.after}' 시험이 끝난 뒤에 시작합니다`));
      if (pv.factor && pv.factor !== 1 && !(draft.plan && draft.plan.hours !== null)) {
        f.hint.append(make('span', 'sd-hint-factor', `${draft.subject} 지난 시험은 계획의 ${pv.factor}배 걸렸어요 → 공부 시간에 반영했습니다`));
      }
      if (!f.date.value) return;
      const today = D.today();
      const sessions = pv.sessions.filter(s => s.date >= today && s.reason !== 'early').map(s => `${md(s.date)} ${s.label}`);
      f.hint.append(make('span', 'sd-hint-dates', sessions.length ? sessions.join(' · ') : '남은 기간이 짧아 오늘 바로 진행합니다'));
    }

    f.planned.addEventListener('change', () => {
      if (f.planned.checked && !state.sizeTouched) setSize(SD.TYPE_DEFAULT_SIZE[f.type.value]);
      showPlanBox();
    });
    f.type.addEventListener('change', () => { if (!state.sizeTouched) setSize(SD.TYPE_DEFAULT_SIZE[f.type.value]); showPlanBox(); });
    f.sizeGroup.addEventListener('change', () => { state.sizeTouched = true; updateHint(); });
    f.date.addEventListener('change', updateHint);
    f.subject.addEventListener('change', updateHint);
    tuneInputs.forEach(i => i.addEventListener('input', updateHint));
    f.tuneToggle.addEventListener('click', () => showTune(f.tuneBody.classList.contains('d-none')));
    f.tuneReset.addEventListener('click', () => { fillOverride(null); updateHint(); });

    function lockLinked(locked) {
      [f.title, f.date, f.type].forEach(i => { i.disabled = locked; });
      f.planned.disabled = locked;
      f.lockNote.classList.toggle('d-none', !locked);
    }

    function setDeleteConfirm(on) {
      state.confirmDelete = on;
      f.del.textContent = on ? '정말 삭제' : '삭제';
      f.del.classList.toggle('btn-danger', on);
      f.del.classList.toggle('btn-outline-danger', !on);
    }

    function reset(dateYmd) {
      state.editingId = null;
      state.sizeTouched = false;
      form.reset();
      form.classList.remove('was-validated');
      lockLinked(false);
      f.date.value = dateYmd || (plannerOnly ? D.addDays(D.today(), 7) : D.today());
      f.type.value = 'assignment';
      f.planned.checked = plannerOnly;               // off by default on Calendar · Todo
      f.subject.value = plannerOnly ? SD.SUBJECTS[0] : '기타';
      setPriority('mid');
      fillOverride(null);
      showTune(false);
      setSize(SD.TYPE_DEFAULT_SIZE.assignment);
      f.heading.textContent = '할 일 추가';
      f.submit.textContent = '추가';
      f.badge.classList.add('d-none');
      f.cancel.classList.add('d-none');
      f.del.classList.add('d-none');
      setDeleteConfirm(false);
      showPlanBox();
    }

    function edit(id) {
      const t = findTask(id);
      if (!t) return false;
      reset();
      state.editingId = id;
      state.sizeTouched = true;
      f.title.value = t.title;
      if (![...f.subject.options].some(o => o.value === t.subject)) f.subject.add(new Option(t.subject, t.subject));
      f.subject.value = t.subject;
      f.date.value = t.date;
      f.type.value = t.type;
      f.planned.checked = plannerOnly || t.planned;
      setPriority(t.priority);
      fillOverride(t.plan);
      showTune(!!t.plan);
      setSize(t.size);
      lockLinked(t.sourceEventId !== null);
      f.heading.textContent = '할 일 수정';
      f.submit.textContent = '수정 저장';
      f.badge.classList.remove('d-none');
      f.cancel.classList.remove('d-none');
      f.del.classList.remove('d-none');
      showPlanBox();
      root.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      (t.sourceEventId !== null ? form.querySelector(`#${uid}-size-${t.size}`) : f.title).focus({ preventScroll: true });
      return true;
    }

    form.addEventListener('submit', e => {
      e.preventDefault();
      f.title.value = f.title.value.trim();
      if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
      const planned = isPlanned();
      const data = { subject: f.subject.value, priority: priority(), planned, size: currentSize(), plan: planned ? readOverride() : null };
      if (!f.title.disabled) Object.assign(data, { title: f.title.value, date: f.date.value, type: planned ? f.type.value : 'general' });

      const tasks = SD.getTasks();
      let msg;
      if (state.editingId !== null) {
        const t = tasks.find(x => x.id === state.editingId);
        if (t) Object.assign(t, data);
        msg = planned ? '수정했어요. 계획을 다시 계산했어요.' : '수정했어요.';
      } else {
        tasks.push({ id: SD.newId(), ...data, completed: false, createdAt: D.today(), sessions: [],
          sourceEventId: null, sourceRev: null, archived: false, orphaned: false });
        msg = planned ? '추가했어요. 플래너에 반영했어요.' : '할 일을 추가했어요.';
      }
      if (!SD.saveTasks(tasks)) { onSaved('저장하지 못했어요. 브라우저의 사이트 데이터 설정을 확인하세요.'); return; }
      const keepDate = f.date.value;
      reset(plannerOnly ? undefined : keepDate);
      onSaved(msg, data.date);
    });

    f.cancel.addEventListener('click', () => { reset(); onSaved(null); });
    f.del.addEventListener('click', () => {
      if (!state.confirmDelete) { setDeleteConfirm(true); return; }
      let tasks = SD.getTasks();
      const t = tasks.find(x => x.id === state.editingId);
      // linked to a Calendar deadline → hide instead of delete, or the next sync recreates it
      if (t && t.sourceEventId !== null) t.archived = true;
      else tasks = tasks.filter(x => x.id !== state.editingId);
      SD.saveTasks(tasks);
      reset();
      onSaved('삭제했어요.');
    });
    form.addEventListener('keydown', e => { if (e.key === 'Escape' && state.editingId !== null) { reset(); onSaved(null); } });

    reset();
    return {
      edit, reset,
      setDate(ymd) { if (state.editingId === null) { f.date.value = ymd; updateHint(); } },
      focus() { f.title.focus(); },
      refresh: updateHint,
      editingId: () => state.editingId
    };
  }

  return { create };
})();
