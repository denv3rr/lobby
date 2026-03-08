# Scene Expansion Research

This file tracks open-source scene references and the config patterns already supported in the lobby so future wings can be added without hardcoding one-off logic.

## Open-Source Three.js References

- Official portal example: https://threejs.org/examples/webgl_portal.html
  - Useful for portal framing, layered emissive depth, and scene-within-scene presentation ideas.
- Official pointer lock example: https://threejs.org/examples/misc_controls_pointerlock
  - Useful for keeping desktop movement predictable while new wings and mini-spaces are added.
- Official environment map example: https://threejs.org/examples/webgl_materials_envmaps.html
  - Useful reference for reflective room accents and premium material response.
- Official ground-projected environment mapping example: https://threejs.org/examples/webgl_materials_envmaps_groundprojected.html
  - Useful for outdoor wings that need more atmosphere without adding heavy geometry.
- Procedural city tour: https://github.com/jstrait/city-tour
  - Good reference for modular world generation, path-driven traversal, and city-scale layout thinking.
- Open-source art gallery prototype: https://github.com/theringsofsaturn/3D-art-gallery-threejs
  - Useful for room pacing, framed content presentation, and exhibition-style sequencing.

## CC0 / Open Asset Sources Already In Use

- Kenney: https://kenney.nl/assets
- Quaternius: https://quaternius.com
- Poly Haven: https://polyhaven.com
- ambientCG: https://ambientcg.com

## Current Room/Interaction Patterns

The lobby now supports:

- Add a new feed room in `public/config.defaults/catalog.json` under `rooms`.
- Feed a room from any runtime feed with `feedSource`.
- Place a room anywhere with `origin`, `size`, `entrySide`, and `expansion.step`.
- Prevent cluttered entrances automatically through scene-loader doorway/portal safety checks.
- Add inspectable props in `public/config.defaults/scene.json` with `interactable`.
- Give an interactable reusable actions:
  - `url`
  - `theme`
  - `portal`
  - `message`
  - `show-module`
  - `hide-module`
  - `toggle-module`
- Group props into revealable modules with:
  - `modules`
  - `initiallyHidden`
  - `allowCatalogOverlap` for props intentionally placed inside catalog room shells

## Suggested Next Builds

- Add a playable micro-loop inside the Prototype Atelier using `toggle-module` and timed reveals.
- Introduce a second feed-backed outdoor wing for livestreams, devlogs, or releases.
- Swap primitive hero props in the outdoor district for CC0 kitbashed GLBs from the asset sources above.
- Add room-local audio beds and theme-specific exterior lighting to each outdoor wing.
