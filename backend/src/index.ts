import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import './db'; // open DB + apply schema + seed on startup
import { sessionMiddleware, requireAuth, mountAuthRoutes } from './auth';
import { mountApiRoutes } from './routes';

const app = express();
app.use(express.json());
app.use(sessionMiddleware);

app.get('/api/health', (_req, res) => res.json({ ok: true }));
mountAuthRoutes(app);

// Everything else under /api requires auth (no-op when APP_PASSWORD is unset).
const api = express.Router();
api.use(requireAuth);
mountApiRoutes(api);
app.use('/api', api);

// In production the built frontend is served from FRONTEND_DIR (set in Docker).
const FRONTEND_DIR = process.env.FRONTEND_DIR || path.join(__dirname, '..', 'public');
if (fs.existsSync(FRONTEND_DIR)) {
  app.use(express.static(FRONTEND_DIR));
  app.get('*', (_req, res) => res.sendFile(path.join(FRONTEND_DIR, 'index.html')));
}

// JSON error handler (last). Keeps the API returning JSON, not HTML stacks.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`DragonBudget listening on :${PORT}`));
