(() => {
  const STORAGE_KEYS = {
    records: "studyTimer.records",
    subjects: "studyTimer.subjects",
    goal: "studyTimer.dailyGoal",
    theme: "studyTimer.theme",
  };

  const DEFAULT_SUBJECTS = ["수학", "영어", "국어", "과학", "코딩", "기타"];
  const DEFAULT_GOAL = 120;

  const els = {
    themeToggle: document.getElementById("themeToggle"),
    progressToggle: document.getElementById("progressToggle"),
    progressClose: document.getElementById("progressClose"),
    progressPanel: document.getElementById("progressPanel"),
    layout: document.querySelector(".layout"),
    subjectSelect: document.getElementById("subjectSelect"),
    addSubjectBtn: document.getElementById("addSubjectBtn"),
    timerDisplay: document.getElementById("timerDisplay"),
    timerStatus: document.getElementById("timerStatus"),
    startBtn: document.getElementById("startBtn"),
    pauseBtn: document.getElementById("pauseBtn"),
    stopBtn: document.getElementById("stopBtn"),
    sessionTime: document.getElementById("sessionTime"),
    todayTime: document.getElementById("todayTime"),
    recentList: document.getElementById("recentList"),
    dailyGoal: document.getElementById("dailyGoal"),
    saveGoalBtn: document.getElementById("saveGoalBtn"),
    goalBar: document.getElementById("goalBar"),
    goalText: document.getElementById("goalText"),
    statToday: document.getElementById("statToday"),
    statWeek: document.getElementById("statWeek"),
    dailyChart: document.getElementById("dailyChart"),
    subjectChart: document.getElementById("subjectChart"),
    allRecordsList: document.getElementById("allRecordsList"),
    clearRecordsBtn: document.getElementById("clearRecordsBtn"),
  };

  let records = loadJson(STORAGE_KEYS.records, []);
  let subjects = loadJson(STORAGE_KEYS.subjects, DEFAULT_SUBJECTS);
  let dailyGoal = Number(localStorage.getItem(STORAGE_KEYS.goal)) || DEFAULT_GOAL;

  let running = false;
  let paused = false;
  let startedAt = null;
  let accumulatedMs = 0;
  let tickId = null;

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function saveRecords() {
    localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(records));
  }

  function saveSubjects() {
    localStorage.setItem(STORAGE_KEYS.subjects, JSON.stringify(subjects));
  }

  function formatDuration(ms) {
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  function formatMinutes(ms) {
    return Math.round(ms / 60000);
  }

  function toDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function startOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - diff);
    return d;
  }

  function currentElapsedMs() {
    if (!running || paused || !startedAt) return accumulatedMs;
    return accumulatedMs + (Date.now() - startedAt);
  }

  function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    els.themeToggle.textContent = theme === "dark" ? "라이트모드" : "다크모드";
  }

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    setTheme(saved === "dark" ? "dark" : "light");
  }

  function renderSubjects() {
    const current = els.subjectSelect.value;
    els.subjectSelect.innerHTML = subjects
      .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
      .join("");
    if (subjects.includes(current)) {
      els.subjectSelect.value = current;
    }
  }

  function escapeHtml(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function updateTimerButtons() {
    els.startBtn.disabled = running && !paused;
    els.pauseBtn.disabled = !running || paused;
    els.stopBtn.disabled = !running && accumulatedMs === 0;
    els.subjectSelect.disabled = running;
    els.addSubjectBtn.disabled = running;
  }

  function updateTimerView() {
    const elapsed = currentElapsedMs();
    els.timerDisplay.textContent = formatDuration(elapsed);
    els.sessionTime.textContent = formatDuration(elapsed);
    els.todayTime.textContent = formatDuration(getTodayMs() + (running ? elapsed : 0));

    if (!running && accumulatedMs === 0) {
      els.timerStatus.textContent = "대기 중";
    } else if (paused) {
      els.timerStatus.textContent = "일시정지";
    } else if (running) {
      els.timerStatus.textContent = `"${els.subjectSelect.value}" 학습 중`;
    }
  }

  function getTodayMs() {
    const today = toDateKey(new Date());
    return records
      .filter((r) => r.date === today)
      .reduce((sum, r) => sum + r.durationMs, 0);
  }

  function getWeekMs() {
    const start = startOfWeek(new Date()).getTime();
    return records
      .filter((r) => new Date(r.endedAt).getTime() >= start)
      .reduce((sum, r) => sum + r.durationMs, 0);
  }

  function startTick() {
    stopTick();
    tickId = setInterval(() => {
      updateTimerView();
      if (els.layout.classList.contains("progress-open")) renderProgress();
    }, 250);
  }

  function stopTick() {
    if (tickId) {
      clearInterval(tickId);
      tickId = null;
    }
  }

  function startTimer() {
    if (running && !paused) return;

    if (!running) {
      accumulatedMs = 0;
    running = true;
      paused = false;
      startedAt = Date.now();
    } else if (paused) {
      paused = false;
      startedAt = Date.now();
    }

    startTick();
    updateTimerButtons();
    updateTimerView();
  }

  function pauseTimer() {
    if (!running || paused) return;
    accumulatedMs += Date.now() - startedAt;
    startedAt = null;
    paused = true;
    stopTick();
    updateTimerButtons();
    updateTimerView();
  }

  function stopTimer() {
    if (!running && accumulatedMs === 0) return;

    let durationMs = accumulatedMs;
    if (running && !paused && startedAt) {
      durationMs += Date.now() - startedAt;
    }

    const subject = els.subjectSelect.value;
    const endedAt = new Date();

    if (durationMs >= 1000) {
      records.unshift({
        id: crypto.randomUUID(),
        subject,
        durationMs,
        endedAt: endedAt.toISOString(),
        date: toDateKey(endedAt),
      });
      saveRecords();
    }

    running = false;
    paused = false;
    startedAt = null;
    accumulatedMs = 0;
    stopTick();
    updateTimerButtons();
    updateTimerView();
    renderRecent();
    renderProgress();
  }

  function renderRecent() {
    const recent = records.slice(0, 8);
    if (!recent.length) {
      els.recentList.innerHTML = `<li class="empty">아직 기록이 없습니다.</li>`;
      return;
    }

    els.recentList.innerHTML = recent
      .map((r) => {
        const time = new Date(r.endedAt).toLocaleString("ko-KR", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<li>
          <span>${escapeHtml(r.subject)} · ${formatDuration(r.durationMs)}</span>
          <span class="meta">${time}</span>
        </li>`;
      })
      .join("");
  }

  function renderProgress() {
    const liveToday = getTodayMs() + (running ? currentElapsedMs() : 0);
    const weekMs = getWeekMs() + (running ? currentElapsedMs() : 0);
    const goalMs = dailyGoal * 60 * 1000;
    const percent = Math.min(100, Math.round((liveToday / goalMs) * 100));

    els.statToday.textContent = formatDuration(liveToday);
    els.statWeek.textContent = formatDuration(weekMs);
    els.goalBar.style.width = `${percent}%`;
    els.goalText.textContent = `${formatMinutes(liveToday)} / ${dailyGoal}분 (${percent}%)`;
    els.dailyGoal.value = String(dailyGoal);

    renderDailyChart();
    renderSubjectChart();
    renderAllRecords();
  }

  function renderDailyChart() {
    const days = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }

    const todayKey = toDateKey(new Date());
    const values = days.map((d) => {
      const key = toDateKey(d);
      let ms = records
        .filter((r) => r.date === key)
        .reduce((sum, r) => sum + r.durationMs, 0);
      if (key === todayKey && running) ms += currentElapsedMs();
      return { date: d, ms };
    });

    const max = Math.max(...values.map((v) => v.ms), 1);

    els.dailyChart.innerHTML = values
      .map((v) => {
        const height = Math.max(2, Math.round((v.ms / max) * 110));
        const label = `${v.date.getMonth() + 1}/${v.date.getDate()}`;
        return `<div class="bar-item">
          <span class="bar-value">${formatMinutes(v.ms)}m</span>
          <div class="bar" style="height:${height}px"></div>
          <span class="bar-label">${label}</span>
        </div>`;
      })
      .join("");
  }

  function renderSubjectChart() {
    const map = new Map();
    for (const r of records) {
      map.set(r.subject, (map.get(r.subject) || 0) + r.durationMs);
    }
    if (running) {
      const subject = els.subjectSelect.value;
      map.set(subject, (map.get(subject) || 0) + currentElapsedMs());
    }

    const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      els.subjectChart.innerHTML = `<p class="empty">과목별 기록이 없습니다.</p>`;
      return;
    }

    const max = Math.max(...entries.map(([, ms]) => ms), 1);
    els.subjectChart.innerHTML = entries
      .map(([name, ms]) => {
        const width = Math.max(2, Math.round((ms / max) * 100));
        return `<div class="subject-row-bar">
          <span class="name">${escapeHtml(name)}</span>
          <div class="track"><div class="fill" style="width:${width}%"></div></div>
          <span class="value">${formatDuration(ms)}</span>
        </div>`;
      })
      .join("");
  }

  function renderAllRecords() {
    if (!records.length) {
      els.allRecordsList.innerHTML = `<li class="empty">저장된 기록이 없습니다.</li>`;
      return;
    }

    els.allRecordsList.innerHTML = records
      .map((r) => {
        const time = new Date(r.endedAt).toLocaleString("ko-KR");
        return `<li>
          <span>${escapeHtml(r.subject)} · ${formatDuration(r.durationMs)}</span>
          <span class="meta">${time}</span>
        </li>`;
      })
      .join("");
  }

  let progressOpen = false;
  let progressAnimating = false;

  function setProgressOpen(open) {
    if (progressAnimating || open === progressOpen) return;

    progressOpen = open;
    progressAnimating = true;

    els.layout.classList.toggle("progress-open", open);
    els.progressPanel.setAttribute("aria-hidden", String(!open));
    els.progressToggle.setAttribute("aria-expanded", String(open));
    els.progressToggle.textContent = open ? "Progress 닫기" : "Progress";

    if (open) renderProgress();

    const onEnd = (event) => {
      if (event.target !== els.progressPanel) return;
      if (event.propertyName !== "width" && event.propertyName !== "flex-basis") {
        return;
      }
      els.progressPanel.removeEventListener("transitionend", onEnd);
      progressAnimating = false;
    };

    els.progressPanel.addEventListener("transitionend", onEnd);
    window.setTimeout(() => {
      progressAnimating = false;
    }, 400);
  }

  function isProgressOpen() {
    return progressOpen;
  }

  function addSubject() {
    const name = prompt("추가할 과목 이름을 입력하세요.");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (subjects.includes(trimmed)) {
      els.subjectSelect.value = trimmed;
      return;
    }
    subjects.push(trimmed);
    saveSubjects();
    renderSubjects();
    els.subjectSelect.value = trimmed;
  }

  els.themeToggle.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "light"
        : "dark";
    setTheme(next);
  });

  els.progressToggle.addEventListener("click", () => {
    setProgressOpen(!isProgressOpen());
  });

  els.progressClose.addEventListener("click", () => {
    setProgressOpen(false);
  });

  els.startBtn.addEventListener("click", startTimer);
  els.pauseBtn.addEventListener("click", pauseTimer);
  els.stopBtn.addEventListener("click", stopTimer);
  els.addSubjectBtn.addEventListener("click", addSubject);

  els.saveGoalBtn.addEventListener("click", () => {
    const value = Number(els.dailyGoal.value);
    if (!Number.isFinite(value) || value < 1) {
      alert("일일 목표는 1분 이상이어야 합니다.");
      return;
    }
    dailyGoal = Math.min(1440, Math.floor(value));
    localStorage.setItem(STORAGE_KEYS.goal, String(dailyGoal));
    renderProgress();
  });

  els.clearRecordsBtn.addEventListener("click", () => {
    if (!confirm("모든 학습 기록을 삭제할까요?")) return;
    records = [];
    saveRecords();
    renderRecent();
    renderProgress();
    updateTimerView();
  });

  window.addEventListener("beforeunload", (event) => {
    if (running || accumulatedMs > 0) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  initTheme();
  renderSubjects();
  updateTimerButtons();
  updateTimerView();
  renderRecent();
  progressOpen = false;
  els.layout.classList.remove("progress-open");
  els.progressPanel.setAttribute("aria-hidden", "true");
  els.progressToggle.setAttribute("aria-expanded", "false");
  els.progressToggle.textContent = "Progress";
})();
