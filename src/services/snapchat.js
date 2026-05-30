import axios from 'axios';
import * as cheerio from 'cheerio';
import { buildStaticQualities } from './qualities.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Snapchat: 0 = image, 1 = video (verified via CDN content-type)
const SNAP_MEDIA_TYPES = {
  0: 'image',
  1: 'video',
  2: 'video',
};

function buildSpotlightPageUrl(input, pathSuffix) {
  if (input.startsWith('http')) {
    return input.trim();
  }
  return `https://www.snapchat.com/${pathSuffix}`;
}

function detectMediaType(snap) {
  const fromCode = SNAP_MEDIA_TYPES[snap.snapMediaType];
  if (fromCode) return fromCode;

  const url = snap.snapUrls?.mediaUrl || '';
  if (/video|\.mp4|\.1322/i.test(url)) return 'video';
  if (/\.400\.|image|\.jpg|\.jpeg|\.png/i.test(url)) return 'image';

  return 'unknown';
}

export function parseInput(input) {
  if (!input || typeof input !== 'string') return null;

  let value = input.trim();
  if (!value) return null;

  const profileSpotlightMatch = value.match(
    /snapchat\.com\/@([^/]+)\/spotlight\/([^/?#]+)/i
  );
  if (profileSpotlightMatch) {
    const username = profileSpotlightMatch[1];
    const spotlightId = profileSpotlightMatch[2];
    const pageUrl = buildSpotlightPageUrl(value, `@${username}/spotlight/${spotlightId}`);
    return { type: 'spotlight', username, spotlightId, pageUrl };
  }

  const shortSpotlightMatch = value.match(/snapchat\.com\/spotlight\/([^/?#]+)/i);
  if (shortSpotlightMatch) {
    const spotlightId = shortSpotlightMatch[1];
    const pageUrl = buildSpotlightPageUrl(value, `spotlight/${spotlightId}`);
    return { type: 'spotlight', username: null, spotlightId, pageUrl };
  }

  const username = normalizeUsername(value);
  if (username) return { type: 'profile', username };

  return null;
}

export function normalizeUsername(input) {
  if (!input || typeof input !== 'string') return null;

  let value = input.trim();
  if (!value) return null;

  if (/snapchat\.com\/(?:@[^/]+\/)?spotlight\//i.test(value)) return null;

  const urlMatch = value.match(/snapchat\.com\/(?:add|@)\/([^/?#]+)/i);
  if (urlMatch) value = urlMatch[1];

  value = value.replace(/^@/, '').split(/[/?#]/)[0].trim();
  return value || null;
}

function unwrap(value) {
  if (value == null) return null;
  if (typeof value === 'object' && 'value' in value) return value.value;
  return value;
}

function formatSubscriberCount(count) {
  const raw = String(count ?? '').trim();
  const n = Number(raw.replace(/,/g, ''));
  if (!raw || Number.isNaN(n) || n === 0) return 'Not public';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

function formatAccountAge(timestampMs) {
  if (!timestampMs) return 'Unknown';
  const years = (Date.now() - Number(timestampMs)) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) {
    const months = Math.max(1, Math.floor(years * 12));
    return `${months} mo`;
  }
  const y = Math.floor(years);
  return y === 1 ? '1 year' : `${y} years`;
}

function scoreRankFromSubscribers(count) {
  const n = Number(String(count).replace(/,/g, ''));
  if (Number.isNaN(n) || n === 0) return '🌱 Creator';
  if (n >= 5_000_000) return '🏆 Legend';
  if (n >= 1_000_000) return '💎 Diamond';
  if (n >= 500_000) return '🥇 Gold';
  if (n >= 100_000) return '🥈 Silver';
  if (n >= 10_000) return '🥉 Bronze';
  return '🌱 Rising';
}

function buildHighlightPreviews(pageProps) {
  return (pageProps.curatedHighlights || []).map((highlight) => {
    const snaps = highlight.snapList || [];
    const title =
      unwrap(highlight.storyTitle) ||
      highlight.title ||
      'Highlight';

    return {
      id: unwrap(highlight.storyId) || title,
      title,
      snapCount: snaps.length,
      thumbnailUrl:
        unwrap(highlight.thumbnailUrl) ||
        unwrap(snaps[0]?.snapUrls?.mediaPreviewUrl) ||
        snaps[0]?.snapUrls?.mediaUrl ||
        null,
      snaps: snaps
        .map((snap) =>
          mapSnap(snap, { collectionTitle: title, collectionType: 'highlight' })
        )
        .filter((s) => s.mediaUrl),
    };
  });
}

function mapSnap(snap, context = {}) {
  const mediaUrl = snap.snapUrls?.mediaUrl;
  const previewUrl =
    unwrap(snap.snapUrls?.mediaPreviewUrl) || snap.snapUrls?.mediaPreviewUrl;
  const mediaType = detectMediaType(snap);

  const mapped = {
    id: unwrap(snap.snapId) || `${context.collectionId || 'snap'}-${snap.snapIndex}`,
    index: snap.snapIndex ?? 0,
    type: mediaType,
    mediaUrl,
    previewUrl: typeof previewUrl === 'string' ? previewUrl : null,
    title: unwrap(snap.snapTitle),
    timestamp: unwrap(snap.timestampInSec)
      ? new Date(Number(unwrap(snap.timestampInSec)) * 1000).toISOString()
      : null,
    collectionTitle: context.collectionTitle || null,
    collectionType: context.collectionType || null,
    qualities: [],
  };

  mapped.qualities = buildStaticQualities(mapped);
  return mapped;
}

function mapHighlightCollection(collection, type) {
  const snaps = collection.snapList || [];
  const title =
    collection.storyTitle?.value ||
    unwrap(collection.storyTitle) ||
    collection.title ||
    `${type} highlight`;

  return {
    id: collection.storyId?.value || unwrap(collection.storyId) || title,
    title,
    type,
    thumbnailUrl:
      collection.thumbnailUrl?.value ||
      unwrap(collection.thumbnailUrl) ||
      snaps[0]?.snapUrls?.mediaPreviewUrl?.value ||
      snaps[0]?.snapUrls?.mediaUrl,
    snapCount: snaps.length,
    snaps: snaps.map((snap) =>
      mapSnap(snap, {
        collectionId: title,
        collectionTitle: title,
        collectionType: type,
      })
    ),
  };
}

function extractPublicProfile(userProfile) {
  const info =
    userProfile?.publicProfileInfo ||
    userProfile?.publicProfile ||
    userProfile;

  if (!info?.username) return null;

  const createdMs = unwrap(info.creationTimestampMs) || info.creationTimestampMs;
  const accountAge = formatAccountAge(createdMs);

  return {
    username: info.username,
    displayName: info.title || info.mutableName || info.username,
    bio: info.bio || '',
    subscriberCount: info.subscriberCount || '0',
    subscriberCountFormatted: formatSubscriberCount(info.subscriberCount),
    accountAge,
    creationTimestampMs: createdMs ? Number(createdMs) : null,
    profilePictureUrl: info.profilePictureUrl || null,
    heroImageUrl: info.squareHeroImageUrl || null,
    snapcodeUrl: info.snapcodeImageUrl || null,
    websiteUrl: info.websiteUrl || null,
    address: info.address || null,
    verified: Boolean(info.badge),
    hasStory: Boolean(info.hasStory),
    hasHighlights: Boolean(info.hasCuratedHighlights),
    hasSpotlight: Boolean(info.hasSpotlightHighlights),
    category: info.categoryStringId || null,
    profileUrl: `https://www.snapchat.com/@${info.username}`,
  };
}

async function fetchPagePropsFromUrl(pageUrl) {
  const { data: html } = await axios.get(pageUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    maxRedirects: 5,
    timeout: 30000,
  });

  const $ = cheerio.load(html);
  const nextDataScript = $('#__NEXT_DATA__').html();

  if (!nextDataScript) {
    throw new Error('Could not load Snapchat page data. The page structure may have changed.');
  }

  const nextData = JSON.parse(nextDataScript);
  return nextData.props?.pageProps || {};
}

async function fetchPageProps(username) {
  const profileUrl = `https://www.snapchat.com/add/${encodeURIComponent(username)}`;
  return fetchPagePropsFromUrl(profileUrl);
}

function buildStats(media, collections) {
  return {
    totalCollections: collections.length,
    totalSnaps: media.length,
    videos: media.filter((s) => s.type === 'video').length,
    images: media.filter((s) => s.type === 'image').length,
  };
}

function extractCreatorProfile(metadata, fallbackUsername) {
  const videoMeta = metadata?.videoMetadata;
  const creator =
    videoMeta?.creator?.personCreator ||
    videoMeta?.creator?.publicProfileCreator ||
    videoMeta?.creator;

  if (creator?.username) {
    return {
      username: creator.username,
      displayName: creator.name || creator.username,
      bio: videoMeta?.description || '',
      subscriberCount: creator.followerCount || '0',
      subscriberCountFormatted: formatSubscriberCount(creator.followerCount || '0'),
      profilePictureUrl: videoMeta?.thumbnailUrl || null,
      heroImageUrl: null,
      snapcodeUrl: null,
      websiteUrl: creator.websiteUrl || null,
      address: null,
      verified: false,
      hasStory: false,
      hasHighlights: false,
      hasSpotlight: true,
      category: 'spotlight',
      profileUrl: creator.url || `https://www.snapchat.com/@${creator.username}`,
    };
  }

  return {
    username: fallbackUsername,
    displayName: fallbackUsername,
    bio: videoMeta?.description || '',
    subscriberCount: '0',
    subscriberCountFormatted: '0',
    profilePictureUrl: videoMeta?.thumbnailUrl || null,
    heroImageUrl: null,
    snapcodeUrl: null,
    websiteUrl: null,
    address: null,
    verified: false,
    hasStory: false,
    hasHighlights: false,
    hasSpotlight: true,
    category: 'spotlight',
    profileUrl: `https://www.snapchat.com/@${fallbackUsername}`,
  };
}

function findSpotlightEntry(stories, spotlightId) {
  if (!spotlightId || !stories?.length) return stories?.[0];

  return (
    stories.find((entry) => {
      const storyId = unwrap(entry.story?.storyId);
      const snapId = unwrap(entry.story?.snapList?.[0]?.snapId);
      return storyId === spotlightId || snapId === spotlightId;
    }) || stories[0]
  );
}

function rejectSpotlightForMode(mode) {
  return {
    found: false,
    message: `This is a Spotlight link. Use Video Downloader instead.`,
    hint: mode,
  };
}

export async function resolveVideos(input) {
  const parsed = parseInput(input);
  if (!parsed) {
    throw new Error('Enter a username, profile URL, or Spotlight link.');
  }

  if (parsed.type === 'spotlight') {
    const pageProps = await fetchPagePropsFromUrl(parsed.pageUrl);
    const stories = pageProps.spotlightFeed?.spotlightStories || [];

    if (!stories.length) {
      return {
        found: false,
        message: 'Spotlight video not found. It may be removed or unavailable.',
      };
    }

    const entry = findSpotlightEntry(stories, parsed.spotlightId);
    const snapRaw = entry.story?.snapList?.[0];
    if (!snapRaw?.snapUrls?.mediaUrl) {
      return { found: false, message: 'Video file not available for this Spotlight.' };
    }

    const title =
      entry.metadata?.videoMetadata?.description ||
      entry.metadata?.videoMetadata?.name ||
      'Spotlight Video';

    const video = mapSnap(snapRaw, { collectionTitle: title, collectionType: 'spotlight' });

    return {
      found: true,
      videos: [video],
    };
  }

  const pageProps = await fetchPageProps(parsed.username);
  if (!extractPublicProfile(pageProps.userProfile)) {
    return {
      found: false,
      message: 'Profile not found or is private.',
    };
  }

  const videos = [];
  for (const spotlight of pageProps.spotlightHighlights || []) {
    const collection = mapHighlightCollection(spotlight, 'spotlight');
    videos.push(...collection.snaps.filter((s) => s.type === 'video' && s.mediaUrl));
  }

  return {
    found: true,
    username: parsed.username,
    videos,
  };
}

export async function resolveProfile(input) {
  const parsed = parseInput(input);
  if (parsed?.type === 'spotlight') {
    return rejectSpotlightForMode('profile');
  }

  const username = normalizeUsername(input);
  if (!username) {
    throw new Error('Enter a valid Snapchat username or profile URL.');
  }

  const pageProps = await fetchPageProps(username);
  const profile = extractPublicProfile(pageProps.userProfile);

  if (!profile) {
    return {
      found: false,
      message: 'Profile not found or is private.',
    };
  }

  const highlights = buildHighlightPreviews(pageProps);
  const highlightItemCount = highlights.reduce((n, h) => n + h.snapCount, 0);

  return {
    found: true,
    profile: {
      ...profile,
      highlightCollectionCount: highlights.length,
      highlightItemCount,
    },
    highlights,
  };
}

export async function resolveScore(input) {
  const parsed = parseInput(input);
  if (parsed?.type === 'spotlight') {
    return rejectSpotlightForMode('score');
  }

  const username = normalizeUsername(input);
  if (!username) {
    throw new Error('Enter a valid Snapchat username or profile URL.');
  }

  const pageProps = await fetchPageProps(username);
  const profile = extractPublicProfile(pageProps.userProfile);

  if (!profile) {
    return {
      found: false,
      message: 'Profile not found or is private.',
    };
  }

  const highlights = buildHighlightPreviews(pageProps);
  const highlightItems = highlights.reduce((n, h) => n + h.snapCount, 0);
  let spotlightVideos = 0;
  for (const s of pageProps.spotlightHighlights || []) {
    spotlightVideos += (s.snapList || []).filter((snap) => detectMediaType(snap) === 'video').length;
  }

  const subsNum = Number(String(profile.subscriberCount).replace(/,/g, ''));
  const hasSubs = !Number.isNaN(subsNum) && subsNum > 0;

  return {
    found: true,
    username: profile.username,
    displayName: profile.displayName,
    snapScorePublic: false,
    note: 'Snap Score is private on Snapchat. Showing public profile stats.',
    ring: {
      value: hasSubs ? profile.subscriberCountFormatted : String(highlightItems + spotlightVideos),
      label: hasSubs ? 'Subscribers' : 'Public media',
    },
    rank: scoreRankFromSubscribers(profile.subscriberCount),
    breakdown: {
      subscribers: profile.subscriberCountFormatted,
      accountAge: profile.accountAge,
      highlights: String(highlightItems),
      spotlightVideos: String(spotlightVideos),
      hasActiveStory: profile.hasStory,
    },
    profile,
  };
}

export async function resolveStories(input) {
  const parsed = parseInput(input);
  if (parsed?.type === 'spotlight') {
    return rejectSpotlightForMode('story');
  }

  const username = normalizeUsername(input);
  if (!username) {
    throw new Error('Enter a valid Snapchat username or profile URL.');
  }

  const pageProps = await fetchPageProps(username);
  if (!extractPublicProfile(pageProps.userProfile)) {
    return {
      found: false,
      message: 'Profile not found or is private.',
    };
  }

  const collections = [];

  if (pageProps.story?.snapList?.length) {
    collections.push(
      mapHighlightCollection(
        { ...pageProps.story, storyTitle: { value: 'Active Story' } },
        'story'
      )
    );
  }

  for (const highlight of pageProps.curatedHighlights || []) {
    collections.push(mapHighlightCollection(highlight, 'highlight'));
  }

  return {
    found: true,
    username,
    collections,
  };
}

export async function resolveMedia(input) {
  const parsed = parseInput(input);
  if (!parsed) {
    throw new Error('Enter a username, profile URL, or Spotlight link.');
  }

  if (parsed.type === 'spotlight') {
    const videoResult = await resolveVideos(input);
    if (!videoResult.found) return videoResult;

    const pageProps = await fetchPagePropsFromUrl(parsed.pageUrl);
    const entry = findSpotlightEntry(
      pageProps.spotlightFeed?.spotlightStories || [],
      parsed.spotlightId
    );
    const collection = mapHighlightCollection(
      {
        ...entry.story,
        storyTitle: {
          value:
            entry.metadata?.videoMetadata?.description ||
            entry.metadata?.videoMetadata?.name ||
            'Spotlight Video',
        },
      },
      'spotlight'
    );
    const profile = extractCreatorProfile(entry.metadata, parsed.username || 'spotlight');
    const media = collection.snaps.filter((s) => s.mediaUrl);

    return {
      found: true,
      source: 'spotlight',
      profile,
      collections: [collection],
      media,
      stats: buildStats(media, [collection]),
    };
  }

  return getProfileAndMedia(parsed.username);
}

export async function getProfileAndMedia(usernameInput) {
  const username = normalizeUsername(usernameInput);
  if (!username) {
    throw new Error('Please enter a valid Snapchat username or profile URL.');
  }

  const pageProps = await fetchPageProps(username);
  const profile = extractPublicProfile(pageProps.userProfile);

  if (!profile) {
    return {
      found: false,
      username,
      message: 'Profile not found or is private.',
    };
  }

  const collections = [];

  if (pageProps.story?.snapList?.length) {
    collections.push(
      mapHighlightCollection(
        {
          ...pageProps.story,
          storyTitle: { value: 'Active Story' },
        },
        'story'
      )
    );
  }

  for (const highlight of pageProps.curatedHighlights || []) {
    collections.push(mapHighlightCollection(highlight, 'highlight'));
  }

  for (const spotlight of pageProps.spotlightHighlights || []) {
    collections.push(mapHighlightCollection(spotlight, 'spotlight'));
  }

  const allSnaps = collections.flatMap((c) => c.snaps).filter((s) => s.mediaUrl);

  return {
    found: true,
    source: 'profile',
    profile,
    collections,
    media: allSnaps,
    stats: buildStats(allSnaps, collections),
  };
}

export async function streamMedia(url, res) {
  if (!url || !url.startsWith('https://')) {
    throw new Error('Invalid media URL.');
  }

  const response = await axios.get(url, {
    responseType: 'stream',
    headers: {
      'User-Agent': USER_AGENT,
      Referer: 'https://www.snapchat.com/',
      Origin: 'https://www.snapchat.com',
    },
    timeout: 120000,
    maxRedirects: 5,
  });

  const contentType = response.headers['content-type'] || 'application/octet-stream';
  const ext = contentType.includes('video')
    ? 'mp4'
    : contentType.includes('png')
      ? 'png'
      : 'jpg';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="snapchat-media.${ext}"`);

  response.data.pipe(res);
}
