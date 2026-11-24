/* =========================================================
   Dashboard — one GitHub-style grid per class, Jan 1 → Dec 31
   Two sources (toggle), both read-only:
     timer → Timer logs (studyLogs.minutes)
     plan  → planner sessions ticked on Main / Planner (task.sessions hours)
   Maintainer: 김지환
   ========================================================= */
(() => {
  "use strict";

  const D = SD.date;
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const $ = (sel) => document.querySelector(sel);
  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // minutes → level 0–4 (upper bounds of levels 1–3; above = 4)
  const SOURCES = {
    timer: {
      steps: [30, 60, 120],
      scale: "1칸 = 하루 · 30분 · 1시간 · 2시간 기준",
      note: "Timer로 공부한 시간이에요. 과목은 Timer에서 고른 과목 기준.",
    },
    plan: {
      steps: [60, 120, 240],
      scale: "1칸 = 하루 · 1시간 · 2시간 · 4시간 기준",
      note: "오늘의 계획에서 체크한 공부 시간이에요 (Main · Planner). 과목은 할 일의 과목 기준.",
    },
  };

  let source = "timer";
  try {
    if (localStorage.getItem("dashSource") === "plan") source = "plan";
  } catch (e) {}

  const subjectOf = (s) => (SD.SUBJECTS.includes(s) ? s : "기타");

  // { subject: Map(ymd → minutes) } for the given year
  function collect(year) {
    const out = Object.fromEntries(SD.SUBJECTS.map((s) => [s, new Map()]));
    const add = (subject, ymd, min) => {
      if (!ymd.startsWith(`${year}-`) || min <= 0) return;
      const m = out[subjectOf(subject)];
      m.set(ymd, (m.get(ymd) || 0) + min);
    };
    if (source === "timer") {
      SD.getStudyLogs().forEach((l) => add(l.subject, l.date, l.minutes));
    } else {
      SD.getTasks().forEach((t) =>
        t.sessions.forEach((x) => add(t.subject, x.date, x.hours * 60)),
      );
    }
    return out;
  }

  const level = (min) => {
    if (!min) return 0;
    const s = SOURCES[source].steps;
    return min <= s[0] ? 1 : min <= s[1] ? 2 : min <= s[2] ? 3 : 4;
  };
  const fmtDay = (ymd) => {
    const d = D.parse(ymd);
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`;
  };

  /* ---------- one grid: 7 rows (Mon → Sun) × weeks ---------- */
  function heatmap(year, values, today) {
    const jan1 = `${year}-01-01`;
    const dec31 = `${year}-12-31`;
    const start = D.addDays(jan1, -((D.dow(jan1) + 6) % 7)); // Monday on/before Jan 1
    const weeks = Math.ceil((D.diff(dec31, start) + 1) / 7);

    // one grid: column 1 = weekday labels, row 1 = month labels, cells placed by week × weekday
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
    ["월", "", "수", "", "금", "", ""].forEach((t, r) =>
      at(make("span", "sd-heat-dow", t), 1, r + 2),
    );
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

  function streaks(dates, today) {
    const has = new Set(dates);
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

  function render() {
    const today = D.today();
    const year = D.parse(today).getFullYear();
    const data = collect(year);
    const src = SOURCES[source];

    $("#yearLabel").textContent = `${year}년 1월 1일부터`;
    $("#sourceNote").textContent = src.note;
    $("#legendScale").textContent = src.scale;
    $(`#${source === "timer" ? "srcTimer" : "srcPlan"}`).checked = true;

    // summary over all classes
    const byDay = new Map();
    const totals = SD.SUBJECTS.map((s) => {
      let sum = 0;
      data[s].forEach((min, ymd) => {
        sum += min;
        byDay.set(ymd, (byDay.get(ymd) || 0) + min);
      });
      return { subject: s, minutes: sum, days: data[s].size };
    });
    const all = totals.reduce((s, t) => s + t.minutes, 0);
    const st = streaks([...byDay.keys()].filter((d) => d <= today), today);
    const top = [...totals].sort((a, b) => b.minutes - a.minutes)[0];
    $("#statTotal").textContent = Stats.formatMinutes(all);
    $("#statDays").textContent = `${byDay.size}일`;
    $("#statStreak").textContent = `${st.current}일`;
    $("#statBest").textContent = st.best ? `최고 ${st.best}일` : "";
    $("#statTop").textContent = top && top.minutes ? top.subject : "–";
    $("#statTopNote").textContent =
      top && top.minutes ? Stats.formatMinutes(top.minutes) : "";

    // one card per class
    const root = $("#heatmaps");
    root.replaceChildren(
      ...totals.map((t) => {
        const card = make("section", "card sd-heat-card");
        const body = make("div", "card-body");
        const head = make(
          "div",
          "d-flex flex-wrap justify-content-between align-items-baseline gap-2 mb-2",
        );
        head.append(
          make("h2", "sd-section-title", t.subject),
          make(
            "span",
            "small text-secondary",
            t.minutes
              ? `${Stats.formatMinutes(t.minutes)} · ${t.days}일`
              : "아직 기록 없음",
          ),
        );
        const scroll = make("div", "sd-heat-scroll");
        const map = heatmap(year, data[t.subject], today);
        map.setAttribute("role", "img");
        map.setAttribute(
          "aria-label",
          `${t.subject} ${year}년 공부 기록: ${t.days}일, 총 ${Stats.formatMinutes(t.minutes)}`,
        );
        scroll.append(map);
        body.append(head, scroll);
        card.append(body);
        return card;
      }),
    );

    // narrow screens: show the part of the year around today
    root.querySelectorAll(".sd-heat-scroll").forEach((s) => {
      const cell = s.querySelector(".is-today");
      if (cell && s.scrollWidth > s.clientWidth)
        s.scrollLeft = cell.offsetLeft - s.clientWidth + 40;
    });
  }

  document.querySelectorAll('input[name="source"]').forEach((r) =>
    r.addEventListener("change", () => {
      source = r.value;
      try {
        localStorage.setItem("dashSource", source);
      } catch (e) {}
      render();
    }),
  );

  SD.onChange([SD.KEYS.tasks, SD.KEYS.studyLogs], render);
  window.addEventListener("focus", render);
  render();
})();
