import cookieSession from 'cookie-session';
import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';

// Single shared password gate (DESIGN.md §2). Stateless signed cookie, so it
// survives restarts with no session store. If APP_PASSWORD is unset, auth is
// disabled entirely — zero friction in dev, enabled in prod by setting the env.
const APP_PASSWORD = process.env.APP_PASSWORD;
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-insecure-secret';

// If auth is on, refuse to start with the forgeable default secret — otherwise
// the cookie signature is public and sessions can be forged.
if (APP_PASSWORD && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set when APP_PASSWORD is set (sessions would otherwise be forgeable).');
}

// Cookie has no `secure` flag on purpose: the app is served over plain HTTP
// behind Tailscale (no TLS), so `secure: true` would stop the cookie being sent.
export const sessionMiddleware: RequestHandler = cookieSession({
  name: 'db_sess',
  secret: SESSION_SECRET,
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
});

// Constant-time compare (hash first so unequal lengths don't leak / throw).
function passwordMatches(input: string): boolean {
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(APP_PASSWORD as string).digest();
  return crypto.timingSafeEqual(a, b);
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!APP_PASSWORD) return next();
  if (req.session?.authed) return next();
  res.status(401).json({ error: 'unauthorized' });
};

export function mountAuthRoutes(app: Express): void {
  app.post('/api/auth/login', (req, res) => {
    if (!APP_PASSWORD) return res.json({ ok: true, authDisabled: true });
    const password = (req.body ?? {}).password;
    if (typeof password === 'string' && passwordMatches(password)) {
      req.session!.authed = true;
      return res.json({ ok: true });
    }
    res.status(401).json({ error: 'invalid password' });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  app.get('/api/auth/status', (req, res) => {
    res.json({
      authRequired: !!APP_PASSWORD,
      authenticated: !APP_PASSWORD || !!req.session?.authed,
    });
  });
}
