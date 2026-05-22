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

- **Persistence is broken in plain browsers.** `storage.js` expects `window.storage` (a non-standard async API). Without it, all writes go to a per-tab `_mem` object and disappear on refresh. Users get "guest"-like persistence even when registered.
- **Passwords are plaintext.** `auth.js` stores `data.pass = p` and compares with `===`. Not safe for any real deployment. If you're hardening this, see the suggestions doc.
- **`getAvailableCars()` in `game.js:73` is dead/inconsistent code.** Its body returns only free cars, but its comment says "first 3 + owned". `renderCarGrid()` doesn't actually use it — it filters in its own callback. The `G.selCar(i)` exposed to HTML uses `getAvailableCars()`, but nothing in the current HTML calls `G.selCar` (carcards bind their own `onclick`). Treat `getAvailableCars` as unused.
- **`updateStats()` runs every frame** with `{ speed: S.kmh }`, awaiting `dbGet` / `dbSet` and running mission/achievement checks each time. This is one of the hottest paths in the game and a major perf concern (and lots of storage churn).
- **Music interval can leak.** `audio.stopMusic()` flips `musicPlaying = false` but doesn't `clearInterval(musicNodes._loopId)`. The interval no-ops until it self-clears at the next tick (up to `beat*8` seconds later). When the user mashes `M`, intervals can briefly overlap.
- **Engine oscillators never stop.** They're created in `audio.init()`, `.start()`-ed once, and only their gain is ducked to 0. Repeated `init()` calls (currently guarded by `isReady()`) would compound this.
- **Particle pool size is fixed at first init.** `GFX.partMax` changes do nothing to the mesh count after `particles.init()` runs — only the visibility cap (`lim`) changes. Switching to Ultra mid-game does NOT allocate more particles.
- **`carObj.wheels.rotation.x += S.spd * 3`** in `game.js:274` is frame-rate dependent (no `dt`). Same with parts of `physics.js` (angular velocity decay constants).
- **Lap detection is radius-based** (`world.js:170`). At very high speeds with low frame rate, a car could skip past the trigger ring and miss a lap.
- **Three.js r128 is from 2021.** Many newer APIs (e.g., better PBR, USE_LOGDEPTHBUF improvements) aren't available. Be cautious copy-pasting Three.js code from modern docs.
- **Hebrew UI strings live in HTML, not a translation table.** Edits that touch user-facing copy must be made directly in `index.html` / `about.html` / message strings in JS modules.
- **`turbo_drift_3d_v3.html` is legacy.** It duplicates ~50% of the modular code in inline form. Do not propagate fixes there unless explicitly asked.

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
- **A new music track** → add a `play<Name>` function in `audio.js`, append name to `TRACKS[]`, branch in `startMusic`.
- **A new achievement** → push to `ACHS[]` in `achievements.js`. The condition is a function over the `stats` object.
- **Graphics quality presets** → `setGfxPreset` in `js/menu.js`.

---

## 10. Quick gotchas

- `kmh` is `|spd| * 120` — speed thresholds in missions (200/300 km/h) translate to `spd ≈ 1.67 / 2.5`.
- Cars are filtered out of the car select grid if not owned and not free — there's no "locked" preview state. To change this, edit `renderCarGrid` in `game.js:78`.
- The minimap is centered on the player (car at center, world rotates relative to it). Track is drawn at fixed orientation, not rotated with car heading.
- The vignette (`.vig`) and damage overlay (`#dmg`) are CSS-only DOM elements outside the canvas.
- `pixelRatio` is clamped to `min(GFX.pixRatio, window.devicePixelRatio)` — Ultra preset's 2.5 only applies on hi-DPI displays.
