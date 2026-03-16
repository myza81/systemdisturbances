# Implementation Plan (Faster, Smoother Rendering; No Downsampling; Features Preserved)

Constraint: keep all samples (no downsampling) and keep current UI/UX and user flow. If any step would change UI/UX (even slightly), it is explicitly called out before implementation.

## Phase 0 - Baseline + Guardrails (1 session)

Goal: measure where time goes and prevent regressions.

- Add a lightweight performance toggle (dev-only) to log:
  - time spent in `buildChartOption` / `buildLayeringOption`
  - duration of `chart.setOption`
  - number of channels * samples per page
- Add a "Perf budget" checklist (manual):
  - cursor placement latency target (e.g. < 30ms)
  - tab switch raw<->layering target (e.g. < 200ms with typical record)
  - RMS toggle target (e.g. < 500ms for typical page)

Verification:

- Record 2-3 representative files (small/medium/large). For each, capture timings before changes.

UI/UX impact: none.

## Phase 1 - Frontend Rendering Hotspots (Largest Win; No UI Changes) (2-4 sessions)

Goal: eliminate unnecessary O(channels*samples) work when interacting (cursors, hover, mode toggle).

### 1.1 Decouple cursor updates from full series rebuild

Current: cursor changes trigger full option rebuild; each rebuild recomputes `scaledValues` and reconstructs `[x,y]` pairs.

Work:

- Split chart updates into separate effects:
  - Data effect: rebuild full option only when page/window/data/config/theme changes.
  - Cursor effect: update only cursor overlay when `cursors` changes.
- Implement cursor overlay updates with a minimal `setOption`:
  - update `series[].markLine.data` OR use top-level `graphic` vertical lines.
- Avoid `notMerge: true` for cursor-only updates.

Verification:

- With many channels, moving cursor A/B should not cause spikes in GC or long scripting tasks.

UI/UX impact: none (same cursors, same visuals).

### 1.2 Replace linear nearest-index search with binary search

Current: nearest index is found by scanning `time_ms` for every hover and cursor placement.

Work:

- Implement `nearestIndex(time_ms, x)` via binary search (O(log n)).
- Use it in:
  - raw chart `updateAxisPointer` handler
  - calculated chart `updateAxisPointer` handler
  - `getValuesAt()` cursor readouts
  - layering hover handler (for primary and each external record)

Verification:

- Hover readout stays responsive even for larger windows.

UI/UX impact: none.

### 1.3 Stop rebuilding per-point `[x,y]` arrays for every channel

Current: `data: time_ms.map((t,i)=>[t,y[i]])` per channel creates huge allocation churn.

Work (preferred, zero-feature-loss approach):

- Switch raw + calculated charts to use a shared x-axis without duplicating x per series.
  - Option A (simplest): `xAxis.type = 'category'`, set `xAxis.data = time_ms`, each series `data = scaledValues`.
  - Keep axis label formatting to still display `ms`.
- Keep precision: no resampling; every y value is still plotted.

Verification:

- Compare plotted samples at random indices (same values at same time labels).
- Confirm cursor placement maps to correct `time_ms` index.

UI/UX impact: should be visually identical. If you notice any axis/tooltip behavior difference, we will call it out before landing the change.

### 1.4 Cache scaled arrays per page/config

Current: `scaledValues = values.map(v => v * scale)` runs inside `buildChartOption`.

Work:

- Precompute `scaledValues` when data arrives or when scale config changes.
- Store cached results keyed by `(recordId, page, window_ms, mode, channelName, scale)`.
- Ensure cache is cleared on page/window/mode change or record change.

Verification:

- CPU profile shows `scaledValues` computation no longer dominates interactive events.

UI/UX impact: none.

### 1.5 Throttle hover updates (without losing sample precision)

Current: `updateAxisPointer` can fire frequently; each call builds a big `newVals` object.

Work:

- Throttle hover handler to at most 30-60 Hz using `requestAnimationFrame`.
- Only recompute hovered values when the nearest index changes.

Verification:

- Hover readout remains accurate (always matches the nearest sample), but doesn’t stutter.

UI/UX impact: none.

### 1.6 [DONE] Fix ECharts Graphic TypeError (`__ec_inner`)

Current: Rapidly updating or removing `graphic` elements (cursors/crosshair) can trigger a TypeError in ECharts' transition engine.

Work:
- Disable transitions for all `graphic` elements by setting `transition: []`.
- Add `isDisposed()` checks before any chart interaction.
- Ensure unique/stable `id`s for all graphic elements.

Verification:
- Dragging cursors rapidly for 10+ seconds should not trigger any console errors.

UI/UX impact: none (visuals stay same, just more stable).

## Phase 2 - Layering View Performance (Keep Features; No UI Changes) (2-5 sessions)

Goal: make Raw<->Layering tab switching smooth and layering interactions fast.

### 2.1 Avoid full rebuilds when only cursors change

- Same approach as Phase 1.1, applied to `buildLayeringOption` and `layeringChartInstance`.

### 2.2 Reduce redundant external fetches and recomputes

Current state: you added cache invalidation on page/window/mode changes (good), but the effect depends on `crossFileData` and can re-run often.

Work:

- Track in-flight fetches per external ID to avoid duplicate requests.
- Only re-render layering chart after all required external pages are present (or render incrementally but avoid repeated full option rebuild).

### 2.3 Limit layering data duplication

- Layering often has fewer channels than raw view; keep `[x,y]` pairs here if offsets require it.
- Still apply caching:
  - memoize shifted-time arrays per `(extId, offsetMs, page)`.
  - do not rebuild series for unchanged groups.

Verification:

- Switching to layering doesn’t freeze even with a larger raw record.

UI/UX impact: none.

## Phase 3 - RMS Performance + Correctness (Backend) (1-3 sessions)

Goal: RMS toggle becomes fast and RMS is correct across page boundaries.

### 3.1 Replace `_compute_rms` with O(n) rolling RMS

- Implement rolling RMS using cumulative sum of squares (vectorized numpy).
- Avoid Python loops over every sample.

### 3.2 Fix page-boundary continuity

- For `get_waveform(...mode=rms)`, compute RMS using a pre-roll of `window-1` samples before `start_idx`, then return only the requested page slice.

### 3.3 Cache RMS results for the session TTL

- Cache per `(recordId, channel, page, window_ms, frequency, sample_rate)`.
- For multi-user production, use Redis (or in-process cache for beta).

Verification:

- RMS page 2 start values match what you would get computing RMS over the full record.
- Toggle instantaneous<->RMS repeatedly: second toggle is near-instant due to cache.

UI/UX impact: none.

## Phase 4 - Production-Grade Session Privacy + TTL (Backend/API) (2-6 sessions)

Goal: guest uploads are private per user/session, expire automatically, and do not leak across users.

- Add server-side guest session identity (httpOnly cookie).
- Add ownership scoping to every record query (list/detail/waveform/channels/delete/config).
- Add TTL fields and cleanup job:
  - absolute TTL 24h
  - optional idle timeout (e.g. 60 minutes)
- Implement best-effort "close browser" cleanup with keepalive/beacon, but rely on TTL as the guarantee.

Verification:

- Two browsers/incognito sessions cannot see each other’s records.
- Expired records are purged.

UI/UX impact: none (unless you want a visible session indicator; not required).

## Phase 5 - Quality + Packaging Readiness (parallel, ongoing)

Goal: keep the codebase maintainable while optimizing.

- Fix ESLint errors and keep `npm -C frontend run lint` passing.
- Add CI checks (lint + build).
- Document performance targets and how to profile.
- For executable beta: decide packaging strategy (Electron/Tauri vs packaged backend + browser).

Verification:

- `npm -C frontend run build` still succeeds.
- Lint passes.

## Deliverables Checklist

- Phase 0: baseline perf logs + representative test cases
- Phase 1: cursor/hover fast path + no `[x,y]` rebuild churn for raw/calculated
- Phase 2: layering fast path + stable caching
- Phase 3: RMS O(n) + continuity + caching
- Phase 4: private sessions + TTL cleanup
- Phase 5: lint/CI + packaging notes
