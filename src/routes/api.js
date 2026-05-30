import { Router } from 'express';
import {
  getProfileAndMedia,
  normalizeUsername,
  resolveMedia,
  resolveProfile,
  resolveScore,
  resolveStories,
  resolveVideos,
  streamMedia,
} from '../services/snapchat.js';
import { probeQualities } from '../services/qualities.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'snapchat-downloader-api' });
});

router.get('/fetch', async (req, res) => {
  try {
    const input = req.query.input;
    if (!input) {
      return res.status(400).json({ error: 'Missing input query parameter.' });
    }

    const data = await resolveMedia(input);
    res.json(data);
  } catch (err) {
    console.error('[fetch]', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch content.' });
  }
});

router.get('/fetch/video', async (req, res) => {
  try {
    const input = req.query.input;
    if (!input) return res.status(400).json({ error: 'Missing input.' });
    res.json(await resolveVideos(input));
  } catch (err) {
    console.error('[fetch/video]', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch video.' });
  }
});

router.get('/fetch/profile', async (req, res) => {
  try {
    const input = req.query.input;
    if (!input) return res.status(400).json({ error: 'Missing input.' });
    res.json(await resolveProfile(input));
  } catch (err) {
    console.error('[fetch/profile]', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch profile.' });
  }
});

router.get('/fetch/score', async (req, res) => {
  try {
    const input = req.query.input;
    if (!input) return res.status(400).json({ error: 'Missing input.' });
    res.json(await resolveScore(input));
  } catch (err) {
    console.error('[fetch/score]', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch score.' });
  }
});

router.get('/fetch/story', async (req, res) => {
  try {
    const input = req.query.input;
    if (!input) return res.status(400).json({ error: 'Missing input.' });
    res.json(await resolveStories(input));
  } catch (err) {
    console.error('[fetch/story]', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch stories.' });
  }
});

router.get('/profile/:username', async (req, res) => {
  try {
    const username = normalizeUsername(req.params.username);
    if (!username) {
      return res.status(400).json({ error: 'Invalid username.' });
    }

    const data = await getProfileAndMedia(username);
    if (!data.found) {
      return res.status(404).json(data);
    }

    res.json({
      profile: data.profile,
      stats: data.stats,
    });
  } catch (err) {
    console.error('[profile]', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch profile.' });
  }
});

router.get('/media/:username', async (req, res) => {
  try {
    const username = normalizeUsername(req.params.username);
    if (!username) {
      return res.status(400).json({ error: 'Invalid username.' });
    }

    const data = await getProfileAndMedia(username);
    res.json(data);
  } catch (err) {
    console.error('[media]', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch media.' });
  }
});

router.get('/qualities', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'Missing url parameter.' });
    }

    const qualities = await probeQualities(decodeURIComponent(url));
    res.json({ qualities });
  } catch (err) {
    console.error('[qualities]', err.message);
    res.status(500).json({ error: err.message || 'Failed to load qualities.' });
  }
});

router.get('/download', async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'Missing url query parameter.' });
    }

    await streamMedia(decodeURIComponent(url), res);
  } catch (err) {
    console.error('[download]', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || 'Download failed.' });
    }
  }
});

export default router;
