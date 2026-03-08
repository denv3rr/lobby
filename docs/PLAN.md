# Seperet Lobby Plan

## Goals
- Build a static, GitHub Pages-friendly 3D lobby for Seperet.com.
- Keep it modular so content updates happen through JSON and assets, not engine rewrites.
- Deliver a liminal, uncanny atmosphere with practical performance on desktop and mobile.
- Support multiple creepy indoor "experience presets" selectable via query param or in-lobby dropdown.
- Include a left-room virtual popup shop and right-room projects gallery using shared card rendering.

## Constraints
- No backend required.
- Static hosting compatibility (GitHub Pages).
- Must include WebGL fallback links if 3D is unsupported.
- Audio must respect browser autoplay restrictions.

## Architecture
- Runtime: Three.js + vanilla JavaScript.
- Build: Vite, configurable `base` path for GH Pages project pages.
- Configuration source: `/public/config/*.json`.

## Repository Structure
- `src/engine`: renderer setup, asset cache, scene assembly.
- `src/systems`: controls, interaction/raycast, audio, theming/particles.
- `src/ui`: overlays (sound activation, instructions, settings).
- `public/config`: scene, theme, and audio authoring files.
- `public/assets`: models, textures, and audio files.

## Data-Driven Scene
- `scene.json` drives room setup, spawn, portals, props, lights, and fog.
- Portals are interactive link objects with labels and target URLs.
- Props can be primitive placeholders or external GLB models.
- `catalog.json`, `shop-feed.json`, and `projects-feed.json` drive side-room product/project cards.

## Experience + Seasonal Theming
- `themes.json` defines named presets like `lobby`, `inferno`, `purgatory`, `neon`, plus optional seasonal `winter`.
- Theme can override:
  - materials/textures/colors
  - light and fog tuning
  - particle systems (for example snow)
  - audio mix changes
  - additional props (for example Christmas tree)
- Theme can be selected by query parameter (`?theme=winter`) and dev-only UI dropdown.
- This allows Squarespace nav/dropdown links to deep-link directly to an experience variant.

## Audio Atmosphere
- `audio.json` defines ambient layers and SFX map.
- App shows an `Enable Sound` gate on first load.
- Ambient loops start only after explicit click/tap.

## Performance Approach
- Fast first render: simple room first, async props afterwards.
- Quality modes:
  - Low: lower render scale, reduced particles, no shadows.
  - Medium: default.
  - High: enhanced shadows and particle count.
- Keep geometry simple and texture budgets practical for web.

## How To Add Props
1. Add model to `public/assets/models/...`.
2. Add a prop object in `public/config/scene.json` or `themes.json` `additionalProps`.
3. Set transform and optional interaction metadata.

## Integration Notes
- Preferred deployment: GH Pages with either:
  - `lobby.seperet.com` CNAME to Pages domain.
  - reverse-proxied path `seperet.com/lobby` through Cloudflare.
- Full step-by-step is documented in `docs/INTEGRATION-SQUARESPACE.md`.

## Asset Sweep Execution
- Full production asset sweep plan: `docs/ASSET-SWEEP-PLAN.md`
- Scene tracking manifest: `public/assets/manifest/scene-asset-manifest.json`
