/* =========================================================
   Progress — study time from Timer logs (studyLogs) + Todo completion
   Daily goal is a per-browser setting in localStorage "dailyGoal" (minutes), not part of SD.
   Logs can't be deleted here: SD has no delete for studyLogs.
   Maintainer: 김민성
   ========================================================= */
(() => {
  "use strict";

  const D = SD.date;
  const GOAL_KEY = "dailyGoal";
  const GOAL_DEFAULT = 120;
  const GOAL_MIN = 1;
  const GOAL_MAX = 1440;
  const DAYS_PER_PAGE = 7; // record list shows this many days, "더 보기" adds more
  const LOG_MODE_LABEL = { stopwatch: "스톱워치", focus: "뽀모도로" };

  const $ = (sel) => document.querySelector(sel);
  let subjectRange = "week"; // "week" | "all"
  let recordDays = DAYS_PER_PAGE;

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

  /* ---------- daily goal (localStorage "dailyGoal") ---------- */
  function validGoal(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= GOAL_MIN && n <= GOAL_MAX ? n : null;
  }

  function readGoal() {
    try {
      return validGoal(localStorage.getItem(GOAL_KEY)) || GOAL_DEFAULT;
    } catch (e) {
      return GOAL_DEFAULT;
    }
  }

  function saveGoal(minutes) {
    try {
      localStorage.setItem(GOAL_KEY, String(minutes));
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------- render ---------- */
  function renderStats(today, week, logs, goal, tasks) {
    const todayMin = Stats.minutesOn(today, logs);
    const weekTotal = week.reduce((s, d) => s + d.minutes, 0);
    const studiedDays = week.filter((d) => d.minutes > 0).length;
    const goalPct = Math.min(100, Math.round((todayMin / goal) * 100));
    const rate = Stats.taskCompletion(tasks);
    const todayCount = logs.filter((l) => l.date === today).length;

    $("#weekLabel").textContent =
      `${Stats.formatDate(week[0].date, { month: "long", day: "numeric" })} – ${Stats.formatDate(week[6].date, { month: "long", day: "numeric" })}`;

    $("#statToday").textContent = Stats.formatMinutes(todayMin);
    $("#statTodayNote").textContent = todayCount
      ? `기록 ${todayCount}개`
      : "아직 기록 없음";

    $("#statWeek").textContent = Stats.formatMinutes(weekTotal);
    $("#statWeekNote").textContent = studiedDays
      ? `${studiedDays}일 공부함`
      : "";

    $("#statGoal").textContent = `${goalPct}%`;
    setBar("statGoal", goalPct);
    $("#statGoalNote").textContent =
      `${Stats.formatMinutes(todayMin)} / ${Stats.formatMinutes(goal)}`;

    $("#statRate").textContent = `${rate.pct}%`;
    setBar("statRate", rate.pct);
    $("#statRateNote").textContent = `${rate.done} / ${rate.total}개 완료`;
  }

  function renderWeekChart(today, week, goal) {
    const chart = $("#weekChart");
    // a full bar = the daily goal (longer days stretch the scale)
    const max = Math.max(goal, ...week.map((d) => d.minutes));
    const goalDays = week.filter((d) => d.minutes >= goal).length;

    chart.replaceChildren();
    week.forEach((d) => {
      const li = make("li", "sd-week-row");
      li.classList.toggle("is-today", d.date === today);
      li.classList.toggle("is-future", d.date > today);
      li.classList.toggle("is-goal", d.minutes >= goal);
      const track = make("span", "sd-week-track");
      const bar = make("span", "sd-week-bar");
      bar.style.width = `${(d.minutes / max) * 100}%`;
      track.append(bar);
      li.setAttribute(
        "aria-label",
        `${d.label}요일 ${d.minutes ? Stats.formatMinutes(d.minutes) : "기록 없음"}`,
      );
      li.append(
        make("span", "sd-week-day", d.label),
        track,
        make(
          "span",
          "sd-week-value",
          d.minutes ? Stats.formatMinutes(d.minutes) : "–",
        ),
      );
      chart.append(li);
    });

    $("#weekGoalNote").textContent =
      `목표 ${Stats.formatMinutes(goal)} · 달성 ${goalDays}일`;
    $("#weekEmpty").classList.toggle(
      "d-none",
      week.some((d) => d.minutes > 0),
    );
  }

  function renderGoalForm(goal) {
    const input = $("#goalInput");
    if (document.activeElement !== input) input.value = goal;
    document.querySelectorAll("[data-goal]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.goal) === goal);
    });
  }

  // one row: label · bar · value
  function barRow(label, pct, value) {
    const li = make("li", "sd-bar-row");
    const track = make("span", "sd-bar-track");
    const bar = make("span", "sd-bar-fill");
    bar.style.width = `${pct}%`;
    track.append(bar);
    li.append(
      make("span", "sd-bar-label text-truncate", label),
      track,
      make("span", "sd-bar-value", value),
    );
    return li;
  }

  function renderSubjectTime(week, logs) {
    const inRange =
      subjectRange === "week"
        ? logs.filter((l) => l.date >= week[0].date && l.date <= week[6].date)
        : logs;
    const rows = Stats.minutesBySubject(inRange);
    const max = Math.max(1, ...rows.map((r) => r.minutes));
    const list = $("#subjectTimeList");

    document.querySelectorAll("[data-range]").forEach((btn) => {
      const on = btn.dataset.range === subjectRange;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on);
    });
    list.replaceChildren(
      ...rows.map((r) =>
        barRow(
          r.subject,
          (r.minutes / max) * 100,
          Stats.formatMinutes(r.minutes),
        ),
      ),
    );
    $("#subjectTimeEmpty").textContent =
      subjectRange === "week" ? "이번 주 기록이 없습니다." : "기록이 없습니다.";
    $("#subjectTimeEmpty").classList.toggle("d-none", rows.length > 0);
  }

  function renderSubjectTasks(tasks) {
    const rows = Stats.tasksBySubject(tasks);
    const list = $("#subjectTaskList");
    list.replaceChildren(
      ...rows.map((r) => {
        const li = barRow(r.subject, r.pct, `${r.done}/${r.total}`);
        li.setAttribute(
          "aria-label",
          `${r.subject} ${r.total}개 중 ${r.done}개 완료`,
        );
        return li;
      }),
    );
    $("#subjectTaskEmpty").classList.toggle("d-none", rows.length > 0);
  }

  // records grouped by day, newest first
  function renderRecords(today, logs) {
    const titles = new Map(SD.getTasks().map((t) => [t.id, t.title]));
    const byDay = new Map();
    [...logs]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .forEach((l) => {
        if (!byDay.has(l.date)) byDay.set(l.date, []);
        byDay.get(l.date).push(l);
      });

    const days = [...byDay.keys()];
    const box = $("#recordList");
    box.replaceChildren();

    days.slice(0, recordDays).forEach((ymd) => {
      const dayLogs = byDay.get(ymd);
      const group = make("section", "sd-record-day");
      const head = make("h3", "sd-record-head");
      head.append(
        make(
          "span",
          "",
          ymd === today
            ? `오늘 · ${Stats.formatDate(ymd)}`
            : Stats.formatDate(ymd),
        ),
        make(
          "span",
          "sd-record-total",
          Stats.formatMinutes(Stats.minutesOn(ymd, dayLogs)),
        ),
      );
      const list = make("ul", "sd-log-list");
      dayLogs.forEach((l) => {
        const li = make("li", "sd-log-item");
        const body = make("div", "sd-log-body");
        const meta = make("div", "sd-log-meta");
        meta.append(
          make("span", "badge sd-subj", l.subject),
          make("span", "", LOG_MODE_LABEL[l.mode] || "기록"),
        );
        body.append(meta);
        if (titles.has(l.taskId)) {
          body.append(
            make("div", "sd-log-task text-truncate", titles.get(l.taskId)),
          );
        }
        li.append(
          body,
          make("span", "sd-log-minutes", Stats.formatMinutes(l.minutes)),
        );
        list.append(li);
      });
      group.append(head, list);
      box.append(group);
    });

    $("#recordsCount").textContent = logs.length ? `${logs.length}개` : "";
    $("#recordEmpty").classList.toggle("d-none", logs.length > 0);
    $("#recordMore").classList.toggle("d-none", days.length <= recordDays);
  }

  function render() {
    const today = D.today();
    const logs = SD.getStudyLogs();
    const tasks = SD.activeTasks();
    const week = Stats.weekMinutes(today, logs);
    const goal = readGoal();

    renderStats(today, week, logs, goal, tasks);
    renderWeekChart(today, week, goal);
    renderGoalForm(goal);
    renderSubjectTime(week, logs);
    renderSubjectTasks(tasks);
    renderRecords(today, logs);
  }

  /* ---------- events ---------- */
  function applyGoal(value) {
    const input = $("#goalInput");
    const goal = validGoal(value);
    input.classList.toggle("is-invalid", goal === null);
    if (goal === null) return;
    $("#goalSaved").textContent = saveGoal(goal)
      ? `하루 ${Stats.formatMinutes(goal)}으로 저장했어요.`
      : "이 브라우저에서는 저장할 수 없어요.";
    input.blur();
    render();
  }

  $("#goalForm").addEventListener("submit", (e) => {
    e.preventDefault();
    applyGoal($("#goalInput").value);
  });
  document
    .querySelectorAll("[data-goal]")
    .forEach((btn) =>
      btn.addEventListener("click", () => applyGoal(btn.dataset.goal)),
    );
  document.querySelectorAll("[data-range]").forEach((btn) =>
    btn.addEventListener("click", () => {
      subjectRange = btn.dataset.range;
      render();
    }),
  );
  $("#recordMore").addEventListener("click", () => {
    recordDays += DAYS_PER_PAGE;
    render();
  });

  SD.onChange([SD.KEYS.studyLogs, SD.KEYS.tasks, GOAL_KEY], render);
  render();
})();
