(() => {
  const preference = matchMedia('(prefers-color-scheme: dark)');
  let saved = null;
  try { saved = localStorage.getItem('gift-theme'); } catch {}
  let explicit = saved === 'dark' || saved === 'light';
  const root = document.documentElement;
  let themeTimer;
  function apply(theme, animate = false) {
    if (animate) {
      root.classList.add('theme-changing');
      clearTimeout(themeTimer);
      themeTimer = setTimeout(() => root.classList.remove('theme-changing'), 450);
    }
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#111e19' : '#f6f3eb';
    const toggle = document.querySelector('#theme-toggle');
    if (!toggle) return;
    const dark = theme === 'dark';
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
    toggle.title = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
    toggle.querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
    toggle.querySelector('.theme-label').textContent = dark ? 'Светлая тема' : 'Тёмная тема';
  }
  apply(explicit ? saved : preference.matches ? 'dark' : 'light');
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.querySelector('#theme-toggle').addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      explicit = true;
      try { localStorage.setItem('gift-theme', next); } catch {}
      apply(next, true);
    });
  });
  preference.addEventListener('change', e => { if (!explicit) apply(e.matches ? 'dark' : 'light', true); });
})();
