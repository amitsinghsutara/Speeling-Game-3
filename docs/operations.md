# Operations

## Environments

| | URL | Project |
|---|---|---|
| Production | https://spelling-adventure-68z.pages.dev | Cloudflare Pages `spelling-adventure` (classic Pages) |
| Game 2 (separate, leave alone) | https://forest-spelling-adventure.pages.dev | `forest-spelling-adventure` |

## Prerequisites

- **Node 24 or later.** It runs the TypeScript scripts directly.
- **Cloudflare login:** sign in with `npx wrangler login`.
- **npm setting on this machine:** if `npm install` fails with `EALLOWSCRIPTS`, your shell has `npm_config_allow_scripts` set. Run `unset npm_config_allow_scripts` (bash), or `Remove-Item Env:npm_config_allow_scripts` (PowerShell), first. Don't change `~/.npmrc`.

## Deploying

```bash
npm run deploy:adviser   # production: check + build with AI switched on in the browser + upload
```

- **Always use `deploy:adviser` for production.** Plain `npm run deploy` builds with the browser AI switches off, which quietly stops players asking for advice and suggestions.
- **How players get it:** see [Updates](#updates) below. In short, the app finds the new version by itself, offers it on the Welcome and level screens, and also installs it on the next launch.
- **Settings need a deploy.** Secret changes apply to **new deployments**, so redeploy after changing one.

## Secrets and settings

All values are encrypted Cloudflare secrets on the production environment.

```bash
npx wrangler pages secret list --project-name=spelling-adventure                 # names only
printf 'true' | npx wrangler pages secret put ADVISER_ENABLED --project-name=spelling-adventure
npx wrangler pages secret put GEMINI_API_KEY --project-name=spelling-adventure   # interactive; paste the key
```

| Name | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio key. Only the owner enters it. |
| `GEMINI_MODEL` | Main model id |
| `GEMINI_FALLBACK_MODEL` | Optional second model |
| `ADVISER_ENABLED` | `true` turns the play adviser on |
| `INSIGHTS_ENABLED` | `true` turns the grown-ups' suggestions on |

### Kill switches

Turning either feature off takes effect on the next deployment. The game keeps working, using its local rules.

```bash
printf 'false' | npx wrangler pages secret put ADVISER_ENABLED --project-name=spelling-adventure
printf 'false' | npx wrangler pages secret put INSIGHTS_ENABLED --project-name=spelling-adventure
npm run deploy:adviser
```

### Rotating the Gemini key

1. Create a new key in Google AI Studio.
2. Run `npx wrangler pages secret put GEMINI_API_KEY --project-name=spelling-adventure` and paste the new key.
3. Redeploy, then delete the old key in AI Studio.
4. Update `.dev.vars` for local testing.

## Logs

```bash
npx wrangler pages deployment tail --project-name=spelling-adventure
```

Lines look like `{"event":"advice","outcome":"ok","model":"gemini-3.5-flash-lite",…}`. They contain metadata only. In the browser, filter the console on `[adviser]` or `[insights]`.

## Local development

| Command | What it runs |
|---|---|
| `npm run dev` | The game with hot reload. No service worker, no AI functions. |
| `npm run build && npx vite preview` | The production build with the service worker, for offline testing |
| `npm run dev:full` | The production build with AI switched on, plus the Pages Functions, at http://127.0.0.1:8788 |
| `npm run mock:gemini` | A fake Gemini at http://127.0.0.1:8790 |

### Local testing with the Pages Functions

1. Copy `.dev.vars.example` to `.dev.vars`. It's git-ignored, and only the local server reads it.
2. Set it up for one of two modes:
   - **Real Gemini:** set `GEMINI_API_KEY`, `GEMINI_MODEL` and optionally `GEMINI_FALLBACK_MODEL`, plus `ADVISER_ENABLED=true` and `INSIGHTS_ENABLED=true`.
   - **Fake Gemini:** uncomment `GEMINI_API_BASE=http://127.0.0.1:8790` and run `npm run mock:gemini`.
3. Run `npm run dev:full`. The server reads `.dev.vars` at startup, so restart it after edits.
4. To send a realistic request without playing, use `node scripts/sample-advice-request.ts` or `node scripts/sample-insights-request.ts` and POST the output with `curl`.

For safety, the function sends the key only to Google's endpoint or to `127.0.0.1` or `localhost`.

## Updates

The code is in `src/pwa/register.ts`, `src/pwa/updates.ts` and `src/pwa/status.ts`.

1. **Checks:** the app checks for a new version on load, **every 30 minutes**, whenever it **returns to the foreground**, and when the device **comes back online**. The gap between checks is at least 1 minute. This matters for the container app, which may stay open for days.
2. **Download:** a found version downloads in the background and waits.
3. **Offer:** on the Welcome and level screens, a banner says *"A new version is ready!"* with **Update now** and **Later**. It never appears during a puzzle. "Later" is safe, because the update also installs itself on the next launch.
4. **Apply:** "Update now" asks the waiting version to take over, then **reloads the page ourselves**. Progress is saved on every change, so nothing is lost.
5. **Grown-ups' screen:** it shows the running version (`0.1.0 (commit, built date)`) and a **Check for updates** button, with "Checking…", "You have the latest version", "A new version is ready" (plus **Update now**), "offline" or an error.
6. **Console:** `[updates]` messages log the running version, each check's result, and when an update is applied.

**Why the app reloads itself:** vite-plugin-pwa only reloads for updates Workbox found itself. It treats versions found by our own checks as "external" and never reloads for them. Relying on it left pages running old code after the new version had taken over. The app also catches a newer version taking over from elsewhere, such as another tab, and offers a reload.

**Version info:** `vite.config.ts` injects `__APP_BUILD__` (the `package.json` version, the short git commit and the build time) into every build. Bump `version` in `package.json` for releases.

**Testing an update locally:**

1. Run `npx vite build && npx vite preview --host 127.0.0.1 --port <fresh port>`.
2. Open the page and let it cache.
3. Run `npx vite build` again; a new build time counts as a new version.
4. Open the grown-ups' screen and press **Check for updates**, go back to the level screen, and press **Update now**.

## Offline

- **Precache:** the service worker caches 218 entries (about 4.9 MB): the app, content, woff2 fonts, icons and all 200 word MP3s.
- **Container notice:** once caching completes, the container is told through `window.Android.cachedStatus(true)`.
- **Testing offline:** build and preview, let it cache, **stop the server**, then reload. Checking only in an already-open tab isn't enough.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `npm install` fails with `EALLOWSCRIPTS` | Unset `npm_config_allow_scripts` (see Prerequisites) |
| A local preview shows **Game 2** | An old Game 2 service worker still controls that `localhost` port. Use another port, or `127.0.0.1`. |
| Live site shows the old version | It updates on the next launch, or when the Welcome or level screen applies the update. Reload once. |
| No `[adviser]` requests in production | Deployed with `npm run deploy` instead of `deploy:adviser`, or `ADVISER_ENABLED` isn't `true` |
| Advice is always `ADVISER_NOT_APPLICABLE` | Normal for a new child: there is nothing to choose between yet |
| Insights show "AI took too long" or "not available" | Gemini timed out or hit its free-tier limit. The local suggestions are shown instead. |
| `wrangler pages project create` fails with `EALLOWSCRIPTS` | Wrangler 4.149 delegates to Workers. The project already exists; never pass `--force` again. |
