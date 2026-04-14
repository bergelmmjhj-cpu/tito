# TITO Architecture Audit

Date: 2026-04-14
Scope: production-grade architecture audit of the Hotel Staff Time Clock application before phased implementation.

## Executive Summary

TITO is already stronger on the backend than it is on the frontend. The server is largely organized into routes, controllers, services, models, middleware, db, and utils, and it already supports session auth, optional Google OAuth, workplace geofencing, admin timesheet review, payroll approval, immutable payroll export batches, and pay period locking.

The frontend is in a transitional state. The committed application still relies on a large unified client built from `client/index.html`, `client/app.js`, and `client/style.css`, while the current worktree also contains a newer split-UI draft under `client/admin/` and `client/worker/`. That draft is the correct direction, but it is not yet a complete production-ready replacement for the legacy client.

The highest-value implementation strategy is to keep the current backend structure, complete the admin/worker UI separation, harden the admin dashboard, then add workplace auto-detection plus CRM address normalization, and finally deliver the exception and reporting pages.

## Current Repository Layout

### Frontend

Primary client structure:

- `client/index.html` - unified login page and legacy app shell
- `client/app.js` - large mixed client for auth, worker clock, admin tabs, geolocation, timesheets, and payroll
- `client/style.css` - shared styling for the legacy unified client

Current split-UI draft present in the worktree:

- `client/admin/index.html`
- `client/admin/admin.css`
- `client/admin/admin-dashboard.js`
- `client/admin/admin-users.js`
- `client/admin/admin-timesheets.js`
- `client/admin/admin-workplaces.js`
- `client/admin/admin-exceptions.js`
- `client/admin/admin-reports.js`
- `client/worker/index.html`
- `client/worker/worker-clock.js`
- `client/worker/worker.css`

### Backend

Server structure under `server/src/`:

- `routes/` - Express route registration
- `controllers/` - HTTP handlers and response formatting
- `services/` - business rules and orchestration
- `models/` - persistence and normalization logic
- `middleware/` - auth, role, and rate limiting
- `db/` - PostgreSQL pools, schema, migrations, initialization
- `utils/` - auth, errors, passwords, and time helpers

## Frontend Architecture

### 1. Entry Points And Routing Behavior

There are effectively three frontend entry points in the repository today.

1. `client/index.html`
   - Acts as the current root launcher.
   - Contains the login experience and a hidden legacy shell for both worker and admin UI sections.
   - Still depends on `client/app.js` and `client/style.css`.

2. `client/admin/index.html`
   - Newer admin-only dashboard shell.
   - Intended to be the dedicated admin destination after login.
   - Uses a management-dashboard layout rather than the worker clock layout.

3. `client/worker/index.html`
   - Newer worker-only clock page.
   - Intended to be the dedicated worker destination after login.
   - Focused on clock actions, current status, location, and history.

The split-UI draft is directionally correct, but the committed app still relies on the legacy monolith. The current worktree includes local redirect changes in `client/app.js` that try to send admins to `/admin/` and workers to `/worker/`, but those changes have not been fully integrated into a complete production flow yet.

### 2. Legacy Unified Client

The legacy client is concentrated in `client/app.js`, which currently handles:

- login and signup
- session restore
- worker time clock actions
- geolocation capture and map preview
- history rendering
- workplace management UI
- admin user management UI
- admin timesheet and payroll UI

This produces several architecture problems:

- mixed responsibilities in one file
- duplicated state transitions for worker and admin concerns
- hidden-section rendering instead of clean page separation
- complicated onboarding for future changes

### 3. Admin Rendering And Tab Switching

The legacy admin experience uses section toggling inside the unified client. The split admin draft uses a dedicated admin page with tabbed navigation and per-tab JavaScript modules.

Current admin responsibilities already covered somewhere in the client stack:

- dashboard KPIs
- user and role management
- worker workplace assignments
- timesheet review and payroll actions
- payroll export listing and detail
- reports and CSV exports

The split admin draft is preferable because it separates concerns by page and by module, but some modules still depend on backend endpoints or route wiring that are only partially present.

### 4. Worker Rendering

The worker flow is simpler and closer to production quality. The split worker page is focused on:

- current time
- current attendance status
- clock in
- start break
- end break
- clock out
- location capture and refresh
- history table

That is the right product direction for hotel staff, especially for non-technical users.

### 5. CSS Organization

There are three styling layers today:

- `client/style.css` for the legacy mixed client
- `client/admin/admin.css` for the split admin dashboard
- `client/worker/worker.css` for the split worker UI

The split styles are an improvement because they stop forcing admin and worker interfaces into the same visual language. The remaining issue is duplication of helper tokens and UI primitives across stylesheets.

## Backend Architecture

### 1. Server Startup And Runtime

`server/index.js` is the application entry point. It is responsible for:

- environment startup logging
- database initialization
- CRM pool initialization
- optional Google OAuth initialization
- bootstrap admin setup
- static asset serving
- route registration
- health endpoint exposure

Deployment expectations are already aligned with Railway and PostgreSQL. The app also supports a development JSON fallback when `DATABASE_URL` is missing outside production.

### 2. Route Structure

Main route groups:

- `authRoutes.js` - registration, login, logout, Google auth, auth options, current user
- `timeRoutes.js` - worker clock actions, current status, and history
- `adminRoutes.js` - admin access, users, workers, timesheets, payroll, pay periods
- `workplaceRoutes.js` - local workplace CRUD and listing
- `crmRoutes.js` - CRM-backed workplace or hotel reads
- `legacyRoutes.js` - backward-compatible older endpoints

### 3. Controller Layer

Controllers are thin and generally well-structured. They:

- parse request inputs
- call service functions
- translate domain errors through `toHttpError`
- log structured failures with route context

This layer is already close to the desired production structure.

### 4. Service Layer

The service layer is where most application rules live.

Important service areas:

- `authService.js` - worker registration, login, session issuance, token-to-user lookup
- `sessionService.js` - session persistence with PostgreSQL and memory fallback
- `workplaceService.js` - workplace CRUD and behavior around geofencing data
- `geofenceService.js` - nearest workplace and geofence calculations
- `adminTimesheetService.js` - admin timesheet filtering, review flow, payroll summary, payroll exports, pay periods
- `adminBootstrapService.js` - bootstrap admin creation and synchronization

The backend does not need a broad structural rewrite. It needs targeted cleanup as features are expanded.

### 5. Model Layer

Models already encapsulate normalization and persistence for both PostgreSQL and JSON fallback. Important model files include:

- `userModel.js`
- `workplaceModel.js`
- `timeLogModel.js`
- `payrollExportBatchModel.js`
- `payrollPeriodModel.js`
- `crmWorkplaceModel.js`
- `crmHotelModel.js`

This is already close to the backend structure requested for phase 9.

### 6. Middleware

Current middleware is focused and appropriate:

- `authMiddleware.js` - bearer token parsing and session lookup
- `roleMiddleware.js` - admin role enforcement
- `rateLimitMiddleware.js` - login and auth endpoint throttling

## Auth And Session Flow

### Worker And Admin Login

Current login is handled through the auth API and bearer tokens.

- Sessions are stored in PostgreSQL when available.
- In JSON fallback mode, session behavior degrades to in-memory storage.
- Google OAuth exists as an optional auth path but must remain preserved.

### Session Restore

Session restore currently depends on token presence in local storage plus `GET /api/auth/me` or equivalent status checks. The current split-UI draft moves toward role-based destination routing after auth, which aligns with the product requirement.

## Workplace And CRM Logic

### Local Workplaces

Local workplaces store:

- hotel or workplace name
- address and contact metadata
- latitude and longitude
- geofence radius
- optional time zone
- active flag

### CRM Data

CRM integration is read-only and uses a separate database pool. The app normalizes CRM records into Tito's internal workplace shape rather than requiring a single fixed CRM schema.

This area still needs work because blank address fields indicate incomplete field normalization or insufficient fallbacks for:

- city
- province or state
- country
- postal code
- address line fields

### Auto-Detection Foundation

The codebase already has the right primitives for automatic workplace detection:

- worker GPS capture at clock-in
- nearest-workplace calculation
- geofence radius matching
- review flags for unresolved or out-of-radius cases

Phase 4 should build on `geofenceService.js`, `timeLogModel.js`, and CRM normalization rather than starting from scratch.

## Timesheet, Payroll, And Review Logic

The app has already evolved beyond a basic time clock.

Current supported concepts include:

- closed versus open shifts
- breaks and missing break-end detection
- review status on shifts
- review notes and admin audit actions via time logs
- payroll status on shifts: pending, approved, exported
- immutable payroll export batches
- batch reopen and batch reissue lifecycle
- explicit payroll periods with open or locked states

This is the right base for building:

- a dedicated exception page
- payroll reporting
- hotel-level hour summaries

## Database Structure

### Primary Application Tables

Current PostgreSQL schema includes at least these core tables:

- `users`
  - identity, role, email, staff id, password fields, Google identity fields, active flag

- `workplaces`
  - name, address metadata, coordinates, radius, time zone, CRM metadata, active flag

- `user_workplace_assignments`
  - user-to-workplace assignment mapping

- `shifts`
  - clock-in/out timestamps, business date, business time zone, actual hours, payable hours, review state, payroll state, payroll export batch reference

- `breaks`
  - per-shift break intervals

- `time_logs`
  - immutable action history including worker actions and admin review or payroll actions

- `sessions`
  - bearer token sessions with expiry

- `payroll_export_batches`
  - immutable batch snapshots, CSV payload, row snapshots, lifecycle status, replacement links, period link

- `payroll_periods`
  - period label, date range, open or locked status, actor metadata

### CRM-Linked Data

CRM-linked tables are not owned by the main application schema. Instead, they are read from the external CRM database through dedicated models and normalized into Tito's shape.

### JSON Fallback

The JSON fallback mirrors the major application data concepts and is migrated through `server/src/db/migrations.js`. This is useful for development but adds operational complexity.

## Current Product Flows

### Worker Login Flow

1. User opens root login page.
2. User authenticates with credentials or optional Google flow.
3. Token is stored client-side.
4. Session restore checks user role.
5. Intended steady-state destination is worker UI at `/worker/`.

### Admin Login Flow

1. Admin opens root login page.
2. Admin authenticates with credentials.
3. Token is stored client-side.
4. Session restore checks role.
5. Intended steady-state destination is admin UI at `/admin/`.

### Clock In And Clock Out Flow

1. Worker session loads current status.
2. GPS location is requested or refreshed.
3. Worker clocks in.
4. Backend creates a shift and a time log entry.
5. Geofence evaluation resolves the workplace or marks review flags.
6. Worker can start break, end break, and clock out.
7. Backend computes actual hours and payable hours.

### Timesheet Flow

1. Admin filters timesheets by date, worker, workplace, review status, payroll status, and now pay period.
2. Admin opens shift detail.
3. Admin reviews exceptions, closes missing state, adjusts payable hours if needed, and updates payroll status.
4. Approved shifts become export candidates.

### Workplace Management Flow

1. Admin lists workplaces.
2. Admin creates or edits local workplace records.
3. Admin assigns workers to workplaces.
4. CRM workplace data may also be surfaced for lookup and matching.

## Major Risks And Upgrade Targets

### 1. Frontend Split Is Incomplete

The current split-UI draft should be used, but not committed blindly. The worker side looks close to usable. The admin side still has backend-wiring risk and duplicate infrastructure.

### 2. Legacy Monolith Is Still Active

`client/app.js` is still too large and too mixed. Normal production use should stop depending on hidden admin and worker sections inside the root page.

### 3. Admin And Worker Experiences Are Too Similar In The Legacy App

This is a direct usability problem and should be solved in phase 2 with a fully separated admin dashboard versus worker clock UI.

### 4. CRM Field Mapping Needs Hardening

Blank city, state, and country fields strongly suggest incomplete normalization or fallback coverage in the CRM-to-workplace mapping path.

### 5. Exception Review UI Is Not Yet A First-Class Page

The backend already has enough review signals to support a production-grade "Shifts That Need Review" page. The dedicated page and action set still need to be finished and standardized.

### 6. Reporting Exists Only Partially

CSV exports are present in places, but a dedicated reports page and a clear export surface still need to be completed.

## Recommended Phase Execution

### Commit 1 - Audit And Architecture

Deliver this dedicated architecture audit document only.

### Commit 2 - Admin And Worker UI Separation

Build on the existing split-UI draft under `client/admin/` and `client/worker/`, but harden it before commit. Keep `client/index.html` as the launcher, not the full application shell for steady-state usage.

### Commit 3 - Admin Dashboard

Make the dashboard the default admin landing view with clear KPI cards and management-oriented wording.

### Commit 4 - Workplace Auto-Detection And CRM Normalization

Finish nearest-workplace clock-in assignment and fix address normalization gaps from CRM.

### Commit 5 - Exceptions And Reports

Deliver the dedicated review page and reports page using the current timesheet and payroll foundation.

## Decision Record

Implementation decisions for this upgrade:

- Build on the current local split-UI draft instead of discarding it.
- Keep the phase-1 artifact as a dedicated architecture document.
- Preserve Railway deployment, PostgreSQL, CRM integration, Google login, payroll periods, and payroll export lifecycle behavior.
- Prefer targeted cleanup over a risky broad backend rewrite, because the backend structure is already close to the desired target state.