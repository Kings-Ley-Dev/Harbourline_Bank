# Harbourline Bank – Web-Based Banking Management & Client Portal

MERN implementation of public banking website, secure client portal and administrative dashboard.

## Stack
React 18 + Vite · Node 20+/Express (served via a Vercel serverless function, **no `app.listen()` in production**) ·
MongoDB Atlas + Mongoose · JWT in `httpOnly` cookies · bcrypt · TOTP MFA · i18next (en, fr, es, pt, ar with RTL).

## Layout
```
api/index.js          Vercel serverless entry (exports the Express app)
server/               Express app, models, routes, services, tests, seed script
  routes/             public, auth, admin, client
  services/           notify (email/WhatsApp/SMS), messages (approved translations), audit, ledger
client/               React SPA (public site, /portal, /admin)
vercel.json           rewrites /api/* to the function, security headers, SPA fallback
```

## Run locally
Requires Node 20+ and a MongoDB (Atlas free cluster or local `mongod`).
```bash
cp .env.example .env            # set MONGODB_URI, JWT_SECRET, APP_URL=http://localhost:5173
npm install && npm --prefix client install
npm run seed -- --demo          # super admin (+ demo staff/client; never in production)
npm run dev:api                 # API on :3001
npm run dev:client              # SPA on :5173 (proxies /api)
```
