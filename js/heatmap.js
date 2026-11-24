/* =========================================================
   Study Dashboard — Timer heatmap (GitHub-style), Jan 1 → Dec 31
   Read-only: Timer logs (studyLogs.minutes). Used by Dashboard (index.html).
     Heatmap.render(container, { subject })  subject '' = all classes
   Maintainer: 김지환
   ========================================================= */
const Heatmap = (() => {
  "use strict";

  const D = SD.date;
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const STEPS = [30, 60, 120]; // minutes: ≤30 lv1 · ≤60 lv2 · ≤120 lv3 · more lv4
  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const level = (min) =>
    !min ? 0 : min <= STEPS[0] ? 1 : min <= STEPS[1] ? 2 : min <= STEPS[2] ? 3 : 4;
  const fmtDay = (ymd) => {
    const d = D.parse(ymd);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
  };

  // Map(ymd → minutes) for one year; subject null = every log
  function minutesByDay(year, subject = null, logs = SD.getStudyLogs()) {
    const out = new Map();
    logs.forEach((l) => {
      if (!l.date.startsWith(`${year}-`) || l.minutes <= 0) return;
      if (subject !== null && l.subject !== subject) return;
      out.set(l.date, (out.get(l.date) || 0) + l.minutes);
    });
    return out;
  }

  function streaks(days, today) {
    const has = new Set([...days].filter((d) => d <= today));
    let current = 0;
    let d = has.has(today) ? today : D.addDays(today, -1); // today not studied yet → count up to yesterday
    while (has.has(d)) {
      current++;
      d = D.addDays(d, -1);
    }
    let best = 0;
    let run = 0;
    let prev = null;
    [...has].sort().forEach((x) => {
      run = prev && D.diff(x, prev) === 1 ? run + 1 : 1;
      best = Math.max(best, run);
      prev = x;
    });
    return { current, best };
  }

  // one grid: column 1 = weekday labels, row 1 = month labels, cells placed by week × weekday
  function grid(year, values, today) {
    const jan1 = `${year}-01-01`;
    const dec31 = `${year}-12-31`;
    const start = D.addDays(jan1, -((D.dow(jan1) + 6) % 7)); // Monday on/before Jan 1
    const weeks = Math.ceil((D.diff(dec31, start) + 1) / 7);
    const wrap = make("div", "sd-heat");
    wrap.style.setProperty("--weeks", weeks);
    const at = (node, col, row, span = 1) => {
      node.style.gridColumn = `${col} / span ${span}`;
      node.style.gridRow = String(row);
      wrap.append(node);
    };
    for (let m = 0; m < 12; m++) {
      const first = D.toYMD(new Date(year, m, 1));
      at(make("span", "sd-heat-month", `${m + 1}월`), Math.floor(D.diff(first, start) / 7) + 2, 1, 3);
    }
    ["월", "", "수", "", "금", "", ""].forEach((t, r) => at(make("span", "sd-heat-dow", t), 1, r + 2));
    for (let i = 0; i < weeks * 7; i++) {
      const ymd = D.addDays(start, i);
      const cell = make("i", "sd-heat-cell");
      if (ymd < jan1 || ymd > dec31) cell.classList.add("is-out");
      else {
        const min = values.get(ymd) || 0;
        cell.classList.add(`lv${level(min)}`);
        if (ymd > today) cell.classList.add("is-future");
        if (ymd === today) cell.classList.add("is-today");
        cell.title = `${fmtDay(ymd)} · ${min ? Stats.formatMinutes(min) : "기록 없음"}`;
      }
      at(cell, Math.floor(i / 7) + 2, (i % 7) + 2);
    }
    return wrap;
  }

  // draws the grid into `scroll`, returns the numbers for the summary line
  function render(scroll, { subject = "" } = {}) {
    const today = D.today();
    const year = D.parse(today).getFullYear();
    const values = minutesByDay(year, subject || null);
    let total = 0;
    values.forEach((m) => {
      total += m;
    });
    const st = streaks(values.keys(), today);
    const map = grid(year, values, today);
    map.setAttribute("role", "img");
    map.setAttribute(
      "aria-label",
      `${subject || "전체"} ${year}년 Timer 공부 기록: ${values.size}일, 총 ${Stats.formatMinutes(total)}`,
    );
    scroll.replaceChildren(map);
    // narrow screens: show the part of the year around today
    const cell = map.querySelector(".is-today");
    if (cell && scroll.scrollWidth > scroll.clientWidth)
      scroll.scrollLeft = cell.offsetLeft - scroll.clientWidth + 40;
    return { year, total, days: values.size, ...st };
  }

  return { STEPS, minutesByDay, streaks, render };
})();
