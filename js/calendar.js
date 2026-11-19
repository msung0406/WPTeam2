(function () {
  'use strict';
  const store = window.PlannerStore;
  const today = store.fromDateKey(store.todayKey());
  let shownYear = today.getFullYear();
  let shownMonth = today.getMonth();
  let selectedDate = store.todayKey();

  const $ = id => document.getElementById(id);
  const grid = $('calendar-grid');
  const form = $('event-form');
  const titleInput = $('event-title');
  const dateInput = $('event-date');

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function changeMonth(amount) {
    const newMonth = new Date(shownYear, shownMonth + amount, 1);
    shownYear = newMonth.getFullYear();
    shownMonth = newMonth.getMonth();
    render();
  }

  function selectDate(key) {
    selectedDate = key;
    const chosen = store.fromDateKey(key);
    shownYear = chosen.getFullYear();
    shownMonth = chosen.getMonth();
    dateInput.value = selectedDate;
    render();
  }

  function renderCalendar(events, ddays) {
    const firstDay = new Date(shownYear, shownMonth, 1);
    // Monday-first calendar; Sunday is index 6.
    const offset = (firstDay.getDay() + 6) % 7;
    const todayKey = store.todayKey();
    grid.replaceChildren();
    $('month-title').textContent = `${shownYear}년 ${shownMonth + 1}월`;

    const perDate = new Map();
    for (const item of events) {
      if (!perDate.has(item.date)) perDate.set(item.date, []);
      perDate.get(item.date).push({ ...item, kind: 'event' });
    }
    for (const item of ddays) {
      if (!perDate.has(item.date)) perDate.set(item.date, []);
      perDate.get(item.date).push({ ...item, kind: 'dday' });
    }

    for (let i = 0; i < 42; i++) {
      const date = new Date(shownYear, shownMonth, i - offset + 1);
      const key = store.dateKey(date);
      const inMonth = date.getMonth() === shownMonth;
      const selected = key === selectedDate;
      const isToday = key === todayKey;
      const items = perDate.get(key) || [];
      const button = makeElement('button', 'calendar-day');
      button.type = 'button';
      if (!inMonth) button.classList.add('calendar-day--muted');
      if (selected) button.classList.add('calendar-day--selected');
      if (isToday) button.classList.add('calendar-day--today');
      button.setAttribute('aria-pressed', String(selected));
      button.setAttribute('aria-label', `${store.displayDate(key)}${items.length ? `, 일정 ${items.length}개` : ''}`);
      button.addEventListener('click', () => selectDate(key));

      const number = makeElement('span', 'calendar-day__number', String(date.getDate()));
      button.append(number);
      const itemsBox = makeElement('span', 'calendar-day__items');
      for (const item of items.slice(0, 2)) {
        itemsBox.append(makeElement('span',
          item.kind === 'event' ? 'calendar-chip calendar-chip--event' : 'calendar-chip calendar-chip--dday',
          item.title));
      }
      if (items.length > 2) {
        itemsBox.append(makeElement('span', 'calendar-chip calendar-chip--more', `+${items.length - 2}개`));
      }
      button.append(itemsBox);
      grid.append(button);
    }

    const monthPrefix = `${shownYear}-${String(shownMonth + 1).padStart(2, '0')}-`;
    const monthEventCount = events.filter(item => item.date.startsWith(monthPrefix)).length;
    const monthDdayCount = ddays.filter(item => item.date.startsWith(monthPrefix)).length;
    $('month-summary').textContent = `이번 달 일정 ${monthEventCount}개 · D-Day ${monthDdayCount}개`;
  }

  function renderSelectedDay(events, ddays) {
    $('selected-date-title').textContent = store.displayDate(selectedDate, { month: 'long', day: 'numeric', weekday: 'long' });
    const schedule = $('selected-schedule');
    schedule.replaceChildren();
    const selectedEvents = events.filter(item => item.date === selectedDate);
    const selectedDdays = ddays.filter(item => item.date === selectedDate);
    $('selected-date-count').textContent = `총 ${selectedEvents.length + selectedDdays.length}개`;

    if (!selectedEvents.length && !selectedDdays.length) {
      const blank = makeElement('div', 'empty-state');
      blank.append(makeElement('span', 'empty-state__icon', '✦'));
      blank.append(makeElement('p', '', '이 날짜에 등록된 일정이 없어요.'));
      blank.append(makeElement('small', '', '아래에서 새 일정을 등록해 보세요.'));
      schedule.append(blank);
      return;
    }

    selectedEvents.forEach(item => {
      const li = makeElement('li', 'schedule-item');
      const copy = makeElement('div', 'schedule-item__copy');
      copy.append(makeElement('span', 'schedule-item__dot schedule-item__dot--event'));
      copy.append(makeElement('span', 'schedule-item__title', item.title));
      const del = makeElement('button', 'icon-button icon-button--danger', '×');
      del.type = 'button';
      del.title = `${item.title} 삭제`;
      del.setAttribute('aria-label', `${item.title} 일정 삭제`);
      del.addEventListener('click', () => {
        if (store.removeEvent(item.id)) render();
      });
      li.append(copy, del);
      schedule.append(li);
    });

    selectedDdays.forEach(item => {
      const li = makeElement('li', 'schedule-item');
      const copy = makeElement('div', 'schedule-item__copy');
      copy.append(makeElement('span', 'schedule-item__dot schedule-item__dot--dday'));
      copy.append(makeElement('span', 'schedule-item__title', item.title));
      const countdown = makeElement('span', 'mini-countdown', store.ddayText(item.date));
      li.append(copy, countdown);
      schedule.append(li);
    });
  }

  function render() {
    const events = store.getEvents();
    const ddays = store.getDdays();
    renderCalendar(events, ddays);
    renderSelectedDay(events, ddays);
  }

  $('previous-month').addEventListener('click', () => changeMonth(-1));
  $('next-month').addEventListener('click', () => changeMonth(1));
  $('today-button').addEventListener('click', () => selectDate(store.todayKey()));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const date = dateInput.value;
    if (!title || !store.isValidDateKey(date)) return;
    if (store.addEvent(title, date)) {
      titleInput.value = '';
      selectDate(date);
      titleInput.focus();
      $('form-status').textContent = '일정이 추가됐어요.';
    }
  });
  window.addEventListener('storage', render);
  window.addEventListener('focus', render);
  dateInput.value = selectedDate;
  render();
})();
