/* ===========================
   Instadown ATRX — app.js
   Public API-based fetch
   =========================== */

// ── helpers ──────────────────────────────────────────────

function extractShortcode(url) {
  const match = url.match(/instagram\.com\/(?:p|reel|reels|tv|stories\/[^/]+)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
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

  const badge = document.getElementById('resultBadge');
  badge.textContent = type === 'video' ? '🎬 Reel / Video' : '🖼️ Photo';

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
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = type === 'video' ? 'mp4' : 'jpg';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `instadown_${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
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

// ── Tier 1: SaveIG ────────────────────────────────────────

async function fetchViaSaveIG(url) {
  const res = await fetch('https://v3.saveig.app/api/ajaxSearch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `q=${encodeURIComponent(url)}&t=media&lang=en`
  });
  if (!res.ok) throw new Error('SaveIG failed');
  const data = await res.json();
  if (!data.data) throw new Error('No data');

  const parser = new DOMParser();
  const doc = parser.parseFromString(data.data, 'text/html');
  const videoEl = doc.querySelector('a[href*=".mp4"]');
  const imgEl = doc.querySelector('img[src*="cdninstagram"], img[src*="fbcdn"], img[src*="instagram"]');

  if (!videoEl && !imgEl) throw new Error('No media in response');

  return {
    mediaUrl: videoEl ? videoEl.href : null,
    thumbUrl: imgEl ? imgEl.src : null,
    type: videoEl ? 'video' : 'photo',
    author: null
  };
}

// ── Tier 2: snapinsta.app ─────────────────────────────────

async function fetchViaSnapInsta(url) {
  // Get token first
  const pageRes = await fetch('https://snapinsta.app/');
  if (!pageRes.ok) throw new Error('snapinsta page failed');
  const pageHtml = await pageRes.text();
  const tokenMatch = pageHtml.match(/name="token"\s+value="([^"]+)"/);
  if (!tokenMatch) throw new Error('No token');

  const res = await fetch('https://snapinsta.app/action.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `url=${encodeURIComponent(url)}&token=${tokenMatch[1]}&lang=en`
  });
  if (!res.ok) throw new Error('snapinsta action failed');
  const data = await res.json();
  if (!data.data) throw new Error('No data');

  const parser = new DOMParser();
  const doc = parser.parseFromString(data.data, 'text/html');
  const videoEl = doc.querySelector('a[href*=".mp4"]');
  const imgEl = doc.querySelector('img');

  if (!videoEl && !imgEl) throw new Error('No media');

  return {
    mediaUrl: videoEl ? videoEl.href : null,
    thumbUrl: imgEl ? imgEl.src : null,
    type: videoEl ? 'video' : 'photo',
    author: null
  };
}

// ── Tier 3: fastdl.app ────────────────────────────────────

async function fetchViaFastDL(url) {
  const res = await fetch('https://fastdl.app/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url })
  });
  if (!res.ok) throw new Error('fastdl failed');
  const data = await res.json();

  const isVideo = data.type === 'video' || !!(data.url || '').match(/\.mp4/);
  const mediaUrl = isVideo ? data.url : null;
  const thumbUrl = data.thumbnail || (!isVideo ? data.url : null);
  if (!mediaUrl && !thumbUrl) throw new Error('No media from fastdl');

  return {
    mediaUrl,
    thumbUrl,
    type: isVideo ? 'video' : 'photo',
    author: data.username || null
  };
}

// ── Tier 4: inflact.com ───────────────────────────────────

async function fetchViaInflact(url) {
  const shortcode = extractShortcode(url);
  if (!shortcode) throw new Error('No shortcode');

  const res = await fetch(`https://inflact.com/downloader/instagram/post/?url=${encodeURIComponent(url)}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' }
  });
  if (!res.ok) throw new Error('inflact failed');
  const html = await res.text();

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const videoEl = doc.querySelector('a[href*=".mp4"], video source');
  const imgEl = doc.querySelector('img.result__img, img[src*="cdninstagram"]');

  if (!videoEl && !imgEl) throw new Error('No media from inflact');

  return {
    mediaUrl: videoEl ? (videoEl.href || videoEl.src) : null,
    thumbUrl: imgEl ? imgEl.src : null,
    type: videoEl ? 'video' : 'photo',
    author: null
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
    showError('Invalid URL', 'Please enter a valid Instagram link (instagram.com/p/… or /reel/…)');
    return;
  }

  btn.disabled = true;

  const strategies = [
    { label: 'Connecting to server…',   fn: () => fetchViaSaveIG(input) },
    { label: 'Trying alternate source…', fn: () => fetchViaSnapInsta(input) },
    { label: 'Trying another source…',  fn: () => fetchViaFastDL(input) },
    { label: 'Final attempt…',          fn: () => fetchViaInflact(input) }
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
      console.warn(`[Instadown] ${s.label} failed:`, e.message);
    }
  }

  btn.disabled = false;
  showError(
    'Media not found',
    'This post may be private, or all sources are temporarily unavailable. Only public posts can be downloaded.'
  );
}

// ── Enter key ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('urlInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleFetch();
  });
});
