# 🐉 DragonBudget

Self-hosted personal budgeting app. Single Docker container: Express serves the
built React frontend and the JSON API from one process; SQLite lives on a mounted
volume. See [DESIGN.md](DESIGN.md) for the full spec.

## Dev

```bash
# backend (port 3000)
cd backend && npm install && npm run dev

# frontend (port 5173, proxies /api → 3000)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. The DB is created at `backend/data/budgeting.db` on
first run (override with `DATA_DIR`). Auth is **off** in dev unless `APP_PASSWORD`
is set.

## Test

```bash
cd backend && npm test
```

## Run with Docker

The whole app — built frontend + API — runs from a single container on port 3000.
From the project root:

```bash
APP_PASSWORD=yourpassword SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

Then open **http://localhost:3000** and log in with `yourpassword`.

- `--build` (re)builds the multi-stage image; drop it on later runs if nothing changed.
- `-d` runs detached — `docker compose logs -f` to watch, `docker compose down` to stop.
- `APP_PASSWORD` + `SESSION_SECRET` must be set **together**; setting only the password
  makes the container exit on startup (see [Authentication](#authentication)).

**No password (trusted LAN only):** `docker compose up -d --build` with neither var set
disables the login gate.

**On Windows (no `openssl`)** — PowerShell:

```powershell
$env:APP_PASSWORD="yourpassword"; $env:SESSION_SECRET=[guid]::NewGuid().ToString("N"); docker compose up -d --build
```

**Without compose** (plain Docker):

```bash
docker build -t dragonbudget .
docker run -d -p 3000:3000 -v "$(pwd)/data:/data" \
  -e APP_PASSWORD=yourpassword -e SESSION_SECRET=$(openssl rand -hex 32) \
  dragonbudget
```

**Data & backups:** the SQLite DB lives at `./data/budgeting.db` on the host (mounted to
`/data` in the container) and survives restarts and rebuilds. Back it up by copying that
one file alongside your existing backup routine.

**Loading transactions:** open the app → **Import** → upload a BNP Paribas Fortis CSV
export. Re-importing overlapping date ranges is safe — duplicates are skipped.

**Access control on a home server:** Tailscale network membership keeps the public
internet out; the `APP_PASSWORD` gate covers anyone else on your tailnet.

## Authentication

There's a single shared-password gate, controlled by two env vars that do different
jobs:

- **`APP_PASSWORD`** is both the login password *and* the on/off switch for auth:
  - **unset** → auth is disabled entirely (no login screen, every request allowed).
    This is the zero-friction default for local dev.
  - **set** → the whole app requires logging in with that password.
- **`SESSION_SECRET`** signs the login cookie. After you log in, the server stores no
  session — it sets a signed cookie and re-verifies that signature on each request
  (stateless, survives restarts). If the secret were a known/default value, anyone
  could forge a valid cookie and bypass the password.

Because of that, **if `APP_PASSWORD` is set but `SESSION_SECRET` is not, the server
refuses to start.** In production set both; generate the secret once:

```bash
APP_PASSWORD=yourpassword SESSION_SECRET=$(openssl rand -hex 32) docker compose up -d --build
```

Why a password at all behind Tailscale? Defense in depth — Tailscale keeps the public
internet out, but the password stops anyone *else* on your tailnet (a guest device, a
shared node) from poking at your finances. To skip it entirely (trusted LAN only),
leave `APP_PASSWORD` empty.

The session cookie is intentionally **not** marked `secure`: the app is served over
plain HTTP behind Tailscale (no TLS), so a `secure` cookie would never be sent.

## Env

| Var | Default | Notes |
|---|---|---|
| `PORT` | `3000` | listen port |
| `DATA_DIR` | `backend/data` (dev) / `/data` (Docker) | SQLite file location |
| `FRONTEND_DIR` | `<dist>/../public` | built frontend to serve; if absent, API only (dev) |
| `APP_PASSWORD` | _(unset = no auth)_ | shared login password + auth on/off switch |
| `SESSION_SECRET` | _(none)_ | cookie signing key; **required** when `APP_PASSWORD` is set, else startup fails |
