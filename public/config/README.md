Local runtime config files live here and are git-ignored by default:
- `scene.json`
- `themes.json`
- `audio.json`
- `catalog.json`
- `shop-feed.json`
- `projects-feed.json`

If these are missing, the app loads tracked defaults from:
- `public/config.defaults/scene.json`
- `public/config.defaults/themes.json`
- `public/config.defaults/audio.json`
- `public/config.defaults/catalog.json`
- `public/config.defaults/shop-feed.json`
- `public/config.defaults/projects-feed.json`

For local customization:
1. Copy defaults into this folder.
2. Edit local files.
3. Run `npm run dev`.

To refresh live shop products into your local ignored runtime config:
1. Run `npm run sync:shop`
2. Restart dev server if needed.

To refresh projects feed from GitHub pinned repos:
1. Run `npm run sync:projects`
2. (Optional) include workshop screenshots:
   `npm run sync:projects -- --workshop-url="<workshop-item-url>" --workshop-title="South Padre Island"`
