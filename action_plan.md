# Action Plan: Channel Layering + Reference Lines

This file tracks the rectification and refinement plan for the Channel Layering + Custom Reference Lines feature.

We will address each item here one by one in later passes.

---

## 1. Scope and Responsibilities

- Keep reference lines as a **front‑end only** concern for now.
  - Use existing backend endpoints only:
    - `GET /api/v1/disturbances/<id>/channels/` for channel metadata.
    - Existing waveform/window endpoints via current hooks.
  - No changes to Django models/serializers/views in this phase.
- If persistence is required later, add a dedicated subsection for a small REST API and a JSON field on `DisturbanceRecord` (e.g. `reference_line_config`).

**Planned actions**
- [ ] Confirm there are no unused or experimental backend endpoints added for reference lines.
- [ ] Design (but not yet implement) a minimal persistence API shape for future use.

---

## 2. Correct View Scoping

Reference line UI and overlays must live **only** in the Channel Layering view.

Current status:
- `ReferenceLineControlPanel` is rendered only inside `view === 'layering'`.
- Raw and Calculated charts no longer render reference lines or intersection markers.

**Planned actions**
- [ ] Re‑scan `WaveformViewer.jsx` to ensure:
  - No `ReferenceLineRenderer.render` calls in Raw/Advanced paths.
  - No `IntersectionCalculator`/`IntersectionDisplay` usage outside layering.
- [ ] Manually verify in the UI that switching tabs hides the panel and overlays outside Channel Layering.

---

## 3. Layering Chart Integration

The layering chart uses a multi‑grid layout via `buildLayeringOption`. Reference lines must respect that layout.

Risks:
- Current `ReferenceLineRenderer` assumes a **single grid** (`option.grid[0]`).
- Channel Layering uses multiple grids (one per group), so using only `grid[0]` is approximate.

**Planned actions**
- [ ] Extend `ReferenceLineRenderer` to:
  - Accept grid metadata (e.g. which group/grid a line applies to), or
  - Iterate all grids and draw horizontal lines across each group grid (matching layering semantics).
- [ ] Ensure `convertToPixel` calls use the same coordinate system as `buildLayeringOption` (e.g. `{ gridIndex }` usage instead of raw `[left, top, width, height]`).
- [ ] Add a small debug helper (only in dev) to visualize grid bounds and verify alignment.

---

## 4. Reference Line Data Model & Manager

Files: `ReferenceLine.js`, `ReferenceLineManager.js`.

Goals:
- Keep a simple, explicit model:
  - `id`, `type` (`horizontal` | `vertical`), `value`, `axis`, `color`, `visible`.
- Provide predictable operations:
  - Add/remove/update/toggle, caps at 20 lines, listeners for UI/renderer sync.

**Planned actions**
- [ ] Revisit `ReferenceLineManager` API to ensure it is minimal and consistent (no hidden state like `_originalValue` leaking outside drag logic).
- [ ] Consider separating **UI state** (e.g. editing flags) from pure line data.
- [ ] Add a simple serialization helper for future backend persistence.

---

## 5. Reference Line Control Panel UX

File: `ReferenceLineControlPanel.jsx` + `.module.css`.

Goals:
- Make the panel self‑explanatory and aligned with existing dashboard styling.
- Reduce cognitive load for common tasks (voltage sag thresholds, fault markers).

Current design improvements:
- Clear header with one‑line description.
- Two clear sections:
  - "Horizontal thresholds (Y axis)" with PU values.
  - "Vertical Lines (X-axis/Time)" with seconds.
- Inline validation and editing; capacity indicator at bottom.

Remaining opportunities:
- No presets for common engineering thresholds.
- No inline legend that maps line colors to their meaning.

**Planned actions**
- [ ] Add optional **presets** for horizontal lines (e.g. 0.9 / 0.8 / 0.7 pu) when active layering group looks like voltage.
- [ ] Show a small legend list summarizing active lines (e.g. `H: 0.7 pu`, `V: 1.235 s`).
- [ ] Consider more descriptive placeholders and microcopy for errors.

---

## 6. Drag & Interaction Model

Files: `ReferenceLineRenderer.js`, `WaveformViewer.jsx`.

Current behavior:
- Lines are rendered via ECharts `graphic` overlay.
- Dragging is handled by zrender hit‑testing within `ReferenceLineRenderer._setupInteractionListeners`.
- Drag updates go back through `ReferenceLineManager.updateLine`.

Potential issues:
- Hit tolerance and drag feedback could feel inconsistent compared to cursor drag.
- No snapping or constraints tuned to signal ranges.

**Planned actions**
- [ ] Tune hit‑testing (tolerance, cursor style) and ensure it does not conflict with existing cursor drag in layering.
- [ ] Add optional snapping:
  - Horizontal: small PU increments (e.g. 0.01).
  - Vertical: time granularity based on sampling interval.
- [ ] Ensure drag listeners are installed and removed exactly once per chart lifecycle to avoid leaks.

---

## 7. Intersection Calculation & Display

Files: `IntersectionCalculator.js`, `IntersectionDisplay.js`, `WaveformViewer.jsx`.

Current behavior:
- Horizontal intersections:
  - Scan samples, detect threshold crossings, use linear interpolation.
  - Markers rendered as circles on the chart.
- Vertical behavior:
  - Core logic exists in `IntersectionCalculator`, but UI integration is minimal (no dedicated vertical tooltip yet).

Risks:
- Intersection rendering currently assumes a single grid and simple `convertToPixel` signature.
- Intersection markers are cleared/re‑drawn by replacing `option.graphic`, which might collide with other `graphic` use.

**Planned actions**
- [ ] Refine `IntersectionDisplay` to:
  - Use IDs that do not overwrite other `graphic` elements (keep reference‑line/marker groups separate).
  - Support multi‑grid charts by passing the right `gridIndex`.
- [ ] Plug vertical line readout more explicitly into the existing hover/cursor UI (fixed crosshair semantics).
- [ ] Add light caching of intersection results keyed by `(lineId, datasetHash)` to avoid recomputing on every minor change.

---

## 8. Performance, Memory & Error Handling

Goals:
- Ensure the new feature does not regress performance or stability on large records.

Potential concerns:
- Repeated `setOption({ graphic: ... }, { notMerge: true })` calls.
- Attaching multiple zrender listeners if effects are re‑run frequently.

**Planned actions**
- [ ] Audit all `ReferenceLineRenderer.render` and `IntersectionDisplay.renderIntersections` call sites to:
  - Only call when lines or relevant data actually change.
  - Avoid unnecessary full `graphic` replacement when possible.
- [ ] Centralize zrender listener setup/teardown in a dedicated helper to guarantee one registration per chart instance.
- [ ] Wrap all feature logic in defensive try/catch blocks with console logging only in dev mode.

---

## 9. Testing & Validation

Goals:
- Confirm behavior matches `implimentation_layering.md` and `layering.md` use cases.

**Planned actions**
- [ ] Manual scenario tests:
  - Voltage sag: add 0.7 pu horizontal, confirm intersection times match expectations.
  - Relay pickup: 0.9 pu, verify crossings.
  - Frequency limit: 49.5 Hz on appropriate channels.
  - Fault time markers: vertical lines at known times, verify per‑signal readouts.
- [ ] Browser matrix smoke tests for the layering view (Chrome/Edge/Firefox).
- [ ] Extend frontend tests to cover:
  - Creating/removing/toggling lines.
  - Drag updates reflected in control panel.
  - Intersection calculation on simple synthetic waveforms.

---

## 10. Future Work (Not in current rectification scope)

- Optional backend persistence of reference lines per disturbance + layering configuration.
- Exporting reference line definitions with reports.
- More advanced engineering workflows (e.g. auto‑detect sag intervals based on thresholds).
