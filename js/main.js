/* =========================================================
   Dashboard (index.html) — today: to-do list, study time, this week, Timer heatmap
   Today's list = the same list as today on Calendar · Todo (js/views.js).
   Heatmap = Timer logs from Jan 1 (js/heatmap.js), all classes or one class.
   Writes: tasks only through SD.newTodo / Views (setCompleted, toggleSession);
           subjects (과목 관리: SD.addSubject / SD.removeSubject).
   Maintainer: 김지환
   ========================================================= */
(() => {
  "use strict";

  const D = SD.date;
  const $ = (sel) => document.querySelector(sel);
  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const toast = new bootstrap.Toast("#toast", { delay: 2000 });
  const notify = (msg) => {
    if (!msg) return;
    $("#toastMsg").textContent = msg;
    toast.show();
  };

  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return "늦은 밤까지 수고하세요!";
    if (h < 12) return "좋은 아침이에요!";
    if (h < 18) return "안녕하세요!";
    return "오늘 하루도 수고했어요!";
  }

  let ctx;

  function renderHeader(rows) {
    $("#greeting").textContent = greeting();
    const p = Views.dayProgress(rows);
    const left = p.total - p.done;
    $("#greetingSub").textContent =
      p.total === 0
        ? "오늘은 계획된 일이 없어요."
        : left === 0
          ? "오늘 할 일을 모두 끝냈어요."
          : `오늘 남은 할 일이 ${left}개 있어요.`;
    $("#listCount").textContent = p.total ? `${p.done} / ${p.total} 완료` : "";
  }

  function renderStudy() {
    const minutes = Stats.minutesOn(ctx.today);
    $("#studyTotal").textContent = Stats.formatMinutes(minutes);
    const items = ctx.plan.days[ctx.today] || [];
    const planned = items.reduce((s, i) => s + Views.plannedHours(i, ctx), 0);
    const done = items.reduce(
      (s, i) => s + Math.min(i.done, Views.plannedHours(i, ctx)),
      0,
    );
    const pct = planned ? Math.round((done / planned) * 100) : 0;
    $("#studyNote").textContent = minutes
      ? "Timer 기록 기준"
      : "Timer로 공부하면 여기에 쌓여요";
    $("#planLabel").textContent = planned
      ? `${Views.fmtH(done)} / ${Views.fmtH(planned)}`
      : "계획 없음";
    $("#planBar").style.width = `${pct}%`;
    $("#planBarWrap").setAttribute("aria-valuenow", pct);
  }

  function renderDdays() {
    const list = $("#ddayList");
    const ddays = Stats.upcomingDdays().slice(0, 4);
    $("#ddayEmpty").classList.toggle("d-none", ddays.length > 0);
    list.replaceChildren(
      ...ddays.map((d) => {
        const li = make("li", "sd-dday-item");
        const name = make("div", "sd-dday-name");
        name.append(
          make("div", "text-truncate", d.title),
          make("div", "sd-dday-date", Stats.formatDate(d.targetDate)),
        );
        const badge = make(
          "span",
          "sd-dday-badge",
          Stats.ddayText(d.targetDate),
        );
        badge.classList.toggle("is-today", d.targetDate === ctx.today);
        li.append(name, badge);
        return li;
      }),
    );
  }

  /* ---------- Timer heatmap + 과목 관리 ---------- */
  let heatSubject = "";
  try {
    heatSubject = localStorage.getItem("heatSubject") || "";
  } catch (e) {}

  function renderHeat() {
    const subjects = SD.getSubjects();
    if (heatSubject && !subjects.includes(heatSubject)) heatSubject = "";
    const sel = $("#heatSubject");
    sel.replaceChildren(
      new Option("전체", ""),
      ...subjects.map((s) => new Option(s, s)),
    );
    sel.value = heatSubject;
    const r = Heatmap.render($("#heatGrid"), { subject: heatSubject });
    $("#heatYear").textContent = `Timer · ${r.year}년 1월 1일부터`;
    const sum = $("#heatSummary");
    sum.replaceChildren();
    if (!r.days) {
      sum.textContent = heatSubject
        ? `${heatSubject}: 올해 Timer 기록이 아직 없어요.`
        : "올해 Timer 기록이 아직 없어요. Timer로 공부하면 하루 한 칸씩 채워져요.";
      return;
    }
    const b = (t) => make("b", "", t);
    sum.append(
      `${heatSubject || "전체"} · 올해 `,
      b(Stats.formatMinutes(r.total)),
      " · ",
      b(`${r.days}일`),
      " 공부 · 연속 ",
      b(`${r.current}일`),
      r.best ? ` (최고 ${r.best}일)` : "",
    );
  }

  function renderSubjects() {
    $("#subjectList").replaceChildren(
      ...SD.getSubjects().map((name) => {
        const li = make("li", "sd-subject-chip");
        const del = make("button", "", "×");
        del.type = "button";
        del.setAttribute("aria-label", `${name} 과목 삭제`);
        del.addEventListener("click", () => {
          if (!del.classList.contains("is-confirm")) {
            del.classList.add("is-confirm");
            del.textContent = "삭제?";
            return;
          }
          SD.removeSubject(name);
          render("과목을 지웠어요. 기록은 그대로 있어요.");
        });
        li.append(name, del);
        return li;
      }),
    );
  }

  $("#heatSubject").addEventListener("change", (e) => {
    heatSubject = e.target.value;
    try {
      localStorage.setItem("heatSubject", heatSubject);
    } catch (err) {}
    renderHeat();
  });
  $("#subjectToggle").addEventListener("click", (e) => {
    const box = $("#subjectBox");
    const open = box.classList.toggle("d-none") === false;
    e.currentTarget.setAttribute("aria-expanded", String(open));
    if (open) $("#subjectName").focus();
  });
  $("#subjectForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#subjectName");
    if (!input.value.trim()) return input.focus();
    const name = SD.addSubject(input.value);
    if (!name) return notify("과목은 30개까지 추가할 수 있어요.");
    input.value = "";
    render(`${name} 과목을 추가했어요.`);
    input.focus();
  });

  function render(msg) {
    notify(msg);
    ctx = Views.load();
    const rows = Views.renderDayList($("#todayList"), ctx.today, ctx);
    $("#todayEmpty").classList.toggle("d-none", rows.length > 0);
    renderHeader(rows);
    renderStudy();
    renderDdays();
    const wk = Views.renderWeekStrip($("#weekStrip"), ctx);
    $("#weekRange").textContent = `${Views.md(wk.start)} – ${Views.md(wk.end)}`;
    renderHeat();
    renderSubjects();
  }

  Views.bindDayList($("#todayList"), () => ctx, render);

  // quick add: plain to-do for today (details → Calendar · Todo)
  $("#quickForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#quickTitle");
    const title = input.value.trim();
    if (!title) return input.focus();
    const tasks = SD.getTasks();
    tasks.push(SD.newTodo({ title, due: D.today() }));
    if (!SD.saveTasks(tasks)) return notify("저장하지 못했어요.");
    input.value = "";
    render("오늘 할 일에 추가했어요.");
  });

  SD.onChange(
    [
      SD.KEYS.tasks,
      SD.KEYS.events,
      SD.KEYS.ddays,
      SD.KEYS.studyLogs,
      SD.KEYS.settings,
      SD.KEYS.subjects,
    ],
    () => render(),
  );
  window.addEventListener("focus", () => render());
  render();
})();
