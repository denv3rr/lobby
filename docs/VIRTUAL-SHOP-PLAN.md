# Virtual Popup Shop Plan

## Objective
- Add a left-side gift shop room inside the lobby that renders clickable product popups sourced from `https://seperet.com/shop`.
- Add a right-side room reserved for code/project cards using the same card presentation format.
- Keep everything static-hosting compatible for GitHub Pages (no backend required).

## Constraints
- Runtime is browser-only on GH Pages.
- Cross-origin live scraping from client is brittle (CORS + markup drift), so ingest must happen at build/dev time.
- App must still load if feed sync fails (graceful fallback to committed defaults).

## Architecture

### 1) Data ingest (build/dev step)
- Script: `scripts/syncShopFeed.mjs`
- Source: `https://seperet.com/shop`
- Flow:
1. Fetch shop listing.
2. Discover product URLs (`/shop/p/...`).
3. Fetch each product page.
4. Parse title, URL, image (Open Graph / JSON-LD), and optional price.
5. Emit normalized JSON feed.

- Output files:
  - Local override (ignored): `public/config/shop-feed.json`
  - Committed fallback: `public/config.defaults/shop-feed.json`

### 2) Runtime content config
- New config: `public/config.defaults/catalog.json`
- Defines:
  - Left room placement and storefront style.
  - Right room placement and projects style.
  - Card layout grid (rows/columns/gap/max visible).
  - Theme mappings (`theme -> item selection strategy`).

- Projects feed:
  - `public/config.defaults/projects-feed.json`
  - Structure mirrors shop feed so both render through one card system.

### 3) 3D systems
- New runtime system: `src/systems/catalog/catalogRoomSystem.js`
- Responsibilities:
  - Build left and right room fixtures (entrance frames, floor strips, signage planes).
  - Instantiate card stands from feed data.
  - Load card images as textures with fallback materials.
  - Expose interactive targets (`hitbox`, `label`, `url`, `hover state`) for click-through.
  - Apply theme-aware filtering/swapping when theme changes.

### 4) Interaction layer integration
- Reuse existing raycast interaction flow by passing portals + catalog targets together.
- Hover prompt displays card title; click opens item link in new tab.

## Theme-aware content behavior
- `catalog.json` maps theme IDs to content presets:
  - Example: `roman` can highlight formal apparel first.
  - Example: `neon` can prioritize cyber items.
- If a theme has no explicit mapping, fallback to `default`.

## Fallback behavior
- If sync script has no network or parse errors:
  - Keep previous `shop-feed.json` if present.
  - Otherwise use committed defaults from `config.defaults`.
- If a card image fails to load:
  - Render branded fallback plane + title label.

## Rollout phases
1. Plan + schema: finalize docs and config contracts.
2. Ingest pipeline: generate static shop feed JSON.
3. Catalog room system: left shop room + right project room scaffold.
4. Theme binding: swap/filter cards on theme change.
5. Polish: signage, spacing, hover cues, and performance tuning.
6. QA + deploy: build verification, GH Pages publish, smoke test links.

## QA checklist
- `npm run sync:shop` writes valid feed JSON.
- `npm run dev` shows populated left shop room with clickable cards.
- Right room renders project-format cards (or placeholder cards) without errors.
- Theme switches do not break catalog content.
- App still loads when feed files are missing or partially invalid.
- `npm run build` succeeds and output works on GH Pages path base.

## Near-term extension
- Add project ingest script for GitHub repos (manual allowlist + metadata fetch).
- Add optional item rarity/featured tags for layout emphasis.
- Add animated card frames by theme (subtle only, performance-safe).
