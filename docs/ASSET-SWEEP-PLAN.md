# Asset Ingestion Sweep Plan

## Objective
Execute a full asset pass that upgrades every scene from procedural/placeholder-heavy to authored, high-impact, scene-true environments while preserving performance and static GH Pages compatibility.

## Scope
- Scenes: `lobby`, `backrooms`, `roman`, `inferno`, `purgatory`, `neon` (and `winter` as optional seasonal variant).
- Asset classes:
  - Models (`.glb`)
  - Textures (`.webp` preferred)
  - Audio ambience/SFX (`.ogg`/`.wav`)
- Engine hooks already in place:
  - Per-theme props/lights/audio mixes
  - Per-theme particle effects
  - Per-theme and per-portal portal styling

## Constraints
- Static-only deployment (GH Pages).
- No server-side processing.
- License-safe sources only (CC0 or clearly commercial-safe terms).
- Keep first meaningful render fast and stable across desktop/mobile.

## Phase Plan

### Phase 0: Governance + Source Validation
- Confirm final approved source list (license-first).
- Require per-asset metadata before import:
  - source URL
  - license type
  - attribution requirement
  - original filename
  - transformed filename
- Output:
  - completed entries in `public/assets/manifest/scene-asset-manifest.json`
  - optional attribution section draft for README/docs

Gate:
- Pass: every target slot has a source candidate with validated terms.
- Fail: block imports, replace with alternate source before proceeding.

Implied Next Move:
- If pass -> Phase 1.
- If fail -> continue sourcing until all required slots are green.

### Phase 1: Scene-by-Scene Asset Targeting
- Fill target slots for each scene:
  - 2-4 hero models
  - 2-3 supporting textures
  - 2 ambience loops + optional one-shots
- Keep scene identity strict:
  - `lobby`: classy liminal
  - `backrooms`: stale fluorescent office maze
  - `roman`: pompeii villa atrium
  - `inferno`: heat/ritual/hazard
  - `purgatory`: monochrome surreal limbo
  - `neon`: cyber-industrial shrine

Gate:
- Pass: every scene has complete asset candidate set by class (model/texture/audio).
- Fail: incomplete scene cannot move to import stage.

Implied Next Move:
- If pass -> Phase 2.
- If fail -> patch missing class first (usually ambience or hero prop).

### Phase 2: Import + Optimization
- Download/import into:
  - `public/assets/models/props/`
  - `public/assets/textures/`
  - `public/assets/audio/`
- Normalize:
  - models: keep mesh count practical, remove hidden nodes
  - textures: 1K baseline, 2K only hero surfaces
  - audio: consistent loudness range for layered playback
- Keep naming convention aligned to config and manifest.

Gate:
- Pass: assets load without runtime errors and without breaking build.
- Fail: revert problematic asset and replace/optimize before continuing.

Implied Next Move:
- If pass -> Phase 3.
- If fail -> fix asset-level issue, do not modify engine behavior yet.

### Phase 3: Scene Integration
- Map assets into:
  - `public/config/themes.json`
  - `public/config.defaults/themes.json`
  - `public/config/audio.json` + defaults
- Replace placeholder props progressively by scene.
- Tune scene-specific lighting to new asset response.
- Keep atmosphere coherent with audio + particles + portal style.

Gate:
- Pass: each scene visually and sonically matches intended identity.
- Fail: scene-specific retune loop (lights/material mix/audio gain).

Implied Next Move:
- If pass -> Phase 4.
- If fail -> isolate one scene and complete polish before touching others.

### Phase 4: QA + Performance Regression Sweep
- Device tiers:
  - low-end laptop/iGPU
  - mainstream desktop
  - mobile touch device
- Validate:
  - no blank scene/theme regressions
  - portal interaction reliability
  - audio start behavior after user interaction
  - quality mode scaling impact
- Verify `npm run build` and dev runtime stability.

Gate:
- Pass: no critical regressions, acceptable frame pacing.
- Fail: downscale heavy assets, reduce particles/lights, retest.

Implied Next Move:
- If pass -> Phase 5.
- If fail -> optimize biggest offenders first (textures, then model complexity).

### Phase 5: Release + Documentation
- Update docs with:
  - imported asset inventory
  - license/attribution requirements
  - known replacement slots
- Deploy to GH Pages and validate theme deep links.

Gate:
- Pass: live experience stable + documented.
- Fail: roll back only offending assets/config deltas.

Implied Next Move:
- If pass -> start iterative “content packs” pipeline.
- If fail -> hotfix and redeploy.

## Execution Order (Recommended)
1. `lobby` baseline polish pack
2. `backrooms` immersion pack
3. `roman` hero pack
4. `inferno` hero pack
5. `purgatory` surreal pack
6. `neon` cyber pack
7. optional `winter` seasonal pack

## Definition Of Done (Sweep)
- Every non-seasonal scene has:
  - at least 2 custom imported models active
  - at least 1 imported texture in use (where stylistically appropriate)
  - scene-specific ambience profile with no generic fallback feel
- No runtime blockers and no scene dropdown/loading regressions.
- `npm run build` passes.
- Manifest and source/license mapping are up to date.

