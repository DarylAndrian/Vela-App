# Vela Whiteboard continuation

## Implemented

Whiteboard opens from Vela’s local tool rail. The workspace has a multipage A4 notebook, blank, ruled, and dotted paper, thumbnail navigation, 25–800% zoom, Fit Page, and touch and Space-drag navigation. It supports pressure-sensitive ink, six shapes, and session undo and redo.

Palm rejection: a touch that starts while the pen is hovering or in contact, or within 500 ms (`PALM_GUARD_MS`) of any pen event, is ignored for its whole contact. A pen coming into range also ends a touch pan or pinch already in progress. Pen activity is tracked at window level, so a pen hovering over the toolbar counts too.

Paste a screenshot into the drawing workspace, move or resize it, then switch to Pen or a shape to annotate it. With **Region Copy**, drag a rectangle and press **Ctrl+C** for a transparent PNG or choose **Save as JPG** for a white background. Both use two pixels per page unit. The notebook and active page are saved locally in IndexedDB. A failed save retains the edits and shows **Retry**. Pending or failed changes trigger a close prompt.

## Where to resume

The original requirements are in [VELA-WHITEBOARD-PLAN.md](<C:/Users/user/Documents/Codex/2026-11-26/do-you-know-goodnotes-i-want/outputs/VELA-WHITEBOARD-PLAN.md>). The implementation is in `features/src/screens/whiteboard/`. `useBoardSurface.ts` handles input, zoom, and canvas layers. `ink.ts` and `render.ts` provide artwork geometry for both the workspace and exports. `exchange.ts` encodes the crop and calls Vela’s IPC. `storage.ts` handles IndexedDB transactions, and `useNotebook.ts` manages edit history and the save queue. `scripts/whiteboard-smoke.js` exercises the built workspace through the launcher in an isolated in-memory Electron session.

## Automated verification

- `npm run features:build`, the feature TypeScript check, and `git diff --check` passed.
- All Whiteboard smoke checks passed. They cover the launcher, synthetic pen geometry and cancellation, screenshot paste and resizing, undo and redo, PNG transparency and stacking, white JPG export, Ctrl+wheel anchoring at 800%, Fit Page, the unsaved-edit close prompt, retry after a forced IndexedDB abort, and restoration in a new renderer. The PNG fixture was 176 × 144 pixels and identical at both zoom levels.
- Whiteboard and Picture Connector exercised the shared Electron image handler through `ClipboardItem` construction. The test intercepted the final system clipboard write. A normal Windows run can verify the handoff to an external editor.
- In the 2026-11-26 continuation the full `npm run smoke` passed every check, including the Media Converter minimum-window check that failed before. No code change targeted that check, so it may depend on the display and window environment.

## OS-level device check (`npm run whiteboard:device`)

`scripts/whiteboard-device.js` runs in the isolated smoke session with a visible, always-on-top Vela window. `scripts/whiteboard-pointer.ps1` injects pen and touch through `InjectSyntheticPointerInput`, so the input passes through Windows and Chromium's WM_POINTER handling rather than scripted DOM events. The check takes over the pointer for about 20 seconds. It writes to the real system clipboard and then restores the previous items. It passed three consecutive runs on this machine (Windows 11, MSI Pen 2, HID touch screen present). It covers:

- Pen hover reaches the page as `pointerType: 'pen'` with no buttons and leaves no ink.
- An injected pressure ramp from 0.1 to 1.0 is stored with 41 samples. The pressures rise monotonically from 0.0996 to 1.
- A confident (non-palm-flagged) touch reached the page during pen contact, while the pen hovered, and 100 ms after the pen left. It caused no scrolling, zoom, or extra ink. With the guard disabled, the hover and after-lift palm checks fail, so they detect the bug.
- Once the pen has been away for longer than the guard, one finger pans and two fingers pinch-zoom.
- A Region Copy through ink and a pasted picture is read back by a separate PowerShell/.NET process. The clipboard offers `PNG`, `Format17` (CF_DIBV5), `Bitmap` and `DeviceIndependentBitmap`. The PNG is about 214 × 173 for a 106 × 88 unit region, with a transparent corner, the picture's red, and the ink color `23,36,58` on top of the picture. The DIB has the same size; DIB has no alpha channel, as expected. Copying still works after cancelling the JPG save dialog.

`scripts/clipboard-probe.ps1` can be run alone after a manual copy to inspect what other apps will receive.

Electron 45's main-process `clipboard` is asynchronous (`read`, `write`, `readText`, `has`, `clear`); the sync `readImage` and `availableFormats` are gone.

## Still needs a person with the pen display

Injection proves the event path and the app logic. It does not prove the feel of real hardware.

1. Start Vela with `npm start` after `npm run features:build`. Open **Whiteboard** from the tool rail. Record the display and pen model; this machine reports an MSI Pen 2. Draw a light-to-firm stroke, a fast curve, a slow corner, and a tap. Judge the real pressure curve and the minimum width, which is 20% of the brush at zero pressure. Check the release end, the hover cursor, and the perceived latency. Tune `radius()` in `ink.ts` only after observing real input.
2. Rest a real palm during pen contact and while hovering. Real palms may arrive without the confidence bit and be filtered by Windows, or arrive as large contacts. Confirm the 500 ms guard feels right when switching from pen to finger. A known gap: a palm that lands *before* the pen comes into range can pan the page slightly until the pen is detected.
3. Take a real screenshot with Win+Shift+S and paste it into Whiteboard. Annotate it, copy a region, and paste the region into a PNG-aware editor such as Paint.NET, GIMP, Photoshop, or PowerPoint; expect transparent margins. Also paste into Paint and record how it shows the transparent margins. It may use the PNG or the DIB. Look at the crop edges by eye. Try copying from Picture Connector into the same editors.

## Remaining manual checks from the original list

4. Add all three paper styles and change the template of a page with artwork. Jump between thumbnails. Drag each shape in both directions and check alignment at 25%, Fit Page, and 800%.
5. Quit and relaunch Vela after the saved indicator appears. Verify the active page, artwork, and pasted picture. Check the native close prompt during a pending save as well as after a failed save.
