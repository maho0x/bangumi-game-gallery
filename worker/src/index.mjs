const DEFAULT_ALLOWED_ORIGINS = [
  'https://bgm.tv',
  'https://bangumi.tv',
  'https://chii.in'
];

const ROUTE = /^\/v1\/steam\/apps\/([1-9]\d{0,9})\/screenshots$/;
const GETCHU_SAMPLES_ROUTE = /^\/v1\/getchu\/items\/([1-9]\d{0,8})\/samples$/;
const GETCHU_IMAGE_ROUTE = /^\/v1\/getchu\/items\/([1-9]\d{0,8})\/samples\/([1-9]\d?)(_s)?\.jpg$/;
const MAX_APP_ID = 4294967295;
const MAX_GETCHU_SAMPLES = 50;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_EDGE_TTL = 7 * 24 * 60 * 60;
const IMAGE_BROWSER_TTL = 24 * 60 * 60;
const MAX_UPSTREAM_BYTES = 2 * 1024 * 1024;
const MAX_SCREENSHOTS = 100;
const SUCCESS_EDGE_TTL = 6 * 60 * 60;
const NOT_FOUND_EDGE_TTL = 10 * 60;
const BROWSER_TTL = 60 * 60;
const UPSTREAM_TIMEOUT_MS = 8000;

function allowedOrigins(env) {
  const configured = (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function securityHeaders() {
  return {
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
}

function jsonResponse(body, status, origin, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...securityHeaders(),
      ...(origin ? corsHeaders(origin) : {}),
      ...extraHeaders
    }
  });
}

function parseAppId(pathname) {
  const match = pathname.match(ROUTE);
  if (!match) return null;
  const appId = Number(match[1]);
  return Number.isSafeInteger(appId) && appId > 0 && appId <= MAX_APP_ID
    ? String(appId)
    : null;
}

function buildSteamScreenshotUrl(filename, appId, size) {
  if (typeof filename !== 'string') return null;
  const match = filename.match(
    /^steam\/apps\/([1-9]\d{0,9})\/(ss_[a-f0-9]{40})\.jpg(\?t=\d+)?$/i
  );
  if (!match || match[1] !== appId) return null;
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/` +
    `${match[2]}.${size}.jpg${match[3] || ''}`;
}

function sanitizeSteamPayload(payload, appId) {
  const items = payload && payload.response && payload.response.store_items;
  const item = Array.isArray(items)
    ? items.find((candidate) =>
        candidate && String(candidate.appid || candidate.id) === appId && candidate.success === 1
      )
    : null;
  if (!item) return null;

  const sourceScreenshots = item.screenshots && item.screenshots.all_ages_screenshots;
  const screenshots = Array.isArray(sourceScreenshots)
    ? sourceScreenshots.slice(0, MAX_SCREENSHOTS).flatMap((shot) => {
        const thumbnail = shot && buildSteamScreenshotUrl(shot.filename, appId, '600x338');
        const full = shot && buildSteamScreenshotUrl(shot.filename, appId, '1920x1080');
        if (!thumbnail || !full) {
          return [];
        }
        return [{ thumbnail, full }];
      })
    : [];

  return {
    appId: Number(appId),
    name: typeof item.name === 'string' ? item.name.slice(0, 300) : '',
    requiredAge: 0,
    contentDescriptorIds: [],
    screenshots
  };
}

function cacheKey(request, appId) {
  const url = new URL(request.url);
  url.pathname = `/__cache/steam/apps/${appId}/screenshots`;
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
}

async function fetchSteam(appId) {
  const endpoint = new URL('https://api.steampowered.com/IStoreBrowseService/GetItems/v1/');
  endpoint.searchParams.set('input_json', JSON.stringify({
    ids: [{ appid: Number(appId) }],
    context: {
      language: 'english',
      country_code: 'US',
      steam_realm: 1
    },
    data_request: {
      include_basic_info: true,
      include_screenshots: true
    }
  }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BangumiGameGallery/1.0 (Steam screenshot metadata proxy)'
      },
      redirect: 'follow',
      signal: controller.signal
    });

    if (!response.ok) throw new Error(`Steam returned HTTP ${response.status}`);
    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new Error('Steam returned a non-JSON response');
    }
    const contentLength = Number(response.headers.get('Content-Length') || 0);
    if (contentLength > MAX_UPSTREAM_BYTES) throw new Error('Steam response is too large');

    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_UPSTREAM_BYTES) {
      throw new Error('Steam response is too large');
    }
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

function parseGetchuSamplesId(pathname) {
  const match = pathname.match(GETCHU_SAMPLES_ROUTE);
  return match ? match[1] : null;
}

function parseGetchuImage(pathname) {
  const match = pathname.match(GETCHU_IMAGE_ROUTE);
  return match ? { id: match[1], n: match[2], thumb: Boolean(match[3]) } : null;
}

function getchuImagePath(id, n, thumb) {
  return `/v1/getchu/items/${id}/samples/${n}${thumb ? '_s' : ''}.jpg`;
}

function getchuUpstreamImageUrl(id, n, thumb) {
  return `https://www.getchu.com/brandnew/${id}/c${id}sample${n}${thumb ? '_s' : ''}.jpg`;
}

// Getchu item pages link every sample CG as /brandnew/{id}/c{id}sample{n}.jpg,
// with an optional _s.jpg thumbnail. Only those numbers are taken from the page.
function extractGetchuSamples(html, id, base) {
  const pattern = new RegExp(`/brandnew/${id}/c${id}sample([1-9]\\d?)(_s)?\\.jpg`, 'g');
  const full = new Set();
  const thumbs = new Set();
  for (const match of html.matchAll(pattern)) {
    (match[2] ? thumbs : full).add(Number(match[1]));
  }
  return [...full].sort((a, b) => a - b).slice(0, MAX_GETCHU_SAMPLES).map((n) => ({
    thumbnail: base + getchuImagePath(id, n, thumbs.has(n)),
    full: base + getchuImagePath(id, n, false)
  }));
}

async function fetchWithTimeout(url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readLimited(response, maxBytes) {
  const contentLength = Number(response.headers.get('Content-Length') || 0);
  if (contentLength > maxBytes) throw new Error('Upstream response is too large');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error('Upstream response is too large');
  return buffer;
}

async function fetchGetchuItemPage(id) {
  const response = await fetchWithTimeout(`https://www.getchu.com/item/${id}/?gc=gc`, {
    headers: {
      'Accept': 'text/html',
      // Skips the age gate; without it Getchu serves an interstitial page.
      'Cookie': 'getchu_adalt_flag=getchu.com',
      'User-Agent': 'BangumiGameGallery/1.0 (Getchu sample metadata proxy)'
    },
    redirect: 'follow'
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Getchu returned HTTP ${response.status}`);
  const buffer = await readLimited(response, MAX_UPSTREAM_BYTES);
  return new TextDecoder('euc-jp').decode(buffer);
}

async function checkRateLimit(limiter, key) {
  if (!limiter || typeof limiter.limit !== 'function') return false;
  const result = await limiter.limit({ key });
  return result.success === true;
}

function refererOrigin(request) {
  try {
    return new URL(request.headers.get('Referer') || '').origin;
  } catch (error) {
    return null;
  }
}

function edgeCacheKey(request, pathname) {
  const url = new URL(request.url);
  url.pathname = `/__cache${pathname}`;
  url.search = '';
  return new Request(url.toString(), { method: 'GET' });
}

// <img> requests carry no Origin header, so image routes check the Referer,
// which Bangumi pages send as their origin under the default referrer policy.
async function handleGetchuImage(request, env, ctx, image) {
  if (!allowedOrigins(env).has(refererOrigin(request))) {
    return jsonResponse({ error: 'forbidden_referer' }, 403, null);
  }
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, null, { 'Allow': 'GET' });
  }
  if (!env.UPSTREAM_RATE_LIMITER) {
    return jsonResponse({ error: 'rate_limiter_not_configured' }, 503, null);
  }

  const key = edgeCacheKey(request, getchuImagePath(image.id, image.n, image.thumb));
  const cached = await caches.default.match(key);
  if (cached) {
    return new Response(cached.body, {
      status: 200,
      headers: {
        'Content-Type': cached.headers.get('Content-Type') || 'image/jpeg',
        'Cache-Control': `public, max-age=${IMAGE_BROWSER_TTL}`,
        'X-Worker-Cache': 'HIT',
        ...securityHeaders()
      }
    });
  }

  const upstreamAllowed = await checkRateLimit(env.UPSTREAM_RATE_LIMITER, 'getchu-image');
  if (!upstreamAllowed) {
    return jsonResponse(
      { error: 'upstream_rate_limited' },
      503,
      null,
      { 'Retry-After': '60', 'Cache-Control': 'no-store' }
    );
  }

  try {
    const response = await fetchWithTimeout(
      getchuUpstreamImageUrl(image.id, image.n, image.thumb),
      {
        headers: {
          'Accept': 'image/*',
          // Getchu rejects image requests that do not come from its own pages.
          'Referer': `https://www.getchu.com/item/${image.id}/`,
          'User-Agent': 'BangumiGameGallery/1.0 (Getchu sample image proxy)'
        }
      }
    );
    const contentType = response.headers.get('Content-Type') || '';
    if (!response.ok || !contentType.toLowerCase().startsWith('image/')) {
      return jsonResponse(
        { error: 'getchu_image_not_found' },
        404,
        null,
        { 'Cache-Control': 'public, max-age=60' }
      );
    }
    const body = await readLimited(response, MAX_IMAGE_BYTES);
    ctx.waitUntil(caches.default.put(key, new Response(body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, s-maxage=${IMAGE_EDGE_TTL}`
      }
    })));
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': `public, max-age=${IMAGE_BROWSER_TTL}`,
        'X-Worker-Cache': 'MISS',
        ...securityHeaders()
      }
    });
  } catch (error) {
    console.error('Getchu image request failed', error);
    return jsonResponse(
      { error: 'getchu_upstream_unavailable' },
      502,
      null,
      { 'Cache-Control': 'no-store' }
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const image = url.search ? null : parseGetchuImage(url.pathname);
    if (image) return handleGetchuImage(request, env, ctx, image);

    const origin = request.headers.get('Origin');

    // Requiring an exact browser Origin stops other websites from casually using
    // this endpoint. It is not authentication: non-browser clients can spoof it.
    if (!origin || !allowedOrigins(env).has(origin)) {
      return jsonResponse({ error: 'forbidden_origin' }, 403, null);
    }

    const appId = parseAppId(url.pathname);
    const getchuId = parseGetchuSamplesId(url.pathname);
    if ((!appId && !getchuId) || url.search) {
      return jsonResponse({ error: 'not_found' }, 404, origin);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...securityHeaders(), ...corsHeaders(origin) }
      });
    }

    if (request.method !== 'GET') {
      return jsonResponse(
        { error: 'method_not_allowed' },
        405,
        origin,
        { 'Allow': 'GET, OPTIONS' }
      );
    }

    // Fail closed if the Wrangler bindings were omitted. Silently running without
    // limits would turn this into an easy-to-abuse public endpoint.
    if (!env.CLIENT_RATE_LIMITER || !env.UPSTREAM_RATE_LIMITER) {
      return jsonResponse({ error: 'rate_limiter_not_configured' }, 503, origin);
    }

    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const clientAllowed = await checkRateLimit(
      env.CLIENT_RATE_LIMITER,
      `${origin}:${clientIp}`
    );
    if (!clientAllowed) {
      return jsonResponse(
        { error: 'rate_limited' },
        429,
        origin,
        { 'Retry-After': '60', 'Cache-Control': 'no-store' }
      );
    }

    if (getchuId) return handleGetchuSamples(request, env, ctx, origin, getchuId);

    const key = cacheKey(request, appId);
    const cached = await caches.default.match(key);
    if (cached) {
      const body = await cached.text();
      return new Response(body, {
        status: cached.status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${cached.status === 200 ? BROWSER_TTL : 60}`,
          'X-Worker-Cache': 'HIT',
          ...securityHeaders(),
          ...corsHeaders(origin)
        }
      });
    }

    // This second, shared limit is charged only on cache misses and protects the
    // Steam upstream when an attacker rotates IPs or randomizes App IDs.
    const upstreamAllowed = await checkRateLimit(
      env.UPSTREAM_RATE_LIMITER,
      'steam-appdetails'
    );
    if (!upstreamAllowed) {
      return jsonResponse(
        { error: 'upstream_rate_limited' },
        503,
        origin,
        { 'Retry-After': '60', 'Cache-Control': 'no-store' }
      );
    }

    try {
      const payload = await fetchSteam(appId);
      const result = sanitizeSteamPayload(payload, appId);
      const status = result ? 200 : 404;
      const body = JSON.stringify(result || { error: 'steam_app_not_found' });
      const edgeTtl = result ? SUCCESS_EDGE_TTL : NOT_FOUND_EDGE_TTL;
      const cachedResponse = new Response(body, {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, s-maxage=${edgeTtl}`
        }
      });

      ctx.waitUntil(caches.default.put(key, cachedResponse.clone()));

      return new Response(body, {
        status,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${result ? BROWSER_TTL : 60}`,
          'X-Worker-Cache': 'MISS',
          ...securityHeaders(),
          ...corsHeaders(origin)
        }
      });
    } catch (error) {
      console.error('Steam upstream request failed', error);
      return jsonResponse(
        { error: 'steam_upstream_unavailable' },
        502,
        origin,
        { 'Cache-Control': 'no-store' }
      );
    }
  }
};

async function handleGetchuSamples(request, env, ctx, origin, id) {
  const base = new URL(request.url).origin;
  const key = edgeCacheKey(request, `/v1/getchu/items/${id}/samples`);
  const cached = await caches.default.match(key);
  if (cached) {
    const body = await cached.text();
    return new Response(body, {
      status: cached.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${cached.status === 200 ? BROWSER_TTL : 60}`,
        'X-Worker-Cache': 'HIT',
        ...securityHeaders(),
        ...corsHeaders(origin)
      }
    });
  }

  const upstreamAllowed = await checkRateLimit(env.UPSTREAM_RATE_LIMITER, 'getchu-item');
  if (!upstreamAllowed) {
    return jsonResponse(
      { error: 'upstream_rate_limited' },
      503,
      origin,
      { 'Retry-After': '60', 'Cache-Control': 'no-store' }
    );
  }

  try {
    const html = await fetchGetchuItemPage(id);
    const samples = html ? extractGetchuSamples(html, id, base) : [];
    const result = html ? { id: Number(id), samples } : null;
    const status = result ? 200 : 404;
    const body = JSON.stringify(result || { error: 'getchu_item_not_found' });
    const edgeTtl = result ? SUCCESS_EDGE_TTL : NOT_FOUND_EDGE_TTL;
    ctx.waitUntil(caches.default.put(key, new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, s-maxage=${edgeTtl}`
      }
    })));
    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': `public, max-age=${result ? BROWSER_TTL : 60}`,
        'X-Worker-Cache': 'MISS',
        ...securityHeaders(),
        ...corsHeaders(origin)
      }
    });
  } catch (error) {
    console.error('Getchu upstream request failed', error);
    return jsonResponse(
      { error: 'getchu_upstream_unavailable' },
      502,
      origin,
      { 'Cache-Control': 'no-store' }
    );
  }
}

export {
  parseAppId,
  sanitizeSteamPayload,
  parseGetchuSamplesId,
  parseGetchuImage,
  extractGetchuSamples
};
