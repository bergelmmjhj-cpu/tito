# Phase 1 Audit And Implementation Plan

Date: 2026-04-15
Repository: TITO (Hotel Staff Time Clock)

## Architecture Summary

### Frontend
- The project has split entry points for worker and admin experiences:
  - `client/worker/index.html` + `client/worker/worker-clock.js` + `client/worker/worker.css`
  - `client/admin/index.html` + `client/admin/*.js` + `client/admin/admin.css`
- Root login remains at `client/index.html`, then redirects by role to `/worker/` or `/admin/`.
- Worker flow is action-centric (clock in/out, break start/end, location, history).
- Admin flow is management-centric (dashboard, staff, timesheets, hotels, exceptions, reports).

### Backend
- Startup in `server/index.js` initializes database, CRM pool, Google auth, bootstrap admin, static serving, and route registration.
- Layered architecture exists and is used consistently:
  - `routes/` -> `controllers/` -> `services/` -> `models/` -> `db/`
- Auth/session flow uses token sessions backed by PostgreSQL with JSON fallback.
- Time clock and timesheet logic are centralized in services (`timeService`, `adminTimesheetService`).

### Database
- PostgreSQL schema in `server/src/db/schema.js` includes:
  - `users`, `workplaces`, `user_workplace_assignments`, `shifts`, `breaks`, `time_logs`, `sessions`
  - `payroll_periods`, `payroll_export_batches`
- Schema supports geofence metadata, payroll lifecycle, and audit logs.

### Existing Functional Coverage
- Worker/admin UI split: implemented.
- Dashboard KPIs: implemented.
- Automatic workplace resolution at clock-in (assigned or nearest): implemented.
- CRM workplace normalization with city/state/country fallbacks: implemented.
- Exception review page: implemented but needed additional rule coverage.
- Reports page: implemented but worker/hotel/payroll exports needed dedicated endpoints and shaping.

## Gap Analysis
- Missing/partial before this phase implementation:
  - Exception detection did not include duplicate shifts, suspicious short shifts, or over-16-hour shifts.
  - Reports reused generic timesheet CSV for worker/hotel summaries.
  - Payroll report in reports tab created a payroll batch instead of a direct cutoff export.
  - Exception resolve UX labels/actions were less explicit for non-technical users.

## Implementation Plan

### Commit 1 - Audit + Architecture
- Add this audit artifact and phase roadmap.

### Commit 2 - Admin/Worker Separation Hardening
- Keep split admin and worker modules as canonical.
- Remove remaining confusing wording in admin controls and keep dashboard management-focused.

### Commit 3 - Dashboard And Usability Polish
- Maintain dashboard as default admin landing.
- Keep KPI cards large and labels plain-language.
- Ensure obvious action affordances for non-technical staff.

### Commit 4 - Exception Engine + Workplace Workflow
- Extend exception detection for:
  - Duplicate shifts
  - Suspicious short shifts
  - Over-16-hour shifts
- Keep close shift and note workflow explicit.

### Commit 5 - Exceptions + Reports Completion
- Add dedicated report endpoints and CSV shaping for:
  - Daily attendance
  - Payroll cutoff
  - Worker hours summary
  - Hotel hours summary
- Wire reports UI to dedicated endpoints.

### Commit 6 - Admin View Navigation Simplification
- Replace admin tab-style semantics with clearer view-style navigation.
- Add URL query-backed view routing (`?view=`) with browser back/forward support.
- Preserve lazy module initialization and section state while navigating.

### Commit 7 - Login Access Clarity Hardening
- Add explicit `Login Page` shortcut controls in admin and worker headers.
- Reduce user confusion when landing on shell routes by providing immediate path back to root sign-in.

### Commit 8 - Build Fingerprint Verification
- Add visible build fingerprint badges on login, admin, and worker shells.
- Improve runtime diagnostics by making it obvious whether users are seeing this repository's latest UI build.

## Risk Notes
- Current worktree already includes a restoration of production entrypoint files after a prior regression merge; those changes remain staged as baseline and should be reviewed together with phase commits.
- Runtime verification requires Node/npm environment; static diagnostics pass in-editor.
npm install
npm --prefix server install
npm start
