import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import translations from '../i18n/translations.json';
import { getSetting, updateSettings, type LanguageCode } from '../services/settingsStore';

type TranslationParams = Record<string, string | number>;
type TranslationMap = Record<string, string>;

const DICTIONARIES = translations as Record<LanguageCode, TranslationMap>;
const SUPPORTED_LANGUAGES: LanguageCode[] = ['de-DE', 'en-GB'];

interface LanguageContextValue {
  language: LanguageCode;
  languages: LanguageCode[];
  setLanguage: (language: LanguageCode) => void;
  t: (key: string, params?: TranslationParams) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'de-DE',
  languages: SUPPORTED_LANGUAGES,
  setLanguage: () => {},
  t: (key) => key,
});

function isLanguageCode(value: string | undefined): value is LanguageCode {
  return value === 'de-DE' || value === 'en-GB';
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const saved = getSetting('misc').language;
    return isLanguageCode(saved) ? saved : 'de-DE';
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
    updateSettings('misc', { language: nextLanguage });
  }, []);

  const t = useCallback(
    (key: string, params?: TranslationParams) => {
      const template = DICTIONARIES[language]?.[key] ?? DICTIONARIES['en-GB']?.[key] ?? key;
      return interpolate(template, params);
    },
    [language],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ language, languages: SUPPORTED_LANGUAGES, setLanguage, t }),
    [language, setLanguage, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useTranslation() {
  return useContext(LanguageContext).t;
}
