/* =========================================================
   Study Dashboard — appearance (theme · accent · text size · corners)
   Loaded in <head> WITHOUT defer so the saved theme is applied before the page paints
   (no flash of the default colors). Saved per browser in localStorage "appearance".
   Colors themselves live in css/style.css ([data-theme="…"] token blocks).
     Theme.get() → { theme, accent, fontSize, radius }
     Theme.set({ theme: 'nord' })   merges, saves, applies
   Maintainer: 김주환
   ========================================================= */
const Theme = (() => {
  'use strict';

  const KEY = 'appearance';
  // id must match a [data-theme="id"] block in style.css
  const THEMES = [
    { id: 'default', name: '기본', dark: false },
    { id: 'latte', name: 'Latte', dark: false },
    { id: 'forest', name: '숲', dark: false },
    { id: 'ocean', name: '바다', dark: false },
    { id: 'sakura', name: '벚꽃', dark: false },
    { id: 'mono', name: '모노', dark: false },
    { id: 'solarized', name: 'Solarized', dark: false },
    { id: 'midnight', name: '미드나잇', dark: true },
    { id: 'frappe', name: 'Frappé', dark: true },
    { id: 'mocha', name: 'Mocha', dark: true },
    { id: 'nord', name: 'Nord', dark: true },
    { id: 'dracula', name: 'Dracula', dark: true },
    { id: 'gruvbox', name: 'Gruvbox', dark: true },
    { id: 'tokyo', name: 'Tokyo Night', dark: true }
  ];
  const FONT = { small: '15px', normal: '16px', large: '17.5px' };
  const RADIUS = { sharp: ['4px', '3px'], normal: ['10px', '8px'], round: ['16px', '12px'] };   // [cards, small parts]
  const DEFAULTS = { theme: 'default', accent: null, fontSize: 'normal', radius: 'normal' };

  const isHex = v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
  const byId = id => THEMES.find(t => t.id === id);

  function get() {
    let p = {};
    try { p = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { p = {}; }
    return {
      theme: byId(p.theme) ? p.theme : DEFAULTS.theme,
      accent: isHex(p.accent) ? p.accent.toLowerCase() : null,
      fontSize: p.fontSize in FONT ? p.fontSize : DEFAULTS.fontSize,
      radius: p.radius in RADIUS ? p.radius : DEFAULTS.radius
    };
  }

  // readable text on top of a color: dark text on light colors, white on dark ones
  function inkOn(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#1a1a1a' : '#ffffff';
  }

  function apply(p = get()) {
    const root = document.documentElement;
    const t = byId(p.theme) || THEMES[0];
    root.dataset.theme = t.id;
    if (t.dark) root.setAttribute('data-bs-theme', 'dark'); else root.removeAttribute('data-bs-theme');

    // custom accent: overrides the theme's accent tokens (others stay the theme's)
    const st = root.style;
    if (p.accent) {
      st.setProperty('--sd-accent', p.accent);
      st.setProperty('--sd-accent-ink', inkOn(p.accent));
      st.setProperty('--sd-accent-text', t.dark ? `color-mix(in srgb, ${p.accent} 80%, #ffffff)` : `color-mix(in srgb, ${p.accent} 75%, var(--sd-ink))`);
      st.setProperty('--sd-accent-soft', `color-mix(in srgb, ${p.accent} ${t.dark ? 22 : 18}%, transparent)`);
    } else {
      ['--sd-accent', '--sd-accent-ink', '--sd-accent-text', '--sd-accent-soft'].forEach(v => st.removeProperty(v));
    }
    st.fontSize = FONT[p.fontSize] || FONT.normal;
    const [r, rs] = RADIUS[p.radius] || RADIUS.normal;
    st.setProperty('--sd-radius', r);
    st.setProperty('--sd-radius-sm', rs);
  }

  function set(patch) {
    const next = { ...get(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { /* storage blocked: applies for this page only */ }
    apply(next);
    return next;
  }

  const reset = () => set({ ...DEFAULTS });

  apply();
  // another tab changed it → follow
  window.addEventListener('storage', e => { if (e.key === KEY || e.key === null) apply(); });

  return { THEMES, DEFAULTS, get, set, apply, reset, KEY };
})();
