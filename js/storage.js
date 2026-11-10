/* =========================================================
   Study Dashboard — shared data layer v3 (ALL pages load this first)
   Every page reads/writes localStorage ONLY through SD.*
   v4 = size-based planning with session hours. Tasks have a size (1–5), no time estimate;
        the planner (js/planner.js) turns size + due date + your week into sessions of N hours.
   Rules: date "YYYY-MM-DD" · time "HH:MM" · id = SD.newId()
   Maintainer: 김주환
   ========================================================= */
const SD = (() => {
  'use strict';

  /* ---------- constants ---------- */
  const KEYS = { tasks: 'tasks', events: 'events', ddays: 'ddays', studyLogs: 'studyLogs', settings: 'settings' };

  // Fixed list so per-subject stats never split on typos
  const SUBJECTS = ['Web Programming', 'Algorithms', 'Networking', 'Autonomous Driving', 'Cloud', '기타'];

  const PRIORITIES = ['high', 'mid', 'low'];
  const PRIORITY_LABEL = { high: '높음', mid: '보통', low: '낮음' };

  const TYPES = ['exam', 'project', 'assignment', 'general'];
  const TYPE_LABEL = { exam: '시험', project: '프로젝트', assignment: '과제', general: '일반' };
  const TYPE_DEFAULT_SIZE = { general: 2, assignment: 3, exam: 4, project: 5 };

  const SIZES = [1, 2, 3, 4, 5];
  const SIZE_LABEL = { 1: '아주 작음', 2: '작음', 3: '보통', 4: '큼', 5: '아주 큼' };

  // Weekly availability, index = day of week (0 Sun … 6 Sat): 'off' 쉼 · 'short' 짧게 (1h sessions) · 'long' 길게 (종일 OK)
  const AVAIL = ['off', 'short', 'long'];
  const AVAIL_LABEL = { off: '쉼', short: '짧게', long: '길게' };
  const DEFAULT_WEEK = ['short', 'short', 'short', 'short', 'short', 'short', 'long'];
  const DEFAULT_SETTINGS = { shortDayHours: 4, longDayHours: 8, restDays: [], restNotes: {}, week: DEFAULT_WEEK, startEarly: true };
  const clampInt = (v, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
  const halfHours = (v, lo, hi) => { const n = Math.round(parseFloat(v) * 2) / 2; return Number.isFinite(n) && n >= lo && n <= hi ? n : null; }; // 0.5 steps

  /* ---------- small validators ---------- */
  const isYMD = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const isHM = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const isId = v => typeof v === 'number' && Number.isFinite(v);
  const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
  const str = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');
  const toSize = (v, fallback) => { const n = parseInt(v, 10); return SIZES.includes(n) ? n : fallback; };

  /* ---------- dates: local time only ----------
     toISOString() is UTC → returns yesterday in Korea before 09:00. Never use it for dates. */
  const pad = n => String(n).padStart(2, '0');
  const date = {
    toYMD: d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    parse: ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d); },
    today: () => date.toYMD(new Date()),
    addDays: (ymd, n) => { const d = date.parse(ymd); d.setDate(d.getDate() + n); return date.toYMD(d); },
    diff: (a, b) => Math.round((date.parse(a) - date.parse(b)) / 86400000),   // a − b in days
    dow: ymd => date.parse(ymd).getDay(),                                     // 0 Sun … 6 Sat
    isWeekend: ymd => [0, 6].includes(date.parse(ymd).getDay()),
    isYMD, isHM
  };

  /* ---------- ids: Date.now(), never repeated even within the same ms ---------- */
  let lastId = 0;
  function newId() {
    let id = Date.now();
    if (id <= lastId) id = lastId + 1;
    lastId = id;
    return id;
  }

  /* ---------- raw read / write (never throw) ---------- */
  function readRaw(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function writeRaw(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }                                   // quota full / storage blocked
  }
  const readList = (key, normalize) => {
    const v = readRaw(key, []);
    return Array.isArray(v) ? v.map(normalize).filter(Boolean) : [];
  };

  /* ---------- normalizers: old or hand-edited data never crashes a page ---------- */
  function normalizeTask(t) {
    if (!t || !isId(t.id) || typeof t.title !== 'string' || !isYMD(t.date)) return null;
    const type = oneOf(t.type, TYPES, 'general');
    return {
      id: t.id,
      title: str(t.title),
      subject: str(t.subject) || '기타',
      date: t.date,                                              // due date
      priority: oneOf(t.priority, PRIORITIES, 'mid'),
      type,
      size: toSize(t.size, TYPE_DEFAULT_SIZE[type]),             // 1–5
      completed: t.completed === true,
      createdAt: isYMD(t.createdAt) ? t.createdAt : (t.date < date.today() ? t.date : date.today()),
      sessions: normalizeSessions(t),                            // [{ date, hours }] one entry per finished session
      plan: normalizePlanOverride(t.plan),                       // per-task override of the size pattern, or null
      sourceEventId: isId(t.sourceEventId) ? t.sourceEventId : null, // linked Calendar deadline
      sourceRev: typeof t.sourceRev === 'string' ? t.sourceRev : null,
      archived: t.archived === true,                             // deleted in Todo, deadline still exists
      orphaned: t.orphaned === true                              // deadline deleted after work started
    };
  }

  // finished sessions; v3 data had sessionDates (1 hour each)
  function normalizeSessions(t) {
    if (Array.isArray(t.sessions)) {
      return t.sessions.filter(x => x && isYMD(x.date)).map(x => ({ date: x.date, hours: halfHours(x.hours, 0.5, 16) || 1 }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return Array.isArray(t.sessionDates) ? t.sessionDates.filter(isYMD).sort().map(d => ({ date: d, hours: 1 })) : [];
  }

  // per-task tuning, any field null = size default
  // window: start n days before due · short: number of sessions (non-exam) · long: 종일 days · hours: session length (exam: max hours per day)
  // early: exam only — days of light review before the main study days
  function normalizePlanOverride(p) {
    if (!p || typeof p !== 'object') return null;
    const o = { window: clampInt(p.window, 0, 30), short: clampInt(p.short, 0, 20), long: clampInt(p.long, 0, 4), hours: halfHours(p.hours, 0.5, 12), early: clampInt(p.early, 0, 30) };
    return Object.values(o).every(v => v === null) ? null : o;
  }

  function normalizeEvent(e) {
    if (!e || !isId(e.id) || typeof e.title !== 'string' || !isYMD(e.date)) return null;
    const base = { id: e.id, title: str(e.title), date: e.date };
    if (e.kind === 'deadline') {
      const type = oneOf(e.type, TYPES, 'assignment');
      return {
        ...base, kind: 'deadline', type,
        subject: str(e.subject) || '기타',
        size: toSize(e.size, TYPE_DEFAULT_SIZE[type]),
        priority: oneOf(e.priority, PRIORITIES, 'high'),
        showDday: e.showDday === true
      };
    }
    // schedule (also every v1 event). Times are optional and display-only.
    return { ...base, kind: 'schedule', start: isHM(e.start) ? e.start : null, end: isHM(e.end) ? e.end : null };
  }

  function normalizeDday(d) {
    if (!d || !isId(d.id) || typeof d.title !== 'string' || !isYMD(d.targetDate)) return null;
    return { id: d.id, title: str(d.title), targetDate: d.targetDate };
  }

  function normalizeLog(l) {
    if (!l || !isId(l.id) || !isYMD(l.date)) return null;
    return {
      id: l.id, subject: str(l.subject) || '기타', date: l.date,
      minutes: Math.max(0, parseInt(l.minutes, 10) || 0),
      mode: str(l.mode, 20) || 'focus', taskId: isId(l.taskId) ? l.taskId : null
    };
  }

  function normalizeRestNotes(notes, days) {
    const keep = new Set(Array.isArray(days) ? days.filter(isYMD) : []);
    if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return {};
    return Object.fromEntries(Object.entries(notes).filter(([d, n]) => keep.has(d) && typeof n === 'string' && n.trim()).map(([d, n]) => [d, n.trim().slice(0, 20)]));
  }

  function normalizeSettings(s) {
    s = s && typeof s === 'object' && !Array.isArray(s) ? s : {};
    return {
      shortDayHours: halfHours(s.shortDayHours, 1, 12) ?? DEFAULT_SETTINGS.shortDayHours,   // max study hours on a 짧게 day
      longDayHours: halfHours(s.longDayHours, 4, 14) ?? DEFAULT_SETTINGS.longDayHours,      // what one 종일 means
      restDays: Array.isArray(s.restDays) ? [...new Set(s.restDays.filter(isYMD))].sort() : [],                // 쉬는 날: specific dates with nothing planned
      restNotes: normalizeRestNotes(s.restNotes, s.restDays),                                                 // optional note per break day, e.g. "가족 여행"
      startEarly: s.startEarly !== false,                                                  // light 미리 review before exams when there is time
      week: Array.isArray(s.week) && s.week.length === 7 ? s.week.map((v, i) => oneOf(v, AVAIL, DEFAULT_WEEK[i])) : [...DEFAULT_WEEK]
    };
  }

  /* =========================================================
     tasks — owner: Todo · Planner
     ========================================================= */
  const getTasks = () => readList(KEYS.tasks, normalizeTask);       // includes archived: use activeTasks() for display
  const saveTasks = tasks => writeRaw(KEYS.tasks, tasks);
  const activeTasks = (tasks = getTasks()) => tasks.filter(t => !t.archived);

  function updateTask(taskId, fn) {
    const tasks = getTasks();
    const t = tasks.find(x => x.id === taskId);
    if (!t) return null;
    fn(t);
    saveTasks(tasks);
    return t;
  }

  // Tick / untick a task's session for a date (Todo and Main use this).
  // done=true adds `hours` studied that day; done=false clears that day for the task.
  function toggleSession(taskId, ymd, done, hours = 1) {
    return updateTask(taskId, t => {
      t.sessions = t.sessions.filter(x => x.date !== ymd || done);
      if (done) t.sessions.push({ date: ymd, hours: halfHours(hours, 0.5, 16) || 1 });
      t.sessions.sort((a, b) => a.date.localeCompare(b.date));
    });
  }
  const hoursOn = (task, ymd) => task.sessions.filter(x => x.date === ymd).reduce((s, x) => s + x.hours, 0);
  const hoursBefore = (task, ymd) => task.sessions.filter(x => x.date < ymd).reduce((s, x) => s + x.hours, 0);
  const totalHours = task => task.sessions.reduce((s, x) => s + x.hours, 0);

  // Finish (or reopen) a whole task. Remaining planned sessions disappear.
  const setCompleted = (taskId, completed) => updateTask(taskId, t => { t.completed = !!completed; });

  /* =========================================================
     events — owner: Calendar
     ========================================================= */
  const getEvents = () => readList(KEYS.events, normalizeEvent);
  const saveEvents = events => writeRaw(KEYS.events, events);
  const eventsOn = (ymd, events = getEvents()) => events.filter(e => e.date === ymd);
  const hasScheduleOn = (ymd, events = getEvents()) => events.some(e => e.kind === 'schedule' && e.date === ymd);

  /* =========================================================
     ddays — owner: Calendar
     ========================================================= */
  const getDdays = () => readList(KEYS.ddays, normalizeDday);
  const saveDdays = ddays => writeRaw(KEYS.ddays, ddays);

  // D-Day list for Main / Dashboard: plain D-Days + deadlines marked showDday, nearest first
  function allDdays() {
    const fromDeadlines = getEvents()
      .filter(e => e.kind === 'deadline' && e.showDday)
      .map(e => ({ id: e.id, title: e.title, targetDate: e.date, source: 'deadline' }));
    return [...getDdays().map(d => ({ ...d, source: 'dday' })), ...fromDeadlines]
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate));
  }

  /* =========================================================
     studyLogs — owner: Timer (statistics only; the planner does not read minutes)
     ========================================================= */
  const getStudyLogs = () => readList(KEYS.studyLogs, normalizeLog);
  function addStudyLog(log) {
    const entry = normalizeLog({ mode: 'focus', date: date.today(), ...log, id: newId() });
    if (!entry) return null;
    const logs = getStudyLogs();
    logs.push(entry);
    writeRaw(KEYS.studyLogs, logs);
    return entry;
  }

  /* =========================================================
     settings — owner: Todo · Planner
     ========================================================= */
  const getSettings = () => normalizeSettings(readRaw(KEYS.settings, {}));
  const saveSettings = s => writeRaw(KEYS.settings, normalizeSettings(s));

  /* =========================================================
     Calendar deadlines → linked tasks
     Runs on every page load and when another tab changes events.
     Only writes when something actually changed (no storage-event ping-pong between tabs).
     ========================================================= */
  const deadlineFields = e => ({ title: e.title, subject: e.subject, date: e.date, type: e.type, size: e.size, priority: e.priority });

  function syncDeadlines() {
    const deadlines = getEvents().filter(e => e.kind === 'deadline');
    const ids = new Set(deadlines.map(e => e.id));
    let tasks = getTasks();
    const result = { created: 0, updated: 0, removed: 0, orphaned: 0 };

    deadlines.forEach(e => {
      const fields = deadlineFields(e);
      const rev = JSON.stringify(fields);
      const t = tasks.find(x => x.sourceEventId === e.id);
      if (!t) {
        tasks.push({ id: newId(), ...fields, completed: false, createdAt: date.today(), sessions: [], plan: null,
          sourceEventId: e.id, sourceRev: rev, archived: false, orphaned: false });
        result.created++;
      } else if (t.sourceRev !== rev) {
        // Calendar changed the deadline → its fields win; progress is kept.
        // If Calendar didn't change, Todo's own edits to size/priority stay.
        Object.assign(t, fields, { sourceRev: rev });
        result.updated++;
      }
    });

    tasks = tasks.filter(t => {
      if (t.sourceEventId === null || ids.has(t.sourceEventId)) return true;
      // deadline was deleted in Calendar
      if (t.archived || (t.sessions.length === 0 && !t.completed)) { result.removed++; return false; }
      t.sourceEventId = null;
      t.sourceRev = null;
      t.orphaned = true;
      result.orphaned++;
      return true;
    });

    if (result.created || result.updated || result.removed || result.orphaned) saveTasks(tasks);
    return result;
  }

  /* =========================================================
     Backup: export / import every key as one JSON file
     ========================================================= */
  function exportAll() {
    return {
      app: 'study-dashboard', version: 4, exportedAt: new Date().toISOString(),
      data: { tasks: getTasks(), events: getEvents(), ddays: getDdays(), studyLogs: getStudyLogs(), settings: getSettings() }
    };
  }
  function importAll(obj) {
    if (!obj || obj.app !== 'study-dashboard' || !obj.data || typeof obj.data !== 'object') {
      return { ok: false, error: 'Study Dashboard 백업 파일이 아닙니다.' };
    }
    const d = obj.data;
    const list = (v, fn) => (Array.isArray(v) ? v.map(fn).filter(Boolean) : []);
    const next = {
      tasks: list(d.tasks, normalizeTask), events: list(d.events, normalizeEvent),
      ddays: list(d.ddays, normalizeDday), studyLogs: list(d.studyLogs, normalizeLog),
      settings: normalizeSettings(d.settings)
    };
    const ok = Object.entries(next).every(([k, v]) => writeRaw(KEYS[k], v));
    if (!ok) return { ok: false, error: '저장 공간에 쓸 수 없습니다.' };
    syncDeadlines();
    return { ok: true, counts: Object.fromEntries(Object.entries(next).map(([k, v]) => [k, Array.isArray(v) ? v.length : 1])) };
  }

  /* =========================================================
     Change notifications from other tabs
     SD.onChange([SD.KEYS.tasks], () => render())
     ========================================================= */
  function onChange(keys, callback) {
    window.addEventListener('storage', e => {
      if (e.key === null || keys.includes(e.key)) callback(e.key);
    });
  }

  /* ---------- auto-sync on load and when Calendar changes in another tab ---------- */
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    syncDeadlines();
    window.addEventListener('storage', e => {
      if (e.key === KEYS.events || e.key === null) syncDeadlines();
    });
  }

  return {
    // constants
    KEYS, SUBJECTS, PRIORITIES, PRIORITY_LABEL, TYPES, TYPE_LABEL, TYPE_DEFAULT_SIZE, SIZES, SIZE_LABEL, AVAIL, AVAIL_LABEL, DEFAULT_WEEK,
    // utils
    date, newId, onChange,
    // tasks
    getTasks, saveTasks, activeTasks, toggleSession, hoursOn, hoursBefore, totalHours, setCompleted,
    // events / ddays
    getEvents, saveEvents, eventsOn, hasScheduleOn, getDdays, saveDdays, allDdays,
    // study logs
    getStudyLogs, addStudyLog,
    // settings
    getSettings, saveSettings,
    // calendar → tasks
    syncDeadlines,
    // backup
    exportAll, importAll
  };
})();
