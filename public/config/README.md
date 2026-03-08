Local runtime overrides supported here (git-ignored):
- `scene.json`
- `themes.json`
- `audio.json`
- `catalog.json`
- `objectives.json`
- `drift-events.json`
- `atelier-feed.json`
- `shop-feed.json`
- `projects-feed.json`
- `videos-feed.json`
- `videos-long-feed.json`

Runtime load behavior:
1. Try `public/config/<file>.json`
2. Fallback to `public/config.defaults/<file>.json`
3. Production `dist/config/*.json` is copied from `dist/config.defaults/*.json`

So if you want GitHub Pages/runtime defaults to change, edit files in:
- `public/config.defaults/`

Recommended local workflow:
1. Tune JSON in the in-app dev menu or under `public/config/`
2. Promote finished overrides into `public/config.defaults/`
3. Push, then let GitHub Pages build the promoted defaults

Short commands:
- `npm run promote` copies current local overrides into `public/config.defaults/`
- `npm run ship` runs promote + validation/build checks
- `npm run sync` refreshes shop, project, and video feeds

Scene interaction hooks:
- Props can declare `interactable.actions` with `url`, `theme`, `portal`, `message`, `show-module`, `hide-module`, or `toggle-module`
- Props can join revealable scene groups with `modules` + `initiallyHidden`
- Props placed intentionally inside catalog room shells should set `allowCatalogOverlap: true`
