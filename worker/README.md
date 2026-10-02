# Steam gallery metadata Worker

This Worker exposes these fixed endpoints:

```text
GET /v1/steam/apps/{appId}/screenshots       (Origin: https://bgm.tv)
GET /v1/getchu/items/{id}/samples            (Origin: https://bgm.tv)
GET /v1/getchu/items/{id}/samples/{n}.jpg    (Referer: https://bgm.tv/...)
GET /v1/getchu/items/{id}/samples/{n}_s.jpg  (Referer: https://bgm.tv/...)
```

The Getchu samples endpoint reads the item page (EUC-JP) and returns the
`c{id}sample{n}.jpg` CGs it links. Getchu rejects image requests whose Referer is
not getchu.com, so the two image routes proxy only those sample files, cached at
the edge for 7 days. `<img>` requests carry no Origin header, so these routes
check that the Referer's origin is one of the allowed Bangumi origins instead.
Cache misses on both Getchu routes are charged to `UPSTREAM_RATE_LIMITER`.

It is deliberately not a general-purpose proxy. It validates the Steam App ID,
accepts only the three Bangumi origins, rate-limits each client, applies a second
shared rate limit to Steam cache misses, caches successful and negative results,
and returns only sanitized screenshot metadata.

## Deploy

Wrangler 4.36.0 or newer is required for rate-limit bindings.

1. Change the two `namespace_id` values in `wrangler.jsonc` if those IDs are
   already used by another rate-limit binding in your Cloudflare account.
2. Authenticate and deploy:

   ```bash
   cd worker
   npx wrangler@latest login
   npx wrangler@latest deploy
   ```

3. The production custom domain is configured as
   `bangumi-steam-gallery.ry.mk`; `workers.dev` and preview URLs are disabled.
   Verify the endpoint with an allowed Origin:

   ```bash
   curl -i \
     -H 'Origin: https://bgm.tv' \
     'https://bangumi-steam-gallery.ry.mk/v1/steam/apps/620/screenshots'
   ```

The Worker fails closed with HTTP 503 if either rate-limit binding is absent.
The configuration intentionally does not set `limits.cpu_ms`, because custom CPU
limits are unavailable on the Cloudflare Workers Free plan.

## Component request

```js
function fetchSteamScreenshots(workerBaseUrl, appId) {
  return fetch(
    workerBaseUrl + '/v1/steam/apps/' + encodeURIComponent(appId) + '/screenshots'
  ).then(function (response) {
    if (!response.ok) throw new Error('Steam proxy HTTP ' + response.status);
    return response.json();
  }).then(function (data) {
    return data.screenshots.map(function (shot) {
      return { thumbnail: shot.thumbnail, url: shot.full };
    });
  });
}
```

## Abuse-resistance limits

The Origin allowlist prevents ordinary browser pages on other sites from using
the Worker, but Origin is not authentication and can be spoofed by scripts and
servers. An API secret embedded in a public Bangumi component would also be
extractable and therefore would not improve this.

For a public deployment, also configure Cloudflare account-level controls:

- Set the Worker route to **fail closed** when the account quota is exhausted.
- Add a WAF rate-limiting rule or bot rule on `/v1/steam/apps/*/screenshots` if
  the domain is proxied through a Cloudflare zone.
- Enable Workers Logs and watch HTTP 429, 503, and cache-miss volume.
- Lower `UPSTREAM_RATE_LIMITER` if the gallery has modest traffic.

Cloudflare's Worker rate-limit counters and Cache API are local to each Cloudflare
location. They are practical abuse controls, not strict global accounting. For a
hard global daily quota, add a Durable Object counter or restrict requests to a
maintained allowlist of Steam App IDs.
