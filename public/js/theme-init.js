/* Runs before anything is painted so the saved theme is in place from the first frame (no flash of the wrong theme).
   Plain script, no modules, no dependencies. The choice is saved by js/theme.js under "wh_theme". Dark is the default. */
(function () {
  var t = 'dark';
  try { var s = localStorage.getItem('wh_theme'); if (s === 'light' || s === 'dark') t = s; } catch (e) { /* private mode: stay dark */ }
  var root = document.documentElement;
  root.setAttribute('data-theme', t);
  var m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', t === 'light' ? '#f5f7fb' : '#070b14');
})();
