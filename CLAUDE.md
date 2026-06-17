# CLAUDE.md

This file gives Claude Code the context it needs to be productive in the **Turbo Drift 3D** repository.

---

## 1. Project overview

Turbo Drift 3D is a single-player, browser-based 3D arcade racing game written in vanilla JavaScript with Three.js (r128, loaded from CDN). No build step, no package manager — the project is served as static files. The codebase is bilingual: UI strings are mostly Hebrew (RTL), code/identifiers are English.

There are **two parallel implementations** in the repo:

1. **Modular version** (current / active) — `index.html` + `about.html` + `css/style.css` + `js/*.js` (ES modules).
2. **Legacy monolith** — `turbo_drift_3d_v3.html` (single 45 KB HTML with inline JS/CSS). Older feature set; kept for reference only.

When making changes, edit the **modular version** unless the user explicitly asks otherwise.

---

## 2. How to run

The game uses ES modules, so `file://` will not work — it must be served over HTTP.

```bash
# PowerShell / cmd — pick one:
python -m http.server 8000
npx serve .
php -S localhost:8000
```

Then open `http://localhost:8000`.

> Three.js r128 is loaded from `cdnjs.cloudflare.com`, so the first run requires an internet connection.

---

## 3. Directory layout

```
turbo-drift/
├── index.html               # Main entry — auth screen + menus + HUD scaffolding
├── about.html               # Standalone credits / donation page
├── css/style.css            # All gameplay UI styling (auth, menu, HUD, popups)
├── js/
│   ├── game.js              # Orchestrator: globals, render loop, race lifecycle
│   ├── storage.js           # `dbGet`/`dbSet` wrapper around window.storage (with in-memory fallback)
│   ├── auth.js              # Username/password register + login (plaintext storage — see §7)
│   ├── menu.js              # Panel switching, settings toggles, graphics presets
│   ├── shop.js              # Car shop rendering + buy flow (dispatches `buy-car` CustomEvent)
│   ├── missions.js          # MISSIONS[] definitions + check/render
│   ├── achievements.js      # ACHS[] definitions + check/render
│   ├── audio.js             # Web Audio engine sound, SFX, 3 procedural music tracks
│   ├── cars.js              # ALL_CARS[] data + buildCarModel() Three.js mesh builder
│   ├── world.js             # Track, city, props, lights, lap detection
│   ├── physics.js           # updatePhysics() — driving, drift, collisions
│   ├── hud.js               # updateHUD() + updateMinimap()
│   └── particles.js         # Pooled particle mesh system
├── assets/logo.svg          # Game logo
├── README.md                # User-facing readme (also duplicated as turbo_drift_README.md)
└── turbo_drift_3d_v3.html   # Legacy single-file build — do not edit unless asked
```

---

## 4. Architecture

### Entry & boot
`index.html` loads `three.min.js` (r128) and then `js/game.js` as a module. `game.js` calls `initMenuParticles()` and `init3D()` at the bottom — Three.js scene, renderer, world generation, and the render loop start before the user logs in. The render loop is always running but skips physics when `running` is false or `paused` is true.

### Game state
`game.js` holds three global state buckets:

- `GFX` — graphics flags (shadows, particles, bloom, etc.) and quality settings (shadow res, pixel ratio, fog density, particle pool size).
- `CFG` — audio config (sfx on/off, engine on/off, volume).
- `S` — per-race state: position, velocity, angle, speed, drift score, HP, nitro, gear, RPM, lap timing, camera shake. Lives across pauses; reset at race start.

`window.G` is the bridge from inline `onclick=...` attributes in HTML to module functions. Every interactive button in `index.html` calls into `G.*`.

### Render loop (`game.js:240`)
1. Always animate world (clouds, blinking lights).
2. If not racing or paused → render frame and return.
3. Run physics → update stats → check lap → update audio → place car visually → spawn particles → update camera/HUD/minimap → render.

### Physics (`physics.js`)
Custom arcade physics, NOT a real wheel/tire model.
- `S.spd` is a normalized speed (max ~3.5). km/h shown in HUD = `|spd| * 120`.
- `S.av` is angular velocity (radians per frame, multiplied by `accelMult = dt*60` for frame-rate normalization).
- Drift triggered by `Space` (handbrake) at speed > 0.25; multiplies steering authority and accumulates `S.dScore`.
- Collisions are circle-vs-circle against `world.colls[]` (built during world generation). Bounce by reflecting velocity along normal, scale `spd` by `-0.2`.

### World (`world.js`)
Procedurally generated on `generate()`:
- Track centerline = 101 points around `trackR(t) = 320 + sin(t*3)*90 + cos(t*5)*50 + sin(t*7)*25`.
- Road mesh = ShapeGeometry following the centerline at ±18 units wide.
- City = ~150 boxes scattered in a 420–820 radius ring outside the track.
- Props: 250 trees, street lamps every 6 track points, telecom towers, cranes, gas stations, billboards.
- Collision shapes pushed to `colls[]` as `{x, z, r}` circles.

### Audio (`audio.js`)
- `init()` creates the AudioContext lazily, started by the first user gesture (the race begin).
- Engine sound = 4 oscillators (sawtooth+square+sine+triangle) routed through a low-pass filter into `engGain`. Frequency tracks `bf = 55 + rpm*200 + |spd|*45`.
- Tire and wind noise = looping noise buffers gated by speed/drift.
- Music = three handwritten procedural tracks (`playNightDrive`, `playNeonRush`, `playMidnightCruise`). Each schedules a loop of oscillator notes via `loopTrack(fn, interval)`. `setInterval` ID is stuffed onto `musicNodes._loopId` and the loop self-terminates when `musicPlaying = false`.

### Persistence (`storage.js`)
Wraps a non-standard `window.storage` async API with try/catch. **If `window.storage` does not exist** (the default in plain browsers), `dbGet` returns `null` and `dbSet` only writes to an in-memory `_mem` object — meaning save data is lost on refresh. See §7.

### Auth (`auth.js`)
Username/password stored in plain text in the user record (`user_<name>` key). `data.pass !== p` check on login. Guest mode → user name `'אורח'` (Hebrew for "Guest"). See §7 for the security note.

### Menu state
All panels are `<div class="mpanel">` siblings inside `#menuContent`. `showPanel(id)` toggles the `active` class on the right one. Per-panel render functions (`refreshMissions`, `refreshAch`, `refreshShop`, `renderCarGrid`) re-read user data from storage every time the panel opens.

---

## 5. Game data (definitions live in code, not JSON)

| File | Data |
|---|---|
| `cars.js` | `ALL_CARS[]` — 8 cars with `id, n, col, acc, ms, grip, dft, icon, spd, grp, price` |
| `missions.js` | `MISSIONS[]` — 10 missions targeting a `stat` key on the user `stats` object |
| `achievements.js` | `ACHS[]` — 10 achievements with predicate functions over `stats` |

To add a new car/mission/achievement, append to the array. The renderers iterate generically.

---

## 6. Controls

Hardcoded in `game.js:172` and `physics.js:7`:

| Key (code) | Action |
|---|---|
| `KeyW` / `ArrowUp` | Throttle |
| `KeyS` / `ArrowDown` | Brake / reverse |
| `KeyA` / `ArrowLeft` | Steer left |
| `KeyD` / `ArrowRight` | Steer right |
| `Space` | Handbrake (drift) |
| `ShiftLeft` / `ShiftRight` | Nitro |
| `KeyC` | Cycle camera (chase → hood → top-down) |
| `KeyR` | Reset car position to start |
| `KeyM` | Next music track |
| `Escape` | Pause / resume |

---

## 7. Known sharp edges (read before changing)

These are real footguns that have bitten people working on this code. Confirm a fix matches the spirit of the design before sweeping refactors.

- **Service worker is network-first for HTML/JS/CSS.** `sw.js` serves same-origin `.html`/`.js`/`.css` and navigations network-first (cache-first only for fonts/CDN libs). This is deliberate — an earlier cache-first version served a **stale `index.html`** so code changes didn't appear until two reloads. If you change caching, keep code updates landing immediately. Bump `CACHE` (`turbo-drift-vN`) when you change the asset list.
- **`updateStats()` is gone — stats are batched.** Per-frame data accumulates in `pendingStats` and flushes every ~2s / on lap via `flushStats()` (`game.js`). `statsCache` holds the user record in memory. Don't reintroduce per-frame `dbGet`/`dbSet`.
- **Engine oscillators never stop.** Created in `audio.init()`, `.start()`-ed once, only their gain is ducked to 0. `init()` is guarded by `isReady()`. `muteEngine()` ducks gain on pause/menu.
- **Particle pool is pre-allocated at 800** (`particles.init(THREE, scene, 800)` in `game.js`). `GFX.partMax` only changes the per-frame visibility cap, not the mesh count — so switching presets mid-game is safe and allocates nothing.
- **Lap detection is radius-based** (`world.checkLap`) with a 5s/lap minimum guard. At very high speed + low frame rate a car could skip the trigger ring. Race finish (`game.js`) reads `S.totalLaps` produced by this, so the same caveat applies.
- **Three.js r128 readonly trap** (see §10) — `Object.assign(mesh, {position})` throws. This already bit the car builder; the `mk()` helper in `cars.js` is the safe pattern.
- **Bloom is optional.** `index.html` loads `EffectComposer`/`UnrealBloomPass` from jsdelivr as classic scripts before the module. `setupComposer()` feature-checks `THREE.EffectComposer` && co. and falls back to the CSS-filter bloom in `hud.js` if they're absent. `GFX.realBloom` gates which path runs (and tells `hud.js` to skip the CSS filter).
- **Three.js r128 is from 2021.** Newer APIs aren't available. Be cautious copy-pasting modern Three.js docs.
- **Hebrew UI strings live in HTML**, not a translation table. Edits to user-facing copy go directly in `index.html` / `about.html` / JS message strings.
- **`turbo_drift_3d_v3.html` is legacy** and `.gitignore`d. Do not propagate fixes there unless explicitly asked.

### Resolved (do not "re-fix")
- **Persistence** now uses real `localStorage` (`storage.js`, `td3d_` prefix) with `window.storage`/in-memory fallback. Saves survive refresh.
- **Passwords** are SHA-256 + per-user salt (`auth.js`), with one-time migration from any legacy plaintext `data.pass`. Never store plaintext.
- **Music interval leak** fixed — `stopMusic()` calls `clearInterval(loopHandle)`.
- **`getAvailableCars()`** removed; `renderCarGrid()` is the single source of truth for the car grid (owned + free shown, locked cars route to shop).

---

## 8. Conventions & style

- **No build step, no bundler, no TypeScript.** Plain ES modules. Keep imports relative (`./foo.js`).
- **Single-letter / two-letter identifiers** are common in hot paths (`S`, `K`, `GFX`, `mm`, `lc`). Follow existing style in `world.js` / `hud.js` / `physics.js`. Top-level public APIs use full words.
- **Three.js is loaded as a global `THREE`** (script tag), not imported. Modules accept `THREE` as a parameter so they don't double-import.
- **`document.getElementById` is the standard pattern** — no abstraction, no virtual DOM.
- **Inline `onclick`** attributes in HTML call into `window.G` — this is intentional. New menu buttons should follow this pattern unless refactoring the whole menu.
- **No tests, no linting, no CI.**
- **No package.json, no node_modules.**

---

## 9. Where to look for…

- **Tuning car handling** → `js/cars.js` (acc, ms, grip, dft) + `js/physics.js` (gripFactor formula).
- **Adding a HUD element** → markup in `index.html` (`#hud`), styling in `css/style.css`, update logic in `js/hud.js`.
- **Adding a track element** → `js/world.js`, push to `colls[]` for collision.
- **Camera tweaks** → `updateCam()` in `js/game.js:206`.
- **A new music track** → add a `play<Name>` function in `audio.js`, append name to `TRACKS[]`, branch in `startMusic` (there are 5: Night Drive, Neon Rush, Midnight Cruise, Cyber Highway, Retro Wave).
- **A new achievement** → push to `ACHS[]` in `achievements.js`. The condition is a function over the `stats` object.
- **Graphics quality presets** → `setGfxPreset` in `js/menu.js`.
- **A new race track** → append to `TRACKS[]` in `world.js` (`{ id, name, icon, r(t), fog, ground, road, rim, defaultRain }`). `r(t)` is the radius function; everything else (road, city, boost pads, lap line) derives from it. The car-select grid renders track cards automatically.
- **Race rules / rewards / finish** → `beginRace` + `finishRace` + `computePosition` in `game.js`. Modes: `circuit` (vs 3 AI, live position), `timetrial` (solo + ghost), `free` (endless). Lap target is `RACE.laps`.
- **Bloom / post-processing** → `setupComposer` + `renderFrame` in `game.js`; bloom scripts are in `index.html` (and cached in `sw.js`).

---

## 10. Quick gotchas

- `kmh` is `|spd| * 120` — speed thresholds in missions (200/300 km/h) translate to `spd ≈ 1.67 / 2.5`.
- Locked (unowned, non-free) cars **are** shown in the car-select grid greyed out; clicking one routes to the shop. Owned + free cars are selectable. Logic is in `renderCarGrid` (`game.js`).
- The world is rebuilt into a disposable `worldGroup` on every `world.generate()` (track switch). The player car, ghost, AI cars and particle pool are separate objects added straight to the scene — they survive regeneration; only `worldGroup` is disposed.
- The minimap is centered on the player and also plots boost pads, AI cars, and the ghost.
- The vignette (`.vig`) and damage overlay (`#dmg`) are CSS-only DOM elements outside the canvas.
- The vignette (`.vig`) and damage overlay (`#dmg`) are CSS-only DOM elements outside the canvas.
- `pixelRatio` is clamped to `min(GFX.pixRatio, window.devicePixelRatio)` — Ultra preset's 2.5 only applies on hi-DPI displays.
- **Three.js r128 readonly trap:** `Object.assign(mesh, { position: vec3 })` throws because `position` is a getter-only property on Object3D. Always use `mesh.position.set(x, y, z)` or `mesh.position.copy(vec3)`. The helper `mk()` in `cars.js` follows this safe pattern.

---

## 11. Git / GitHub workflow

**Remote:** `https://github.com/DrummingBird1/TurboDrift.git` (branch `main`)

**Push policy — automatic after major updates:** After completing any large feature, bug-fix sweep, or refactor, **push the changes to GitHub without waiting to be asked**. The user has standing approval for this. A "major" update is anything the user would describe as a milestone: multiple files modified together, a new feature, a critical bug fix, or substantial refactor. Trivial single-file tweaks, in-progress experiments, or doc edits in isolation usually do not warrant a push — use judgment.

**Standard flow:**
```powershell
git -C "D:/AI/Claude/turbo-drift" add <files>
git -C "D:/AI/Claude/turbo-drift" commit -m "<descriptive message>"
git -C "D:/AI/Claude/turbo-drift" push origin main
```

**Important config notes:**
- The repo has a per-repo `user.email` set to `DrummingBird1@users.noreply.github.com` because GitHub blocks pushes with the user's private email. **Do not** revert to the global email when committing — it will get rejected.
- Working-dir ownership exception is registered: `git config --global --add safe.directory D:/AI/Claude/turbo-drift`.
- `.gitignore` excludes `.claude/`, legacy duplicates (`turbo_drift_3d_v3.html`, `turbo_drift_README.md`, `turbo_drift_logo.svg`), and `node_modules`/`.env`. Keep it that way.

**Commit message style:** Short imperative title, then a body grouping changes by type (Bug fixes / New features / Infrastructure). See `804e052` for an example.
