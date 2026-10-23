# Explore snapping · 23 October 2026 · local/unreleased

The user supplied a TypeScript `IllustratorSnapEngine` and requested integration across Explore. The web editor now shares that engine through `floor-snapping.ts`. Existing saved layouts are not rearranged merely by opening them.

## Controls and targets

Arrange → **Snapping** exposes Enable snapping, Grid, Grid size (1–100), Pixel grid and Smart guides. Defaults: enabled, 10-unit grid, smart guides enabled, pixel grid disabled. Grid takes precedence over pixel quantization when both are selected, as in the supplied algorithm. Settings are local editor state and reset on reload. Hold **Alt** while dragging or using arrows to bypass all snapping; the master checkbox also supports touch-only free adjustment.

Pointer tolerance is **four screen pixels divided by actual zoom**. Corners, edge midpoints and centers of other physical objects supply anchors; the floor bounds/center supply ruler guides; existing floor and object edges supply vector guides, including angled segments. The dragged selection is excluded from scene targets. Labels, floor name tags and resize decorations are not physical snapping targets. Green dashed guides show the reached alignment during a gesture and disappear on release/cancellation; they do not restore removed label connector lines.

| Explore action | Integration and preserved behavior |
|---|---|
| Move fixture/table | Corners, edge midpoints and center snap while preserving dimensions, rotation and identity. |
| Move selected group | One shared displacement snaps the group bounds; internal spacing and all identities remain unchanged. |
| Eight object resize handles | Moving handle snaps in world coordinates while the opposite edge/corner stays fixed. Rotated edge handles intersect guide targets with their permitted one-dimensional motion; they do not drift sideways. |
| Eight Resize area handles | Boundary handle snaps to existing geometry; top/left edits rebase coordinates and camera together, preserving physical furniture. Area dimensions retain the existing integer/min/max requirements. |
| Outline corner | Shared targets, bounded integer coordinates, other points unchanged. Invalid/crossing shapes cannot be applied. |
| Polygon edge | Snaps displacement along the edge normal, preserving its endpoint relationship. |
| Circular outline edge | Same targets along its horizontal/vertical resize axis; retains ellipse representation and minimum size. |
| Add fixture/table and Paste | A valid free placement is aligned before adding only the new draft object. Existing geometry is not moved; copies still create independent table/QR identity only on Save. |
| Keyboard moves/resizes | Same engine and bypass. Below 100% zoom, snap tolerance is additionally capped at four document units so a 10-unit arrow step cannot repeatedly snap back to its starting position. |

Rotation retains the approved **15-degree angular steps**; the supplied point engine does not define a new angular mode. Rectangle/Circle presets, exact midpoint Add corner, floor naming, labels, colors and other non-spatial controls retain their existing semantics. Camera pan, zoom and view locking remain continuous view operations.

## Adaptation and safeguards

The supplied projection and per-axis nearest-target pipeline is retained, with finite-scale validation and coherent paired corrections for exact anchors/angled vectors. Orthogonal vector constraints leave the tangent axis available for independent snapping. Constrained resize handles intersect candidate guides with their motion line before selecting a target; projecting an arbitrary snapped cursor afterward would lose alignment or move the fixed anchor.

Snapping precedes existing geometry guards. It cannot authorize physical overlap, escape a protected boundary, move another tenant/outlet's data or bypass layout versions. Unreachable target guides are suppressed when limits/collisions prevent reaching the requested position. Gates and explicitly outdoor tables keep their approved exceptions. Group spacing, existing legacy-collision handling, roundness, labels, original table links and physical stock/financial history remain protected.

The core object-resize helper has an optional quantization step; its existing default remains 10 for other callers. Web snapping can pass zero to avoid rounding a valid guide alignment back onto the legacy grid. Floor area resizing similarly keeps its old default and lets the web adapter use integer precision. No service command, schema, migration, environment or provider change. No PostgreSQL rerun was required for this client geometry change; persisted object coordinates/dimensions already accept finite fractional values.

## Verification

- **310 full backend tests passed**, including **24 affected cases** in floor-snapping, floor-editor-state and floor-plan tests. Twelve new cases cover screen tolerance at multiple zooms, grid/pixel/free modes, nearest rulers, offset reference anchors, atomic point/angled projection, segment clamping, zero-length segments, invalid zoom, bypass, group spacing, collisions, bounds, free gates, rotated fixed anchors, all resize directions, area rebasing, new placement and polygon/circle editing. Existing service tests cover role/outlet/tenant/version/concurrency/history and copy/QR guards; the full suite retains financial/FIFO/history checks.
- **14 browser workflows passed** against localhost:5090 in synthetic isolated workspaces on the private local copy, across **1440px desktop and 390px phone**. Thirteen workflows cover explicit mouse/touch smart snapping, real guide display/cleanup, keyboard departure/Alt, master disable, object resize, floor area, outline editing/cancellation and saved reload; plus eight-direction geometry, thin-floor touch targets, groups/undo/locked view, labels, floor names, add fixtures/tables, gates/fence, roundness and exact midpoint corners. The additional table/fixture copy workflow passed with independent empty tables/QR links and unchanged sessions.
- Typecheck and optimized build passed. Rendered `verification/local-explore-snapping-1440.png` and `verification/local-explore-snapping-390.png` were inspected.

The previous geometry regressions now explicitly disable snapping when checking exact free-resize dimensions, while the new workflows verify enabled snapping. Their DOM-to-saved dimension comparisons allow 0.001 units for browser CSS serialization, without relaxing fixed-anchor or overlap checks. Earlier attempts exposed an unselected test object after Redo and the old hard-grid expectations; the test selects the object before resizing and checks the new behavior separately.

Private logs are in the parent task's `work/`: floor-snap-full-backend.log, floor-snap-targeted.log, floor-snap-final-browser.log (13 passed), floor-snap-copy-browser.log (1 passed), floor-snap-typecheck.log and floor-snap-build.log.

**Local only.** No push, deployment or hosted/live database changes. Production and client/Petpooja release counts remain unchanged. Q111 remains unanswered; procurement remains paused.
