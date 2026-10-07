import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import ar from './locales/ar.json';

export const LANGS = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'fr', label: 'Français', dir: 'ltr' },
  { code: 'es', label: 'Español', dir: 'ltr' },
  { code: 'pt', label: 'Português', dir: 'ltr' },
  { code: 'ar', label: 'العربية', dir: 'rtl' },
];
export const SUPPORTED = LANGS.map((l) => l.code);
const STORAGE_KEY = 'hb_lang';

const safeGet = () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } };

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { translation: en }, fr: { translation: fr }, es: { translation: es }, pt: { translation: pt }, ar: { translation: ar } },
    fallbackLng: 'en',
    supportedLngs: SUPPORTED,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    interpolation: { escapeValue: false },
    // Saved choice first, then browser/device language.
    detection: { order: ['localStorage', 'navigator', 'htmlTag'], lookupLocalStorage: STORAGE_KEY, caches: ['localStorage'] },
  });

function applyDir(lng) {
  const code = (lng || 'en').slice(0, 2);
  const l = LANGS.find((x) => x.code === code) || LANGS[0];
  document.documentElement.lang = l.code;
  document.documentElement.dir = l.dir;
}
applyDir(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', applyDir);

/** Optional country/IP fallback: only when nothing is saved AND the browser language is unsupported. */
export async function ipLanguageFallback() {
  try {
    if (safeGet()) return;
    const browser = (navigator.languages || [navigator.language]).map((l) => (l || '').slice(0, 2).toLowerCase());
    if (browser.some((l) => SUPPORTED.includes(l))) return;
    const r = await fetch('/api/public/locale');
    const j = await r.json();
    const s = j?.data?.suggested;
    if (s && SUPPORTED.includes(s)) i18n.changeLanguage(s);
  } catch { /* offline or no API: keep default */ }
}

export const currentLang = () => (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);

export default i18n;
