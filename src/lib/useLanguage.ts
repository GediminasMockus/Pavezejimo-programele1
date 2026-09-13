import { useEffect, useState } from 'react';

export type Language = 'lt' | 'en';

const LANGUAGE_KEY = 'pavezejimai_language';
const LANGUAGE_EVENT = 'pavezejimai-language-change';

export function getLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'en' ? 'en' : 'lt';
  } catch {
    return 'lt';
  }
}

export function setLanguagePreference(language: Language) {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Keep the in-memory UI update even if storage is unavailable.
  }
  document.documentElement.lang = language;
  window.dispatchEvent(new CustomEvent(LANGUAGE_EVENT, { detail: language }));
}

export function useLanguage() {
  const [language, setLanguage] = useState<Language>(() => getLanguage());

  useEffect(() => {
    document.documentElement.lang = language;

    const handleLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<Language>).detail;
      setLanguage(next === 'en' ? 'en' : 'lt');
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LANGUAGE_KEY) setLanguage(event.newValue === 'en' ? 'en' : 'lt');
    };

    window.addEventListener(LANGUAGE_EVENT, handleLanguageChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(LANGUAGE_EVENT, handleLanguageChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, [language]);

  return {
    language,
    setLanguage: setLanguagePreference,
    isEnglish: language === 'en',
  };
}
