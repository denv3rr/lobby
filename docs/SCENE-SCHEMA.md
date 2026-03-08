# Scene Config Schema

This document defines the JSON structures used by the lobby runtime.

## 1) `scene.json`

```json
{
  "meta": {
    "version": 1
  },
  "room": {
    "size": [28, 8, 28],
    "floorY": 0,
    "wallMaterial": {
      "color": "#7a7a6e",
      "texture": "/assets/textures/wall_default.webp",
      "textureRepeat": [6, 2]
    },
    "floorMaterial": {
      "color": "#5f5f55",
      "texture": "/assets/textures/floor_tile_default.webp",
      "textureRepeat": [7, 7]
    },
    "ceilingMaterial": {
      "color": "#8b8b7e"
    }
  },
  "spawn": {
    "position": [0, 1.7, 9],
    "yaw": 180
  },
  "fog": {
    "color": "#3f3f3a",
    "near": 8,
    "far": 45
  },
  "lights": [
    {
      "type": "ambient",
      "color": "#c3c0b2",
      "intensity": 0.45
    },
    {
      "type": "point",
      "color": "#fff7d1",
      "intensity": 1.0,
      "position": [0, 6, 0],
      "distance": 30,
      "castShadow": false
    }
  ],
  "portals": [
    {
      "id": "shop",
      "label": "Shop",
      "url": "https://seperet.com/shop",
      "position": [-8, 1.4, -10],
      "rotation": [0, 0, 0],
      "size": [2.2, 2.8, 0.2],
      "color": "#8fbfff",
      "icon": "/assets/textures/icon_shop.webp"
    }
  ],
  "props": [
    {
      "id": "bench_a",
      "type": "primitive",
      "primitive": "box",
      "position": [2, 0.5, 3],
      "rotation": [0, 30, 0],
      "scale": [2, 1, 0.8],
      "material": {
        "color": "#4d4639",
        "procedural": "water",
        "textureRepeat": [1, 6],
        "textureScroll": [0, 0.35],
        "emissiveMap": "$map",
        "emissiveColor": "#55bfe2",
        "emissiveIntensity": 0.25,
        "roughness": 0.4,
        "metalness": 0.2
      }
    },
    {
      "id": "tree",
      "type": "model",
      "model": "/assets/models/props/christmas_tree.glb",
      "position": [6, 0, -4],
      "rotation": [0, -25, 0],
      "scale": [1, 1, 1],
      "collider": {
        "type": "box",
        "size": [1.5, 3, 1.5]
      }
    }
  ],
  "zones": [
    {
      "id": "carpet_zone",
      "surface": "carpet",
      "shape": "box",
      "position": [0, 0, 0],
      "size": [10, 0.5, 8]
    }
  ]
}
```

### `scene.json` field notes
- `room.size`: `[width, height, depth]`.
- `room.navigationBounds` expands playable movement bounds beyond base room extents (useful for attached annex rooms).
- `room.sideDoorways` can open left/right wall doorways and render glass storefront panels.
- `spawn.yaw`: degrees facing direction at load.
- `rotation` arrays are in degrees (`[x, y, z]`).
- `props[].type`: `"primitive"` or `"model"`.
- `props[].primitive`: `"box"`, `"sphere"`, `"cylinder"`, `"plane"`, `"torus"`.
- Primitive props can use rich `material` options:
  - `procedural`
  - `texture`
  - `textureRepeat`
  - `textureScroll`
  - `emissiveMap`
  - `emissiveColor`
  - `emissiveIntensity`
  - `roughness`
  - `metalness`
- `zones` are optional helper volumes (for footsteps, triggers, ambience).

## 2) `themes.json`

```json
{
  "defaultTheme": "default",
  "autoThemeByMonth": {
    "enabled": false,
    "map": {
      "12": "winter",
      "10": "halloween"
    }
  },
  "themes": {
    "liminal": {
      "label": "Liminal Hall",
      "roomOverrides": {
        "wallMaterial": {
          "color": "#7a7a6e",
          "procedural": "concrete",
          "texture": "/assets/textures/wall_default.webp",
          "textureRepeat": [6, 2],
          "textureScroll": [0, 0.2],
          "emissiveMap": "$map",
          "emissiveColor": "#ff5b1f",
          "emissiveIntensity": 0.6,
          "roughness": 0.9,
          "metalness": 0.02
        },
        "floorMaterial": { "color": "#5f5f55" }
      },
      "fog": { "color": "#3f3f3a", "near": 8, "far": 45 },
      "disableBaseLights": false,
      "lights": [],
      "additionalLights": [
        {
          "type": "point",
          "color": "#ff6d2a",
          "intensity": 1.2,
          "position": [8, 1.2, -8],
          "distance": 22
        }
      ],
      "ambientAudioMix": {
        "music": 0.32,
        "hum": 0.18
      },
      "particles": {
        "snow": { "enabled": false }
      },
      "additionalProps": []
    },
    "chimehall": {
      "label": "Chime Hall",
      "roomOverrides": {},
      "fog": { "color": "#7e928d", "near": 8, "far": 58 },
      "lights": [],
      "ambientAudioMix": {
        "music": 0.72,
        "hum": 0.55,
        "wind": 0.35,
        "chimes": 1
      },
      "particles": {
        "snow": { "enabled": false }
      },
      "additionalProps": []
    },
    "winter": {
      "label": "Winter Variant",
      "roomOverrides": {
        "wallMaterial": {
          "color": "#a7adb5",
          "texture": "/assets/textures/wall_winter.webp"
        },
        "floorMaterial": {
          "color": "#d4d8dc",
          "texture": "/assets/textures/floor_winter.webp"
        }
      },
      "fog": { "color": "#c2d2e2", "near": 10, "far": 55 },
      "lights": [
        { "index": 1, "color": "#dff4ff", "intensity": 1.1 }
      ],
      "ambientAudioMix": {
        "music": 0.28,
        "hum": 0.14
      },
      "particles": {
        "snow": {
          "enabled": true,
          "count": 600,
          "area": [26, 10, 26],
          "fallSpeed": 0.8
        }
      },
      "additionalProps": [
        {
          "id": "winter_tree",
          "type": "model",
          "model": "/assets/models/props/christmas_tree.glb",
          "position": [5, 0, -7],
          "rotation": [0, -20, 0],
          "scale": [1, 1, 1]
        }
      ]
    }
  }
}
```

### `themes.json` field notes
- `lights` override can reference base light by `index`.
- `disableBaseLights: true` can fully hand lighting over to theme-defined sources.
- `additionalLights` appends custom lights (ambient/point/spot) for theme-specific mood.
- `additionalProps` are appended to `scene.props`.
- `ambientAudioMix` keys should match IDs from `audio.json` ambient layers.
- For material blocks, `procedural` supports built-in textures:
  - `concrete`
  - `checkerboard`
  - `neon-grid`
  - `flame`
  - `marble`
  - `pompeii-fresco`
  - `mosaic`
  - `water`
  - `backrooms-wallpaper`
  - `backrooms-carpet`
  - `office-ceiling`
- `textureScroll` animates UV offset over time (for effects like rising flames).
- `animatedTexture: true` can force per-frame texture updates for animated image sources.

## 3) `audio.json`

```json
{
  "ambientLayers": [
    {
      "id": "lobby_pad",
      "volume": 0.32,
      "synth": {
        "type": "drone",
        "frequency": 132,
        "detune": 5
      }
    },
    {
      "id": "backrooms_buzz",
      "volume": 0.27,
      "synth": {
        "type": "hum",
        "frequency": 58
      }
    }
  ],
  "sfx": {
    "uiHover": "/assets/audio/ui_hover.wav",
    "uiClick": "/assets/audio/ui_click.wav",
    "portalDing": "/assets/audio/elevator_ding.wav",
    "footstepTile": "/assets/audio/footstep_tile.wav",
    "footstepCarpet": "/assets/audio/footstep_carpet.wav"
  },
  "zones": [
    {
      "id": "near_elevator",
      "position": [0, 1.6, -11],
      "radius": 4.5,
      "sfx": "portalDing",
      "cooldownMs": 15000
    }
  ]
}
```

### `audio.json` field notes
- All paths are web-root relative (`/assets/...`).
- `ambientLayers[].id` is used by theme mix overrides.
- `ambientLayers[].synth` enables generated ambience with no external file dependency.
- `zones` are optional proximity-triggered one-shots.

## 4) `catalog.json`

Controls left/right side content rooms that render product/project cards in-world.

```json
{
  "enabled": true,
  "rooms": {
    "shop": {
      "label": "Gift Shop",
      "origin": [-9.8, 0, -1.2],
      "size": [8.6, 4.6, 9.6],
      "accentColor": "#8ec8d3",
      "titleColor": "#e8f6f8",
      "connectorDoor": { "width": 2.4, "height": 3 },
      "card": { "width": 1.45, "height": 1.9 },
      "expansion": { "step": [0, 0, -11.8] },
      "layout": {
        "maxItems": 120,
        "displayY": 2.55,
        "horizontalGap": 0.42,
        "wallMargin": 0.72,
        "cardOffset": 0.08
      }
    },
    "projects": {
      "label": "Projects",
      "origin": [9.8, 0, -1.2],
      "size": [8.6, 4.6, 9.6],
      "accentColor": "#b9a2d8",
      "titleColor": "#f2eaff",
      "card": { "width": 1.45, "height": 1.9 },
      "layout": {
        "columns": 2,
        "maxItems": 6,
        "rowGap": 2.35,
        "columnGap": 2.2
      }
    }
  },
  "themeContent": {
    "default": {
      "shop": { "tagsAny": [] },
      "projects": { "tagsAny": ["core"] }
    },
    "neon": {
      "shop": { "tagsAny": ["neon"] },
      "projects": { "tagsAny": ["neon", "core"] }
    }
  }
}
```

### `catalog.json` field notes
- `rooms.shop` and `rooms.projects` control left/right room placement and card grid.
- Cards are arranged as a single row on each wall (`back -> outer -> front`).
- Overflow past all wall slots auto-spawns additional connected annex rooms using `expansion.step`.
- `themeContent.<themeId>` optionally filters feed items by:
  - `itemIds` (exact IDs)
  - `tagsAny` (any matching tag)
- If no matches are found, runtime falls back to unfiltered items.

## 5) `shop-feed.json`

Generated from `https://seperet.com/shop` by `npm run sync:shop` (local override in `public/config/`, committed fallback in `public/config.defaults/`).

```json
{
  "meta": {
    "source": "https://seperet.com/shop",
    "fetchedAt": "2026-02-23T00:00:00.000Z",
    "count": 5
  },
  "items": [
    {
      "id": "mint-reaper-hoodie",
      "title": "Mint Reaper Hoodie",
      "url": "https://seperet.com/shop/p/mint-reaper-hoodie",
      "image": "https://images.squarespace-cdn.com/...",
      "price": 49,
      "currency": "USD",
      "tags": ["backrooms", "lobby"],
      "artwork": []
    }
  ]
}
```

## 6) `projects-feed.json`

Manual feed for the right room (same item shape as shop feed so both use one card renderer).

```json
{
  "meta": {
    "source": "manual",
    "updatedAt": "2026-02-23T00:00:00.000Z",
    "count": 2
  },
  "items": [
    {
      "id": "lobby-engine",
      "title": "Lobby Engine",
      "url": "https://github.com/denv3rr/lobby",
      "image": null,
      "price": null,
      "currency": null,
      "tags": ["core", "lobby"],
      "artwork": [
        {
          "url": "https://example.com/screenshot-1.jpg",
          "title": "Screenshot 1"
        }
      ]
    }
  ]
}
```
