# MusicJam — Collaborative Music & Video Streaming

A self-hosted, real-time listening room app — think Spotify Jam, but you bring your own files. Upload audio or video, generate a 6-digit room code, share it with friends, and everyone plays, pauses, seeks and queues in perfect sync. Built as an installable PWA, with cloud-backed storage (Cloudinary) and HLS transcoding for video.

---

## Features

### Rooms
- Create rooms with a random 6-digit code
- Join via code (validated server-side; friendly 404 for invalid / expired rooms)
- Host-only room deletion with live redirect for everyone inside
- Hourly cleanup of empty rooms older than 1 hour
- Active rooms listing on the home page (user count, current song, play state)

### Identity & presence
- Nickname modal with 8 preset avatar colors (persisted in `sessionStorage`)
- Listener bar with colored avatars (first 8 shown, then `+N`)
- Full user list inside the queue panel
- Join / leave toasts

### Uploads
- Drag & drop or click-to-browse, from both the home page and inside a room
- Multi-file queue with per-file progress
- Client-side duplicate detection (normalised filename match) — skips dupes before upload
- Server-side duplicate detection (filename without extension) — returns HTTP 409
- Audio processed synchronously; video runs as a background HLS transcode job (poll `/api/upload/status/:jobId`)
- Real-time `library-updated` broadcast to every connected client when a new song lands

### Playback
- Unified audio + video player that switches between a vinyl view (audio) and a video player
- HLS video via `hls.js` (with native HLS fallback for Safari)
- Audio-only MP4 / no-visual-track detection — falls back to the vinyl view automatically
- Fullscreen video with auto-hiding overlay / cursor after 3s of inactivity
- Click or drag-to-seek progress bars (audio + video)
- Shared volume slider + mute toggle
- Mobile autoplay unlock (silent play/pause on first touch)

### Real-time sync
- All play / pause / seek / next / prev events routed through Socket.IO and broadcast to the room
- Drift correction: seeks if `|currentTime - serverTime| > 1.0s`, accounting for network RTT
- Re-sync on tab visibility change
- Server-side 2-second debounce per song ID to prevent duplicate "song ended" firings

### Queue management
- Collaborative queue — anyone in the room can add songs from the library panel
- Drag-to-reorder (HTML5 DnD) and one-click remove
- Library panel hides songs already queued / playing (unless searching)
- Auto-requeue toggle (finished songs re-join the end of the queue)
- No-duplicates toggle (blocks the same song being queued twice)
- Repeat modes: `none` / `one` / `queue`
- History: up to 50 played songs stored, last 10 shown in a collapsible panel
- Previous track (pops from history)

### Library & storage
- Single global shared library across all rooms (no per-user libraries)
- Metadata persisted to Cloudinary as a raw JSON asset (`musicjam/songs-db`) — loaded on startup, saved on upload / delete / graceful shutdown
- Delete song removes the Cloudinary resource (HLS: all `.ts` segments + manifest by prefix; audio/video: the single resource)
- Bulk select / download / delete on the home page
- Storage Dashboard at `/dashboard` with stats cards, animated usage bar (green/yellow/red), sortable file table, auto-refresh every 30s

### Sharing & PWA
- Share modal with room code, full URL, QR code (qrcodejs) and native share (`navigator.share`)
- Installable Web App Manifest with 8 icon sizes, app shortcuts (Create / Join Room) and a share target
- Service Worker with cache-first (static), network-first (API / socket.io / uploads) and stale-while-revalidate (other) strategies
- Cloudinary URLs explicitly bypassed by the SW (never cached)
- Push notification + background sync scaffolding present (server-side push not wired)

### Keyboard shortcuts
- `Space` — play / pause
- `Ctrl/Cmd + →` — next song

---

## File size & format limits

This is the part most likely to bite you, so here are the exact values enforced in `server.js`.

### Per-file upload limit
- **500 MB** per file — applies to **both audio and video** (Multer `limits.fileSize`, `server.js`)
- Express body parser limit: `1000mb` for JSON and URL-encoded bodies (for the API, not the file stream)

There is no separate audio vs. video size cap. Both pass through the same Multer middleware, so 500 MB is the hard ceiling for any single upload. Exceeding it returns a Multer `LIMIT_FILE_SIZE` error.

### Storage quota (tracked, not hard-enforced)
- **25 GB** total — the Cloudinary free tier. The `/api/library` endpoint reports `percentUsed` and `availableMB` against this 25 GB figure, but the server does **not** reject uploads when the quota is exceeded. You are responsible for monitoring the dashboard.

### Temp disk
- 1 GB Render disk mounted at `/opt/render/project/src/uploads` — used only as a staging area during upload. Files are deleted immediately after the Cloudinary upload (audio) or after HLS transcoding + upload (video) completes.

### Accepted file types

| Type | Extensions | MIME types |
|------|-----------|-----------|
| Audio | `mp3`, `wav`, `ogg`, `m4a`, `flac`, `aac`, `wma` | `audio/mpeg`, `audio/wav`, `audio/wave`, `audio/x-wav`, `audio/ogg`, `audio/mp4`, `audio/x-m4a`, `audio/flac`, `audio/x-flac`, `audio/aac`, `audio/x-ms-wma`, `application/octet-stream` |
| Video | `mp4`, `webm`, `mov`, `mkv`, `avi` | `video/mp4`, `video/webm`, `video/quicktime`, `video/x-matroska`, `video/x-msvideo` |

A file is accepted if **either** its extension **or** its MIME type matches one of the lists above. The HTML `<input accept>` on the upload zones is narrower (`audio/*,video/mp4,video/webm,video/quicktime`) — drag & drop uses the more permissive server-side regex.

### Video transcoding pipeline
Videos are transcoded to HLS before storage, with these fixed FFmpeg options:
- 360p, `scale=-2:360`
- H.264 (`libx264`) + AAC, `preset ultrafast`, `crf 30`
- Single-threaded (`-threads 1`) to limit memory on small instances
- 6-second `.ts` segments, VOD playlist
- All segments + a rewritten `.m3u8` manifest are uploaded as Cloudinary `raw` resources, then local temp files are deleted

This is why video uploads are asynchronous: the upload endpoint returns `{ isAsync: true, jobId }` immediately and the client polls `/api/upload/status/:jobId` (every ~1.5s) until `status` is `completed` or `failed`.

---

## Known limitations

- **Rooms are in-memory only.** A server restart wipes every room, queue and user. There is no persistence layer for room state — only song metadata is persisted (to Cloudinary).
- **Single-server only.** Socket.IO rooms use in-memory state; horizontal scaling would require a Redis adapter, which is not configured.
- **No authentication.** Anyone with a room code can join; anyone can delete any song from the global library. There are no user accounts.
- **No per-user library.** All uploads go into one shared library visible to everyone.
- **No rate limiting** on the API or socket events.
- **Cloudinary credentials have hardcoded fallbacks** in `server.js`. For any real deployment, set the `CLOUDINARY_*` env vars and rotate the keys — the committed fallback secret is effectively public.
- **Render free tier sleeps** the web service after 15 minutes of inactivity, so the first request after idle has a cold-start delay.
- **Vercel is serverless** and does not support persistent WebSocket connections or long-running FFmpeg jobs. The included `vercel.json` is a starting point but the app is not expected to work correctly there without significant changes (see `MOBILE_HOSTING_GUIDE.md`).
- **Service Worker push / background sync** are wired in `sw.js` but the server never actually pushes notifications, and the `syncQueueActions()` offline queue is a stub.
- **Share target** (`/share`) is declared in `manifest.json` but the route is not implemented in `server.js`.
- **History** is capped at 50 songs server-side; only the last 10 are sent to clients.

---

## Tech stack

**Backend** (`server.js`, `package.json`)
- Node.js ≥ 16, Express 4, Socket.IO 4
- Multer (disk storage), Cloudinary SDK, fluent-ffmpeg + ffmpeg-static + ffprobe-static
- music-metadata (audio tags / duration), UUID, Helmet, compression, CORS

**Frontend** (`public/`)
- Vanilla HTML5 / CSS3 / JS (no framework)
- Socket.IO client, `hls.js` (CDN), `qrcodejs` (CDN), Google Fonts (Inter)
- PWA: `manifest.json` + `sw.js`

---

## Project structure (actual)

```
musicjam/
├── server.js                # Entire backend: routes, Socket.IO, Room class, multer, Cloudinary, HLS
├── package.json
├── render.yaml              # Render.com deployment config
├── vercel.json              # Vercel config (serverless — see limitations)
├── songs-db.json            # Local fallback DB (empty; Cloudinary is source of truth)
├── check-storage.js         # Storage monitoring utility
├── uploads/                 # Temp upload staging (gitkeep)
└── public/
    ├── index.html           # Home page (create / join / library / upload)
    ├── room.html            # Room page (player, queue, library panel, share modal)
    ├── dashboard.html       # Storage dashboard
    ├── manifest.json        # PWA manifest
    ├── sw.js                # Service worker
    ├── css/
    │   ├── style.css
    │   └── room.css
    ├── js/
    │   ├── app.js           # MusicJamApp — home page logic, upload pipeline, PWA install
    │   ├── room.js          # RoomSocketManager — socket events, queue, library panel
    │   └── audio-player.js  # AudioPlayer — dual audio/video player, HLS, fullscreen, sync
    └── icons/               # PWA icons (72–512px)
```

---

## API endpoints

| Method | Route | Purpose |
|-------|-------|---------|
| `GET` | `/` | Home page |
| `GET` | `/dashboard` | Storage dashboard |
| `GET` | `/room/:code` | Room page (404 HTML for invalid code / missing room) |
| `POST` | `/api/rooms` | Create a room → `{ success, room: { code, hostId } }` |
| `GET` | `/api/rooms` | List active rooms (optional `?userId=` to flag host rooms) |
| `GET` | `/api/rooms/:code` | Get full room state |
| `DELETE` | `/api/rooms/:code` | Delete room (host only; `userId` in body) |
| `POST` | `/api/upload` | Upload audio or video (`multipart`, field name `audio`) → `{ success, song }` or `{ success, isAsync: true, jobId }` for video |
| `GET` | `/api/upload/status/:jobId` | Poll HLS transcode job → `{ status, progress, song, error }` |
| `GET` | `/api/library` | All songs + `storage` stats (`songCount`, `totalSizeMB`, `percentUsed`, `availableMB`, `limitMB: 25000`) |
| `DELETE` | `/api/library/:songId` | Delete a song from the library + Cloudinary |

### Socket.IO events

**Client → Server:** `join-room`, `sync-request`, `play`, `pause`, `seek`, `next-song`, `prev-song`, `add-to-queue`, `remove-from-queue`, `reorder-queue`, `set-repeat-mode`, `set-auto-requeue`, `set-no-duplicates`

**Server → Client:** `room-joined`, `user-joined`, `user-left`, `playback-state`, `seek-update`, `queue-updated`, `repeat-mode-updated`, `room-settings-updated`, `library-updated`, `room-deleted`, `error`

---

## Getting started

1. **Install**
   ```bash
   npm install
   ```
2. **Configure Cloudinary** (optional — defaults to a demo cloud baked into `server.js`, but for any real use set your own):
   ```bash
   export CLOUDINARY_CLOUD_NAME=your_cloud
   export CLOUDINARY_API_KEY=your_key
   export CLOUDINARY_API_SECRET=your_secret
   ```
3. **Run**
   ```bash
   npm start
   ```
   Open `http://localhost:3000`, create a room, share the code, and upload some music.

> Note: FFmpeg is bundled via `ffmpeg-static` / `ffprobe-static`, so no system FFmpeg install is required.

---

## Deployment

- **Render.com** (primary) — `render.yaml` provisions a free web service, a 1 GB temp disk, and the `CLOUDINARY_*` env vars. Auto-deploy from GitHub is enabled. This is the path that actually supports WebSockets + FFmpeg.
- **Railway.app** — full Node.js runtime, no sleep. See `DEPLOYMENT.md` / `FREE_DEPLOYMENT_GUIDE.md`.
- **Local + Ngrok** — `ngrok http 3000` for a temporary public URL.
- **Vercel** — `vercel.json` is included but not recommended (serverless model breaks WebSockets and long transcodes).

HTTPS is provided by Render / Railway automatically and is required for the PWA install prompt and `navigator.clipboard`.

---

## License

MIT — use it for personal or commercial purposes.
