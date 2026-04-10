# Time In / Time Out (v1)

First working version of a worker time clock flow for hotel staff.

- Frontend: plain HTML/CSS/JS in `client/`
- Backend: Node.js + Express in `server/`
- Storage: JSON-backed local database with schema migration (`server/data/db.json`)

## Features

- Worker login (staff ID or email + password)
- Worker self-signup (first name, last name, email, password, optional phone)
- Admin workplace management (create, edit, activate/deactivate)
- Time clock page with live status and actions (clock in, break start/end, clock out)
- Browser geolocation capture on every attendance action (clock in, break start/end, clock out)
- Per-action location history (coordinates, accuracy, location capture timestamp)
- Small OpenStreetMap preview for current/last captured location and history row preview
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

Default seeded users:

- Admin: `admin@hotel.local` / `admin12345`
- Worker: `maria@hotel.local` / `password123`
- Worker: `john@hotel.local` / `password123`

You can override default admin seed credentials in `server/.env`:

```bash
DEFAULT_ADMIN_EMAIL=admin@hotel.local
DEFAULT_ADMIN_PASSWORD=admin12345
```

### 3) Open frontend

Open `http://localhost:3000` in your browser. The Express server now serves the frontend.

Quick smoke-test:

```bash
curl http://localhost:3000/health
# TimeClock API running
```

## Location capture behavior

- By default, location is required for attendance actions.
- The browser requests geolocation each time the worker clicks Clock In, Start Break, End Break, or Clock Out.
- The app sends:
  - `latitude`
  - `longitude`
  - `accuracy` (meters, when available)
  - `capturedAt` (location capture timestamp)
- If permission is denied or location is unavailable, the action is blocked and a clear error is shown.
- Frontend status panel shows: `Locating...`, `Location captured`, `Location denied`, or `Location unavailable`.
- Clock In stays disabled until a valid location has been captured.
- The Time Clock page shows a small OpenStreetMap preview centered on the last captured location.

### Browser requirements

- Geolocation requires a secure context in browsers:
  - `https://` in production
  - `http://localhost` is allowed for local development
- If testing from another insecure origin, geolocation may be blocked by the browser.
- The map uses OpenStreetMap tiles loaded from the public tile service, so network access is required for the visual map tiles to appear.

### Optional config

- `REQUIRE_ATTENDANCE_LOCATION=true` (default): location must be provided for attendance actions.
- Set `REQUIRE_ATTENDANCE_LOCATION=false` only if you explicitly want to allow missing location payloads.
- `ENFORCE_CLOCKIN_GEOFENCE=false` (default): if set to `true`, clock-in is rejected when outside the assigned workplace radius.

## Signup flow

- Open the app and switch from `Login` to `Sign Up`.
- Required fields: first name, last name, email, password, confirm password.
- Optional field: phone number.
- Backend enforces unique email and password confirmation.
- Passwords are hashed with PBKDF2 before storage.
- Successful signup auto-logs in the worker and starts a session token.

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
- `workplaces[]`
  - `id`, `name`, `address`, `city`, `state`, `postalCode`, `country`
  - `contactName`, `contactPhone`, `contactEmail`
  - `latitude`, `longitude`, `geofenceRadiusMeters`
  - `active`, `crm`, `createdBy`, `createdAt`, `updatedAt`
- `shifts[]`
  - `id`, `userId`, `clockInAt`, `clockOutAt`, `breaks[]`
- `timeLogs[]`
  - `id`, `userId`, `shiftId`, `actionType`, `timestamp`, `notes`
  - `location`:
    - `latitude`
    - `longitude`
    - `accuracy`
    - `capturedAt`

`timestamp` is the attendance action server timestamp, while `location.capturedAt` is the client geolocation capture time.

`users[]` now includes profile-ready worker fields:

- `firstName`, `lastName`, `name`
- `email`, `phone`, `staffId`
- `role` (`worker` or `admin`)
- `isActive`, `profile`

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
| `POST` | `/api/auth/register` | `{ "firstName", "lastName", "email", "password", "confirmPassword", "phone?" }` | Create worker account and start session |
| `POST` | `/api/auth/login` | `{ "identifier": "W1001 or email", "password": "string" }` | Login and receive bearer token |
| `GET` | `/api/auth/me` | Bearer token | Get current user |

### Time Clock (auth required)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/time/status` | - | Current worker status and open shift |
| `POST` | `/api/time/actions` | `{ "actionType": "clock_in, break_start, break_end, or clock_out", "notes": "optional", "location": { "latitude": number, "longitude": number, "accuracy": number, "capturedAt": "ISO" } }` | Run time action with validated location |
| `GET` | `/api/time/history` | - | Worker attendance action history including location fields |

### Workplaces (admin only)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/workplaces` | query `includeInactive=true|false` | List workplaces |
| `GET` | `/api/workplaces/:workplaceId` | - | Get workplace details |
| `POST` | `/api/workplaces` | workplace payload | Create workplace |
| `PUT` | `/api/workplaces/:workplaceId` | workplace payload | Update workplace |
| `PATCH` | `/api/workplaces/:workplaceId/status` | `{ "active": boolean }` | Activate/deactivate workplace |

### Admin worker assignment (admin only)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/workers` | - | List workers with assigned workplace info |
| `GET` | `/api/admin/assignable-workplaces` | - | List active workplaces available for assignment |
| `PATCH` | `/api/admin/workers/:workerUserId/workplace` | `{ "workplaceId": "id" }` or `{ "workplaceId": null }` | Assign/unassign worker workplace |

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
8. Confirm action history updates with coordinates and location capture timestamps

## Geolocation testing tips

- Chrome/Edge DevTools: open Sensors panel and override location coordinates.
- Mobile device: open the app over HTTPS and allow location permission.
- Denial test: block location permission in browser site settings, then attempt an attendance action.

## Workplace management usage

- Login as admin, then open `Workplaces` from the in-app navigation.
- Add a workplace with coordinates and geofence radius.
- Edit workplace records in place.
- Use activate/deactivate for archival behavior instead of hard delete.
- In the `Worker Workplace Assignment` section, assign each worker to one active workplace.
- Time Clock view now shows assigned workplace info and latest distance check result.

## CRM and geofencing readiness

Ready now:

- Workplaces are managed in dedicated model/service/controller/route modules.
- Workplace records include CRM metadata (`crm.source`, `crm.externalId`, `crm.syncStatus`, `crm.ownerType`).
- Workplace coordinates and geofence radius are validated and stored.
- A dedicated geofence helper exists for distance/radius checks (`server/src/services/geofenceService.js`).

Prepared for next step:

- Attendance logic can be extended to require assigned workplace selection on clock-in.
- Location captured during attendance actions can be compared to workplace geofence to allow/reject clock-ins.
- CRM sync adapters can map external workplace IDs into `crm.externalId` without changing attendance APIs.

Current implementation note:

- Distance-to-assigned-workplace is already calculated and returned in time action/history responses.
- Strict blocking is controlled by `ENFORCE_CLOCKIN_GEOFENCE` so rollout can stay safe while operations configure assignments.
- Clock In is blocked in the frontend until valid location data exists, and the backend also rejects missing clock-in location with `location is required for clock in`.

## v1 security notes

- Session tokens are stored in browser `localStorage` for this starter version (not ideal for production because XSS can expose tokens).
- Session data is in-memory on the server and resets on server restart.
