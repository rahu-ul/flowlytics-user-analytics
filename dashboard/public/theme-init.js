// Runs before first paint so the saved theme is applied without a flash.
// Kept as an external file (not inline) because the API serves the dashboard with helmet's default CSP (script-src 'self').
(function () {
  var theme = 'light';
  try {
    var saved = localStorage.getItem('cf-theme');
    theme = saved === 'light' || saved === 'dark' ? saved : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch (e) { /* storage blocked: fall back to light */ }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
})();
