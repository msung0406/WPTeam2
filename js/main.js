/* =========================================================
   Main — today: to-do list, study time, this week
   Today's list = the same list as today on Calendar · Todo (js/views.js).
   Writes: tasks only through SD.newTodo / Views (setCompleted, toggleSession).
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
    $("#todayLabel").textContent = Stats.formatDate(ctx.today, {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
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
    ],
    () => render(),
  );
  window.addEventListener("focus", () => render());
  render();
})();
