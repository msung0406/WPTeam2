(function () {
  'use strict';
  const store = window.PlannerStore;
  const $ = id => document.getElementById(id);
  const form = $('dday-form');
  const nameInput = $('dday-title');
  const dateInput = $('dday-date');

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function buildCard(item) {
    const days = store.daysUntil(item.date);
    const card = makeElement('article', 'dday-card');
    if (days === 0) card.classList.add('dday-card--today');
    if (days < 0) card.classList.add('dday-card--past');
    const top = makeElement('div', 'dday-card__top');
    top.append(makeElement('span', 'tag', days >= 0 ? '다가오는 일정' : '지난 일정'));
    const del = makeElement('button', 'icon-button icon-button--danger', '×');
    del.type = 'button';
    del.title = `${item.title} 삭제`;
    del.setAttribute('aria-label', `${item.title} D-Day 삭제`);
    del.addEventListener('click', () => {
      if (store.removeDday(item.id)) render();
    });
    top.append(del);
    card.append(top);
    card.append(makeElement('h3', 'dday-card__title', item.title));
    card.append(makeElement('p', 'dday-card__date', store.displayDate(item.date)));
    card.append(makeElement('strong', 'dday-card__count', store.ddayText(item.date)));
    return card;
  }

  function renderGroup(element, items, emptyMessage) {
    element.replaceChildren();
    if (items.length === 0) {
      const empty = makeElement('div', 'empty-state empty-state--compact');
      empty.append(makeElement('span', 'empty-state__icon', '✦'));
      empty.append(makeElement('p', '', emptyMessage));
      element.append(empty);
      return;
    }
    items.forEach(item => element.append(buildCard(item)));
  }

  function render() {
    const all = store.getDdays();
    const upcoming = all.filter(item => store.daysUntil(item.date) >= 0)
      .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    const past = all.filter(item => store.daysUntil(item.date) < 0)
      .sort((a, b) => b.date.localeCompare(a.date));

    $('upcoming-count').textContent = `${upcoming.length}개`;
    $('past-count').textContent = `${past.length}개`;
    $('total-count').textContent = `${all.length}개`;
    $('nearest-count').textContent = upcoming.length ? store.ddayText(upcoming[0].date) : '—';
    $('nearest-title').textContent = upcoming.length ? upcoming[0].title : '등록된 예정 일정이 없어요';
    $('today-date').textContent = `오늘 ${store.displayDate(store.todayKey())}`;
    renderGroup($('upcoming-list'), upcoming, '아직 예정된 D-Day가 없어요. 위에서 하나 추가해 보세요.');
    renderGroup($('past-list'), past, '지난 D-Day가 없어요.');
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = nameInput.value.trim();
    const date = dateInput.value;
    if (!title || !store.isValidDateKey(date)) return;
    if (store.addDday(title, date)) {
      form.reset();
      $('form-status').textContent = 'D-Day가 등록됐어요.';
      nameInput.focus();
      render();
    }
  });

  // Keep the countdown current when the date changes while the page is open.
  window.setInterval(render, 60000);
  window.addEventListener('focus', render);
  window.addEventListener('storage', render);
  render();
})();
