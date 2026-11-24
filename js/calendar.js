/* =========================================================
   Calendar · Todo — calendar.html
   Month grid: events, D-Days, to-dos and planned study sessions.
   Click a day → its events (edit / delete) + its day list (same list as Dashboard).
   Writes: events + ddays here; tasks through TodoForm / Views.
   Deadlines become planned tasks through SD.syncDeadlines().
   Maintainers: 김도형 (calendar), 김주환 (todo)
   ========================================================= */
(() => {
  "use strict";

  const D = SD.date;
  const DOW = Views.DOW;
  const KIND_LABEL = { schedule: "일정", deadline: "마감", dday: "D-Day" };
  const KIND_ORDER = { schedule: 0, deadline: 1, dday: 2, due: 3, todo: 4, session: 5 };
  const CHIPS_PER_DAY = 3;

  const $ = (sel) => document.querySelector(sel);
  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const el = {
    grid: $("#calendarGrid"),
    monthTitle: $("#monthTitle"),
    monthSummary: $("#monthSummary"),
    todayLabel: $("#todayLabel"),
    selectedTitle: $("#selectedTitle"),
    selectedCount: $("#selectedCount"),
    eventList: $("#eventList"),
    eventEmpty: $("#eventEmpty"),
    dayList: $("#dayList"),
    dayEmpty: $("#dayEmpty"),
    form: $("#eventForm"),
    heading: $("#eventHeading"),
    badge: $("#eventBadge"),
    submit: $("#eventSubmit"),
    cancel: $("#eventCancel"),
    title: $("#eventTitle"),
    date: $("#eventDate"),
    start: $("#eventStart"),
    end: $("#eventEnd"),
    type: $("#eventType"),
    subject: $("#eventSubject"),
    priority: $("#eventPriority"),
    showDday: $("#eventShowDday"),
    scheduleFields: $("#scheduleFields"),
    deadlineFields: $("#deadlineFields"),
    formStatus: $("#formStatus"),
    ddayList: $("#ddayList"),
    ddayEmpty: $("#ddayEmpty"),
    ddayCount: $("#ddayCount"),
    ddayForm: $("#ddayForm"),
    ddayName: $("#ddayName"),
    ddayDate: $("#ddayDate"),
    ddayStatus: $("#ddayStatus"),
  };

  const params = new URLSearchParams(location.search);
  const state = {
    year: 0,
    month: 0,
    selected: D.isYMD(params.get("date")) ? params.get("date") : D.today(),
    editingEventId: null,
  };
  let ctx;

  const toast = new bootstrap.Toast("#toast", { delay: 2200 });
  const notify = (msg) => {
    if (!msg) return;
    $("#toastMsg").textContent = msg;
    toast.show();
  };

  /* ---------- small helpers ---------- */
  const mdDow = Views.mdDow;
  function ddayText(ymd) {
    const n = D.diff(ymd, D.today());
    if (n === 0) return "D-Day";
    return n > 0 ? `D-${n}` : `D+${-n}`;
  }
  const timeText = (e) =>
    e.start && e.end
      ? `${e.start}–${e.end}`
      : e.start || (e.end ? `~${e.end}` : "");

  function showMonthOf(ymd) {
    const d = D.parse(ymd);
    state.year = d.getFullYear();
    state.month = d.getMonth();
  }

  /* ---------- what to draw on each day ----------
     Deadline-linked tasks are skipped: the deadline itself is already on that day. */
  function eventsByDate() {
    const map = new Map();
    const add = (date, item) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(item);
    };
    ctx.events.forEach((e) =>
      add(e.date, { kind: e.kind, title: e.title, data: e }),
    );
    SD.getDdays().forEach((d) =>
      add(d.targetDate, { kind: "dday", title: d.title, data: d }),
    );
    return map;
  }

  function chipsFor(ymd, evMap) {
    const items = (evMap.get(ymd) || []).map((i) => ({ ...i }));
    ctx.active
      .filter((t) => t.sourceEventId === null && !t.repeat && t.date === ymd)
      .forEach((t) =>
        items.push({
          kind: t.planned ? "due" : "todo",
          title: t.title,
          done: t.completed,
        }),
      );
    Views.dayRows(ymd, ctx, { plannedOnly: true })
      .filter((r) => r.kind === "session" || r.kind === "studied")
      .forEach((r) =>
        items.push({ kind: "session", title: r.task.title, done: r.checked }),
      );
    return items.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        ((a.data && a.data.start) || "").localeCompare(
          (b.data && b.data.start) || "",
        ),
    );
  }

  /* ---------- month grid (Monday first) ---------- */
  function renderCalendar(evMap) {
    const first = D.toYMD(new Date(state.year, state.month, 1));
    const offset = (D.dow(first) + 6) % 7;
    const gridStart = D.addDays(first, -offset);
    const today = D.today();
    const monthPrefix = first.slice(0, 8);
    const counts = { schedule: 0, deadline: 0, todo: 0, session: 0 };

    el.monthTitle.textContent = `${state.year}년 ${state.month + 1}월`;
    el.grid.replaceChildren();

    for (let i = 0; i < 42; i++) {
      const ymd = D.addDays(gridStart, i);
      const items = chipsFor(ymd, evMap);
      const inMonth = ymd.startsWith(monthPrefix);
      if (inMonth)
        items.forEach((it) => {
          const k = it.kind === "due" ? "deadline" : it.kind;
          if (k in counts) counts[k]++;
        });

      const cell = make("button", "sd-cal-day");
      cell.type = "button";
      cell.classList.toggle("is-other", !inMonth);
      cell.classList.toggle("is-today", ymd === today);
      cell.classList.toggle("is-selected", ymd === state.selected);
      cell.classList.toggle("is-sun", D.dow(ymd) === 0);
      cell.classList.toggle("is-break", ctx.settings.restDays.includes(ymd));
      cell.setAttribute("aria-pressed", String(ymd === state.selected));
      cell.setAttribute(
        "aria-label",
        `${mdDow(ymd)}${items.length ? `, ${items.length}개` : ""}`,
      );
      cell.addEventListener("click", () => selectDate(ymd));

      cell.append(make("span", "sd-cal-num", String(D.parse(ymd).getDate())));
      const chips = make("span", "sd-cal-chips");
      items.slice(0, CHIPS_PER_DAY).forEach((item) => {
        const chip = make(
          "span",
          `sd-cal-chip sd-kind-${item.kind}`,
          item.title,
        );
        if (item.done) chip.classList.add("is-done");
        chips.append(chip);
      });
      if (items.length > CHIPS_PER_DAY)
        chips.append(
          make("span", "sd-cal-more", `+${items.length - CHIPS_PER_DAY}`),
        );
      cell.append(chips);
      el.grid.append(cell);
    }
    el.monthSummary.textContent = `이번 달 일정 ${counts.schedule} · 마감 ${counts.deadline} · 할 일 ${counts.todo} · 공부 ${counts.session}`;
  }

  /* ---------- selected day: events, then the shared day list ---------- */
  function iconButton(text, label, cls, onClick) {
    const btn = make("button", `btn btn-sm btn-link ${cls}`, text);
    btn.type = "button";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.addEventListener("click", onClick);
    return btn;
  }

  function eventItem(item) {
    const li = make("li", `sd-day-item sd-kind-${item.kind}`);
    li.classList.toggle(
      "is-editing",
      item.kind !== "dday" && item.data.id === state.editingEventId,
    );
    const body = make("div", "sd-day-body");
    body.append(make("span", "sd-day-title", item.title));

    const meta = make("div", "sd-day-meta");
    meta.append(
      make("span", `badge sd-kind sd-kind-${item.kind}`, KIND_LABEL[item.kind]),
    );
    const e = item.data;
    if (item.kind === "schedule" && timeText(e))
      meta.append(make("span", "", timeText(e)));
    if (item.kind === "deadline") {
      meta.append(make("span", "badge sd-subj", e.subject));
      meta.append(
        make(
          "span",
          `badge sd-pri sd-pri-${e.priority}`,
          SD.PRIORITY_LABEL[e.priority],
        ),
      );
      meta.append(make("span", "", SD.TYPE_LABEL[e.type]));
    }
    if (item.kind === "dday" || (item.kind === "deadline" && e.showDday)) {
      meta.append(
        make("span", "sd-day-dday", ddayText(e.targetDate || e.date)),
      );
    }
    body.append(meta);
    li.append(body);

    const actions = make("div", "sd-day-actions");
    if (item.kind === "dday") {
      actions.append(
        iconButton("×", `${item.title} 삭제`, "sd-del", () => deleteDday(e.id)),
      );
    } else {
      actions.append(
        iconButton("수정", `${item.title} 수정`, "sd-edit", () => startEditEvent(e.id)),
        iconButton("×", `${item.title} 삭제`, "sd-del", () => deleteEvent(e.id)),
      );
    }
    li.append(actions);
    return li;
  }

  function renderSelectedDay(evMap) {
    const events = evMap.get(state.selected) || [];
    events.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        (a.data.start || "").localeCompare(b.data.start || ""),
    );
    el.selectedTitle.textContent = mdDow(state.selected);
    el.eventList.replaceChildren(...events.map(eventItem));
    el.eventEmpty.classList.toggle("d-none", events.length > 0);

    const rows = Views.renderDayList(el.dayList, state.selected, ctx, {
      onEdit: editTodo,
    });
    el.dayEmpty.classList.toggle("d-none", rows.length > 0);
    el.selectedCount.textContent = `${events.length + rows.length}개`;
  }

  /* ---------- D-Day card: upcoming nearest first, then past ---------- */
  function ddayRow(d) {
    const today = D.today();
    const li = make("li", "sd-dday-item");
    if (d.targetDate < today) li.classList.add("is-past");

    const name = make("div", "sd-dday-name");
    name.append(make("div", "text-truncate", d.title));
    const when = make("div", "sd-dday-date", mdDow(d.targetDate));
    if (d.source === "deadline")
      when.append(make("span", "sd-dday-src", " · 마감"));
    name.append(when);

    const right = make("div", "d-flex align-items-center gap-1");
    const badge = make("span", "sd-dday-badge", ddayText(d.targetDate));
    badge.classList.toggle("is-today", d.targetDate === today);
    right.append(badge);
    if (d.source === "dday")
      right.append(
        iconButton("×", `${d.title} 삭제`, "sd-del", () => deleteDday(d.id)),
      );

    name.addEventListener("click", () => selectDate(d.targetDate));
    li.append(name, right);
    return li;
  }

  function renderDdays() {
    const today = D.today();
    const all = SD.allDdays();
    const upcoming = all.filter((d) => d.targetDate >= today);
    const past = all.filter((d) => d.targetDate < today).reverse();
    el.ddayList.replaceChildren(...upcoming.concat(past).map(ddayRow));
    el.ddayCount.textContent = `${upcoming.length}개 남음`;
    el.ddayEmpty.classList.toggle("d-none", all.length > 0);
  }

  function render(msg) {
    notify(msg);
    ctx = Views.load();
    const evMap = eventsByDate();
    renderCalendar(evMap);
    renderSelectedDay(evMap);
    renderDdays();
  }

  /* ---------- to-dos (shared form) ---------- */
  const tabTodo = bootstrap.Tab.getOrCreateInstance("#tabTodo");
  const tabEvent = bootstrap.Tab.getOrCreateInstance("#tabEvent");
  const todoForm = TodoForm.create($("#todoFormRoot"), {
    onSaved: (msg, ymd) => {
      if (ymd && ymd !== state.selected) {
        state.selected = ymd;
        showMonthOf(ymd);
      }
      render(msg);
    },
  });
  function editTodo(id) {
    tabTodo.show();
    todoForm.edit(id);
  }
  Views.bindDayList(el.dayList, () => ctx, render, { onEdit: editTodo });

  $("#addTodoHere").addEventListener("click", () => {
    tabTodo.show();
    todoForm.reset(state.selected);
    $("#addCard").scrollIntoView({ block: "nearest", behavior: "smooth" });
    todoForm.focus();
  });
  $("#addEventHere").addEventListener("click", () => {
    tabEvent.show();
    resetEventForm();
    $("#addCard").scrollIntoView({ block: "nearest", behavior: "smooth" });
    el.title.focus();
  });

  /* ---------- actions ---------- */
  function selectDate(ymd) {
    state.selected = ymd;
    showMonthOf(ymd);
    if (state.editingEventId === null) el.date.value = ymd;
    todoForm.setDate(ymd);
    history.replaceState(null, "", `?date=${ymd}`);
    render();
  }

  function changeMonth(step) {
    const d = new Date(state.year, state.month + step, 1);
    state.year = d.getFullYear();
    state.month = d.getMonth();
    render();
  }

  // After events change, link/unlink planned tasks right away (same as a page load).
  function saveEvents(events) {
    const ok = SD.saveEvents(events);
    if (ok) SD.syncDeadlines();
    return ok;
  }

  function deleteEvent(id) {
    saveEvents(SD.getEvents().filter((e) => e.id !== id));
    if (state.editingEventId === id) resetEventForm();
    render("삭제했어요.");
  }

  function deleteDday(id) {
    SD.saveDdays(SD.getDdays().filter((d) => d.id !== id));
    render("D-Day를 삭제했어요.");
  }

  function currentKind() {
    return el.form.querySelector('input[name="kind"]:checked').value;
  }

  function showKindFields() {
    const isDeadline = currentKind() === "deadline";
    el.scheduleFields.classList.toggle("d-none", isDeadline);
    el.deadlineFields.classList.toggle("d-none", !isDeadline);
    el.title.placeholder = isDeadline
      ? "예: 자료구조 과제 제출"
      : "예: 동아리 MT";
  }

  function setStatus(text, isError) {
    el.formStatus.textContent = text;
    el.formStatus.classList.toggle("is-error", !!isError);
  }

  function resetEventForm() {
    state.editingEventId = null;
    el.form.reset();
    el.date.value = state.selected;
    $("#kindSchedule").checked = true;
    el.type.value = "assignment";
    eventSubjects.fill('');
    el.priority.value = "high";
    el.showDday.checked = true;
    el.form.querySelectorAll('input[name="kind"]').forEach((r) => {
      r.disabled = false;
    });
    el.heading.textContent = "일정 추가";
    el.submit.textContent = "+ 추가";
    el.badge.classList.add("d-none");
    el.cancel.classList.add("d-none");
    showKindFields();
  }

  function startEditEvent(id) {
    const e = SD.getEvents().find((x) => x.id === id);
    if (!e) return;
    tabEvent.show();
    resetEventForm();
    state.editingEventId = id;
    $(e.kind === "deadline" ? "#kindDeadline" : "#kindSchedule").checked = true;
    // kind stays fixed while editing (a deadline owns a planned task)
    el.form.querySelectorAll('input[name="kind"]').forEach((r) => {
      r.disabled = true;
    });
    el.title.value = e.title;
    el.date.value = e.date;
    if (e.kind === "schedule") {
      el.start.value = e.start || "";
      el.end.value = e.end || "";
    } else {
      el.type.value = e.type;
      eventSubjects.fill(e.subject);
      el.priority.value = e.priority;
      el.showDday.checked = e.showDday;
    }
    el.heading.textContent = "일정 수정";
    el.submit.textContent = "수정 저장";
    el.badge.classList.remove("d-none");
    el.cancel.classList.remove("d-none");
    showKindFields();
    setStatus("");
    render();
    $("#addCard").scrollIntoView({ block: "nearest", behavior: "smooth" });
    el.title.focus({ preventScroll: true });
  }

  function readEventForm() {
    const title = el.title.value.trim();
    const date = el.date.value;
    if (!title) return { error: "이름을 입력해 주세요." };
    if (!D.isYMD(date)) return { error: "날짜를 골라 주세요." };
    const id = state.editingEventId ?? SD.newId();

    if (currentKind() === "schedule") {
      const start = el.start.value || null;
      const end = el.end.value || null;
      if (start && end && end < start)
        return { error: "끝 시간이 시작보다 빨라요." };
      return { event: { id, kind: "schedule", title, date, start, end } };
    }
    const old = SD.getEvents().find((x) => x.id === id);
    return {
      event: {
        id,
        kind: "deadline",
        title,
        date,
        type: el.type.value,
        subject: eventSubjects.value(),
        size: old && old.type === el.type.value ? old.size : undefined,
        priority: el.priority.value,
        showDday: el.showDday.checked,
      },
    };
  }

  el.form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const { event, error } = readEventForm();
    if (error) return setStatus(error, true);
    const editing = state.editingEventId !== null;
    const events = SD.getEvents().filter((x) => x.id !== event.id);
    if (!saveEvents([...events, event]))
      return setStatus(
        "저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.",
        true,
      );
    setStatus(
      editing
        ? "수정했어요."
        : event.kind === "deadline"
          ? "마감을 추가했어요. 플래너에도 들어갔어요."
          : "일정을 추가했어요.",
    );
    state.selected = event.date;
    showMonthOf(event.date);
    resetEventForm();
    render();
    el.title.focus();
  });
  el.cancel.addEventListener("click", () => {
    resetEventForm();
    setStatus("");
    render();
  });

  el.ddayForm.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const title = el.ddayName.value.trim();
    const targetDate = el.ddayDate.value;
    if (!title || !D.isYMD(targetDate)) {
      el.ddayStatus.textContent = "이름과 날짜를 모두 입력해 주세요.";
      el.ddayStatus.classList.add("is-error");
      return;
    }
    SD.saveDdays([...SD.getDdays(), { id: SD.newId(), title, targetDate }]);
    el.ddayStatus.classList.remove("is-error");
    el.ddayStatus.textContent = "D-Day를 추가했어요.";
    el.ddayForm.reset();
    render();
  });

  /* ---------- setup ---------- */
  function fillSelect(select, values, labels) {
    values.forEach((v) => select.add(new Option(labels ? labels[v] : v, v)));
  }
  fillSelect(el.type, SD.TYPES, SD.TYPE_LABEL);
  const eventSubjects = Views.subjectPicker(el.subject);
  fillSelect(el.priority, SD.PRIORITIES, SD.PRIORITY_LABEL);

  el.form
    .querySelectorAll('input[name="kind"]')
    .forEach((r) => r.addEventListener("change", showKindFields));
  $("#prevMonth").addEventListener("click", () => changeMonth(-1));
  $("#nextMonth").addEventListener("click", () => changeMonth(1));
  $("#todayBtn").addEventListener("click", () => selectDate(D.today()));

  // Other tabs (Planner, Dashboard, another Calendar) → redraw. Focus also catches a date change overnight.
  SD.onChange(
    [SD.KEYS.events, SD.KEYS.ddays, SD.KEYS.tasks, SD.KEYS.settings],
    () => render(),
  );
  window.addEventListener("focus", () => render());

  showMonthOf(state.selected);
  resetEventForm();
  todoForm.reset(state.selected);
  render();
})();
