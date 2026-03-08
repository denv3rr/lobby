# Asset Guide

This guide explains how to prepare and add models, textures, and audio for the lobby.

## Folder Layout
- Models: `public/assets/models/...`
- Textures: `public/assets/textures/...`
- Audio: `public/assets/audio/...`

## 1) GLTF/GLB Props

### Recommended Format
- Use `.glb` for compact single-file delivery.
- Apply transforms in DCC tool (Blender) before export when possible.

### Export Settings
- Include only required meshes/materials.
- Prefer low-to-medium poly counts for lobby props.
- Keep texture resolution practical (usually 512-1024).

### Naming Convention
- `prop_<name>.glb`
- Examples:
  - `prop_christmas_tree.glb`
  - `prop_vending_machine.glb`

### Add A Prop
1. Place model in `public/assets/models/props/`.
2. Add prop entry in `public/config/scene.json` or theme `additionalProps`.
3. Set position/rotation/scale.

## 2) Textures

### Recommended Format
- `.webp` for most albedo/diffuse textures.
- `.jpg` acceptable where WebP source is unavailable.

### Recommended Sizes
- Walls/floors: 1024x1024 (2048 only if clearly needed).
- Small props/decals: 512x512.

### Naming Convention
- `wall_<variant>.webp`
- `floor_<variant>.webp`
- `decal_<name>.webp`

### Animated / Thematic Materials
- For animated effects (for example rising flame walls), you can use:
  - `texture` pointing to image/gif asset
  - `textureScroll` in `themes.json` for UV motion
  - `emissiveMap: "$map"` + `emissiveColor` + `emissiveIntensity` for light-emitting look
- Built-in procedural options (no external files needed):
  - `concrete`
  - `checkerboard`
  - `neon-grid`
  - `flame`

## 3) Audio

### Recommended Format
- Ambience/music loops: `.ogg` (or `.mp3` fallback).
- UI and one-shot SFX: short `.wav` or `.ogg`.

### Loudness Guidance
- Normalize ambience around roughly `-18` to `-16 LUFS` (integrated) so layering remains controllable.
- Keep UI SFX brief and lower in level than music peaks.

### Naming Convention
- `amb_<name>_loop.ogg`
- `sfx_<name>.wav`
- Examples:
  - `amb_creepy_music_loop.ogg`
  - `amb_indoor_wind_loop.ogg`
  - `amb_distant_chimes_loop.ogg`
  - `sfx_ui_click.wav`
  - `sfx_footstep_tile_01.wav`

## 4) Missing Asset Behavior
- Missing model paths fall back to primitive placeholders.
- Missing textures fall back to material colors.
- Missing audio files fail gracefully without blocking scene load.

## 5) Seasonal Content Example

### Christmas Tree
1. Drop `public/assets/models/props/christmas_tree.glb`.
2. Add to `themes.json` under `themes.winter.additionalProps`.

### Snow
1. Set `themes.winter.particles.snow.enabled = true`.
2. Tune `count`, `area`, and `fallSpeed` values in JSON.

## 6) Recommended Asset Libraries
- Poly Haven (CC0 textures/HDRIs/models): https://polyhaven.com/license
- ambientCG (CC0 PBR materials): https://ambientcg.com/
- Kenney (CC0 game assets): https://kenney.nl/support
- Quaternius (CC0 model packs): https://quaternius.com/
- Sonniss #GameAudioGDC (royalty-free SFX packs): https://sonniss.com/gdc-bundle-license
- Freesound (mixed licenses, filter carefully): https://freesound.org/help/faq/
- Mixamo animation FAQ: https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html
