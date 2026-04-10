# Time In / Time Out (v1)

First working version of a worker time clock flow for hotel staff.

- Frontend: plain HTML/CSS/JS in `client/`
- Backend: Node.js + Express in `server/`
- Storage: JSON-backed local database with schema migration (`server/data/db.json`)

## Features

- Worker login (staff ID or email + password)
- Time clock page with live status and actions (clock in, break start/end, clock out)
- Attendance history page for worker-only logs
- Request validation and invalid-order prevention
- Modular backend structure ready for future admin routes

## Folder structure

```text
client/
  index.html
  app.js
  style.css

server/
  index.js
  package.json
  .env.example
  data/
    db.json
  src/
    controllers/
    db/
    middleware/
    models/
    routes/
    services/
    utils/
```

## Run locally

### 1) Install dependencies

```bash
npm install
```

### 2) Start backend

```bash
cp server/.env.example server/.env   # optional
npm start
```

### 3) Open frontend

Open `http://localhost:3000` in your browser. The Express server now serves the frontend.

Quick smoke-test:

```bash
curl http://localhost:3000/health
# TimeClock API running
```

## Deployment notes

- Root `package.json` is used for buildpack detection.
- `Procfile` starts the API with `web: npm start`.
- The backend lives in `server/` and is started through root scripts.
- Express serves both the API and the frontend from a single Railway service.
- Visiting the Railway URL loads the web app directly.

## Demo login

- Staff ID: `W1001`
- Email: `maria@hotel.local`
- Password: `password123`

Also available:

- Staff ID: `W1002`
- Email: `john@hotel.local`
- Password: `password123`

## Database schema and migration

The app initializes and migrates a local JSON database at startup.

- `schemaVersion`
- `users[]`
- `shifts[]`
  - `id`, `userId`, `clockInAt`, `clockOutAt`, `breaks[]`
- `timeLogs[]`
  - `id`, `userId`, `shiftId`, `actionType`, `timestamp`, `notes`

Migration logic lives in:

- `server/src/db/migrations.js`
- `server/src/db/database.js`

## API routes

### Health

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/health` | - | Health check, returns `TimeClock API running` |

### Auth

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | `{ "identifier": "W1001 or email", "password": "string" }` | Login and receive bearer token |
| `GET` | `/api/auth/me` | Bearer token | Get current user |

### Time Clock (auth required)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/time/status` | - | Current worker status and open shift |
| `POST` | `/api/time/actions` | `{ "actionType": "clock_in, break_start, break_end, or clock_out", "notes": "optional" }` | Run time action |
| `GET` | `/api/time/history` | - | Worker attendance history |

### Legacy compatibility routes

Existing v1 routes are still available:

- `POST /clock-in`
- `POST /clock-out`
- `GET /logs/:workerId`
- `GET /summary/:workerId`

## Validation and order rules

- cannot start break if not clocked in
- cannot end break if no active break
- cannot clock out if not clocked in
- cannot clock out while on break
- cannot clock in if a shift is already open

## Quick test flow

1. Start backend with `npm start`
2. Open `http://localhost:3000`
3. Login with `W1001` / `password123`
4. Click Clock In
5. Click Start Break
6. Click End Break
7. Click Clock Out
8. Confirm history table updates and total hours are shown

## v1 security notes

- Session tokens are stored in browser `localStorage` for this starter version (not ideal for production because XSS can expose tokens).
- Session data is in-memory on the server and resets on server restart.
