/**
 * Cloudflare Pages Function — /proxy
 * Proxies Instagram media URLs to fix CORS and browser download issues.
 * Usage: /proxy?url=<encoded_media_url>
 */
export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const target = searchParams.get('url');

  if (!target) {
    return new Response('Missing url param', { status: 400 });
  }

  // Only allow Instagram CDN domains
  let parsedUrl;
  try {
    parsedUrl = new URL(target);
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  const allowed = ['cdninstagram.com', 'instagram.com', 'fbcdn.net', 'scontent.cdninstagram.com'];
  const isAllowed = allowed.some(d => parsedUrl.hostname.endsWith(d));
  if (!isAllowed) {
    return new Response('Domain not allowed', { status: 403 });
  }

  const upstream = await fetch(target, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.instagram.com/',
    },
    cf: { cacheEverything: true, cacheTtl: 3600 },
  });

  if (!upstream.ok) {
    return new Response('Upstream error', { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') || 'application/octet-stream';

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
