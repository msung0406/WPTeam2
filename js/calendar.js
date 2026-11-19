/* =========================================================
   Calendar · D-Day — calendar.html
   Data: SD (js/storage.js). Writes events + ddays only;
   deadlines become Todo tasks through SD.syncDeadlines().
   Maintainer: 김도형
   ========================================================= */
(() => {
  "use strict";

  const D = SD.date;
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const KIND_LABEL = {
    schedule: "일정",
    deadline: "마감",
    dday: "D-Day",
    task: "할 일",
  };
  const KIND_ORDER = { schedule: 0, deadline: 1, dday: 2, task: 3 };
  const CHIPS_PER_DAY = 2;

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
    selectedList: $("#selectedList"),
    selectedEmpty: $("#selectedEmpty"),
    form: $("#eventForm"),
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

  const state = { year: 0, month: 0, selected: D.today() };

  /* ---------- small helpers ---------- */
  const md = (ymd) => {
    const d = D.parse(ymd);
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  };
  const mdDow = (ymd) => `${md(ymd)} (${DOW[D.dow(ymd)]})`;
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

  /* ---------- everything that happens on each day ----------
     Deadline-linked tasks are skipped: the deadline itself is already on that day. */
  function itemsByDate() {
    const map = new Map();
    const add = (date, item) => {
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(item);
    };
    SD.getEvents().forEach((e) =>
      add(e.date, { kind: e.kind, title: e.title, data: e }),
    );
    SD.getDdays().forEach((d) =>
      add(d.targetDate, { kind: "dday", title: d.title, data: d }),
    );
    SD.activeTasks()
      .filter((t) => t.sourceEventId === null)
      .forEach((t) => add(t.date, { kind: "task", title: t.title, data: t }));
    map.forEach((list) =>
      list.sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          (a.data.start || "").localeCompare(b.data.start || ""),
      ),
    );
    return map;
  }

  /* ---------- month grid (Monday first) ---------- */
  function renderCalendar(byDate) {
    const first = D.toYMD(new Date(state.year, state.month, 1));
    const offset = (D.dow(first) + 6) % 7;
    const gridStart = D.addDays(first, -offset);
    const today = D.today();
    const monthPrefix = first.slice(0, 8);

    el.monthTitle.textContent = `${state.year}년 ${state.month + 1}월`;
    el.grid.replaceChildren();

    for (let i = 0; i < 42; i++) {
      const ymd = D.addDays(gridStart, i);
      const items = byDate.get(ymd) || [];
      const cell = make("button", "sd-cal-day");
      cell.type = "button";
      cell.classList.toggle("is-other", !ymd.startsWith(monthPrefix));
      cell.classList.toggle("is-today", ymd === today);
      cell.classList.toggle("is-selected", ymd === state.selected);
      cell.classList.toggle("is-sun", D.dow(ymd) === 0);
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
        if (item.kind === "task" && item.data.completed)
          chip.classList.add("is-done");
        chips.append(chip);
      });
      if (items.length > CHIPS_PER_DAY)
        chips.append(
          make("span", "sd-cal-more", `+${items.length - CHIPS_PER_DAY}`),
        );
      cell.append(chips);
      el.grid.append(cell);
    }

    const inMonth = [...byDate.entries()]
      .filter(([ymd]) => ymd.startsWith(monthPrefix))
      .flatMap(([, list]) => list);
    const count = (kind) => inMonth.filter((item) => item.kind === kind).length;
    el.monthSummary.textContent = `이번 달 일정 ${count("schedule")} · 마감 ${count("deadline")} · 할 일 ${count("task")}`;
  }

  /* ---------- selected day ---------- */
  function deleteButton(label, onClick) {
    const btn = make("button", "btn btn-sm btn-link sd-del", "×");
    btn.type = "button";
    btn.setAttribute("aria-label", `${label} 삭제`);
    btn.title = "삭제";
    btn.addEventListener("click", onClick);
    return btn;
  }

  function dayItem(item) {
    const li = make("li", `sd-day-item sd-kind-${item.kind}`);
    const body = make("div", "sd-day-body");
    body.append(make("span", "sd-day-title", item.title));

    const meta = make("div", "sd-day-meta");
    meta.append(
      make(
        "span",
        `badge sd-kind-badge sd-kind-${item.kind}`,
        KIND_LABEL[item.kind],
      ),
    );
    const e = item.data;
    if (item.kind === "schedule" && timeText(e))
      meta.append(make("span", "", timeText(e)));
    if (item.kind === "deadline" || item.kind === "task") {
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
    if (item.kind === "task" && e.completed) {
      li.classList.add("is-done");
      meta.append(make("span", "", "완료"));
    }
    if (item.kind === "dday" || (item.kind === "deadline" && e.showDday)) {
      meta.append(
        make("span", "sd-day-dday", ddayText(e.targetDate || e.date)),
      );
    }
    body.append(meta);
    li.append(body);

    if (item.kind === "schedule" || item.kind === "deadline") {
      li.append(deleteButton(item.title, () => deleteEvent(e.id)));
    } else if (item.kind === "dday") {
      li.append(deleteButton(item.title, () => deleteDday(e.id)));
    } else {
      const link = make("a", "sd-more small", "Todo");
      link.href = "todo.html";
      li.append(link);
    }
    return li;
  }

  function renderSelectedDay(byDate) {
    const items = byDate.get(state.selected) || [];
    el.selectedTitle.textContent = mdDow(state.selected);
    el.selectedCount.textContent = `${items.length}개`;
    el.selectedList.replaceChildren(...items.map(dayItem));
    el.selectedEmpty.classList.toggle("d-none", items.length > 0);
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
      right.append(deleteButton(d.title, () => deleteDday(d.id)));

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

  function render() {
    const byDate = itemsByDate();
    el.todayLabel.textContent = `오늘 ${D.today().replaceAll("-", ".")} (${DOW[D.dow(D.today())]})`;
    renderCalendar(byDate);
    renderSelectedDay(byDate);
    renderDdays();
  }

  /* ---------- actions ---------- */
  function selectDate(ymd) {
    state.selected = ymd;
    showMonthOf(ymd);
    el.date.value = ymd;
    render();
  }

  function changeMonth(step) {
    const d = new Date(state.year, state.month + step, 1);
    state.year = d.getFullYear();
    state.month = d.getMonth();
    render();
  }

  // After events change, link/unlink Todo tasks right away (same as a page load).
  function saveEvents(events) {
    const ok = SD.saveEvents(events);
    if (ok) SD.syncDeadlines();
    return ok;
  }

  function deleteEvent(id) {
    saveEvents(SD.getEvents().filter((e) => e.id !== id));
    render();
  }

  function deleteDday(id) {
    SD.saveDdays(SD.getDdays().filter((d) => d.id !== id));
    render();
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

  function readEventForm() {
    const title = el.title.value.trim();
    const date = el.date.value;
    if (!title) return { error: "이름을 입력해 주세요." };
    if (!D.isYMD(date)) return { error: "날짜를 골라 주세요." };

    if (currentKind() === "schedule") {
      const start = el.start.value || null;
      const end = el.end.value || null;
      if (start && end && end < start)
        return { error: "끝 시간이 시작보다 빨라요." };
      return {
        event: { id: SD.newId(), kind: "schedule", title, date, start, end },
      };
    }
    return {
      event: {
        id: SD.newId(),
        kind: "deadline",
        title,
        date,
        type: el.type.value,
        subject: el.subject.value,
        priority: el.priority.value,
        showDday: el.showDday.checked,
      },
    };
  }

  el.form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const { event, error } = readEventForm();
    if (error) {
      el.formStatus.textContent = error;
      el.formStatus.classList.add("is-error");
      return;
    }
    if (!saveEvents([...SD.getEvents(), event])) {
      el.formStatus.textContent =
        "저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.";
      el.formStatus.classList.add("is-error");
      return;
    }
    el.formStatus.classList.remove("is-error");
    el.formStatus.textContent =
      event.kind === "deadline"
        ? "마감을 추가했어요. Todo에도 생겼어요."
        : "일정을 추가했어요.";
    el.title.value = "";
    el.start.value = "";
    el.end.value = "";
    selectDate(event.date);
    el.title.focus();
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
  function fillSelect(select, values, labels, selected) {
    values.forEach((v) => {
      const opt = make("option", "", labels ? labels[v] : v);
      opt.value = v;
      opt.selected = v === selected;
      select.append(opt);
    });
  }
  fillSelect(el.type, SD.TYPES, SD.TYPE_LABEL, "assignment");
  fillSelect(el.subject, SD.SUBJECTS, null, SD.SUBJECTS[0]);
  fillSelect(el.priority, SD.PRIORITIES, SD.PRIORITY_LABEL, "high");

  el.form
    .querySelectorAll('input[name="kind"]')
    .forEach((r) => r.addEventListener("change", showKindFields));
  $("#prevMonth").addEventListener("click", () => changeMonth(-1));
  $("#nextMonth").addEventListener("click", () => changeMonth(1));
  $("#todayBtn").addEventListener("click", () => selectDate(D.today()));

  // Other tabs (Todo, another Calendar) → redraw. Focus also catches a date change overnight.
  SD.onChange([SD.KEYS.events, SD.KEYS.ddays, SD.KEYS.tasks], render);
  window.addEventListener("focus", render);

  showKindFields();
  selectDate(D.today());
})();
