export type Theme = 'light' | 'dark' | 'system';

const MQ = window.matchMedia('(prefers-color-scheme: dark)');

function apply(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && MQ.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme;
}

export function initTheme() {
  apply(getTheme());
  MQ.addEventListener('change', () => {
    if (getTheme() === 'system') apply('system');
  });
}

export function getTheme(): Theme {
  return (localStorage.getItem('theme') as Theme) ?? 'system';
}

export function setTheme(theme: Theme) {
  localStorage.setItem('theme', theme);
  apply(theme);
}
