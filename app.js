/* ===========================
   Grabify — app.js
   3-tier Instagram media fetch
   =========================== */

const CORS_PROXY = 'https://corsproxy.io/?';

// ── helpers ──────────────────────────────────────────────

function extractShortcode(url) {
  const match = url.match(/instagram\.com\/(?:p|reel|reels|tv|stories\/[^/]+)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

function mediaType(url) {
  if (!url) return 'photo';
  if (/\.mp4|\.mov|video/i.test(url)) return 'video';
  return 'photo';
}

function setLoading(msg = 'Fetching media…') {
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('errorCard').style.display = 'none';
  document.getElementById('loadingCard').style.display = 'block';
  document.getElementById('loadingText').textContent = msg;
}

function showError(title, msg) {
  document.getElementById('loadingCard').style.display = 'none';
  document.getElementById('resultCard').style.display = 'none';
  const ec = document.getElementById('errorCard');
  ec.style.display = 'block';
  ec.classList.remove('slide-in');
  void ec.offsetWidth;
  ec.classList.add('slide-in');
  document.getElementById('errorTitle').textContent = title;
  document.getElementById('errorMsg').textContent = msg;
}

function showResult({ mediaUrl, thumbUrl, type, author }) {
  document.getElementById('loadingCard').style.display = 'none';
  document.getElementById('errorCard').style.display = 'none';

  const rc = document.getElementById('resultCard');
  rc.style.display = 'block';
  rc.classList.remove('slide-in');
  void rc.offsetWidth;
  rc.classList.add('slide-in');

  // badge
  const badge = document.getElementById('resultBadge');
  badge.textContent = type === 'video' ? '🎬 Reel / Video' : '🖼️ Photo';

  // preview
  const preview = document.getElementById('mediaPreview');
  preview.innerHTML = '';
  if (type === 'video' && mediaUrl) {
    const vid = document.createElement('video');
    vid.src = mediaUrl;
    vid.controls = true;
    vid.playsInline = true;
    vid.preload = 'metadata';
    preview.appendChild(vid);
  } else if (thumbUrl || mediaUrl) {
    const img = document.createElement('img');
    img.src = thumbUrl || mediaUrl;
    img.alt = 'Instagram media preview';
    img.loading = 'lazy';
    preview.appendChild(img);
  } else {
    preview.innerHTML = '<p class="media-placeholder">Preview not available.<br/>Click Download to save.</p>';
  }

  // author meta
  const metaRow = document.getElementById('metaRow');
  const authorEl = document.getElementById('authorMeta');
  if (author) {
    metaRow.style.display = 'block';
    authorEl.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
      @${author}`;
  } else {
    metaRow.style.display = 'none';
  }

  // download button
  const dlBtn = document.getElementById('downloadBtn');
  dlBtn.onclick = () => downloadMedia(mediaUrl || thumbUrl, type);
}

async function downloadMedia(url, type) {
  if (!url) return;
  const dlBtn = document.getElementById('downloadBtn');
  dlBtn.disabled = true;
  dlBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/><polyline points="12 8 12 12 14 14"/>
    </svg>
    Downloading…`;

  try {
    const proxied = CORS_PROXY + encodeURIComponent(url);
    const res = await fetch(proxied);
    const blob = await res.blob();
    const ext = type === 'video' ? 'mp4' : 'jpg';
    const filename = `grabify_${Date.now()}.${ext}`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    // fallback: open in new tab
    window.open(url, '_blank');
  }

  dlBtn.disabled = false;
  dlBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    Download`;
}

function resetUI() {
  document.getElementById('resultCard').style.display = 'none';
  document.getElementById('errorCard').style.display = 'none';
  document.getElementById('loadingCard').style.display = 'none';
  document.getElementById('urlInput').value = '';
  document.getElementById('urlInput').focus();
}

// ── Tier 1: oEmbed ────────────────────────────────────────

async function fetchOEmbed(url) {
  const endpoint = `https://graph.facebook.com/v18.0/instagram_oembed?url=${encodeURIComponent(url)}&fields=thumbnail_url,author_name,type,media_type&access_token=anonymous`;
  // oEmbed public endpoint (no token needed for basic)
  const oembed = `https://api.instagram.com/oembed/?url=${encodeURIComponent(url)}&omitscript=true`;
  const res = await fetch(CORS_PROXY + encodeURIComponent(oembed));
  if (!res.ok) throw new Error('oEmbed failed');
  const data = await res.json();
  if (!data.thumbnail_url) throw new Error('No thumbnail in oEmbed');
  return {
    mediaUrl: null, // oEmbed only gives thumbnail
    thumbUrl: data.thumbnail_url,
    type: 'photo',
    author: data.author_name || null
  };
}

// ── Tier 2: Embed page scrape ─────────────────────────────

async function fetchEmbedPage(url) {
  const shortcode = extractShortcode(url);
  if (!shortcode) throw new Error('No shortcode');
  const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
  const res = await fetch(CORS_PROXY + encodeURIComponent(embedUrl));
  if (!res.ok) throw new Error('Embed page failed');
  const html = await res.text();

  // Extract image from embed HTML
  const imgMatch = html.match(/src="(https:\/\/[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/i);
  const vidMatch = html.match(/src="(https:\/\/[^"]*\.mp4[^"]*)"/i);
  const authorMatch = html.match(/"username":"([^"]+)"/);

  if (!imgMatch && !vidMatch) throw new Error('No media in embed page');

  const isVideo = !!vidMatch;
  return {
    mediaUrl: vidMatch ? decodeURIComponent(vidMatch[1]).replace(/\\u0026/g, '&') : null,
    thumbUrl: imgMatch ? decodeURIComponent(imgMatch[1]).replace(/\\u0026/g, '&') : null,
    type: isVideo ? 'video' : 'photo',
    author: authorMatch ? authorMatch[1] : null
  };
}

// ── Tier 3: Picuki proxy ──────────────────────────────────

async function fetchPicuki(url) {
  const shortcode = extractShortcode(url);
  if (!shortcode) throw new Error('No shortcode');

  // Try Picuki-style approach via an open instaloader-like endpoint
  const apiUrl = `https://www.picuki.com/media/${shortcode}`;
  const res = await fetch(CORS_PROXY + encodeURIComponent(apiUrl));
  if (!res.ok) throw new Error('Picuki failed');
  const html = await res.text();

  const imgMatch = html.match(/<img[^>]+class="post-image"[^>]+src="([^"]+)"/i)
    || html.match(/property="og:image"\s+content="([^"]+)"/i);
  const vidMatch = html.match(/<video[^>]+src="([^"]+)"/i)
    || html.match(/property="og:video"\s+content="([^"]+)"/i);
  const authorMatch = html.match(/class="profile-name"[^>]*>\s*([^<]+)</i)
    || html.match(/property="og:site_name"\s+content="([^"]+)"/i);

  if (!imgMatch && !vidMatch) throw new Error('Picuki: no media found');

  return {
    mediaUrl: vidMatch ? vidMatch[1] : null,
    thumbUrl: imgMatch ? imgMatch[1] : null,
    type: vidMatch ? 'video' : 'photo',
    author: authorMatch ? authorMatch[1].trim() : null
  };
}

// ── Tier 4: og:image fallback via CORS proxy ──────────────

async function fetchOGImage(url) {
  const res = await fetch(CORS_PROXY + encodeURIComponent(url));
  if (!res.ok) throw new Error('OG fetch failed');
  const html = await res.text();

  const ogImg = html.match(/property="og:image"\s+content="([^"]+)"/i)
    || html.match(/name="og:image"\s+content="([^"]+)"/i);
  const ogVid = html.match(/property="og:video(?::url)?"\s+content="([^"]+)"/i);
  const authorMatch = html.match(/"owner":\{"username":"([^"]+)"/i)
    || html.match(/"username":"([^"]+)"/i);

  if (!ogImg && !ogVid) throw new Error('No OG media');

  return {
    mediaUrl: ogVid ? ogVid[1] : null,
    thumbUrl: ogImg ? ogImg[1] : null,
    type: ogVid ? 'video' : 'photo',
    author: authorMatch ? authorMatch[1] : null
  };
}

// ── Main handler ──────────────────────────────────────────

async function handleFetch() {
  const input = document.getElementById('urlInput').value.trim();
  const btn = document.getElementById('fetchBtn');

  if (!input) {
    document.getElementById('urlInput').focus();
    return;
  }

  if (!/instagram\.com/.test(input)) {
    showError('Invalid URL', 'Please enter a valid Instagram link (instagram.com/p/…)');
    return;
  }

  btn.disabled = true;

  const strategies = [
    { label: 'Trying oEmbed…', fn: () => fetchOEmbed(input) },
    { label: 'Trying embed page…', fn: () => fetchEmbedPage(input) },
    { label: 'Trying Picuki…', fn: () => fetchPicuki(input) },
    { label: 'Final attempt…', fn: () => fetchOGImage(input) }
  ];

  for (const s of strategies) {
    setLoading(s.label);
    try {
      const result = await s.fn();
      if (result && (result.thumbUrl || result.mediaUrl)) {
        showResult(result);
        btn.disabled = false;
        return;
      }
    } catch (e) {
      // try next
    }
  }

  btn.disabled = false;
  showError(
    'Media not found',
    'This post may be private, a story, or Instagram blocked our request. Only public posts can be downloaded.'
  );
}

// ── Enter key ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('urlInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleFetch();
  });
});
