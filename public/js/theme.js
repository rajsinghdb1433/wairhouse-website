// Light / dark theme. js/theme-init.js applies the saved choice before first paint (no flash); this file switches it,
// remembers it, and keeps the toggle button and the browser's address-bar colour in step. Dark is the default.
const KEY = 'wh_theme';
const BAR = { light: '#f5f7fb', dark: '#070b14' };

// Both icons are in the button; CSS shows the one for the theme you would switch TO (sun while dark, moon while light).
const SUN = '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6"/></svg>';
const MOON = '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.4 14.1A8.6 8.6 0 0 1 9.9 3.6a8.6 8.6 0 1 0 10.5 10.5Z"/></svg>';
export const themeIcons = SUN + MOON;

export const currentTheme = () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

// Labels, titles and the address-bar colour follow the active theme.
export function syncTheme() {
  const t = currentTheme(), to = t === 'light' ? 'dark' : 'light';
  document.querySelectorAll('.theme-toggle').forEach((b) => { b.setAttribute('aria-label', `Switch to ${to} theme`); b.setAttribute('title', `Switch to ${to} theme`); b.dataset.theme = t; });
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', BAR[t]);
}

export function setTheme(t, { save = true, animate = true } = {}) {
  if (t !== 'light' && t !== 'dark') return;
  const root = document.documentElement;
  // A short, global colour fade while switching (not while merely loading a page). Skipped for people who ask for less motion.
  if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) { root.classList.add('theme-anim'); clearTimeout(setTheme.t); setTheme.t = setTimeout(() => root.classList.remove('theme-anim'), 450); }
  root.setAttribute('data-theme', t);
  if (save) { try { localStorage.setItem(KEY, t); } catch (_) { /* private mode: it still works for this visit */ } }
  syncTheme();
  window.dispatchEvent(new CustomEvent('themechange', { detail: t }));
}
export const toggleTheme = () => setTheme(currentTheme() === 'light' ? 'dark' : 'light');

// Another tab changed the theme: follow it.
addEventListener('storage', (e) => { if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark') && e.newValue !== currentTheme()) setTheme(e.newValue, { save: false }); });
