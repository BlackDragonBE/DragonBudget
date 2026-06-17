# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

DragonBudget is a self-hosted personal budgeting web app: import BNP Paribas Fortis
CSV exports, categorize transactions via rules, view month/all-time reports, detect
recurring expenses. Single-user, single shared-password gate, runs as one Docker
container behind Tailscale. See `DESIGN.md` for the full spec and rationale.

## Commands

```bash
# Backend (port 3000) — tsx watch auto-reloads on source edits
cd backend && npm install && DATA_DIR=./data npm run dev
cd backend && npm run build          # tsc -> dist/  (also the typecheck)
cd backend && npm test               # node --test over test/**/*.test.ts
cd backend && node --import tsx --test test/rules.test.ts   # single test file

# Frontend (port 5173, proxies /api -> :3000)
cd frontend && npm install && npm run dev
cd frontend && npm run build         # tsc --noEmit (typecheck) + vite build

# Production: one container serves built frontend + API
APP_PASSWORD=… SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

There is no lint step and no frontend test runner — `tsc` is the typecheck for both
sides, and backend correctness is covered by `node:test` files in `backend/test/`.

## Architecture

**Two npm projects, one runtime.** `backend/` (Express, CommonJS) and `frontend/`
(React+Vite, ESM) build separately. In production the multi-stage `Dockerfile` copies
the built frontend into the backend image; `backend/src/index.ts` serves it via
`express.static` (when `FRONTEND_DIR` exists) and mounts the API on the same port. In
dev they run as two servers and Vite proxies `/api`.

**Database is the built-in `node:sqlite` (`DatabaseSync`), not better-sqlite3.** The
dev machine's Node has no prebuilt better-sqlite3 binary; `node:sqlite` is stdlib with
zero native deps. Constraints this imposes:
- Docker runtime must be **node:24+** (`node:sqlite` is unflagged since 23.4).
- `stmt.run()` **throws on `undefined`** params — always pass `null`.
- Rows are **null-prototype objects** — `assert.deepEqual` trips on the prototype in
  tests (normalize with `{...row}` or explicit field copy).
- No `.transaction()` helper — use `tx(db, fn)` from `db.ts` (BEGIN/COMMIT/ROLLBACK).
  **`tx()` cannot nest**; `applyRules()` runs its own transaction, so callers must not
  wrap it inside another `tx()` (see `categorize/suggest.ts:acceptSuggestion`).

**Schema & seed on startup.** `db.ts:createDb()` runs `schema.ts`'s embedded
`CREATE TABLE IF NOT EXISTS` DDL (embedded as a string so there's no build-copy step)
and seeds default categories once. Adding a table = add it to `schema.ts`; it appears
on next process start, no migration framework.

**The import pipeline is the spine** (`csv/`):
`parse.ts` (BNP CSV → zod-validated rows: BOM strip, `DD/MM/YYYY`→ISO, amounts →
integer cents, status mapping) → `import.ts` (sha256 `import_hash` dedup via
`INSERT OR IGNORE`, idempotent re-import) → `postImport.ts` (the hook that runs
**after every import**: apply category rules to new rows, then re-run recurring
detection). Extend `runPostImport` rather than the import route.

**Categorization engine** (`categorize/`): `rules.ts` matches rules by descending
priority (first match wins) and **never overwrites `category_source='manual'`** unless
`recategorizeAll` is passed. `tokens.ts` extracts a merchant token from `details`
(shared by recurring detection and rule suggestion). `suggest.ts` proposes rules when
a manual categorization reveals a repeated token.

**Reports are pure query functions** in `reports.ts` (month / balance-history /
category-trends), wrapped by thin handlers in `routes/reports.ts`. Recurring detection
lives in `recurring/detect.ts`.

**Routes**: `routes/index.ts` mounts every resource router under a single
`requireAuth`-gated `/api` router; auth routes (`/api/auth/*`) and `/api/health` are
mounted before the gate so login is reachable.

## Invariants — do not break these

- **Money is integer cents everywhere.** Convert to/from euros only at the API/display
  boundary (`frontend/src/format.ts:euros`). Never store or sum floats.
- **`status='rejected'` transactions are excluded** from balances, totals, and
  recurring detection — but still listed (greyed) in the UI.
- **Dedup key** (`import.ts:importHash`) includes `details` (carries the bank's
  reference number); never key on `Volgnummer` (unreliable, can be malformed).
- **Auth is env-gated**: unset `APP_PASSWORD` = no auth (dev). If `APP_PASSWORD` is set
  but `SESSION_SECRET` is not, the server refuses to start. The session cookie has no
  `secure` flag on purpose (app is HTTP behind Tailscale, no TLS).

## Testing notes

Tests use `node:test` + `node:assert/strict` with `createDb(':memory:')` for isolation.
The real 485-row export at `csv_exports/CSV_2026-06-17-16.52.csv` is the fixture for
`csv.test.ts` (gitignored as private financial data; that test skips if absent). When
adding logic to the parser, categorization, or recurring detection, add a focused test
there rather than a synthetic one — the real export carries the edge cases.
