# Asset Shortlist (Part 2)

Curated free-source shortlist mapped to the current theme presets.

## License Baseline
- Poly Haven assets are CC0: https://polyhaven.com/license
- Quaternius FAQ confirms CC0 usage for commercial projects: https://quaternius.com/faq.html
- Kenney support confirms CC0 for game assets: https://kenney.nl/support
- Sonniss GameAudioGDC license: https://sonniss.com/gdc-bundle-license/
- Pixabay content license summary: https://pixabay.com/service/license-summary/
- Freesound license FAQ: https://freesound.org/help/faq/

## 1) `lobby` Theme

### Textures
- Concrete wall base:
  - https://polyhaven.com/a/concrete_slab_wall
- Floor tile options:
  - https://polyhaven.com/a/floor_tiles_02
  - https://polyhaven.com/a/checkered_pavement_tiles

### Props
- Urban/indoor prop packs:
  - https://kenney.nl/assets/retro-urban-kit
  - https://kenney.nl/assets/city-kit-industrial

### Ambient Audio
- General ambient tracks:
  - https://pixabay.com/sound-effects/search/ambient/
- Low indoor wind layers:
  - https://pixabay.com/sound-effects/search/wind/

## 2) `inferno` Theme

### Texture/Material Direction
- Use animated wall treatment in config (`textureScroll`) and swap to lava/fire texture sets from:
  - https://polyhaven.com/license (browse texture catalog under CC0)

### Props
- Dungeon/industrial props for braziers, pillars, debris:
  - https://quaternius.com/packs/medievaldungeon.html
  - https://kenney.nl/assets/modular-dungeon-kit

### Ambient Audio
- Dark drones + low rumbles:
  - https://sonniss.com/gameaudiogdc/
  - https://pixabay.com/sound-effects/search/ambient/

## 3) `roman` Theme

### Texture/Material Direction
- Marble and travertine-like surfaces:
  - https://polyhaven.com/a/marble_01
  - https://polyhaven.com/textures?c=tiles

### Props
- Classical architecture/statue-ready kits:
  - https://quaternius.com/packs/oldstyle.html
  - https://kenney.nl/assets/retro-medieval-kit

### Ambient Audio
- Courtyard/wind/chime atmospheres:
  - https://pixabay.com/sound-effects/search/chimes/
  - https://pixabay.com/sound-effects/search/wind/

## 4) `backrooms` Theme

### Texture/Material Direction
- Wallpaper-like and office material sources:
  - https://ambientcg.com/list?category=Wallpaper
  - https://ambientcg.com/list?category=Carpet

### Props
- Office/cubicle-style modular kits:
  - https://kenney.nl/assets/furniture-kit
  - https://quaternius.com/packs/ultimatemodularoffice.html

### Ambient Audio
- Fluorescent hum / office-roomtone style layers:
  - https://pixabay.com/sound-effects/search/hum/
  - https://sonniss.com/gameaudiogdc/

## 5) `purgatory` Theme

### Texture/Material Direction
- High-contrast tile/checker options:
  - https://polyhaven.com/a/checkered_pavement_tiles
- Backup floor tile set:
  - https://polyhaven.com/a/floor_tiles_02

### Props
- Sparse geometric modular kits:
  - https://kenney.nl/assets/modular-dungeon-kit
  - https://kenney.nl/assets/retro-medieval-kit

### Ambient Audio
- Distant chime layers:
  - https://pixabay.com/sound-effects/search/chimes/
- Subtle tonal ambience:
  - https://pixabay.com/sound-effects/search/ambient/

## 6) `neon` Theme

### Lighting/Environment References
- Neon environment look reference (HDRI):
  - https://polyhaven.com/a/neon_photostudio

### Props
- Sci-fi/cyber objects:
  - https://quaternius.com/packs/cyberpunkgamekit.html
  - https://quaternius.com/packs/scifiessentialskit.html
  - https://kenney.nl/assets/modular-space-kit

### Ambient Audio
- Tech hums + synthetic ambience:
  - https://sonniss.com/gameaudiogdc/
  - https://pixabay.com/sound-effects/search/ambient/

## 7) Character / Animation (Optional Later)
- Mixamo FAQ/licensing: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
- Three.js animation runtime docs:
  - https://threejs.org/docs/pages/AnimationMixer.html
  - https://threejs.org/manual/en/animation-system.html

## First Import Pass (Recommended)
1. Import only 2 texture sets + 1 model pack + 2 ambience loops per theme.
2. Keep each texture at 1K initially.
3. Convert long audio loops to `.ogg` and normalize to consistent loudness.
4. After each theme pass, re-test `npm run build` and mobile performance.
