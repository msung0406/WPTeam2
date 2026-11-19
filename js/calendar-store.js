/* Shared data and date helpers for Calendar + D-Day.
 * Both pages load this file before their own script.
 */
(function () {
  'use strict';

  const EVENT_KEY = 'study-planner-events-v1';
  const DDAY_KEY = 'study-planner-ddays-v1';

  function pad(number) {
    return String(number).padStart(2, '0');
  }

  // Use local year/month/day, not toISOString() (which can shift dates in Korea).
  function dateKey(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function isValidDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const test = new Date(year, month - 1, day);
    return test.getFullYear() === year && test.getMonth() === month - 1 && test.getDate() === day;
  }

  function fromDateKey(value) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function todayKey() {
    return dateKey(new Date());
  }

  // Compare calendar dates in UTC to avoid daylight-saving-time hour differences.
  function dayNumber(value) {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / 86400000;
  }

  function daysUntil(value) {
    return dayNumber(value) - dayNumber(todayKey());
  }

  function ddayText(value) {
    const days = daysUntil(value);
    if (days === 0) return 'D-Day';
    return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
  }

  function displayDate(value, options) {
    return new Intl.DateTimeFormat('ko-KR', options || {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    }).format(fromDateKey(value));
  }

  function getItems(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(item => item && typeof item.id === 'string' &&
        typeof item.title === 'string' && isValidDateKey(item.date));
    } catch (error) {
      console.warn('저장된 데이터를 읽을 수 없습니다.', error);
      return [];
    }
  }

  function setItems(key, items) {
    try {
      localStorage.setItem(key, JSON.stringify(items));
      return true;
    } catch (error) {
      console.error('저장할 수 없습니다.', error);
      alert('브라우저에 저장할 수 없습니다. 브라우저의 저장 공간 설정을 확인해 주세요.');
      return false;
    }
  }

  function id() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function add(key, title, date) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle || cleanTitle.length > 80 || !isValidDateKey(date)) return false;
    return setItems(key, [...getItems(key), { id: id(), title: cleanTitle, date: date }]);
  }

  function remove(key, itemId) {
    return setItems(key, getItems(key).filter(item => item.id !== itemId));
  }

  window.PlannerStore = Object.freeze({
    dateKey, fromDateKey, todayKey, daysUntil, ddayText, displayDate, isValidDateKey,
    getEvents: () => getItems(EVENT_KEY),
    addEvent: (title, date) => add(EVENT_KEY, title, date),
    removeEvent: (itemId) => remove(EVENT_KEY, itemId),
    getDdays: () => getItems(DDAY_KEY),
    addDday: (title, date) => add(DDAY_KEY, title, date),
    removeDday: (itemId) => remove(DDAY_KEY, itemId)
  });
})();
