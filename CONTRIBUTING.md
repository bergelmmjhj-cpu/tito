# How to Request Changes

This guide explains how to ask Copilot to make changes to this repository.
Describe what you want, where it should go, and what "done" looks like — the more
specific you are, the better the result.

---

## What to include in a change request

### 1. Scope — which files or areas

Name the specific file(s) or layer you want changed. Examples:

| Layer | Examples |
|-------|---------|
| Frontend page | `client/index.html`, `client/app.js`, `client/style.css` |
| Admin page | `client/admin/` |
| Backend route | `server/src/routes/timeRoutes.js`, `server/src/routes/legacyRoutes.js` |
| Controller | `server/src/controllers/timeController.js` |
| Service / business logic | `server/src/services/timeService.js` |
| Data model | `server/src/models/timeLogModel.js` |
| Shared utilities | `server/src/utils/` |
| Server entry point | `server/index.js` |

### 2. Behavior — what it should do

Describe the exact input, the expected output, and any edge cases. Use short bullet
points or numbered steps.

### 3. Acceptance criteria — how to test that it's done

Write the steps you will follow to verify the change works. This helps ensure the
right thing is built.

### 4. Constraints — what NOT to change

State anything that must stay the same. For example:
- "Keep in-memory / JSON storage — no database changes"
- "Don't add new npm packages"
- "Don't touch the admin panel"

---

## How to reference existing code

Copy the relevant file path and, if helpful, a short excerpt of the existing code you
want modified. For example:

> In `server/src/services/timeService.js`, the `performAction` function currently only
> accepts `clock_in`, `break_start`, `break_end`, `clock_out`. I want to add a new
> `overtime_start` action that behaves the same way as `clock_in` except it sets
> `isOvertime: true` on the record.

Providing the function name, the file, and the current behavior is usually enough.

---

## How to request a PR

Add one of these phrases to your change request:

- **"Make these changes and open a PR."** — Copilot will commit the changes to a new
  branch and open a pull request against `main`.
- **"Open a PR from branch `your-branch-name` into `main`."** — Specifies the branch
  name you want used.

---

## Copy-paste change-request template

```
## What I want changed

**Files / area:** 
<!-- e.g. server/src/services/timeService.js -->

**Behavior I want:**
<!-- Describe the new or changed behavior step by step -->
1. 
2. 
3. 

**What currently happens (if this is a fix):**
<!-- Describe the current broken/unwanted behavior -->

**Acceptance criteria — I'll verify by:**
<!-- e.g. "POST /clock-in with valid body returns 201 with clockInAt set" -->
1. 
2. 

**Constraints (do NOT change):**
<!-- e.g. "Keep JSON file storage, don't add new dependencies" -->
- 

**Open a PR?** yes / no
**Branch name (optional):** feature/
```

---

## Quick examples

### Small UI tweak

> In `client/index.html` and `client/style.css`, add a **Clear** button below the
> Status area that resets the status text to "Ready." and the Logs area to "(none)".
> Don't change the backend. Open a PR.

### Backend behavior change

> In `server/src/services/timeService.js`, include `durationMinutes` in the
> clock-out response (difference between `clockInAt` and `clockOutAt`, rounded to
> one decimal). Keep JSON storage. Don't add new packages. Open a PR.

### End-to-end new feature

> Add a **Shift History** tab to the worker page (`client/index.html`, `client/app.js`,
> `client/style.css`) that calls `GET /api/time/shifts` and renders each shift as a
> table row: date, hotel, clock-in time, clock-out time, duration. No new backend
> routes needed — the endpoint already exists. Open a PR from branch
> `feature/shift-history-tab`.
