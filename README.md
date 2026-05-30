# snap_Backend

Snapchat Tools API — Express server that fetches public Snapchat profile, story, spotlight, and video data.

## Local setup

```bash
npm install
npm run dev
```

API: `http://localhost:5000/api/health`

## Deploy on Render

1. [Render](https://render.com) → **New** → **Web Service**
2. Connect this GitHub repo (`Mohsin0306/snap_Backend`)
3. Settings:
   - **Root Directory:** leave empty (repo root is this backend)
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. **Environment variables** (optional):
   - `CORS_ORIGINS` — extra allowed origins, comma-separated (e.g. your WordPress domain if not already listed)
5. After deploy, set your frontend `SNAP_API_BASE` to:
   - `https://YOUR-SERVICE.onrender.com/api`

Default CORS already allows `sstoryviewer.com` and localhost.

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/fetch/video?input=` | Videos (username or Spotlight URL) |
| GET | `/api/fetch/profile?input=` | Profile + highlights preview |
| GET | `/api/fetch/score?input=` | Public stats |
| GET | `/api/fetch/story?input=` | Stories + highlights |
| GET | `/api/qualities?url=` | Video quality variants |
| GET | `/api/download?url=` | Media download proxy |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server port (Render sets this automatically) |
| `CORS_ORIGINS` | — | Extra comma-separated allowed origins |
