import { Router } from 'express';
import { config, LANGUAGES } from '../config.js';
import { ok } from '../utils.js';
import { configuredChannels } from '../services/notify.js';

const router = Router();

const COUNTRY_LANG = {
  fr: 'FR BE LU MC SN CI BF ML TG BJ NE GN CM CD GA CG HT MG',
  es: 'ES MX CO PE CL VE EC GT CU BO DO HN PY SV NI CR PA UY',
  pt: 'PT BR AO MZ CV GW ST',
  ar: 'SA AE EG MA DZ TN JO KW QA OM BH LB IQ LY SD YE SY',
};
const lookup = Object.fromEntries(Object.entries(COUNTRY_LANG).flatMap(([l, cs]) => cs.split(' ').map((c) => [c, l])));

router.get('/health', (req, res) => ok(res, { status: 'ok', time: new Date().toISOString() }));

// Optional IP/country fallback for first-visit language selection (Vercel supplies x-vercel-ip-country).
router.get('/locale', (req, res) => {
  const country = (req.get('x-vercel-ip-country') || '').toUpperCase() || null;
  const suggested = country ? lookup[country] || 'en' : null;
  ok(res, { country, suggested: suggested && LANGUAGES.includes(suggested) ? suggested : null });
});

router.get('/config', (req, res) => ok(res, { brand: config.brand, languages: LANGUAGES, statementsEnabled: config.statementsEnabled }));

export default router;
