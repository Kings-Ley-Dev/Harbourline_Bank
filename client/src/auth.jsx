import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import i18n from './i18n/index.js';
import { api, setUnauthorizedHandler } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const adopt = useCallback((u) => {
    setUser(u);
    // A saved preference on the profile always wins over browser detection.
    if (u?.preferredLanguage && u.preferredLanguage !== i18n.resolvedLanguage) i18n.changeLanguage(u.preferredLanguage);
  }, []);

  useEffect(() => {
    api('/auth/me').then((d) => adopt(d.user)).catch(() => setUser(null)).finally(() => setReady(true));
    setUnauthorizedHandler(() => { setUser(null); setSessionExpired(true); });
  }, [adopt]);

  const value = useMemo(() => ({
    user, ready, sessionExpired,
    clearExpired: () => setSessionExpired(false),
    async login(email, password, portal, code) {
      const d = await api('/auth/login', { method: 'POST', body: { email, password, portal, ...(code ? { code } : {}) } });
      if (d.mfaRequired) return { mfaRequired: true };
      setSessionExpired(false);
      adopt(d.user);
      return { user: d.user };
    },
    async logout() { try { await api('/auth/logout', { method: 'POST' }); } finally { setUser(null); } },
    async refresh() { const d = await api('/auth/me'); adopt(d.user); return d.user; },
    async setLanguage(lng) {
      i18n.changeLanguage(lng); // also cached in localStorage by the detector
      if (user) { try { await api('/auth/language', { method: 'PATCH', body: { preferredLanguage: lng } }); setUser({ ...user, preferredLanguage: lng }); } catch { /* UI already switched */ } }
    },
  }), [user, ready, sessionExpired, adopt]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
