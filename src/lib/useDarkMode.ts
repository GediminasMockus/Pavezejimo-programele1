import { useEffect, useState } from 'react';

const DARK_MODE_KEY = 'pavezejimai_dark_mode';

export function useDarkMode() {
  const [isDark, setIsDark] = useState(() => {
    try {
      const stored = localStorage.getItem(DARK_MODE_KEY);
      if (stored !== null) return stored === 'true';
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(DARK_MODE_KEY, String(isDark));
    } catch {
      // Ignore localStorage errors
    }
  }, [isDark]);

  const toggle = () => setIsDark(!isDark);

  return { isDark, toggle };
}
