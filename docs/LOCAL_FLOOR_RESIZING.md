# Local floor-plan resizing · 23 October 2026

The receiving user requested resizing from every direction for selected floor-plan objects. Arrange now shows eight existing-style green/white handles: four edges and four corners. The prior right, bottom and bottom-right controls remain compatible.

Dragging the left or top side changes the origin and dimensions while keeping the opposite world-space edge/corner fixed, including rotated objects. Mouse and touch movement is converted into the object's local axes. Keyboard arrows move the selected local edge in 10-unit increments; cursor orientation follows rotation. Handles retain their constant screen size at different zoom levels. Existing minimum/maximum dimensions, rotated rectangular floor limits, gate boundary snapping, outline/save validation and permission/version guards remain in force. Moving, rotating, selection, pan/zoom, undo/redo and the green theme are preserved.

Only client resize controls and the shared pure geometry helper changed. No service, schema, account, environment, invoice, payment or stock changes. Layouts still save through the existing authorized command.

## Verified locally, unreleased

- **16 affected geometry/service tests passed** across floor geometry, editor state, gates, controls and plan persistence. Coverage includes all eight directions, fixed opposite anchors across seven rotations, growth/shrinkage, wall/room minimums and maximums, floor limits, source immutability, version/role guards and preservation of existing table/session/order identities.
- **Five browser workflows passed on localhost:5090**, covering desktop 1440px and phone 390px: all eight handles with real mouse and touch input, growth/shrinkage, keyboard resizing, rotated and unrotated objects, one-gesture undo/redo, saved geometry/reload, no page overflow, and existing table placement, boundary gates, group selection and locked pan/zoom behavior. The new eight-direction workflow passed again after adding phone viewport panning for the screenshots; panning does not change saved geometry.
- Typecheck and optimized build passed. Rendered selected-object screenshots inspected at both widths, with 0° and 30° rotation: verification/local-eight-resize-handles-WIDTH-ANGLE.png.

Private task logs in the parent work directory: eight-resize-backend.log, eight-resize-final-browser.log, eight-resize-screen-browser.log, eight-resize-typecheck.log and eight-resize-build.log. Initial test development corrected an unsupported Escape assumption, a fixture rotation outside the existing 15° rule, and an assertion exceeding Chromium's CSS-coordinate precision; none required changing those existing product rules.

No full-backend or remote PostgreSQL rerun is claimed for this geometry-only update. Local synthetic browser workspaces and in-memory service tests were used. No push, deployment or Production/client/Petpooja release-count change. Q111 remains unanswered and procurement remains paused.

Latest local policy update: LOCAL_FLOOR_FIXTURES.md supersedes gate boundary snapping and always-inside placement, adds collision guards, and retains the eight resize handles.
