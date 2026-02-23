# Seperet Digital Lobby

Static, GitHub Pages-ready 3D lobby for Seperet.com built with Three.js + Vite.

## Highlights
- Indoor liminal lobby vibe with configurable creepy ambience.
- JSON-driven scene, portals, themes, and audio (`public/config/*.json`).
- JSON-driven side rooms for a virtual popup shop (left) and project cards (right).
- Experience presets from dropdown/query param (for example `?theme=liminal`).
- Desktop controls: click-to-focus, WASD + mouse look (pointer lock).
- Mobile controls: drag to look, tap-to-move.
- Audio autoplay compliance via `Enable Sound` gate.
- WebGL fallback panel with direct links.
- Optional seasonal example included (`winter` with snow + tree placeholder).

## Quick Start
```bash
npm install
npm run dev
```

Build:
```bash
npm run build
```

Preview build:
```bash
npm run preview
```

## Configuration

All runtime behavior is driven by:
- `public/config/scene.json`
- `public/config/themes.json`
- `public/config/audio.json`
- `public/config/catalog.json`
- `public/config/shop-feed.json`
- `public/config/projects-feed.json`

These local config files are intentionally git-ignored for private iteration.
If they are missing, the app falls back to tracked defaults in:
- `public/config.defaults/scene.json`
- `public/config.defaults/themes.json`
- `public/config.defaults/audio.json`
- `public/config.defaults/catalog.json`
- `public/config.defaults/shop-feed.json`
- `public/config.defaults/projects-feed.json`

Create local editable configs from defaults:
```bash
cp public/config.defaults/*.json public/config/
```

### Scene (`scene.json`)
- Room size/materials, spawn, fog, lights, portals, props, and surface zones.
- Portals include URL + label + transform and are clickable in-world.

### Themes (`themes.json`)
- Presets: `lobby`, `backrooms`, `roman`, `inferno`, `purgatory`, `neon`, `winter`.
- Theme can override:
  - room textures/colors
  - procedural materials (for example checkerboard, flame, neon-grid)
  - fog + lights
  - scene-source lighting via `disableBaseLights` + `additionalLights`
  - ambient audio mix
  - particles (snow)
  - additional props
- Select theme by:
  - query param: `?theme=<name>`
  - in-lobby dropdown (`Experience`) in **dev mode only**

### Audio (`audio.json`)
- Ambient layers are scene-driven and synth-capable (for example `lobby_pad`, `backrooms_buzz`, `roman_aura`, `inferno_rumble`, `neon_pulse`)
- Optional SFX map (default keeps ambience-focused behavior)
- Optional proximity audio zones

### Catalog Rooms (`catalog.json`, `shop-feed.json`, `projects-feed.json`)
- Left room is a gift-shop storefront built from `shop-feed.json`.
- Right room is a project showcase using `projects-feed.json` with the same card format.
- Theme-aware filtering is configured in `catalog.json` (`themeContent`).
- Cards are interactable and open links in a new tab.
- Card placement is one-row-per-wall with automatic wall overflow.
- If all walls fill, additional connected annex rooms are spawned automatically.
- Items with `artwork` render an in-world carousel panel; hover item and use mouse wheel to scroll screenshots.

## Virtual Shop Feed Sync
Pull Seperet shop links/images/titles into local runtime feed:

```bash
npm run sync:shop
```

Update committed fallback defaults too:

```bash
npm run sync:shop:defaults
```

Sync project cards from `github.com/denv3rr` profile README pinned repos:

```bash
npm run sync:projects
```

To also ingest South Padre workshop screenshots into the artwork carousel:

```bash
npm run sync:projects -- --workshop-url=\"<workshop-item-url>\" --workshop-title=\"South Padre Island\"
```

## Dev-Only UI + Saved Dev Selections
- The in-app settings panel is shown only in Vite dev server (`npm run dev`).
- Production/GitHub Pages hides this panel.
- In dev mode, selected `theme` and `quality` are saved in browser localStorage:
  - `lobby.dev.theme`
  - `lobby.dev.quality`

## Add A Prop
1. Place model in `public/assets/models/props/` (prefer `.glb`).
2. Add an entry in `scene.json` `props` or theme `additionalProps`.
3. Set `position`, `rotation`, `scale`.
4. If model is missing, app falls back to placeholder geometry.

## Seasonal Example Workflow
- Christmas tree:
  - Drop `public/assets/models/props/christmas_tree.glb`
  - Keep/use `themes.winter.additionalProps`
- Snow:
  - `themes.winter.particles.snow.enabled = true`

Default startup is non-snow liminal indoor atmosphere.

## GitHub Pages Deployment

Workflow file: `.github/workflows/deploy-pages.yml`

By default, build uses:
- `VITE_BASE_PATH=/lobby/`

This matches project pages like:
- `https://<username>.github.io/lobby/`

If using custom domain root (`https://lobby.seperet.com`), set:
- `VITE_BASE_PATH=/`

Vite base config is in `vite.config.js`.

## Squarespace Integration

See `docs/INTEGRATION-SQUARESPACE.md` for both methods:
1. `lobby.seperet.com` -> GitHub Pages via CNAME
2. `seperet.com/lobby` -> Cloudflare reverse proxy path

### Dropdown Menu Pattern
Add Squarespace dropdown items linking directly to theme URLs:
- `https://lobby.seperet.com/?theme=lobby`
- `https://lobby.seperet.com/?theme=backrooms`
- `https://lobby.seperet.com/?theme=roman`
- `https://lobby.seperet.com/?theme=inferno`
- `https://lobby.seperet.com/?theme=purgatory`
- `https://lobby.seperet.com/?theme=neon`
- `https://lobby.seperet.com/?theme=winter`

## Asset Sources (Researched)

Always verify license terms per asset before shipping.

### Textures / Materials
- Poly Haven (CC0): https://polyhaven.com/license
- ambientCG (CC0): https://ambientcg.com/

### 3D Models
- Kenney assets (CC0): https://kenney.nl/support
- Quaternius packs (CC0): https://quaternius.com/
- Sketchfab (filter by license): https://www.sketchfab.com/blogs/community/refine-downloadable-model-searches-with-new-license-filters/

### Audio / SFX / Ambience
- Sonniss GameAudioGDC bundles (royalty-free, commercial use): https://sonniss.com/gameaudiogdc/
- Sonniss bundle license: https://sonniss.com/gdc-bundle-license
- Freesound FAQ + license guidance: https://freesound.org/help/faq/
- Pixabay content license: https://pixabay.com/service/license-summary/

### Animation Sources
- Mixamo FAQ (free + royalty-free usage terms): https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- Quaternius Universal Animation Library (CC0): https://quaternius.com/packs/universalanimationlibrary.html

### Animation Script References (Three.js)
- AnimationMixer docs: https://threejs.org/docs/pages/AnimationMixer.html
- Animation system manual: https://threejs.org/manual/en/animation-system.html

## Public Docs
- Plan: `docs/PLAN.md`
- Asset sweep plan: `docs/ASSET-SWEEP-PLAN.md`
- Scene schema: `docs/SCENE-SCHEMA.md`
- Squarespace integration: `docs/INTEGRATION-SQUARESPACE.md`
- Asset prep guide: `docs/ASSET-GUIDE.md`
- Asset shortlist by theme: `docs/ASSET-SHORTLIST.md`
- Context-to-scene generation workflow: `docs/CONTEXT-SCENE-GENERATION.md`
- Virtual popup shop implementation plan: `docs/VIRTUAL-SHOP-PLAN.md`

## Asset Sweep Tracking
- Scene-by-scene manifest:
  - `public/assets/manifest/scene-asset-manifest.json`

## What To Commit / What Not To Commit

Commit:
- Source code and config (`src/`, `public/`, `docs/`)
- Build/deploy config (`vite.config.js`, workflow files)
- `README.md`, `package.json`, lockfile

Do not commit:
- `agents.md`
- `_agents/`, `.agents/`, `planning-private/`
- `public/config/*.json` (local runtime overrides)
- `node_modules/`, `dist/`, local temp/log files

These exclusions are enforced in `.gitignore`.
