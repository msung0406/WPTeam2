/* =========================================================
   Study Dashboard — read-only summaries (load after storage.js)
   Pure functions over SD data. Main · Dashboard use it; Progress can too.
   Study time = Timer logs (studyLogs.minutes).
   Maintainer: 김지환
   ========================================================= */
const Stats = (() => {
  "use strict";

  const D = SD.date;
  const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

  // Monday of the week that contains ymd
  const weekStart = (ymd) => D.addDays(ymd, -((D.dow(ymd) + 6) % 7));

  function minutesOn(ymd, logs = SD.getStudyLogs()) {
    return logs
      .filter((l) => l.date === ymd)
      .reduce((s, l) => s + l.minutes, 0);
  }

  // [{ date, label, minutes }] Mon → Sun
  function weekMinutes(today = D.today(), logs = SD.getStudyLogs()) {
    const start = weekStart(today);
    return Array.from({ length: 7 }, (_, i) => {
      const date = D.addDays(start, i);
      return {
        date,
        label: WEEKDAY_LABEL[D.dow(date)],
        minutes: minutesOn(date, logs),
      };
    });
  }

  function taskCompletion(tasks = SD.activeTasks()) {
    const done = tasks.filter((t) => t.completed).length;
    return {
      done,
      total: tasks.length,
      pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    };
  }

  // today's planner items with hours planned / done (same rule as the Todo page)
  function todayPlan(today = D.today()) {
    const settings = SD.getSettings();
    const items = Planner.planDay({
      tasks: SD.getTasks(),
      events: SD.getEvents(),
      settings,
      today,
    });
    const plannedOf = (i) =>
      i.block === "day" ? settings.longDayHours : i.hours;
    const planned = items.reduce((s, i) => s + plannedOf(i), 0);
    const done = items.reduce((s, i) => s + Math.min(i.done, plannedOf(i)), 0);
    return {
      items,
      planned,
      done,
      plannedOf,
      pct: planned ? Math.round((done / planned) * 100) : 0,
    };
  }

  // D-Days from today on, nearest first
  const upcomingDdays = (today = D.today()) =>
    SD.allDdays().filter((d) => d.targetDate >= today);

  function ddayText(ymd, today = D.today()) {
    const n = D.diff(ymd, today);
    if (n === 0) return "D-Day";
    return n > 0 ? `D-${n}` : `D+${-n}`;
  }

  function formatMinutes(min) {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    if (!h) return `${m}분`;
    return m ? `${h}시간 ${m}분` : `${h}시간`;
  }

  const formatHours = (h) =>
    h < 1 && h > 0 ? `${Math.round(h * 60)}분` : `${+h.toFixed(1)}시간`;

  function formatDate(
    ymd,
    opts = { month: "long", day: "numeric", weekday: "short" },
  ) {
    return new Intl.DateTimeFormat("ko-KR", opts).format(D.parse(ymd));
  }

  return {
    WEEKDAY_LABEL,
    weekStart,
    minutesOn,
    weekMinutes,
    taskCompletion,
    todayPlan,
    upcomingDdays,
    ddayText,
    formatMinutes,
    formatHours,
    formatDate,
  };
})();
