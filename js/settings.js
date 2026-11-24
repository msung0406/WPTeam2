/* =========================================================
   Study Dashboard — ⚙ settings panel (every page, load after storage.js + bootstrap)
   Adds a gear button to the top-right corner of the nav and a side panel with:
     테마 · 강조색 · 글자 크기 · 모서리 (js/theme.js, saved per browser)
     데이터: backup export / import, delete all (SD.exportAll / SD.importAll / SD.clearAll)
   Planner settings (my week, hours, 쉬는 날) stay on the Planner page.
   Maintainer: 김주환
   ========================================================= */
(() => {
  'use strict';

  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  /* ---------- gear button: right end of the nav (next to the menu button on phones) ---------- */
  const nav = document.querySelector('.sd-navbar .container-xl');
  if (!nav) return;
  const gear = make('button', 'btn sd-gear order-lg-last ms-auto ms-lg-2 me-2 me-lg-0');
  gear.type = 'button';
  gear.setAttribute('aria-label', '설정');
  gear.title = '설정';
  gear.setAttribute('data-bs-toggle', 'offcanvas');
  gear.setAttribute('data-bs-target', '#sdSettings');
  gear.setAttribute('aria-controls', 'sdSettings');
  gear.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>';
  nav.querySelector('.navbar-brand').after(gear);

  /* ---------- panel (static markup only → innerHTML is safe) ---------- */
  const panel = make('div', 'offcanvas offcanvas-end sd-settings');
  panel.id = 'sdSettings';
  panel.tabIndex = -1;
  panel.setAttribute('aria-labelledby', 'sdSettingsTitle');
  panel.innerHTML = `
    <div class="offcanvas-header">
      <h2 class="offcanvas-title h5 fw-bold" id="sdSettingsTitle">설정</h2>
      <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="닫기"></button>
    </div>
    <div class="offcanvas-body">
      <section class="sd-set-section" aria-labelledby="setThemeTitle">
        <h3 class="sd-set-title" id="setThemeTitle">테마</h3>
        <p class="sd-set-sub">라이트</p>
        <div class="sd-swatches" data-group="light"></div>
        <p class="sd-set-sub mt-3">다크</p>
        <div class="sd-swatches" data-group="dark"></div>
      </section>

      <section class="sd-set-section" aria-labelledby="setAccentTitle">
        <h3 class="sd-set-title" id="setAccentTitle">강조색</h3>
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <input type="color" class="form-control form-control-color" id="setAccent" aria-label="강조색 고르기">
          <div class="sd-accent-presets" role="group" aria-label="추천 강조색"></div>
        </div>
        <button type="button" class="btn btn-link btn-sm p-0 mt-2" id="setAccentReset">테마 기본색으로</button>
      </section>

      <section class="sd-set-section" aria-labelledby="setFontTitle">
        <h3 class="sd-set-title" id="setFontTitle">글자 크기</h3>
        <div class="btn-group w-100" role="group" aria-labelledby="setFontTitle">
          <input type="radio" class="btn-check" name="setFont" id="setFontSmall" value="small"><label class="btn btn-outline-secondary btn-sm sd-size-btn" for="setFontSmall">작게</label>
          <input type="radio" class="btn-check" name="setFont" id="setFontNormal" value="normal"><label class="btn btn-outline-secondary btn-sm sd-size-btn" for="setFontNormal">보통</label>
          <input type="radio" class="btn-check" name="setFont" id="setFontLarge" value="large"><label class="btn btn-outline-secondary btn-sm sd-size-btn" for="setFontLarge">크게</label>
        </div>
      </section>

      <section class="sd-set-section" aria-labelledby="setRadiusTitle">
        <h3 class="sd-set-title" id="setRadiusTitle">모서리</h3>
        <div class="btn-group w-100" role="group" aria-labelledby="setRadiusTitle">
          <input type="radio" class="btn-check" name="setRadius" id="setRadiusSharp" value="sharp"><label class="btn btn-outline-secondary btn-sm sd-size-btn" for="setRadiusSharp">각지게</label>
          <input type="radio" class="btn-check" name="setRadius" id="setRadiusNormal" value="normal"><label class="btn btn-outline-secondary btn-sm sd-size-btn" for="setRadiusNormal">보통</label>
          <input type="radio" class="btn-check" name="setRadius" id="setRadiusRound" value="round"><label class="btn btn-outline-secondary btn-sm sd-size-btn" for="setRadiusRound">둥글게</label>
        </div>
        <button type="button" class="btn btn-link btn-sm p-0 mt-3" id="setLookReset">모양 설정 전부 기본값으로</button>
      </section>

      <section class="sd-set-section" aria-labelledby="setPlanTitle">
        <h3 class="sd-set-title" id="setPlanTitle">플래너</h3>
        <p class="small text-secondary mb-0">내 일주일 · 하루 공부 시간 · 시험 공부 방식 · 쉬는 날은 <a href="planner.html">Planner</a> 페이지에서 바꿔요.</p>
      </section>

      <section class="sd-set-section" aria-labelledby="setDataTitle">
        <h3 class="sd-set-title" id="setDataTitle">데이터</h3>
        <p class="small text-secondary">모든 기록은 이 브라우저에만 저장돼요. 다른 기기로 옮기거나 백업하려면 파일로 내보내세요.</p>
        <div class="d-grid gap-2">
          <button type="button" class="btn btn-outline-secondary btn-sm" id="setExport">백업 파일 내보내기 (.json)</button>
          <label class="btn btn-outline-secondary btn-sm mb-0" for="setImport">백업 파일 가져오기</label>
          <input type="file" class="d-none" id="setImport" accept="application/json,.json">
          <button type="button" class="btn btn-outline-danger btn-sm" id="setClear">모든 데이터 지우기</button>
        </div>
        <p class="sd-set-status small mb-0 mt-2" id="setStatus" role="status" aria-live="polite"></p>
      </section>
    </div>`;
  document.body.append(panel);
  const $ = sel => panel.querySelector(sel);

  /* ---------- theme swatches: each previews its own theme via data-theme ---------- */
  Theme.THEMES.forEach(t => {
    const b = make('button', 'sd-swatch');
    b.type = 'button';
    b.dataset.pick = t.id;
    b.setAttribute('aria-label', `${t.name} 테마`);
    const prev = make('span', 'sd-swatch-preview');
    prev.dataset.theme = t.id;                                  // style.css tokens apply to this element
    prev.append(make('span', 'sd-sw-nav'), make('span', 'sd-sw-card'), make('span', 'sd-sw-accent'), make('span', 'sd-sw-line'));
    b.append(prev, make('span', 'sd-swatch-name', t.name));
    panel.querySelector(`[data-group="${t.dark ? 'dark' : 'light'}"]`).append(b);
  });
  panel.addEventListener('click', e => {
    const b = e.target.closest('[data-pick]');
    if (b) { Theme.set({ theme: b.dataset.pick }); sync(); }
  });

  /* ---------- accent ---------- */
  const PRESETS = ['#e8553a', '#d6578a', '#8b5cf6', '#2b6cb0', '#0f9b8e', '#2f855a', '#c99a06', '#1a1a1a'];
  PRESETS.forEach(c => {
    const b = make('button', 'sd-accent-dot');
    b.type = 'button';
    b.style.background = c;
    b.dataset.accent = c;
    b.setAttribute('aria-label', `강조색 ${c}`);
    $('.sd-accent-presets').append(b);
  });
  $('.sd-accent-presets').addEventListener('click', e => {
    const b = e.target.closest('[data-accent]');
    if (b) { Theme.set({ accent: b.dataset.accent }); sync(); }
  });
  $('#setAccent').addEventListener('input', e => { Theme.set({ accent: e.target.value }); sync(); });
  $('#setAccentReset').addEventListener('click', () => { Theme.set({ accent: null }); sync(); });

  /* ---------- text size · corners ---------- */
  panel.querySelectorAll('input[name="setFont"]').forEach(r => r.addEventListener('change', () => { Theme.set({ fontSize: r.value }); sync(); }));
  panel.querySelectorAll('input[name="setRadius"]').forEach(r => r.addEventListener('change', () => { Theme.set({ radius: r.value }); sync(); }));
  $('#setLookReset').addEventListener('click', () => { Theme.reset(); sync(); });

  // panel shows the current choices
  function sync() {
    const p = Theme.get();
    panel.querySelectorAll('[data-pick]').forEach(b => {
      const on = b.dataset.pick === p.theme;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const accent = p.accent || getComputedStyle(document.documentElement).getPropertyValue('--sd-accent').trim();
    $('#setAccent').value = /^#[0-9a-f]{6}$/i.test(accent) ? accent : '#e8553a';
    panel.querySelectorAll('[data-accent]').forEach(b => b.classList.toggle('is-active', b.dataset.accent === p.accent));
    $('#setAccentReset').classList.toggle('d-none', !p.accent);
    $(`#setFont${p.fontSize[0].toUpperCase()}${p.fontSize.slice(1)}`).checked = true;
    $(`#setRadius${p.radius[0].toUpperCase()}${p.radius.slice(1)}`).checked = true;
  }
  panel.addEventListener('show.bs.offcanvas', sync);
  window.addEventListener('storage', e => { if (e.key === Theme.KEY) sync(); });
  sync();

  /* ---------- data: export / import / delete all ---------- */
  const status = (msg, bad) => { const s = $('#setStatus'); s.textContent = msg; s.classList.toggle('is-error', !!bad); };

  $('#setExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(SD.exportAll(), null, 2)], { type: 'application/json' });
    const a = make('a');
    a.href = URL.createObjectURL(blob);
    a.download = `study-dashboard-${SD.date.today()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    status('백업 파일을 내보냈어요.');
  });

  $('#setImport').addEventListener('change', e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let obj;
      try { obj = JSON.parse(reader.result); } catch (err) { return status('JSON 파일이 아니에요.', true); }
      const r = SD.importAll(obj);
      if (!r.ok) return status(r.error, true);
      status(`가져왔어요: 할 일 ${r.counts.tasks} · 일정 ${r.counts.events} · 기록 ${r.counts.studyLogs}. 새로고침합니다…`);
      setTimeout(() => location.reload(), 900);
    };
    reader.readAsText(file);
  });

  const clearBtn = $('#setClear');
  clearBtn.addEventListener('click', () => {
    if (!clearBtn.classList.contains('is-confirm')) {
      clearBtn.classList.add('is-confirm', 'btn-danger');
      clearBtn.classList.remove('btn-outline-danger');
      clearBtn.textContent = '정말 지울까요? 되돌릴 수 없어요 (한 번 더 누르기)';
      return;
    }
    SD.clearAll();
    status('모든 데이터를 지웠어요. 새로고침합니다…');
    setTimeout(() => location.reload(), 700);
  });
  panel.addEventListener('hidden.bs.offcanvas', () => {
    clearBtn.classList.remove('is-confirm', 'btn-danger');
    clearBtn.classList.add('btn-outline-danger');
    clearBtn.textContent = '모든 데이터 지우기';
    status('');
  });
})();
