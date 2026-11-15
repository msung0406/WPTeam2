/* =========================================================
   Dashboard — everything other pages saved, in one place
   Maintainer: 김지환
   ========================================================= */
(() => {
  "use strict";

  const D = SD.date;
  const UPCOMING_DAYS = 14;
  const GOAL_LIMIT = 5;
  const $ = (sel) => document.querySelector(sel);

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function setBar(id, pct) {
    $(`#${id}Bar`).style.width = `${pct}%`;
    $(`#${id}BarWrap`).setAttribute("aria-valuenow", pct);
  }

  function renderStats(today, week, tasks) {
    const weekTotal = week.reduce((s, d) => s + d.minutes, 0);
    const studiedDays = week.filter((d) => d.minutes > 0).length;
    $("#weekLabel").textContent =
      `${Stats.formatDate(week[0].date, { month: "long", day: "numeric" })} – ${Stats.formatDate(week[6].date, { month: "long", day: "numeric" })}`;
    $("#statToday").textContent = Stats.formatMinutes(Stats.minutesOn(today));
    $("#statWeek").textContent = Stats.formatMinutes(weekTotal);
    $("#statWeekNote").textContent = studiedDays
      ? `${studiedDays}일 공부함`
      : "";

    const rate = Stats.taskCompletion(tasks);
    $("#statRate").textContent = `${rate.pct}%`;
    $("#statRateNote").textContent = `${rate.done} / ${rate.total}개 완료`;
    $("#statLate").textContent = tasks.filter(
      (t) => !t.completed && t.date < today,
    ).length;
  }

  function renderWeekChart(today, week) {
    const chart = $("#weekChart");
    const max = Math.max(60, ...week.map((d) => d.minutes));
    chart.replaceChildren();
    week.forEach((d) => {
      const li = make("li", "sd-week-row");
      li.classList.toggle("is-today", d.date === today);
      li.classList.toggle("is-future", d.date > today);
      const label = make("span", "sd-week-day", d.label);
      const track = make("span", "sd-week-track");
      const bar = make("span", "sd-week-bar");
      bar.style.width = `${(d.minutes / max) * 100}%`;
      track.append(bar);
      const value = make(
        "span",
        "sd-week-value",
        d.minutes ? Stats.formatMinutes(d.minutes) : "–",
      );
      li.setAttribute(
        "aria-label",
        `${d.label}요일 ${d.minutes ? Stats.formatMinutes(d.minutes) : "기록 없음"}`,
      );
      li.append(label, track, value);
      chart.append(li);
    });
    $("#weekEmpty").classList.toggle(
      "d-none",
      week.some((d) => d.minutes > 0),
    );
  }

  function renderCompletion(tasks) {
    const rate = Stats.taskCompletion(tasks);
    $("#rateLabel").textContent = rate.total
      ? `${rate.done} / ${rate.total}개 완료`
      : "등록된 할 일이 없습니다";
    $("#ratePct").textContent = `${rate.pct}%`;
    setBar("rate", rate.pct);

    const bySubject = {};
    tasks.forEach((t) => {
      const s = (bySubject[t.subject] ||= { done: 0, total: 0 });
      s.total++;
      if (t.completed) s.done++;
    });
    const list = $("#subjectList");
    list.replaceChildren();
    Object.entries(bySubject)
      .sort((a, b) => b[1].total - a[1].total)
      .forEach(([subject, s]) => {
        const li = make("li", "sd-subject-row");
        li.append(
          make("span", "text-truncate", subject),
          make("span", "sd-subject-count", `${s.done}/${s.total}`),
        );
        list.append(li);
      });
  }

  function renderDdays(today) {
    const list = $("#ddayList");
    const ddays = Stats.upcomingDdays(today).slice(0, 5);
    list.replaceChildren();
    $("#ddayEmpty").classList.toggle("d-none", ddays.length > 0);
    ddays.forEach((d) => {
      const li = make("li", "sd-dday-item");
      const name = make("div", "sd-dday-name");
      name.append(
        make("div", "text-truncate", d.title),
        make("div", "sd-dday-date", Stats.formatDate(d.targetDate)),
      );
      const badge = make(
        "span",
        "sd-dday-badge",
        Stats.ddayText(d.targetDate, today),
      );
      badge.classList.toggle("is-today", d.targetDate === today);
      li.append(name, badge);
      list.append(li);
    });
  }

  // planned total from the planner; null if it can't be computed
  function plannedHours(task, settings, events, tasks) {
    try {
      return Planner.preview(task, settings, events, tasks).totalHours || null;
    } catch (e) {
      return null;
    }
  }

  function renderGoals(today, tasks) {
    const settings = SD.getSettings();
    const events = SD.getEvents();
    const open = tasks
      .filter((t) => !t.completed)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, GOAL_LIMIT);
    const list = $("#goalList");
    list.replaceChildren();
    $("#goalEmpty").classList.toggle("d-none", open.length > 0);

    open.forEach((t) => {
      const studied = SD.totalHours(t);
      const planned = plannedHours(t, settings, events, tasks);
      const pct = planned
        ? Math.min(100, Math.round((studied / planned) * 100))
        : 0;

      const li = make("li", "sd-goal");
      const head = make("div", "sd-goal-head");
      const title = make("div", "sd-goal-title");
      title.append(make("span", "text-truncate", t.title));
      const meta = make("div", "sd-goal-meta");
      meta.append(
        make("span", "badge sd-subj", t.subject),
        make(
          "span",
          `badge sd-pri sd-pri-${t.priority}`,
          SD.PRIORITY_LABEL[t.priority],
        ),
        make("span", "sd-goal-type", SD.TYPE_LABEL[t.type]),
      );
      title.append(meta);
      const due = make("span", "sd-goal-due", Stats.ddayText(t.date, today));
      due.classList.toggle("is-late", t.date < today);
      head.append(title, due);

      const progress = make("div", "progress");
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-label", `${t.title} 진행률`);
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "100");
      progress.setAttribute("aria-valuenow", pct);
      const bar = make("div", "progress-bar");
      bar.style.width = `${pct}%`;
      progress.append(bar);

      const foot = make(
        "div",
        "sd-goal-foot",
        planned
          ? `${Stats.formatHours(studied)} / 계획 ${Stats.formatHours(planned)}`
          : `${Stats.formatHours(studied)} 공부함`,
      );
      li.append(head, progress, foot);
      list.append(li);
    });
  }

  function renderUpcoming(today, tasks) {
    const end = D.addDays(today, UPCOMING_DAYS - 1);
    const inRange = (ymd) => ymd >= today && ymd <= end;
    const items = [
      ...SD.getEvents()
        .filter((e) => inRange(e.date))
        .map((e) => ({
          date: e.date,
          title: e.title,
          kind: e.kind === "deadline" ? SD.TYPE_LABEL[e.type] : "일정",
          time: e.kind === "schedule" && e.start ? e.start : "",
        })),
      // deadlines from Calendar are already listed as events
      ...tasks
        .filter(
          (t) => !t.completed && t.sourceEventId === null && inRange(t.date),
        )
        .map((t) => ({
          date: t.date,
          title: t.title,
          kind: "마감",
          time: "",
        })),
    ].sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );

    const list = $("#upcomingList");
    list.replaceChildren();
    $("#upcomingEmpty").classList.toggle("d-none", items.length > 0);
    items.forEach((it) => {
      const li = make("li", "sd-upcoming-item");
      const when = make("div", "sd-upcoming-date");
      when.append(
        make(
          "span",
          "sd-upcoming-day",
          it.date.slice(5).split("-").map(Number).join("/"),
        ),
        make(
          "span",
          "sd-upcoming-dow",
          Stats.formatDate(it.date, { weekday: "short" }),
        ),
      );
      const body = make("div", "sd-upcoming-body");
      body.append(
        make("div", "text-truncate", it.title),
        make(
          "div",
          "sd-upcoming-meta",
          [it.kind, it.time, Stats.ddayText(it.date, today)]
            .filter(Boolean)
            .join(" · "),
        ),
      );
      li.append(when, body);
      list.append(li);
    });
  }

  function render() {
    const today = D.today();
    const tasks = SD.activeTasks();
    const week = Stats.weekMinutes(today);
    renderStats(today, week, tasks);
    renderWeekChart(today, week);
    renderCompletion(tasks);
    renderDdays(today);
    renderGoals(today, tasks);
    renderUpcoming(today, tasks);
  }

  SD.onChange(
    [
      SD.KEYS.tasks,
      SD.KEYS.events,
      SD.KEYS.ddays,
      SD.KEYS.studyLogs,
      SD.KEYS.settings,
    ],
    render,
  );
  render();
})();
