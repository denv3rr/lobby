Local runtime override supported here (git-ignored):
- `scene.json`

Runtime load behavior:
1. Try `public/config/scene.json`
2. Fallback to `public/config.defaults/scene.json`
3. All other runtime configs load from `public/config.defaults/*.json` only

So if you want GitHub Pages/runtime defaults to change, edit files in:
- `public/config.defaults/`
