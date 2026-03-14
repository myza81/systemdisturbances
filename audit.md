# Web App Code Audit (Django + React/Vite)

Date: 2026-03-13

## What This App Is Doing (Confirmed Understanding)

This repository implements a power-system disturbance analysis tool:

- Backend: Django + DRF (`backend/`) that ingests disturbance files (COMTRADE .cfg/.dat, CSV, Excel) via HTTP upload, parses them into a common waveform schema, stores the *parsed waveform output* in `DisturbanceRecord` (currently `data_payload` JSON), and serves APIs for listing records, uploading/scanning files, channel metadata, and paginated waveform windows.
- Frontend: React + Vite (`frontend/`) that provides an ingestion flow (scan -> mapping -> upload), a repository list, and a waveform viewer built on ECharts with:
  - window paging (`window_ms`, `page`)
  - per-record channel config (title/color/scale/visible)
  - calculated channels (formula-based)
  - cross-record layering (overlay channels from multiple disturbances)

Target deployment (updated per your clarification):

- Online, multi-user deployment on a web service
- DB: Postgres
- Users: Admin (you) with full control; Guest users can access all UI/UX features (including upload, persist the parsed output within the app scope, and delete those app-scope records)
- Before going online: you want an executable build for beta testers

Important nuance for an "online viewer":

- In a browser-based web app, the file contents necessarily leave the user machine *if you upload to the backend for parsing*. Your current app does exactly that (via `multipart/form-data`).
- What you clarified is: you do not intend to permanently store the original uploaded file on the server; you only keep derived/temporary processing state so users can interact with the waveform.

## Product Constraints (Now Clear)

You clarified the intended service behavior:

- Privacy: uploaded records are private per user (other users cannot list/view/delete them).
- Retention: up to 24 hours, or earlier when the browser is closed.
- Guests can upload and delete (within their own private scope).

Note on "browser is closed": the server cannot reliably know when a browser closes. The practical production pattern is:

- Use a short-lived session identity (cookie-based) with refresh.
- Enforce an inactivity timeout + absolute TTL (e.g. idle 30-60 minutes, absolute 24 hours).
- Best-effort delete on tab close via `navigator.sendBeacon()`/`fetch(..., { keepalive: true })`, but treat this as a hint, not a guarantee.

## How This Audit Was Performed

- Read key backend files: `backend/config/settings.py`, `backend/config/urls.py`, `backend/disturbances/views.py`, parsers in `backend/disturbances/parsers/`, and models/serializers.
- Read key frontend files: `frontend/src/components/features/WaveformViewer.jsx`, ingestion components, and hooks.
- Ran frontend lint and build:
  - `npm -C frontend run lint` (fails with multiple issues; details in findings)
  - `npm -C frontend run build` (succeeds; bundle is very large)
- Backend runtime checks were NOT runnable in this environment because Django isn’t installed in the current Python environment (`python backend/manage.py check` fails with `ModuleNotFoundError: No module named 'django'`).

## Executive Findings (Prioritized)

### P0 (Must Fix Before Multi-User Online Deployment)

1) Security posture is currently "dev-only"

- `backend/config/settings.py` hard-codes `SECRET_KEY`, has `DEBUG=True`, `ALLOWED_HOSTS=['*']`, and `CORS_ALLOW_ALL_ORIGINS=True`.
- No authentication/authorization is implemented for any API.
- Upload endpoints accept arbitrary files without explicit size limits or strong validation.

Impact:

- Online deployment would be vulnerable to trivial abuse (data exfiltration, DOS via huge uploads, cross-origin use, and record deletion).

Fix:

- Split settings into env-based config (dev/staging/prod) and move secrets to environment variables.
- Add identity + authorization + ownership isolation:
  - every disturbance record must have an owner (user id or anonymous session id)
  - list/get/delete/update must enforce "owner-only" (or explicit sharing)
- Add rate limiting + quotas:
  - max upload size, max records per user/session, max concurrent parses
  - per-IP and per-identity throttles
- Add explicit upload constraints (content-type checks, extension checks, server-side size limits).

2) Current storage model is not aligned with "temporary viewer" + will not scale well

- `backend/disturbances/models.py`: `DisturbanceRecord.data_payload = models.JSONField(...)` stores large arrays (`time`, `analog[].values`, `digital[].values`) inside a single row.
- `backend/disturbances/views.py#get_waveform` slices in Python AFTER loading `record.data_payload` from the DB.

Impact:

- Every waveform page request still forces the DB to fetch/decompress the entire JSON field into Django memory.
- Row sizes can become massive (TOAST), read amplification becomes severe, and concurrency suffers.
- Large records will cause slow responses, high memory usage, and poor multi-user performance.
- If you intend short-lived processing state, you still need efficient storage + automatic expiry; Postgres JSON rows are a poor cache for very large arrays.

Fix options (recommended order):

- Recommended (production viewer): treat uploads as ephemeral artifacts with TTL.
  - Store original upload temporarily (object storage or local disk volume) with lifecycle expiry; do not keep forever.
  - Store parsed output in an efficient columnar/binary format (Parquet/Arrow/Zarr) with TTL.
  - Keep Postgres for metadata/ownership/indexes only (small rows), plus pointers to ephemeral artifacts.
  - API reads only the requested window via efficient column reads; do not deserialize full payload per request.
- Alternative: normalize into relational tables (channels table + samples table) BUT this can explode row counts; only viable with careful partitioning/downsampling.
- Add server-side downsampled representations for UI windows (min/max per bucket, LTTB, etc.) so the client never needs raw million-point series for every channel.

Optional privacy-preserving alternative (if you truly want file bytes never to reach your server):

- Parse COMTRADE/CSV/Excel client-side (WASM/JS), render in-browser, and only send optional derived summaries.
- This is a different product shape than the current backend-centric parsing.

3) CPU-heavy RMS computation is implemented with an O(n*window) loop and is also incorrect for paginated windows

- `_compute_rms()` in `backend/disturbances/views.py` computes running RMS by recomputing a segment mean for every sample (nested work).
- In `get_waveform(...mode=rms)`, RMS is computed only over the page slice, which breaks continuity at page boundaries (RMS window should include samples before the page start).
- `get_rms` returns full-record RMS unpaginated, which is a DOS vector for large files.

Impact:

- Large records become extremely slow or time out; concurrent users amplify the problem.

Fix:

- Replace RMS implementation with a vectorized / rolling method: cumulative sum of squares (O(n)) or convolution.
- Compute RMS once at ingest time (background job) and store downsampled overlays.
- Require ownership checks + throttling for expensive endpoints (RMS, full export).

### P1 (Major Performance/Correctness Issues)

4) Frontend ECharts option building duplicates time arrays per channel (high memory + render cost)

- `frontend/src/components/features/WaveformViewer.jsx` `buildChartOption(...)` builds series like:
  - `data: time_ms.map((t, i) => [t, ch.scaledValues[i]])`
- This allocates a new `[t, v]` array for every sample for every channel, every time options are rebuilt.

Impact:

- For N channels and M samples/window, memory and CPU cost is roughly O(N*M) allocations per render.
- With many channels (common in disturbance records), the UI will lag/freezes.

Fix:

- Move downsampling server-side and return fewer points.
- Use ECharts `dataset` to share the time dimension once.
- Precompute and memoize per-channel arrays; avoid re-mapping time on every option rebuild.
- Prefer binary search for hover nearest-index instead of scanning full time array each pointer update.

5) Hard-coded localhost API base breaks real deployment

- `frontend/src/hooks/useWaveformData.js` and `frontend/src/hooks/useSettings.js` use `const API_BASE = 'http://localhost:8000/api/v1'`.
- Other code uses relative `/api/v1` and Vite proxy (`frontend/vite.config.js`).

Impact:

- Deployed web app will call localhost from the user’s browser and fail.

Fix:

- Standardize API base to relative paths (preferred) or `import.meta.env.VITE_API_BASE`.
- Centralize fetch/axios configuration in one client module.

6) COMTRADE trigger time extraction likely incorrect

- `backend/disturbances/parsers/comtrade_parser.py` sets `trigger_time = float(trigger_sample)`.
- In COMTRADE, trigger may be a sample index; you typically map it to time via `time_array[trigger_index]`.

Impact:

- Cursor/time alignment and trigger-centered plotting can be wrong.

Fix:

- Confirm what `python-comtrade` exposes for trigger; convert correctly to seconds.

7) CSV/Excel time parsing can desynchronize time vs signal arrays

- `parse_csv` and `parse_excel` may `dropna()` on time but keep full-length channel value arrays.

Impact:

- Time length may not match values length; later slicing/plotting assumptions can break or silently misalign.

Fix:

- Filter rows consistently (mask rows where time is NaN and apply to all channels), or fill missing times.

### P2 (Best Practices, Maintainability, Dead Code)

8) ESLint currently fails with many errors; several indicate dead code and correctness problems

From `npm -C frontend run lint`:

- Many unused imports/vars (ex: `motion` imported but not used in many components).
- React hooks / effect warnings that can correlate with performance issues.
- `frontend/src/components/features/ColumnMapper.jsx` has a real ordering issue flagged by lint: using `submitMapping` and `initMapping` before declaration.

Fix:

- Make `npm run lint` part of CI and keep it passing.
- Fix the ordering issues and remove unused imports/variables.

9) Very large frontend bundle (slow initial load)

`npm -C frontend run build` output indicates:

- `dist/assets/index-*.js` ~ 1.98 MB minified (658 KB gzip) and triggers chunk-size warnings.

Likely causes: ECharts + XLSX + react-icons + framer-motion shipped in the main chunk.

Fix:

- Code-split heavy features with dynamic imports (WaveformViewer, ColumnMapper/XLSX, ECharts).
- Consider importing only used icon subsets or replacing icon strategy.

10) Dead/broken files and scripts

- `frontend/src/components/features/WaveformChart.jsx` appears unused and calls endpoints that do not exist in the backend.
- `backend/direct_ingest.py` imports `parse_comtrade_in_memory` which does not exist (broken dev script).
- `backend/test_upload.py` posts to `http://localhost:8000/api/disturbances/upload/` but backend routes are under `/api/v1/...` (outdated script).
- `frontend/src/pages/DashboardLayout.module.css.jsx` looks like a React component but is named like a CSS module; likely leftover/unused and confusing.

Fix:

- Remove or relocate dev scripts into a `scripts/` folder and keep them runnable.
- Delete unused components or wire them up.
- Fix misleading filenames.

11) Settings syncing is incomplete / misleading

- `frontend/src/hooks/useSettings.js` defines `syncToBackend()` but it is never called.
- Backend has `/api/v1/settings/` implemented in `backend/disturbances/views.py#app_settings`, but the frontend currently only stores settings in localStorage.

Fix:

- Decide: settings are per-user (store in browser) vs global (store in backend) vs both.
- If syncing to backend is desired, call it with debouncing and proper auth.

12) Repository hygiene issues with local DB

- `backend/data/db.sqlite3` exists, but `.gitignore` only ignores `db.sqlite3` at repo root.

Fix:

- Update `.gitignore` to ignore `backend/data/db.sqlite3` (and any future local db files).

## Backend Detailed Recommendations

### API & Processing Architecture (For Postgres + Multi-User)

- Do not store full waveform arrays in a JSON field.
- Add an ingest pipeline with background jobs:
  - Upload -> store temporarily (TTL) -> enqueue parse job -> return job id
  - Frontend polls job status / uses websocket/SSE for progress
- Cache derived products:
  - downsampled windows per channel
  - RMS/phasor overlays (if required)
  - channel metadata and per-record config

### Ownership + TTL (Required If Guests Can Delete)

- Issue each guest a private identity (recommended: httpOnly, SameSite cookie + server-side session record).
- Add `owner_id` (user id or session id) to `DisturbanceRecord`.
- Add `expires_at` (absolute TTL = 24h) and `last_accessed_at` (for idle expiry) and a cleanup job (cron/Celery beat) to purge expired records and artifacts.
- Ensure every endpoint scopes queries by ownership (including list, get detail, waveform pages, delete).

### Endpoint Hardening

- Add explicit permissions and enforce ownership:
  - Guests: allowed upload/delete, but only their own records (or within their anonymous session scope)
  - Admin: can manage and inspect across scopes (optional)
- Add request size limits and upload limits (Django/DRF + reverse proxy).
- Validate file types, reject unknown formats, sanitize filenames.
- Replace `print(...)` debugging with `logging`.

### Performance Hotspots to Fix First

- `backend/disturbances/views.py#_compute_rms` (algorithmic change)
- `backend/disturbances/views.py#get_waveform` (data storage redesign; avoid loading full payload)
- `backend/disturbances/views.py#get_rms` (remove/paginate/protect)

## Frontend Detailed Recommendations

### Performance

- Rework ECharts data feeding to avoid allocating `[t, v]` arrays per channel per render.
- Replace linear nearest-index scans with binary search (time array is sorted).
- Add caching for waveform windows (same page/window requested repeatedly).

## Symptoms You Reported + Root Causes (Rendering Slowness)

You reported that the UI becomes slow when:

- Displaying waveforms with many channels
- Switching tabs (Raw Waveform <-> Channel Layering)
- Toggling Instantaneous <-> RMS
- Moving cursors A/B

These symptoms align strongly with structural CPU/memory hotspots in the current implementation, not primarily with "computer limitations".

### Frontend Root Causes

1) Full option rebuild on cursor/mode changes

- `frontend/src/components/features/WaveformViewer.jsx` rebuilds the full ECharts option via `buildChartOption(...)` and calls `chart.setOption(option, { notMerge: true })` in effects.
- `buildChartOption(...)` does expensive work:
  - Per-channel scaling: `values.map(v => v * scale)`
  - Per-channel `[x,y]` pair construction: `time_ms.map((t,i) => [t, y[i]])`
- When `cursors` change (moving A/B), this triggers option rebuild even though only the cursor overlay needs updating.

Impact:

- For N channels and M samples per page, cursor movement can induce O(N*M) allocations and heavy garbage collection.

2) Cursor nearest-index lookup is O(M) per event

- Cursor placement computes the nearest index by scanning every value in `time_ms` to find min difference.

Impact:

- With high sampling rates and larger windows, this adds measurable latency per click/move.

3) Tab switch to layering multiplies the work

- Layering uses a separate chart instance and builds its own option.
- Layering may fetch additional waveform pages for external disturbance IDs in `layeringGroups`.

Impact:

- Switching to Channel Layering can cause both network overhead and a large series rebuild.

### Backend Root Causes (RMS)

4) RMS computation is algorithmically expensive

- `backend/disturbances/views.py#_compute_rms` is O(n*window) (recomputes mean of a segment for each sample).
- `get_waveform(...mode=rms)` computes RMS per channel slice on demand.

Impact:

- Toggling RMS on large pages/many channels is slow and scales poorly with concurrent users.

5) RMS continuity is incorrect across pages

- RMS is computed only within the page slice, so values near the beginning of a page do not include samples before the page boundary.

Impact:

- Visually and numerically inconsistent RMS when paging.

## Solutions (Keep Full Precision; No Downsampling)

Your constraint is that downsampling is not acceptable for the main waveform view. The following improvements keep the exact samples while reducing render churn.

### Frontend Solutions

1) Update cursors without rebuilding all series

- Keep the series data stable for a given page.
- When `cursors` change, update only cursor overlays (e.g., `markLine` or `graphic`) via a minimal `setOption` call.
- Avoid `notMerge: true` for cursor updates.

Expected win:

- Cursor A/B movement becomes near-instant even with many channels.

2) Stop allocating `[x,y]` pairs for every series

- Switch to an x-axis that does not require repeating x values in every series.
  - Option A: `xAxis.type = 'category'` with `xAxis.data = time_ms` once; series `data` is only the Y array.
  - Option B: use `dataset` to share the time axis and reference by encode.

Expected win:

- Large reduction in allocations and garbage collection; faster tab switching and mode toggles.

3) Cache scaled channel values per page

- Precompute `scaledValues` once per fetched page and config change.
- Do not recompute scaled values on cursor movement or hover.

4) Replace linear nearest-index scan with binary search

- `time_ms` is sorted; use binary search to find the nearest index in O(log M).

5) Reduce re-renders from effects

- Many state/effect dependencies currently cause repeated chart `setOption`.
- Tighten dependencies and separate effects:
  - One effect for data/page changes (rebuild series)
  - One effect for cursor changes (cursor overlay only)
  - One effect for theme/config changes (style updates)

### Backend Solutions (RMS)

6) Replace `_compute_rms` with O(n) rolling RMS

- Use cumulative sum of squares:
  - `s2[i] = sum(arr[:i]^2)`; rms at i is derived from `s2[i] - s2[i-window]`.
- Or use convolution/stride tricks; keep it vectorized.

7) Fix RMS continuity across pages

- When serving a page, include a pre-roll of `window-1` samples before `start_idx` for RMS calculation, then return only the page portion.

8) Cache RMS results

- Cache RMS per record/channel/mode/window parameters for the TTL duration (in memory cache like Redis).
- Or precompute RMS once during ingest in a background job.

## Diagnostic Steps (To Confirm Bottlenecks)

If you want to confirm exactly where time is spent:

- Browser: Chrome DevTools Performance + Memory; look for long scripting tasks and frequent GC during cursor moves or mode toggles.
- Track allocations: when series data is rebuilt, expect large array churn.
- Backend: add request timing + per-endpoint logging; RMS endpoints will show disproportionate CPU.

### Deployment correctness

- Replace hard-coded API base URLs with relative `/api/v1` or env-based configuration.
- Standardize on one HTTP client and error-handling approach.

### Code quality

- Fix all ESLint errors and keep lint passing.
- Remove dead components (`frontend/src/components/features/WaveformChart.jsx`) or align it to real endpoints.
- Clarify the duplicated dashboard layout files (`frontend/src/pages/DashboardLayout.jsx` vs `frontend/src/pages/DashboardLayout.module.css.jsx`).

## Suggested Implementation Roadmap

### Phase 1 (Stabilize + Secure) - 1 to 3 days

- Add identity (anonymous session tokens or real login), ownership isolation, and remove dev settings from production.
- Fix API base URLs in frontend.
- Enforce delete/list scoping (guests can delete only their own records).
- Fix ESLint errors so CI can enforce quality.

### Phase 2 (Scale the Data Model) - 1 to 2 weeks

- Move waveform storage out of `JSONField`.
- Add background ingestion jobs.
- Add downsampling strategy and return downsampled points by default.

### Phase 3 (UX Performance + Desktop Beta Packaging) - 1 to 2 weeks

- Code-split heavy UI modules.
- Optimize ECharts feeding and hover computations.
- Decide the executable strategy:
  - Desktop app (Electron/Tauri) embedding the frontend, calling a packaged backend service
  - Or a single packaged server (PyInstaller) + local browser access

## Quick Wins Checklist (Low Risk)

- Fix `API_BASE` hard-coding: `frontend/src/hooks/useWaveformData.js`, `frontend/src/hooks/useSettings.js`.
- Remove/rename `frontend/src/pages/DashboardLayout.module.css.jsx`.
- Delete or fix outdated scripts: `backend/test_upload.py`, `backend/direct_ingest.py`.
- Update `.gitignore` for `backend/data/db.sqlite3`.

## Notes / Evidence (Tool Output)

- Frontend build succeeds but produces a large main chunk (~1.98MB minified): `npm -C frontend run build`.
- Frontend lint currently fails with 45 errors and 3 warnings: `npm -C frontend run lint`.
