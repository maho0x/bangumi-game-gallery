# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test                        # run all tests
npx jest --testNamePattern "X"  # run a single test by name
```

## What This Is

A single-file Bangumi (bgm.tv) userscript/component (`bangumi-game-gallery.js`) that injects a screenshot gallery into game subject pages (`/subject/*`). It is a self-contained IIFE with no build step and no runtime dependencies.

## Architecture

The entire component lives in `bangumi-game-gallery.js`. It:

1. **Guards** on `location.pathname` matching `/subject/\d+` and the presence of `#subject_detail` in the DOM.
2. **Discovers** VNDB, DLsite, Steam, and Getchu IDs from anchor links inside `#infobox`.
3. **Fetches VNDB screenshots** via `POST https://api.vndb.org/kana/vn` with the `screenshots` field. Results are NSFW-rated per `sexual >= 2 || violence >= 2`.
4. **Probes DLsite images** without an API: it constructs image URLs from the product ID (`RJ`/`VJ` prefixes only) by rounding up to the nearest thousand for the folder number, then probes `_img_main.webp`, `_img_smpa{n}.webp`, `_img_smp{n}.webp` sequentially until one fails or n reaches 20.
5. **Fetches Steam screenshots** through the allowlisted Cloudflare Worker at `https://bangumi-steam-gallery.ry.mk`, avoiding Steam Store CORS restrictions.
6. **Fetches Getchu samples** through the same Worker (`/v1/getchu/items/{id}/samples`). Getchu blocks hotlinked images (403 unless the Referer is getchu.com), so thumbnails and full images are also served by the Worker, which checks the Bangumi Referer and caches them at the edge.
7. **Coordinates all sources** in `onAllDone()` — waits for every applicable operation, then shows available tabs or removes the gallery when all sources are empty. VNDB, Steam, and Getchu settle after at most 10 seconds; DLsite uses a 4-second per-image timeout and a 10-second overall timeout so a hanging source cannot block the others indefinitely.
8. **Injects styles** once via a `<style id="vndb-styles">` element.
9. **Registers settings** via the Bangumi platform API `chiiLib.ukagaka.addPanelTab` (silently no-ops if the API is absent).

## Bangumi Platform APIs

These are injected by the Bangumi host page and are not available in tests:

- `chiiApp.cloud_settings.get/update/save` — cross-device settings storage. All reads are wrapped in `cloudGet()` / `cloudSet()` helpers that catch exceptions and fall back to `null`.
- `chiiLib.ukagaka.addPanelTab` — registers a settings tab in Bangumi's personalisation panel. Wrapped in try/catch.

When both cloud and localStorage values exist, cloud takes precedence (see `getShowNsfw()`).

## Settings Persistence

| Setting | Cloud key | localStorage fallback |
|---|---|---|
| Show NSFW | `showNsfw` (`'1'`/`'0'`) | `vndb_show_nsfw` |
| Default source | `defaultSource` (`'dlsite'`/`'vndb'`/`'steam'`/`'getchu'`) | — (default: `'dlsite'`) |
| DLsite/Getchu R18 blur | `dlsiteR18` (`'1'`/`'0'`) | — |

## Testing

Tests are in `__tests__/integration.test.js` and run via Jest with `jsdom`. They `eval()` the component source directly so there is no module system. Key test helpers:

- `mockImageProbe(outcomes)` — replaces `global.Image` to synchronously fire `onload`/`onerror` in sequence, enabling deterministic DLsite probe tests.
- `mockFetch(screenshots)` — mocks the VNDB API response.
- `flushPromises()` — flushes the microtask queue after `loadComponent()` when async paths must complete.

The `chiiApp` cloud settings API is simulated per-test via `mockCloudSettings()` inside the DLsite R18 describe block; it is absent (`global.chiiApp` undefined) in all other tests, exercising the graceful fallback paths.
