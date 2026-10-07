import { currentLang } from './i18n/index.js';

const loc = () => (currentLang() === 'ar' ? 'ar-EG-u-nu-latn' : currentLang());

export const money = (minor, currency = 'GHS') => {
  try {
    return new Intl.NumberFormat(loc(), { style: 'currency', currency }).format((minor || 0) / 100);
  } catch {
    return `${currency} ${((minor || 0) / 100).toFixed(2)}`;
  }
};
export const dateFmt = (d, opts = { dateStyle: 'medium' }) => (d ? new Intl.DateTimeFormat(loc(), opts).format(new Date(d)) : '—');
export const dateTimeFmt = (d) => dateFmt(d, { dateStyle: 'medium', timeStyle: 'short' });
export const monthLabel = (ym) => { const [y, m] = ym.split('-').map(Number); return new Intl.DateTimeFormat(loc(), { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1))); };

export const COUNTRIES = [
  ['GH', 'Ghana'], ['NG', 'Nigeria'], ['CI', "Côte d'Ivoire"], ['SN', 'Senegal'], ['TG', 'Togo'], ['BJ', 'Benin'], ['BF', 'Burkina Faso'], ['KE', 'Kenya'], ['ZA', 'South Africa'],
  ['GB', 'United Kingdom'], ['US', 'United States'], ['CA', 'Canada'], ['AU', 'Australia'], ['FR', 'France'], ['ES', 'Spain'], ['PT', 'Portugal'], ['BR', 'Brazil'],
  ['MX', 'Mexico'], ['AE', 'United Arab Emirates'], ['SA', 'Saudi Arabia'], ['EG', 'Egypt'], ['DE', 'Germany'], ['IN', 'India'], ['CN', 'China'],
];
export const countryName = (code) => COUNTRIES.find(([c]) => c === code)?.[1] || code;
export const CURRENCIES = ['GHS', 'USD', 'EUR', 'GBP', 'NGN', 'AUD'];
export const BRAND = 'Harbourline Bank';
