# Integrating Lobby With Seperet.com (Squarespace)

The lobby is a static app hosted on GitHub Pages. No backend is required.

## Option 1 (Recommended): `lobby.seperet.com` Subdomain -> GitHub Pages

Use this when you want the simplest, stable setup.

### Steps
1. Deploy this repository to GitHub Pages (`https://<username>.github.io/lobby/` or custom Pages domain).
2. In repository settings, enable Pages from GitHub Actions deployment.
3. In DNS provider (Cloudflare or domain registrar), create:
   - `CNAME` record: `lobby` -> `<username>.github.io`
4. In repo root, add/update `CNAME` file with:
   - `lobby.seperet.com`
5. In GitHub Pages settings, confirm custom domain is `lobby.seperet.com` and HTTPS is enabled.
6. In Squarespace navigation, add menu link/button to `https://lobby.seperet.com`.

### Squarespace Dropdown Pattern
1. Create a folder/dropdown menu in Squarespace nav, for example `Experiences`.
2. Add external links that point to themed URLs, for example:
   - `https://lobby.seperet.com/?theme=lobby`
   - `https://lobby.seperet.com/?theme=backrooms`
   - `https://lobby.seperet.com/?theme=roman`
   - `https://lobby.seperet.com/?theme=inferno`
   - `https://lobby.seperet.com/?theme=purgatory`
   - `https://lobby.seperet.com/?theme=neon`
3. Users click an option from Seperet dropdown and land directly in that lobby preset.

### Notes
- This avoids proxy caching/routing complexity.
- Keep Vite base path as `/` when deploying to a custom domain root.

## Option 2: `seperet.com/lobby` Path via Cloudflare Reverse Proxy

Use this if you specifically need the lobby under the main site path.

### Steps
1. Deploy lobby on GH Pages (origin), for example:
   - `https://<username>.github.io/lobby/`
2. Configure Vite base to `/lobby/` for build (`VITE_BASE_PATH=/lobby/`).
3. In Cloudflare:
   - Add a rule to proxy requests from `https://seperet.com/lobby/*` to GH Pages origin.
   - Preserve subpath and static file requests.
4. Ensure response headers and caching do not strip JS modules or MIME types.
5. Add rewrite behavior so `/lobby/` serves `index.html` (for SPA-like fallback if needed).
6. Test all asset URLs (`/lobby/assets/...`) and source maps in production.

### Squarespace Dropdown Pattern (Path Proxy)
- Use menu links that point to proxied URLs:
  - `https://seperet.com/lobby/?theme=lobby`
  - `https://seperet.com/lobby/?theme=backrooms`
  - `https://seperet.com/lobby/?theme=roman`
  - `https://seperet.com/lobby/?theme=inferno`
  - `https://seperet.com/lobby/?theme=purgatory`
  - `https://seperet.com/lobby/?theme=neon`

### Notes
- Cloudflare Workers or Transform/Rewrite rules are commonly used for path proxy.
- Squarespace itself does not natively reverse proxy arbitrary app paths; Cloudflare handles this edge routing.

## Which Option To Choose
- Choose **Option 1** if you prioritize reliability and lower maintenance.
- Choose **Option 2** if brand requirements demand a strict path under `seperet.com`.

## No-Backend Guarantee
- Both approaches keep the lobby fully static (HTML/CSS/JS/assets only).
- No server runtime, database, or secrets are required.
