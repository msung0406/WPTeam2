/* =========================================================
   Main — today's study status
   Maintainer: 김지환
   ========================================================= */
(() => {
  "use strict";

  const D = SD.date;
  const $ = (sel, root = document) => root.querySelector(sel);

  function greeting() {
    const h = new Date().getHours();
    if (h < 6) return "늦은 밤까지 수고하세요!";
    if (h < 12) return "좋은 아침이에요!";
    if (h < 18) return "안녕하세요!";
    return "오늘 하루도 수고했어요!";
  }

  function setBar(id, pct) {
    $(`#${id}Bar`).style.width = `${pct}%`;
    $(`#${id}BarWrap`).setAttribute("aria-valuenow", pct);
  }

  function renderHeader(plan) {
    const today = D.today();
    $("#todayLabel").textContent = Stats.formatDate(today, {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    $("#greeting").textContent = greeting();
    const left = plan.items.filter((i) => !i.checked).length;
    $("#greetingSub").textContent =
      plan.items.length === 0
        ? "오늘 계획된 할 일이 없습니다."
        : left === 0
          ? "오늘 계획을 모두 끝냈어요."
          : `오늘 남은 할 일이 ${left}개 있어요.`;
  }

  function renderStats(plan) {
    const checked = plan.items.filter((i) => i.checked).length;
    const total = plan.items.length;
    const value = $("#statPlan");
    value.textContent = `${checked}`;
    const small = document.createElement("small");
    small.textContent = `/ ${total}`;
    value.append(small);
    setBar("statPlan", plan.pct);

    $("#statStudy").textContent = Stats.formatMinutes(
      Stats.minutesOn(D.today()),
    );

    const rate = Stats.taskCompletion();
    $("#statRate").textContent = `${rate.pct}%`;
    setBar("statRate", rate.pct);

    const next = Stats.upcomingDdays()[0];
    $("#statDday").textContent = next ? Stats.ddayText(next.targetDate) : "–";
    $("#statDdayTitle").textContent = next ? next.title : "등록된 D-Day 없음";
  }

  function renderToday(plan) {
    const list = $("#todayPlan");
    const tpl = $("#tplPlan");
    const subjectOf = Object.fromEntries(
      SD.getTasks().map((t) => [t.id, t.subject]),
    );
    list.replaceChildren();
    $("#todayEmpty").classList.toggle("d-none", plan.items.length > 0);
    $("#todayCount").textContent = plan.items.length
      ? `${Stats.formatHours(plan.done)} / ${Stats.formatHours(plan.planned)}`
      : "";

    plan.items.forEach((it, idx) => {
      const node = tpl.content.firstElementChild.cloneNode(true);
      node.dataset.id = it.taskId;
      node.dataset.block = it.block;
      node.classList.toggle("is-done", it.checked);

      const cb = $(".form-check-input", node);
      cb.id = `plan-${idx}`;
      cb.checked = it.checked;
      const title = $(".sd-plan-title", node);
      title.htmlFor = cb.id;
      title.textContent = it.title;

      $(".sd-subj", node).textContent = subjectOf[it.taskId] || "기타";
      const block = $(".sd-block", node);
      block.textContent = it.label;
      block.classList.add(`sd-block-${it.block}`);
      const reason = Planner.REASON_LABEL[it.reason];
      if (reason) {
        const r = $(".sd-reason", node);
        r.textContent = reason;
        r.classList.remove("d-none");
        r.classList.add(`sd-reason-${it.reason}`);
      }
      list.append(node);
    });
  }

  function renderDdays() {
    const list = $("#ddayList");
    const ddays = Stats.upcomingDdays().slice(0, 4);
    list.replaceChildren();
    $("#ddayEmpty").classList.toggle("d-none", ddays.length > 0);
    ddays.forEach((d) => {
      const li = document.createElement("li");
      li.className = "sd-dday-item";
      const name = document.createElement("div");
      name.className = "sd-dday-name";
      const title = document.createElement("div");
      title.className = "text-truncate";
      title.textContent = d.title;
      const when = document.createElement("div");
      when.className = "sd-dday-date";
      when.textContent = Stats.formatDate(d.targetDate);
      name.append(title, when);
      const badge = document.createElement("span");
      badge.className = "sd-dday-badge";
      badge.classList.toggle("is-today", d.targetDate === D.today());
      badge.textContent = Stats.ddayText(d.targetDate);
      li.append(name, badge);
      list.append(li);
    });
  }

  let plan;
  function render() {
    plan = Stats.todayPlan();
    renderHeader(plan);
    renderStats(plan);
    renderToday(plan);
    renderDdays();
  }

  // tick a session: same rule as the Todo page (remaining planned hours are added)
  $("#todayPlan").addEventListener("change", (e) => {
    const box = e.target;
    const host = box.closest("[data-id]");
    if (!host) return;
    const id = Number(host.dataset.id);
    const it = plan.items.find(
      (i) => i.taskId === id && i.block === host.dataset.block,
    );
    const planned = it ? plan.plannedOf(it) : 1;
    SD.toggleSession(
      id,
      D.today(),
      box.checked,
      Math.max(0.5, planned - (it ? it.done : 0)),
    );
    render();
  });

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
