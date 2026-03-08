# Context Scene Generation

This workflow maps a theme context to concrete JSON settings so new scenes stay coherent.

## 1) Context Inputs
- `identity`: one-line narrative (`"abandoned civic atrium"`, `"roman ceremonial hall"`)
- `material family`: stone, plaster, metal, tile, cloth
- `energy`: calm / tense / oppressive / ritual / synthetic
- `source light model`: candles, flame walls, skylight, neon tubes, moonlight
- `acoustic profile`: hard echo, muffled carpet, water reflections, machine hum

## 2) Theme Synthesis Rules

### A) Visual Blocks
- Walls/floor/ceiling use one dominant material family + one accent family.
- Use fog to set depth psychology:
  - short far plane for claustrophobic themes
  - long far plane for grand ceremonial themes
- Add 2-4 structural props that communicate identity (columns, monoliths, channels).

### B) Lighting Blocks
- Start with `disableBaseLights=true` when theme lighting must come from scene objects.
- Build a lighting stack:
  - one low-intensity ambient anchor
  - 2-6 source lights placed where the in-world source exists
  - optional spotlight for ritual/focus scenes
- If source lights are emissive materials, match light color to emissive hue.

### C) Material Animation
- Use `textureScroll` for directional flow:
  - flame: upward (`[0, +v]`)
  - streams/water channels: directional along channel axis
  - neon scanlines: subtle vertical/horizontal drift
- Prefer subtle speeds; large values break liminal mood.

### D) Audio Blocks
- Ambient layers should match context source:
  - architectural/stone: low wind + distant chimes
  - infernal: low drone + heat rumble
  - cyber: electrical hum + synthetic pad
- Keep one layer dominant, others supportive to avoid fatigue.

## 3) Procedural Theme Authoring Pattern

1. Define mood palette: 3-5 colors.
2. Set room material overrides.
3. Place source-driven lights.
4. Add 3-12 props for silhouette and scale.
5. Add material animation where motion is physically implied (water/flame/signage).
6. Tune ambient mix after lighting pass.
7. Validate in low/medium/high quality.

## 4) Current Theme Examples
- `lobby`: warm marble + trim + restrained amber lighting.
- `purgatory`: hard checker field + stark spot pools + monolith forms.
- `roman`: Pompeian red fresco walls, mosaic floor, white columns/statues, warm atrium lighting.
- `backrooms`: yellow wallpaper/carpet office maze with fluorescent pools and low hum.
- `inferno`: rising emissive flame walls with localized orange sources.
- `neon`: emissive grid + cyan/magenta point sources + animated liquid channels.

## 5) Next Expansion Loop
- Add a `themeBlueprints.json` authoring file:
  - mood tags
  - palette
  - material recipes
  - sound recipes
  - prop recipe slots
- Generate final `themes.json` presets from blueprints with a small build script.
- Keep handcrafted overrides for hero scenes.

## References
- Three.js `Fog`: https://threejs.org/docs/#api/en/scenes/Fog
- Three.js `PointLight`: https://threejs.org/docs/#api/en/lights/PointLight
- Three.js `SpotLight`: https://threejs.org/docs/#api/en/lights/SpotLight
- WFC reference implementation: https://github.com/mxgmn/WaveFunctionCollapse
- Procedural Content Generation in Games (book): http://pcgbook.com/
- Wwise fundamentals (layering/mixing workflows): https://www.audiokinetic.com/en/courses/wwise101/
