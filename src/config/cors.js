const DEFAULT_ORIGINS = [
  'https://sstoryviewer.com',
  'https://www.sstoryviewer.com',
  'http://sstoryviewer.com',
  'http://www.sstoryviewer.com',
  'http://localhost:5000',
  'http://127.0.0.1:5000',
];

function parseExtraOrigins() {
  const raw = process.env.CORS_ORIGINS || '';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true;

  const allowed = [...DEFAULT_ORIGINS, ...parseExtraOrigins()];

  if (allowed.includes(origin)) return true;
  if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return true;

  return false;
}

export const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, origin || true);
    } else {
      callback(null, false);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept'],
  credentials: false,
};
