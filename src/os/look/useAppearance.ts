import { useEffect } from 'react';
import { useWindows } from '../core/store';

/** Light or dark as the visitor chose; `system` follows the OS, `sun` the daylight where they are. */
export function useAppearance(daylight: boolean) {
  const appearance = useWindows((s) => s.appearance);
  useEffect(() => {
    const { applyTheme } = useWindows.getState();
    if (appearance === 'sun') {
      applyTheme(daylight ? 'light' : 'dark');
    } else if (appearance === 'system') {
      const query = matchMedia('(prefers-color-scheme: dark)');
      const follow = () => applyTheme(query.matches ? 'dark' : 'light');
      follow();
      query.addEventListener('change', follow);
      return () => query.removeEventListener('change', follow);
    } else {
      applyTheme(appearance);
    }
  }, [appearance, daylight]);

  // The page itself (scrollbars, form controls) takes the theme on screen.
  const theme = useWindows((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}
