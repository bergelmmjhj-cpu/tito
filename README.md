# Time In / Time Out (v1)

First working version of a worker time clock flow for hotel staff.

- Frontend: plain HTML/CSS/JS in `client/`
- Backend: Node.js + Express in `server/`
- Storage: JSON-backed local database with schema migration (`server/data/db.json`)

## Features

- Worker login (staff ID or email + password)
- Worker self-signup (first name, last name, email, password, optional phone)
- Admin workplace management (create, edit, activate/deactivate)
- Admin timesheet review, payroll approval, and payroll export tracking
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

Default users after first startup:

- Admin: `admin@hotel.local` / `<set-via-env>`
- Worker: `<create-via-signup>` / `<user-defined-password>`
- Worker: `<create-via-signup>` / `<user-defined-password>`

Admin bootstrap is created from environment values only when no admin user exists.

Recommended environment variables:

```bash
ADMIN_EMAIL=admin@hotel.local
ADMIN_PASSWORD=<set-strong-password>
ADMIN_FIRST_NAME=System
ADMIN_LAST_NAME=Admin
ADMIN_STAFF_ID=A1000
GOOGLE_CLIENT_ID=<optional-google-client-id>
GOOGLE_CLIENT_SECRET=<optional-google-client-secret>
GOOGLE_REDIRECT_URI=<optional-google-callback-uri>
CORS_ALLOWED_ORIGINS=<optional-comma-separated-origin-allowlist>
BUSINESS_DEFAULT_TIME_ZONE=<optional-iana-time-zone-like-America/New_York>
```

Backward-compatible aliases are still supported:

```bash
DEFAULT_ADMIN_EMAIL=admin@hotel.local
DEFAULT_ADMIN_PASSWORD=<set-strong-password>
```

If you keep values in `server/.env`, `npm start` now loads them automatically.
If `server/.env` is missing, Google OAuth and bootstrap admin credentials will not be configured.

### Manual admin seed command

If you want a direct one-time seed action:

```bash
npm run seed:admin
```

This command creates an admin only if no admin exists.

### Admin login process

After bootstrap/seed, log in from the normal login page using admin staff ID or email and password. Staff and admins now use the same login form. The UI enables admin-only pages (Workplaces and Timesheets) based on the user role returned by auth.

### Google login (optional)

If you configure a Google OAuth web client, the app can start Google sign-in from the login screen.

When Google OAuth is not configured on the server, the Google sign-in button stays hidden automatically.

- Set `GOOGLE_CLIENT_ID`
- Set `GOOGLE_CLIENT_SECRET`
- Set `GOOGLE_REDIRECT_URI`
- Ensure those values exist in runtime environment variables or `server/.env`
- For local development, use `http://localhost:3000/api/auth/google/callback`
- For Railway production, use your deployed domain, for example `https://tito-production-e1d5.up.railway.app/api/auth/google/callback`

The matching Google OAuth `Authorized JavaScript origins` should be the site origin only, for example:

- `http://localhost:3000`
- `https://tito-production-e1d5.up.railway.app`

### Promote an existing worker to admin (optional)

```bash
npm run promote:admin -- W1001
# or
npm run promote:admin -- maria@hotel.local
```

This is a local script path only (not a public signup flow).

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
- `CORS_ALLOWED_ORIGINS`: optional comma-separated list of additional origins allowed to call the API in production. Same-origin requests from the deployed app continue to work automatically.
- `BUSINESS_DEFAULT_TIME_ZONE`: optional fallback IANA time zone used when a workplace does not provide one. This controls how business dates are derived for attendance history and admin timesheets.

## Signup flow

- Open the app and switch from `Login` to `Sign Up`.
- Required fields: first name, last name, email, password, confirm password.
- Optional field: phone number.
- Backend enforces unique email and password confirmation.
- Passwords are hashed with PBKDF2 before storage.
- Signup always creates `worker` users (admin cannot be created through public signup).
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
- Password: `<user-defined-password>`

Also available:

- Staff ID: `W1002`
- Email: `john@hotel.local`
- Password: `<user-defined-password>`

## Database schema and migration

The app initializes and migrates a local JSON database at startup.

- `schemaVersion`
- `users[]`
- `workplaces[]`
  - `id`, `name`, `address`, `city`, `state`, `postalCode`, `country`
  - `contactName`, `contactPhone`, `contactEmail`
  - `latitude`, `longitude`, `geofenceRadiusMeters`, `timeZone`
  - `active`, `crm`, `createdBy`, `createdAt`, `updatedAt`
- `shifts[]`
  - `id`, `userId`, `clockInAt`, `clockOutAt`, `businessDate`, `businessTimeZone`, `breaks[]`
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

### Admin timesheets (admin only)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/admin/timesheets` | query `dateFrom`, `dateTo`, `search`, `workplaceId`, `status`, `payrollStatus`, `page`, `limit` | List business-date timesheets with review and payroll state |
| `GET` | `/api/admin/timesheets/:shiftId` | - | Get detailed shift history, review metadata, and payroll metadata |
| `PATCH` | `/api/admin/timesheets/:shiftId/resolve` | `{ "reviewStatus", "payrollStatus", "reviewNote", "closeOpenShiftAt?", "closeActiveBreakAt?", "payableHours?" }` | Resolve exceptions, set payroll state, and create audit entries |
| `GET` | `/api/admin/timesheets/summary/payroll` | same filters as list | Return filtered payroll readiness and approved/exported totals |
| `GET` | `/api/admin/timesheets/export/csv` | same filters as list | Export filtered timesheets including payroll approval/export columns |

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
3. Login with a valid staff ID / password pair created in your environment
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

## Timesheet payroll workflow

- Review exceptions from the `Timesheets` screen using business-date filters.
- Mark a closed, reviewed shift as `Approved for payroll` when it is ready to leave operations review.
- Mark an already approved shift as `Exported to payroll` after it is sent to payroll.
- Revert a shift to `Pending` if payroll needs it reopened; the audit trail records each transition.

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
