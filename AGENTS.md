# AGENTS.md

## Cursor Cloud specific instructions

三国字守 (`sanguo-td`) is a single, pure-frontend Vite + TypeScript Canvas tower-defense game with **zero runtime dependencies** (Web Audio + Canvas 2D, all procedural — no image/audio assets). There is no backend/database; everything runs in the browser.

### Commands (see `package.json` scripts / `README.md` 开发命令)
- Dev server: `npm run dev` — Vite serves on **port 3333** bound to `0.0.0.0` (configured in `vite.config.ts`, not the Vite default 5173).
- Type check / lint: `npx tsc --noEmit` (strict). Also runs as the first half of `npm run build`.
- Tests: `npm test` (Vitest, runs in a Node environment — 10 files / ~98 unit tests covering pure logic; rendering & drag are not unit-tested).
- Build: `npm run build` (`tsc --noEmit && vite build`).

### Non-obvious gotchas
- **Deployment/合成 drag cannot be driven by synthetic DOM events.** The board uses Pointer Events + `setPointerCapture`, so simulated clicks or the computer-use harness's synthetic drags will NOT place/merge soldiers. To verify deploy/merge programmatically you must drive a real drag via Chrome DevTools Protocol `Input.dispatchMouseEvent` (mousePressed → mouseMoved → mouseReleased). See `.claude/skills/verify/SKILL.md` for the full headless-Chrome + CDP recipe (note: that skill launches Vite on port 5199 via `npx vite --port 5199`; the default `npm run dev` uses 3333).
- Canvas grid geometry: 7 columns wide; cell size = canvas width / 7; center of grid cell (x,y) = canvasRect top-left + ((x+0.5)·cell, (y+0.5)·cell). Deploy = drag from `[data-slot="0"]` center to a grass (`.`) cell center. Level maps are in `src/game/levels.ts`.
- The page auto-pauses on `visibilitychange` (window blur). Headless mode is unaffected; just don't minimize a headed window during testing.
- Progress/mute persist in `localStorage` (`sgtd.progress`, `sgtd.muted`); a prior game state can therefore surface a stale defeat/menu screen on reload.
