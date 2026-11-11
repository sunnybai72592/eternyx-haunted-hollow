export type AccountTheme = 'cyberpunk' | 'dark' | 'matrix';

export function normalizeAccountTheme(value: unknown): AccountTheme {
  return value === 'dark' || value === 'matrix' ? value : 'cyberpunk';
}

/** Apply the signed-in user's saved theme to the document root. */
export function applyAccountTheme(value: unknown): AccountTheme {
  const theme = normalizeAccountTheme(value);
  const root = document.documentElement;

  root.classList.toggle('dark', theme === 'dark');
  root.dataset.eterTheme = theme;
  root.style.colorScheme = 'dark';

  return theme;
}
