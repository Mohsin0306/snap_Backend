import cors from 'cors';
import express from 'express';
import { corsOptions } from './config/cors.js';
import apiRouter from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.use('/api', apiRouter);

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'snap_Backend',
    docs: '/api/health',
  });
});

const server = app.listen(PORT, () => {
  console.log(`Snapchat downloader API running on http://localhost:${PORT}`);
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
