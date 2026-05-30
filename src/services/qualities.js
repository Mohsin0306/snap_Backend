import axios from 'axios';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const VIDEO_TIERS = [144, 240, 360, 480, 640, 720, 800, 1034, 1080, 1322];
const SPOTLIGHT_TIERS = [15, 22, 27, 36, 48, 64, 96, 128, 256];

const SIZE_LABELS = [
  { maxBytes: 80 * 1024, label: '144p' },
  { maxBytes: 200 * 1024, label: '360p' },
  { maxBytes: 500 * 1024, label: '480p' },
  { maxBytes: 900 * 1024, label: '720p' },
  { maxBytes: Infinity, label: '1080p' },
];

function parseCdnUrl(url) {
  if (!url) return null;

  const spotlight = url.match(
    /^(https:\/\/bolt-gcdn\.sc-cdn\.net\/u\/[^.]+)\.(\d+)(\.IRZXSOY)?(\?.*)$/
  );
  if (spotlight) {
    return {
      base: spotlight[1],
      tier: Number(spotlight[2]),
      suffix: spotlight[3] || '',
      query: spotlight[4],
      host: 'bolt',
    };
  }

  const standard = url.match(/^(https:\/\/cf-st\.sc-cdn\.net\/d\/[^.]+)\.(\d+)(\.IRZXSOY)?(\?.*)$/);
  if (standard) {
    return {
      base: standard[1],
      tier: Number(standard[2]),
      suffix: standard[3] || '',
      query: standard[4],
      host: 'cf',
    };
  }

  return null;
}

function buildUrl(parsed, tier) {
  return `${parsed.base}.${tier}${parsed.suffix}${parsed.query}`;
}

const TIER_LABELS = {
  144: '144p',
  240: '240p',
  256: '360p',
  360: '360p',
  410: '360p',
  480: '480p',
  640: '480p',
  720: '720p',
  800: '720p',
  1034: '720p',
  1080: '1080p',
  1322: '1080p',
  15: '480p',
  22: '720p',
  27: '1080p',
  36: '720p',
};

function labelFromBytes(bytes, isImage) {
  if (isImage) return '360p';
  for (const row of SIZE_LABELS) {
    if (bytes <= row.maxBytes) return row.label;
  }
  return '1080p';
}

function labelForUrl(url, meta) {
  const parsed = parseCdnUrl(url);
  if (parsed && TIER_LABELS[parsed.tier]) {
    return TIER_LABELS[parsed.tier];
  }
  return labelFromBytes(meta.bytes, meta.isImage);
}

async function headMeta(url) {
  try {
    const res = await axios.head(url, {
      headers: { 'User-Agent': USER_AGENT, Referer: 'https://www.snapchat.com/' },
      timeout: 12000,
      maxRedirects: 3,
      validateStatus: (s) => s < 500,
    });
    if (res.status !== 200) return null;

    const contentType = res.headers['content-type'] || '';
    const bytes = Number(res.headers['content-length'] || 0);
    const isVideo = contentType.includes('video');
    const isImage = contentType.includes('image');

    if (!isVideo && !isImage) return null;

    return { url, contentType, bytes, isVideo, isImage };
  } catch {
    return null;
  }
}

export function buildStaticQualities(snap) {
  const options = [];

  if (snap.mediaUrl && snap.type === 'video') {
    const parsed = parseCdnUrl(snap.mediaUrl);
    const tier = parsed?.tier;
    let label = '1080p';

    if (tier === 1322 || tier === 1080 || tier === 27) label = '1080p';
    else if (tier === 1034 || tier === 720) label = '720p';
    else if (tier && tier <= 480) label = '480p';

    options.push({
      label,
      url: snap.mediaUrl,
      type: 'video',
      note: 'Best available',
    });
  } else if (snap.mediaUrl && snap.type === 'image') {
    options.push({
      label: 'Original',
      url: snap.mediaUrl,
      type: 'image',
    });
  }

  const seen = new Set();
  return options.filter((o) => {
    if (seen.has(o.url)) return false;
    seen.add(o.url);
    return true;
  });
}

export async function probeQualities(mediaUrl) {
  if (!mediaUrl?.startsWith('https://')) {
    return [];
  }

  const parsed = parseCdnUrl(mediaUrl);
  const candidates = new Set([mediaUrl]);

  if (parsed) {
    const tiers = parsed.host === 'bolt' ? SPOTLIGHT_TIERS : VIDEO_TIERS;
    for (const tier of tiers) {
      candidates.add(buildUrl(parsed, tier));
    }
  }

  const metas = await Promise.all([...candidates].map((url) => headMeta(url)));
  const valid = metas.filter(Boolean);

  const videos = valid
    .filter((m) => m.isVideo)
    .sort((a, b) => a.bytes - b.bytes);

  const qualities = [];

  for (const v of videos) {
    qualities.push({
      label: labelForUrl(v.url, v),
      url: v.url,
      bytes: v.bytes,
      size: formatBytes(v.bytes),
      type: 'video',
    });
  }

  if (!qualities.length) {
    return [{ label: '1080p', url: mediaUrl, type: 'video', size: '' }];
  }

  const byUrl = new Map();
  for (const q of qualities) {
    if (!q.url || byUrl.has(q.url)) continue;
    const parsed = parseCdnUrl(q.url);
    byUrl.set(q.url, {
      ...q,
      tier: parsed?.tier ?? null,
    });
  }

  return [...byUrl.values()].sort((a, b) => a.bytes - b.bytes);
}

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
