/* =========================================================
   Timer — stopwatch + pomodoro
   Finished focus time is saved with SD.addStudyLog (whole minutes, 1분 이상만).
   Breaks are not saved. A running timer survives a reload:
   its start time is kept in localStorage "timerState" (this page's UI state, not shared data).
   Maintainer: 김민성
   ========================================================= */
(() => {
  "use strict";

  const D = SD.date;
  const STATE_KEY = "timerState";
  const RECENT_LIMIT = 5;
  const LONG_BREAK_EVERY = 4; // 4번째 집중 뒤에는 긴 휴식
  const TICK_MS = 250;

  const PHASES = {
    focus: { label: "집중", min: 1, max: 120, minutes: 25 },
    short: { label: "짧은 휴식", min: 1, max: 30, minutes: 5 },
    long: { label: "긴 휴식", min: 1, max: 60, minutes: 15 },
  };
  const LOG_MODE_LABEL = { stopwatch: "스톱워치", focus: "뽀모도로" };

  const $ = (sel) => document.querySelector(sel);
  const els = {
    todayLabel: $("#todayLabel"),
    modeButtons: document.querySelectorAll("[data-mode]"),
    phaseTabs: $("#phaseTabs"),
    phaseButtons: document.querySelectorAll("#phaseTabs [data-phase]"),
    subject: $("#subjectSelect"),
    task: $("#taskSelect"),
    clock: $("#clock"),
    clockStatus: $("#clockStatus"),
    phaseBarWrap: $("#phaseBarWrap"),
    phaseBar: $("#phaseBar"),
    startBtn: $("#startBtn"),
    stopBtn: $("#stopBtn"),
    resetBtn: $("#resetBtn"),
    notice: $("#notice"),
    minutesBox: $("#minutesBox"),
    minuteInputs: document.querySelectorAll("#minutesBox [data-phase]"),
    todayTotal: $("#todayTotal"),
    todayNote: $("#todayNote"),
    recentList: $("#recentList"),
    recentEmpty: $("#recentEmpty"),
  };

  function make(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  /* ---------- state (saved so a reload keeps the running timer) ---------- */
  function defaultState() {
    return {
      mode: "stopwatch", // "stopwatch" | "pomodoro"
      subject: "",
      taskId: null,
      running: false,
      startedAt: null, // Date.now() when the current run started
      accumulatedMs: 0, // time from earlier runs, before the last pause
      phase: "focus", // pomodoro only: "focus" | "short" | "long"
      focusCount: 0, // finished focus sessions, decides short vs long break
      minutes: {
        focus: PHASES.focus.minutes,
        short: PHASES.short.minutes,
        long: PHASES.long.minutes,
      },
    };
  }

  function clampMinutes(phase, value) {
    const n = parseInt(value, 10);
    const { min, max, minutes } = PHASES[phase];
    if (!Number.isFinite(n)) return minutes;
    return Math.min(max, Math.max(min, n));
  }

  function loadState() {
    const base = defaultState();
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STATE_KEY));
    } catch (e) {
      saved = null;
    }
    if (!saved || typeof saved !== "object") return base;

    const s = {
      ...base,
      ...saved,
      minutes: { ...base.minutes, ...saved.minutes },
    };
    if (!["stopwatch", "pomodoro"].includes(s.mode)) s.mode = base.mode;
    if (typeof s.subject !== "string") s.subject = base.subject;
    if (typeof s.taskId !== "number") s.taskId = null;
    if (!(s.phase in PHASES)) s.phase = "focus";
    s.running = s.running === true && Number.isFinite(s.startedAt);
    if (!s.running) s.startedAt = null;
    s.accumulatedMs =
      Number.isFinite(s.accumulatedMs) && s.accumulatedMs > 0
        ? s.accumulatedMs
        : 0;
    s.focusCount =
      Number.isInteger(s.focusCount) && s.focusCount > 0 ? s.focusCount : 0;
    Object.keys(PHASES).forEach((p) => {
      s.minutes[p] = clampMinutes(p, s.minutes[p]);
    });
    return s;
  }

  function saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      // storage blocked: the timer still works, it just won't survive a reload
    }
  }

  const state = loadState();
  let tickId = null;

  /* ---------- time ---------- */
  const isPomodoro = () => state.mode === "pomodoro";
  const elapsedMs = () =>
    Math.max(
      0,
      state.accumulatedMs + (state.running ? Date.now() - state.startedAt : 0),
    );
  const phaseMs = () => state.minutes[state.phase] * 60000;
  const remainingMs = () => Math.max(0, phaseMs() - elapsedMs());
  const inSession = () => state.running || state.accumulatedMs > 0;

  const pad = (n) => String(n).padStart(2, "0");
  function formatClock(ms, withHours) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (withHours) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(h * 60 + m)}:${pad(s)}`;
  }

  // countdown rounds up so it shows 25:00 at the start, not 24:59
  const clockText = () =>
    isPomodoro()
      ? formatClock(Math.ceil(remainingMs() / 1000) * 1000, false)
      : formatClock(elapsedMs(), true);

  /* ---------- saving logs ---------- */
  function openTasks() {
    return SD.activeTasks()
      .filter((t) => !t.completed)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function saveLog(minutes, mode) {
    const taskId = openTasks().some((t) => t.id === state.taskId)
      ? state.taskId
      : null;
    return SD.addStudyLog({ subject: state.subject, minutes, taskId, mode });
  }

  /* ---------- actions ---------- */
  function start() {
    if (state.running) return;
    state.running = true;
    state.startedAt = Date.now();
    setNotice("");
    saveState();
    startTick();
    render();
  }

  function pause() {
    if (!state.running) return;
    state.accumulatedMs = elapsedMs();
    state.running = false;
    state.startedAt = null;
    saveState();
    stopTick();
    render();
  }

  function clearSession() {
    state.running = false;
    state.startedAt = null;
    state.accumulatedMs = 0;
    stopTick();
  }

  // stopwatch: stop and save the whole minutes
  function stopStopwatch() {
    const minutes = Math.floor(elapsedMs() / 60000);
    clearSession();
    if (minutes >= 1) {
      saveLog(minutes, "stopwatch");
      setNotice(`${state.subject ? state.subject + " " : ""}${Stats.formatMinutes(minutes)} 기록했어요.`);
    } else {
      setNotice("1분 미만은 기록하지 않아요.");
    }
    saveState();
    renderAll();
  }

  // pomodoro: back to the start of this phase, nothing saved
  function resetPomodoro() {
    clearSession();
    setNotice("");
    saveState();
    render();
  }

  // pomodoro: the countdown reached 0
  function finishPhase() {
    const finished = state.phase;
    clearSession();

    if (finished === "focus") {
      const minutes = state.minutes.focus;
      saveLog(minutes, "focus");
      state.focusCount += 1;
      state.phase =
        state.focusCount % LONG_BREAK_EVERY === 0 ? "long" : "short";
      setNotice(
        `집중 ${minutes}분 기록했어요. 이제 ${state.minutes[state.phase]}분 ${PHASES[state.phase].label}.`,
      );
    } else {
      state.phase = "focus";
      setNotice("휴식 끝! 다시 집중해 볼까요?");
    }
    saveState();
    renderAll();
  }

  function selectMode(mode) {
    if (inSession() || mode === state.mode) return;
    state.mode = mode;
    setNotice("");
    saveState();
    render();
  }

  function selectPhase(phase) {
    if (inSession() || phase === state.phase) return;
    state.phase = phase;
    setNotice("");
    saveState();
    render();
  }

  /* ---------- tick ---------- */
  function tick() {
    if (isPomodoro() && state.running && remainingMs() === 0) {
      finishPhase();
      return;
    }
    renderClock();
  }

  function startTick() {
    stopTick();
    tickId = setInterval(tick, TICK_MS);
  }

  function stopTick() {
    if (tickId) clearInterval(tickId);
    tickId = null;
  }

  /* ---------- render ---------- */
  function setNotice(text) {
    els.notice.textContent = text;
  }

  function renderClock() {
    const text = clockText();
    els.clock.textContent = text;
    document.title = state.running
      ? `${text} · Timer`
      : "Timer | Study Dashboard";

    if (isPomodoro()) {
      const pct = Math.min(100, Math.round((elapsedMs() / phaseMs()) * 100));
      els.phaseBar.style.width = `${pct}%`;
      els.phaseBarWrap.setAttribute("aria-valuenow", pct);
    }
  }

  function statusText() {
    const isBreak = isPomodoro() && state.phase !== "focus";
    const what = isPomodoro() ? PHASES[state.phase].label : "공부";
    if (state.running)
      return isBreak || !state.subject ? `${what} 중` : `${state.subject} · ${what} 중`;
    if (state.accumulatedMs > 0) return "일시정지";
    if (isPomodoro())
      return `${what} ${state.minutes[state.phase]}분 · 대기 중`;
    return "대기 중";
  }

  function render() {
    const pomodoro = isPomodoro();
    const busy = inSession();
    const isBreak = pomodoro && state.phase !== "focus";

    els.modeButtons.forEach((btn) => {
      const on = btn.dataset.mode === state.mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on);
      btn.disabled = busy && !on;
    });
    els.phaseButtons.forEach((btn) => {
      const on = btn.dataset.phase === state.phase;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on);
      btn.disabled = busy && !on;
    });
    els.minuteInputs.forEach((input) => {
      input.value = state.minutes[input.dataset.phase];
      input.disabled = busy;
    });

    els.phaseTabs.classList.toggle("d-none", !pomodoro);
    els.minutesBox.classList.toggle("d-none", !pomodoro);
    els.phaseBarWrap.classList.toggle("invisible", !pomodoro);
    els.stopBtn.classList.toggle("d-none", pomodoro);
    els.resetBtn.classList.toggle("d-none", !pomodoro);

    if (els.subject.value !== state.subject) subjects.fill(state.subject);
    els.subject.disabled = busy;
    els.task.disabled = busy;

    els.startBtn.textContent = state.running
      ? "일시정지"
      : busy
        ? "계속"
        : "시작";
    els.stopBtn.disabled = !busy;
    els.resetBtn.disabled = !busy;

    els.clock.classList.toggle("is-break", isBreak);
    els.clock.classList.toggle("is-paused", busy && !state.running);
    els.phaseBarWrap.classList.toggle("is-break", isBreak);
    els.clockStatus.textContent = statusText();
    renderClock();
  }

  // classes are the user's own list (Views.subjectPicker adds "+ 새 과목")
  const subjects = Views.subjectPicker(els.subject, {
    onChange: (v) => {
      state.subject = v;
      saveState();
      render();
    },
  });
  function renderSubjects() {
    subjects.fill(state.subject);
  }

  function renderTasks() {
    const tasks = openTasks();
    if (!tasks.some((t) => t.id === state.taskId)) state.taskId = null;

    const none = make(
      "option",
      "",
      tasks.length ? "연결 안 함" : "열린 할 일 없음",
    );
    none.value = "";
    els.task.replaceChildren(
      none,
      ...tasks.map((t) => {
        const opt = make("option", "", t.subject ? `${t.title} · ${t.subject}` : t.title);
        opt.value = String(t.id);
        return opt;
      }),
    );
    els.task.value = state.taskId === null ? "" : String(state.taskId);
  }

  function renderToday() {
    const today = D.today();
    const logs = SD.getStudyLogs();
    const todayLogs = logs.filter((l) => l.date === today);
    const focusCount = todayLogs.filter((l) => l.mode === "focus").length;

    els.todayLabel.textContent = Stats.formatDate(today);
    els.todayTotal.textContent = Stats.formatMinutes(
      Stats.minutesOn(today, logs),
    );
    els.todayNote.textContent = todayLogs.length
      ? `기록 ${todayLogs.length}개${focusCount ? ` · 뽀모도로 ${focusCount}회` : ""}`
      : "아직 기록이 없습니다";

    renderRecent(logs, today);
  }

  function renderRecent(logs, today) {
    const titles = new Map(SD.getTasks().map((t) => [t.id, t.title]));
    const recent = [...logs].sort((a, b) => b.id - a.id).slice(0, RECENT_LIMIT);

    els.recentList.replaceChildren();
    els.recentEmpty.classList.toggle("d-none", recent.length > 0);
    recent.forEach((l) => {
      const li = make("li", "sd-log-item");

      const body = make("div", "sd-log-body");
      const meta = make("div", "sd-log-meta");
      meta.append(
        make("span", "badge sd-subj", l.subject || "과목 없음"),
        make("span", "", LOG_MODE_LABEL[l.mode] || "기록"),
      );
      body.append(meta);
      if (titles.has(l.taskId)) {
        body.append(
          make("div", "sd-log-task text-truncate", titles.get(l.taskId)),
        );
      }

      const side = make("div", "sd-log-side");
      const day =
        l.date === today
          ? "오늘"
          : Stats.formatDate(l.date, {
              month: "numeric",
              day: "numeric",
              weekday: "short",
            });
      side.append(
        make("span", "sd-log-minutes", Stats.formatMinutes(l.minutes)),
        make("span", "sd-log-date", day),
      );

      li.append(body, side);
      els.recentList.append(li);
    });
  }

  function renderAll() {
    renderTasks();
    renderToday();
    render();
  }

  /* ---------- events ---------- */
  els.modeButtons.forEach((btn) =>
    btn.addEventListener("click", () => selectMode(btn.dataset.mode)),
  );
  els.phaseButtons.forEach((btn) =>
    btn.addEventListener("click", () => selectPhase(btn.dataset.phase)),
  );
  els.minuteInputs.forEach((input) =>
    input.addEventListener("change", () => {
      const phase = input.dataset.phase;
      state.minutes[phase] = clampMinutes(phase, input.value);
      saveState();
      render();
    }),
  );

  // linking a task also picks its subject
  els.task.addEventListener("change", () => {
    state.taskId = els.task.value ? Number(els.task.value) : null;
    const task = openTasks().find((t) => t.id === state.taskId);
    if (task && task.subject) state.subject = task.subject;
    saveState();
    render();
  });

  els.startBtn.addEventListener("click", () =>
    state.running ? pause() : start(),
  );
  els.stopBtn.addEventListener("click", stopStopwatch);
  els.resetBtn.addEventListener("click", resetPomodoro);

  SD.onChange([SD.KEYS.studyLogs, SD.KEYS.tasks], () => {
    renderTasks();
    renderToday();
  });

  /* ---------- start ---------- */
  renderSubjects();
  renderAll();
  if (state.running) {
    startTick();
    tick(); // a pomodoro that ended while the page was closed is finished (and saved) now
  }
})();
