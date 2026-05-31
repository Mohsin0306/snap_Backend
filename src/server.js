import cors from 'cors';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { corsOptions } from './config/cors.js';
import apiRouter from './routes/api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '../public');

const app = express();
const PORT = process.env.PORT || 5000;

app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://sstoryviewer.com https://www.sstoryviewer.com http://sstoryviewer.com http://www.sstoryviewer.com"
  );
  next();
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.use('/api', apiRouter);

/* Frontend tool (HTML/CSS/JS) — WordPress sirf iframe se embed kare */
app.use(express.static(publicDir, { maxAge: '7d', etag: true }));
app.get('/tool', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`Snapchat downloader API listening on ${HOST}:${PORT}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the other process or run with a different port:\n` +
        `  set PORT=5001 && npm run dev`
    );
    process.exit(1);
  }
  throw err;
});
