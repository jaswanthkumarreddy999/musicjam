const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs').promises;
const fsSync = require('fs');
const musicMetadata = require('music-metadata');
const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
try {
  const ffmpegPath = require('ffmpeg-static');
  const ffprobeStatic = require('ffprobe-static');
  const ffprobePath = ffprobeStatic.path || ffprobeStatic;
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
  console.log('✓ Loaded static ffmpeg/ffprobe binaries:', { ffmpegPath, ffprobePath });
} catch (e) {
  console.log('⚠️ Static ffmpeg/ffprobe binaries not found. Using system fallback path.');
}
const os = require('os');

// ── Cloudinary config ──────────────────────────────────────────
const CLOUD_NAME   = process.env.CLOUDINARY_CLOUD_NAME || 'lu9erudm';
const CLOUD_KEY    = process.env.CLOUDINARY_API_KEY    || '643732913946747';
const CLOUD_SECRET = process.env.CLOUDINARY_API_SECRET || 'WHCHLt3jmNN7iVJ8rmuM_7QZAdg';

cloudinary.config({ cloud_name: CLOUD_NAME, api_key: CLOUD_KEY, api_secret: CLOUD_SECRET, secure: true });
console.log('☁️  Cloudinary cloud:', CLOUD_NAME);

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// ── Helmet / CSP — allow Cloudinary media ─────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:    ["'self'"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      mediaSrc:      ["'self'", "blob:", "data:", "https://res.cloudinary.com"],
      imgSrc:        ["'self'", "data:", "https://res.cloudinary.com"],
      connectSrc:    ["'self'", "ws:", "wss:", "https://fonts.googleapis.com",
                      "https://fonts.gstatic.com", "https://api.cloudinary.com",
                      "https://res.cloudinary.com", "https://cdn.jsdelivr.net",
                      // HLS segment requests — Cloudinary raw assets
                      "https://*.cloudinary.com"]
    }
  }
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ limit: '1000mb', extended: true }));
app.use(express.static('public'));

// ── Multer — disk storage (prevents OOM on 512MB instances) ──
const AUDIO_EXTS  = /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i;
const VIDEO_EXTS  = /\.(mp4|webm|mov|mkv|avi)$/i;
const AUDIO_MIME  = ['audio/mpeg','audio/wav','audio/wave','audio/x-wav',
                     'audio/ogg','audio/mp4','audio/x-m4a','audio/flac',
                     'audio/x-flac','audio/aac','audio/x-ms-wma',
                     'application/octet-stream'];
const VIDEO_MIME  = ['video/mp4','video/webm','video/quicktime',
                     'video/x-matroska','video/x-msvideo'];

const uploadDir = path.join(__dirname, 'uploads');
try {
  require('fs').mkdirSync(uploadDir, { recursive: true });
} catch (e) {
  // Ignore if exists
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${uuidv4().slice(0, 8)}${path.extname(file.originalname)}`)
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB limit
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const isAudio = AUDIO_EXTS.test(name) || AUDIO_MIME.includes(file.mimetype);
    const isVideo = VIDEO_EXTS.test(name) || VIDEO_MIME.includes(file.mimetype);
    if (isAudio || isVideo) return cb(null, true);
    cb(new Error(`Unsupported file type: ${file.mimetype}`));
  }
});

// In-memory data storage
const rooms = new Map();
const songs = new Map();
const users = new Map(); // socketId -> { userId, roomCode, nickname, color }
const transcodeJobs = new Map(); // jobId -> { status: 'transcoding' | 'uploading' | 'completed' | 'failed', progress: 0, song: null, error: null }

// ── Persistent song metadata — backed by Cloudinary raw asset ──
const SONGS_DB_PUBLIC_ID = 'musicjam/songs-db';

async function loadSongsFromDB() {
  try {
    const url = cloudinary.url(SONGS_DB_PUBLIC_ID, { resource_type: 'raw', secure: true });
    const res = await fetch(url + '?t=' + Date.now());
    if (res.ok) {
      const songsData = await res.json();
      for (const song of songsData) songs.set(song.id, song);
      console.log(`Loaded ${songs.size} songs from Cloudinary DB`);
      return;
    }
    console.log('Cloudinary DB not found, starting fresh');
  } catch (e) {
    console.log('Could not load Cloudinary DB:', e.message);
  }
}

async function saveSongsToDB() {
  try {
    const json = JSON.stringify(Array.from(songs.values()), null, 2);
    await uploadToCloudinary(Buffer.from(json), {
      resource_type: 'raw',
      public_id: SONGS_DB_PUBLIC_ID,
      overwrite: true,
      invalidate: true,
    });
    console.log(`Saved ${songs.size} songs to Cloudinary DB`);
  } catch (error) {
    console.error('Failed to save songs DB:', error.message);
  }
}

// Load songs on server startup
loadSongsFromDB();

// Room code generation
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Room class
class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.users = new Set();       // socket IDs
    this.userMeta = new Map();    // socketId -> { nickname, color }
    this.queue = [];
    this.currentSong = null;
    this.isPlaying = false;
    this.currentTime = 0;
    this.lastUpdate = Date.now();
    this.createdAt = Date.now();
    this.skipVotes = new Set();
    this.history = [];            // played songs history
    this.repeatMode = 'none';     // 'none' | 'one' | 'queue'
    this.autoRequeue = false;     // re-add finished songs to end of queue
    this.noDuplicates = false;    // block duplicate songs in queue
  }

  addUser(userId, meta = {}) {
    this.users.add(userId);
    this.userMeta.set(userId, {
      nickname: meta.nickname || `Listener`,
      color: meta.color || '#00f59b'
    });
  }

  removeUser(userId) {
    this.users.delete(userId);
    this.userMeta.delete(userId);
    this.skipVotes.delete(userId);
    return this.users.size === 0;
  }

  getUserList() {
    return Array.from(this.users).map(id => ({
      socketId: id,
      ...this.userMeta.get(id)
    }));
  }

  addToQueue(song) {
    // noDuplicates: check by originalSongId (the library song id, not queue item id)
    if (this.noDuplicates) {
      const exists = this.queue.some(q => q.originalSongId === song.id || q.originalSongId === song.originalSongId);
      const isCurrent = this.currentSong && (this.currentSong.originalSongId === song.id || this.currentSong.id === song.id);
      if (exists || isCurrent) return { added: false, reason: 'duplicate' };
    }
    this.queue.push({
      id: uuidv4(),
      originalSongId: song.id,
      ...song,
      addedBy: song.addedBy,
      addedAt: Date.now()
    });
    return { added: true };
  }

  clearSkipVotes() {
    this.skipVotes.clear();
  }

  removeFromQueue(songId) {
    this.queue = this.queue.filter(song => song.id !== songId);
  }

  nextSong() {
    if (this.repeatMode === 'one' && this.currentSong) {
      this.currentTime = 0;
      this.lastUpdate = Date.now();
      this.clearSkipVotes();
      return this.currentSong;
    }

    // autoRequeue: push finished song to end of queue before advancing
    if (this.autoRequeue && this.currentSong && this.repeatMode !== 'one') {
      this.queue.push({
        id: uuidv4(),
        originalSongId: this.currentSong.originalSongId || this.currentSong.id,
        title: this.currentSong.title,
        artist: this.currentSong.artist,
        album: this.currentSong.album,
        duration: this.currentSong.duration,
        filename: this.currentSong.filename,
        path: this.currentSong.path,
        addedBy: this.currentSong.addedBy
      });
    }

    if (this.currentSong) {
      this.history.push({ ...this.currentSong });
      if (this.history.length > 50) this.history.shift();
    }

    if (this.queue.length > 0) {
      if (this.repeatMode === 'queue' && this.currentSong && !this.autoRequeue) {
        this.queue.push({
          id: uuidv4(),
          originalSongId: this.currentSong.originalSongId || this.currentSong.id,
          title: this.currentSong.title,
          artist: this.currentSong.artist,
          album: this.currentSong.album,
          duration: this.currentSong.duration,
          filename: this.currentSong.filename,
          path: this.currentSong.path,
          addedBy: this.currentSong.addedBy
        });
      }

      this.currentSong = this.queue.shift();
      this.currentTime = 0;
      this.lastUpdate = Date.now();
      this.clearSkipVotes();
      return this.currentSong;
    }

    if (this.repeatMode === 'queue' && this.currentSong) {
      this.currentTime = 0;
      this.lastUpdate = Date.now();
      this.clearSkipVotes();
      return this.currentSong;
    }

    this.currentSong = null;
    this.isPlaying = false;
    return null;
  }

  prevSong() {
    if (this.history.length > 0) {
      if (this.currentSong) {
        // Put the current song back into the start of the queue
        this.queue.unshift({ ...this.currentSong });
      }
      this.currentSong = this.history.pop();
      this.currentTime = 0;
      this.lastUpdate = Date.now();
      this.clearSkipVotes();
      return this.currentSong;
    }
    return null;
  }

  play() {
    this.isPlaying = true;
    this.lastUpdate = Date.now();
  }

  pause() {
    if (this.isPlaying) {
      this.currentTime += (Date.now() - this.lastUpdate) / 1000;
    }
    this.isPlaying = false;
    this.lastUpdate = Date.now();
  }

  seek(time) {
    this.currentTime = time;
    this.lastUpdate = Date.now();
  }

  getCurrentTime() {
    if (this.isPlaying) {
      return this.currentTime + (Date.now() - this.lastUpdate) / 1000;
    }
    return this.currentTime;
  }

  setRepeatMode(mode) {
    const validModes = ['none', 'one', 'queue'];
    if (validModes.includes(mode)) {
      this.repeatMode = mode;
      return true;
    }
    return false;
  }

  getState() {
    return {
      code: this.code,
      hostId: this.hostId,
      users: Array.from(this.users),
      userList: this.getUserList(),
      queue: this.queue,
      currentSong: this.currentSong,
      isPlaying: this.isPlaying,
      currentTime: this.getCurrentTime(),
      userCount: this.users.size,
      repeatMode: this.repeatMode,
      hasPrev: this.history.length > 0,
      autoRequeue: this.autoRequeue,
      noDuplicates: this.noDuplicates,
      history: this.history.slice(-10).reverse()
    };
  }
}

// Force HTTP redirect for network access (only for local development)
app.use((req, res, next) => {
  // Only redirect HTTPS to HTTP in local development
  // Skip this redirect in production environments (like Render)
  if (process.env.NODE_ENV !== 'production' && req.header('x-forwarded-proto') === 'https') {
    res.redirect(`http://${req.get('host')}${req.url}`);
  } else {
    next();
  }
});

// Routes
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/room/:code', (req, res) => {
  const { code } = req.params;
  
  // Validate room code format (6 digits)
  if (!/^\d{6}$/.test(code)) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invalid Room Code - MusicJam</title>
        <style>
          body { font-family: Arial, sans-serif; background: #121212; color: white; text-align: center; padding: 50px; }
          h1 { color: #1db954; }
          .btn { background: #1db954; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>🎵 MusicJam</h1>
        <h2>Invalid Room Code</h2>
        <p>Room codes must be exactly 6 digits.</p>
        <a href="/" class="btn">← Back to Home</a>
      </body>
      </html>
    `);
  }
  
  // Check if room exists
  const room = rooms.get(code);
  if (!room) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Room Not Found - MusicJam</title>
        <style>
          body { font-family: Arial, sans-serif; background: #121212; color: white; text-align: center; padding: 50px; }
          h1 { color: #1db954; }
          .btn { background: #1db954; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px; }
          .create-btn { background: #1ed760; }
        </style>
      </head>
      <body>
        <h1>🎵 MusicJam</h1>
        <h2>Room Not Found</h2>
        <p>Room <strong>${code}</strong> doesn't exist or has been closed.</p>
        <p>It may have been deleted due to inactivity.</p>
        <div>
          <a href="/" class="btn">← Back to Home</a>
          <a href="#" onclick="createNewRoom()" class="btn create-btn">Create New Room</a>
        </div>
        <script>
          async function createNewRoom() {
            try {
              const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
              const data = await response.json();
              if (data.success) {
                window.location.href = '/room/' + data.room.code + '?userId=' + data.room.hostId;
              }
            } catch (error) {
              alert('Failed to create room. Please try again.');
            }
          }
        </script>
      </body>
      </html>
    `);
  }
  
  // Room exists, serve the room page
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// API Routes
app.post('/api/rooms', (req, res) => {
  const code = generateRoomCode();
  const userId = uuidv4();
  const room = new Room(code, userId);
  
  rooms.set(code, room);
  
  res.json({
    success: true,
    room: {
      code: code,
      hostId: userId
    }
  });
});

app.get('/api/rooms/:code', (req, res) => {
  const { code } = req.params;
  const room = rooms.get(code);
  
  if (!room) {
    return res.status(404).json({
      success: false,
      message: 'Room not found'
    });
  }
  
  res.json({
    success: true,
    room: room.getState()
  });
});

// ── HLS transcoding helper ─────────────────────────────────────
// Converts a video file to HLS segments in a temp directory.
// Returns { hlsDir, manifestPath, segments }
function transcodeToHLS(inputPath, jobId) {
  return new Promise((resolve, reject) => {
    const hlsDir = path.join(os.tmpdir(), `hls-${jobId}`);
    fsSync.mkdirSync(hlsDir, { recursive: true });
    const manifestPath = path.join(hlsDir, 'index.m3u8');
    const segmentPattern = path.join(hlsDir, 'seg%04d.ts');
    let lastLoggedPercent = -10;

    ffmpeg(inputPath)
      .outputOptions([
        '-c:v libx264',       // H.264 video codec (broad compatibility)
        '-c:a aac',           // AAC audio codec
        '-preset ultrafast',   // Minimize memory queue size & maximize speed
        '-crf 30',            // Reduce bitrate footprint slightly
        '-vf scale=-2:360',   // Scale down to 360p (major savings in memory usage)
        '-threads 1',         // Enforce single thread to prevent multi-core RAM accumulation
        '-sc_threshold 0',    // Consistent cuts
        '-g 48',              // GOP size (keyframe every 2s @24fps)
        '-keyint_min 48',
        '-hls_time 6',        // 6-second segments ≈ 3-8 MB each
        '-hls_playlist_type vod',
        '-hls_segment_filename', segmentPattern,
        '-f hls',
      ])
      .output(manifestPath)
      .on('start', cmd => console.log('🎬 FFmpeg HLS cmd:', cmd.slice(0, 120) + '…'))
      .on('progress', p => {
        if (p.percent) {
          const percent = Math.round(p.percent);
          const job = transcodeJobs.get(jobId);
          if (job) job.progress = percent;
          
          // Throttled logging (every 20%) to prevent clogging Render log drains
          if (percent >= lastLoggedPercent + 20 || percent >= 100) {
            console.log(`🎬 [Job ${jobId}] HLS progress: ${percent}%`);
            lastLoggedPercent = percent;
          }
        }
      })
      .on('end', async () => {
        console.log(`✅ [Job ${jobId}] FFmpeg HLS done`);
        // Collect segment filenames
        const entries = await fs.readdir(hlsDir);
        const segments = entries.filter(f => f.endsWith('.ts')).sort();
        resolve({ hlsDir, manifestPath, segments });
      })
      .on('error', (err, _stdout, stderr) => {
        console.error(`❌ [Job ${jobId}] FFmpeg error:`, err.message, stderr?.slice(-300));
        reject(err);
      })
      .run();
  });
}

// Upload all HLS segments + manifest to Cloudinary, return manifest URL
async function uploadHLSToCloudinary(hlsDir, manifestPath, segments, folder, baseId) {
  const segUrls = {};

  // Upload each .ts segment as a raw file
  console.log(`📤 Uploading ${segments.length} HLS segments to Cloudinary…`);
  for (let i = 0; i < segments.length; i++) {
    const segFile = segments[i];
    const segPath = path.join(hlsDir, segFile);
    const publicId = `${folder}/${baseId}/${segFile.replace('.ts', '')}`;
    const result = await cloudinary.uploader.upload(segPath, {
      resource_type: 'raw',
      public_id: publicId,
      overwrite: true,
    });
    segUrls[segFile] = result.secure_url;
    console.log(`  ✓ Segment ${i + 1}/${segments.length}: ${segFile}`);
  }

  // Read original manifest and rewrite local URIs → Cloudinary URLs
  const originalManifest = await fs.readFile(manifestPath, 'utf8');
  const rewrittenManifest = originalManifest.replace(/^(seg\d+\.ts)$/gm, (match) => {
    return segUrls[match] || match;
  });

  // Upload the rewritten manifest as a raw file
  const manifestPublicId = `${folder}/${baseId}/index`;
  const manifestBuffer = Buffer.from(rewrittenManifest, 'utf8');
  const manifestResult = await uploadToCloudinary(manifestBuffer, {
    resource_type: 'raw',
    public_id: manifestPublicId,
    overwrite: true,
    format: 'm3u8',
  });

  console.log('☁️  HLS manifest uploaded:', manifestResult.secure_url);
  return {
    manifestUrl: manifestResult.secure_url,
    segmentPublicIds: Object.values(segUrls).map(u => u)
  };
}

// Generic Cloudinary buffer upload helper (used for DB + manifests)
function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    const r = new Readable();
    r.push(buffer);
    r.push(null);
    r.pipe(stream);
  });
}

// Background transcoding runner to avoid blocking HTTP requests
async function runBackgroundTranscode(jobId, uploadedFilePath, originalname, size, baseId, cloudFolder) {
  let hlsDir = null;
  try {
    console.log(`🎬 [BG Job ${jobId}] Starting HLS transcoding: ${originalname} (${(size / 1024 / 1024).toFixed(1)} MB)`);
    
    // 1. Transcode
    const hlsResult = await transcodeToHLS(uploadedFilePath, baseId);
    hlsDir = hlsResult.hlsDir;

    // 2. Upload segments
    const job = transcodeJobs.get(jobId);
    if (job) job.status = 'uploading';
    
    const { manifestUrl } = await uploadHLSToCloudinary(
      hlsDir, hlsResult.manifestPath, hlsResult.segments, cloudFolder, baseId
    );

    // 3. Probing duration
    const duration = await new Promise((resolve) => {
      ffmpeg.ffprobe(uploadedFilePath, (err, meta) => {
        resolve(err ? 0 : (meta.format?.duration || 0));
      });
    });

    // 4. Save metadata to DB
    const song = {
      id: uuidv4(),
      cloudinaryId: `${cloudFolder}/${baseId}/index`,
      originalName: originalname,
      title: path.parse(originalname).name,
      artist: 'Unknown Artist',
      album: '',
      duration,
      size,
      uploadedAt: Date.now(),
      url: manifestUrl,
      path: manifestUrl,
      mediaType: 'video',
      isHLS: true,
    };

    songs.set(song.id, song);
    await saveSongsToDB();

    // Broadcast update
    io.emit('library-updated', { song });

    // Mark job done
    if (job) {
      job.status = 'completed';
      job.song = song;
    }
    console.log(`✅ [BG Job ${jobId}] Success: Transcoded & uploaded ${originalname}`);

  } catch (error) {
    console.error(`❌ [BG Job ${jobId}] Failure:`, error);
    const job = transcodeJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error.message;
    }
  } finally {
    // Delete local temp original video file
    if (uploadedFilePath) {
      await fs.unlink(uploadedFilePath).catch(e => console.warn('Unlink original file warning:', e.message));
    }
    // Delete local HLS temporary folder
    if (hlsDir) {
      await fs.rm(hlsDir, { recursive: true, force: true }).catch(e => console.warn('Remove hlsDir warning:', e.message));
    }
  }
}

app.post('/api/upload', upload.single('audio'), async (req, res) => {
  let uploadedFilePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    uploadedFilePath = req.file.path;
    const name = req.file.originalname.toLowerCase();
    const isVideo = VIDEO_EXTS.test(name) || VIDEO_MIME.includes(req.file.mimetype);
    const mediaType = isVideo ? 'video' : 'audio';

    // Duplicate check
    const incomingNoExt = path.parse(req.file.originalname.toLowerCase().trim()).name;
    for (const existing of songs.values()) {
      const existingNoExt = path.parse((existing.originalName || '').toLowerCase().trim()).name;
      if (existingNoExt === incomingNoExt) {
        // Delete uploaded file immediately
        await fs.unlink(uploadedFilePath).catch(() => {});
        return res.status(409).json({
          success: false,
          message: `"${existing.title}" already exists in your library`
        });
      }
    }

    const baseId      = `${Date.now()}-${uuidv4().slice(0, 8)}`;
    const cloudFolder = 'musicjam';

    if (isVideo) {
      const jobId = uuidv4();
      transcodeJobs.set(jobId, {
        status: 'transcoding',
        progress: 0,
        song: null,
        error: null
      });

      // Run HLS async process in background, do not await!
      runBackgroundTranscode(jobId, uploadedFilePath, req.file.originalname, req.file.size, baseId, cloudFolder);

      // Return status immediately with jobId
      return res.json({ success: true, isAsync: true, jobId });

    } else {
      // Audio stream is directly uploaded and processed synchronously
      let metadata = {};
      try { metadata = await musicMetadata.parseFile(uploadedFilePath); } catch (e) {}
      let duration = metadata.format?.duration || 0;

      const cloudResult = await cloudinary.uploader.upload(uploadedFilePath, {
        resource_type: 'video',
        folder: cloudFolder,
        public_id: baseId,
        use_filename: false,
      });

      const songUrl      = cloudResult.secure_url;
      const cloudinaryId = cloudResult.public_id;
      duration     = duration || cloudResult.duration || 0;

      const song = {
        id: uuidv4(),
        cloudinaryId,
        originalName: req.file.originalname,
        title: metadata.common?.title || path.parse(req.file.originalname).name,
        artist: metadata.common?.artist || 'Unknown Artist',
        album: metadata.common?.album || '',
        duration,
        size: req.file.size,
        uploadedAt: Date.now(),
        url: songUrl,
        path: songUrl,
        mediaType,
        isHLS: false,
      };

      songs.set(song.id, song);
      await saveSongsToDB();
      io.emit('library-updated', { song });

      // Clean up temp file
      await fs.unlink(uploadedFilePath).catch(() => {});

      return res.json({ success: true, song });
    }

  } catch (error) {
    console.error('Upload handler error:', error);
    if (uploadedFilePath) {
      await fs.unlink(uploadedFilePath).catch(() => {});
    }
    res.status(500).json({ success: false, message: `Upload failed: ${error.message}` });
  }
});

// GET status endpoint of HLS transcoding jobs
app.get('/api/upload/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = transcodeJobs.get(jobId);

  if (!job) {
    return res.status(404).json({ success: false, message: 'Upload job not found' });
  }

  res.json({
    success: true,
    status: job.status,
    progress: job.progress,
    song: job.song,
    error: job.error
  });

  // Automatically clean up job mapping from memory once finished
  if (job.status === 'completed' || job.status === 'failed') {
    setTimeout(() => {
      transcodeJobs.delete(jobId);
    }, 15000); // Keep it around for 15s to let final poll request catch it safely
  }
});


app.get('/api/library', (req, res) => {
  const library = Array.from(songs.values()).sort((a, b) => b.uploadedAt - a.uploadedAt);
  
  // Calculate total storage used
  const totalSize = library.reduce((sum, song) => sum + (song.size || 0), 0);
  const totalSizeMB   = (totalSize / (1024 * 1024)).toFixed(2);
  const percentUsed   = ((totalSize / (25 * 1024 * 1024 * 1024)) * 100).toFixed(2);
  
  res.json({
    success: true,
    songs: library,
    storage: {
      songCount: library.length,
      totalSizeMB: parseFloat(totalSizeMB),
      percentUsed: parseFloat(percentUsed),
      availableMB: parseFloat((25000 - parseFloat(totalSizeMB)).toFixed(2)),
      limitMB: 25000
    }
  });
});

app.delete('/api/library/:songId', async (req, res) => {
  const { songId } = req.params;
  const song = songs.get(songId);

  if (!song) {
    return res.status(404).json({ success: false, message: 'Song not found' });
  }

  try {
    // Cloudinary resource deletion logic
    if (song.cloudinaryId) {
      if (song.isHLS) {
        // Delete all raw files under the HLS folder prefix (manifest + chunks)
        const prefix = song.cloudinaryId.replace('/index', '/');
        await cloudinary.api.delete_resources_by_prefix(prefix, {
          resource_type: 'raw'
        }).catch(e => console.warn('Cloudinary HLS segments deletion warning:', e.message));

        // Delete the now empty folder
        const folderPath = song.cloudinaryId.substring(0, song.cloudinaryId.lastIndexOf('/'));
        await cloudinary.api.delete_folder(folderPath).catch(() => {});
      } else {
        // Normal audio or video file is 'video' resource type
        await cloudinary.uploader.destroy(song.cloudinaryId, {
          resource_type: 'video'
        }).catch(e => console.warn('Cloudinary delete warning:', e.message));
      }
    }

    songs.delete(songId);
    await saveSongsToDB();

    res.json({ success: true, message: 'Song deleted successfully' });
  } catch (error) {
    console.error('Failed to delete song:', error);
    res.status(500).json({ success: false, message: 'Failed to delete song' });
  }
});

app.get('/api/rooms', (req, res) => {
  const activeRooms = Array.from(rooms.values()).map(room => ({
    code: room.code,
    userCount: room.users.size,
    currentSong: room.currentSong ? {
      title: room.currentSong.title,
      artist: room.currentSong.artist
    } : null,
    isPlaying: room.isPlaying,
    queueLength: room.queue.length,
    createdAt: room.createdAt,
    hostId: room.hostId,
    // Check if the requesting user is the host (if userId provided)
    isHost: req.query.userId === room.hostId
  }));
  
  res.json({
    success: true,
    rooms: activeRooms
  });
});

app.delete('/api/rooms/:code', (req, res) => {
  const { code } = req.params;
  const { userId } = req.body;
  
  const room = rooms.get(code);
  
  if (!room) {
    return res.status(404).json({
      success: false,
      message: 'Room not found'
    });
  }
  
  // Check if the user is the host
  if (room.hostId !== userId) {
    return res.status(403).json({
      success: false,
      message: 'Only the host can delete this room'
    });
  }
  
  // Notify all users in the room that it's being deleted
  io.to(code).emit('room-deleted', {
    message: 'Room has been deleted by the host'
  });
  
  // Remove all users from the room
  io.socketsLeave(code);
  
  // Delete the room
  rooms.delete(code);
  
  console.log(`Room ${code} deleted by host ${userId}`);
  
  res.json({
    success: true,
    message: 'Room deleted successfully'
  });
});

// Files are served directly from Cloudinary — no local file route needed

// Socket.IO handling with error protection
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  
  socket.on('join-room', (data) => {
    const { roomCode, userId, nickname, color } = data;
    const room = rooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    
    // Leave any previous room
    if (socket.currentRoom) {
      socket.leave(socket.currentRoom);
      const prevRoom = rooms.get(socket.currentRoom);
      if (prevRoom) {
        prevRoom.removeUser(socket.id);
        socket.to(socket.currentRoom).emit('user-left', {
          userId: socket.id,
          userCount: prevRoom.users.size,
          userList: prevRoom.getUserList()
        });
      }
    }
    
    // Join new room
    socket.join(roomCode);
    socket.currentRoom = roomCode;
    socket.userId = userId;
    socket.nickname = nickname || 'Listener';
    socket.color = color || '#00f59b';
    
    room.addUser(socket.id, { nickname: socket.nickname, color: socket.color });
    users.set(socket.id, { userId, roomCode, nickname: socket.nickname, color: socket.color });
    
    // Send current room state to the new user
    socket.emit('room-joined', {
      success: true,
      room: room.getState(),
      yourUserId: userId
    });
    
    // Notify other users
    socket.to(roomCode).emit('user-joined', {
      userId: socket.id,
      nickname: socket.nickname,
      color: socket.color,
      userCount: room.users.size,
      userList: room.getUserList()
    });
    
    console.log(`User ${socket.nickname} (${socket.id}) joined room ${roomCode}`);
  });

  socket.on('sync-request', () => {
    if (!socket.currentRoom) return;
    const room = rooms.get(socket.currentRoom);
    if (!room) return;
    
    socket.emit('playback-state', {
      isPlaying: room.isPlaying,
      currentSong: room.currentSong,
      currentTime: room.getCurrentTime(),
      queue: room.queue,
      repeatMode: room.repeatMode,
      hasPrev: room.history.length > 0,
      history: room.history.slice(-10).reverse()
    });
  });
  
  socket.on('add-to-queue', (data) => {
    const { songId } = data;
    const user = users.get(socket.id);

    if (!user || !socket.currentRoom) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }

    const room = rooms.get(socket.currentRoom);
    const song = songs.get(songId);

    if (!room || !song) {
      socket.emit('error', { message: 'Room or song not found' });
      return;
    }

    const result = room.addToQueue({ ...song, addedBy: user.userId });

    if (!result.added) {
      socket.emit('error', { message: 'Song already in queue (duplicates blocked)' });
      return;
    }

    io.to(socket.currentRoom).emit('queue-updated', {
      queue: room.queue
    });
  });
  
  socket.on('remove-from-queue', (data) => {
    const { songId } = data;
    const room = rooms.get(socket.currentRoom);
    
    if (!room) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
    room.removeFromQueue(songId);
    
    io.to(socket.currentRoom).emit('queue-updated', {
      queue: room.queue
    });
  });
  
  socket.on('play', () => {
    const room = rooms.get(socket.currentRoom);
    
    if (!room) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
    // If no current song, play next from queue
    if (!room.currentSong && room.queue.length > 0) {
      room.nextSong();
    }
    
    room.play();
    
    io.to(socket.currentRoom).emit('playback-state', {
      isPlaying: true,
      currentSong: room.currentSong,
      currentTime: room.getCurrentTime(),
      queue: room.queue,
      repeatMode: room.repeatMode,
      hasPrev: room.history.length > 0
    });
  });
  
  socket.on('pause', () => {
    const room = rooms.get(socket.currentRoom);
    
    if (!room) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
    room.pause();
    
    io.to(socket.currentRoom).emit('playback-state', {
      isPlaying: false,
      currentSong: room.currentSong,
      currentTime: room.getCurrentTime(),
      queue: room.queue,
      repeatMode: room.repeatMode,
      hasPrev: room.history.length > 0
    });
  });
  
  socket.on('seek', (data) => {
    const { time } = data;
    const room = rooms.get(socket.currentRoom);
    
    if (!room) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
    room.seek(time);
    
    io.to(socket.currentRoom).emit('seek-update', {
      currentTime: time,
      timestamp: Date.now()
    });
  });
  
  socket.on('next-song', () => {
    const room = rooms.get(socket.currentRoom);
    if (!room) { socket.emit('error', { message: 'Not in a room' }); return; }

    // Strong debounce — per-song lock prevents multi-client double-fire on song end
    const now = Date.now();
    const songKey = room.currentSong?.id || 'none';
    if (room.lastNextSongKey === songKey && room.lastNextSongTime && (now - room.lastNextSongTime) < 2000) {
      return;
    }
    room.lastNextSongKey = songKey;
    room.lastNextSongTime = now;

    const nextSong = room.nextSong();
    if (nextSong) room.play();

    io.to(socket.currentRoom).emit('playback-state', {
      isPlaying: !!nextSong,
      currentSong: room.currentSong,
      currentTime: 0,
      queue: room.queue,
      repeatMode: room.repeatMode,
      hasPrev: room.history.length > 0,
      history: room.history.slice(-10).reverse()
    });
  });

  socket.on('prev-song', () => {
    const room = rooms.get(socket.currentRoom);
    if (!room) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    const prevSong = room.prevSong();
    if (prevSong) {
      room.play();
    }
    io.to(socket.currentRoom).emit('playback-state', {
      isPlaying: !!prevSong,
      currentSong: room.currentSong,
      currentTime: 0,
      queue: room.queue,
      repeatMode: room.repeatMode,
      hasPrev: room.history.length > 0,
      history: room.history.slice(-10).reverse()
    });
  });

  socket.on('set-repeat-mode', (data) => {
    const { mode } = data;
    const room = rooms.get(socket.currentRoom);
    if (!room) {
      console.log('set-repeat-mode: Room not found');
      return;
    }
    
    console.log(`Setting repeat mode to: ${mode} for room ${socket.currentRoom}`);
    
    if (room.setRepeatMode(mode)) {
      console.log(`Repeat mode updated to: ${room.repeatMode}`);
      io.to(socket.currentRoom).emit('repeat-mode-updated', {
        repeatMode: room.repeatMode
      });
    } else {
      console.log(`Invalid repeat mode: ${mode}`);
      socket.emit('error', { message: 'Invalid repeat mode' });
    }
  });
  
  // Drag-to-reorder queue
  socket.on('reorder-queue', (data) => {
    const { fromIndex, toIndex } = data;
    const room = rooms.get(socket.currentRoom);
    if (!room) return;
    const q = room.queue;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= q.length || toIndex >= q.length) return;
    const [moved] = q.splice(fromIndex, 1);
    q.splice(toIndex, 0, moved);
    io.to(socket.currentRoom).emit('queue-updated', { queue: room.queue });
  });

  // Toggle auto-requeue
  socket.on('set-auto-requeue', (data) => {
    const room = rooms.get(socket.currentRoom);
    if (!room) return;
    room.autoRequeue = !!data.enabled;
    io.to(socket.currentRoom).emit('room-settings-updated', {
      autoRequeue: room.autoRequeue,
      noDuplicates: room.noDuplicates
    });
  });

  // Toggle no-duplicates
  socket.on('set-no-duplicates', (data) => {
    const room = rooms.get(socket.currentRoom);
    if (!room) return;
    room.noDuplicates = !!data.enabled;
    io.to(socket.currentRoom).emit('room-settings-updated', {
      autoRequeue: room.autoRequeue,
      noDuplicates: room.noDuplicates
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    if (socket.currentRoom) {
      const room = rooms.get(socket.currentRoom);
      if (room) {
        const isEmpty = room.removeUser(socket.id);
        
        if (isEmpty) {
          rooms.delete(socket.currentRoom);
          console.log(`Room ${socket.currentRoom} deleted (empty)`);
        } else {
          socket.to(socket.currentRoom).emit('user-left', {
            userId: socket.id,
            userCount: room.users.size,
            userList: room.getUserList()
          });
        }
      }
    }
    
    users.delete(socket.id);
  });
});

// Clean up old rooms (run every hour)
const oneHour = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  
  rooms.forEach((room, code) => {
    if (room.users.size === 0 && (now - room.createdAt) > oneHour) {
      rooms.delete(code);
      console.log(`Cleaned up inactive room: ${code}`);
    }
  });
}, oneHour);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 MusicJam server running on port ${PORT}`);
  console.log(`🌐 Local: http://localhost:${PORT}`);
  console.log(`🌐 Network: http://192.168.29.43:${PORT}`);
  console.log(`📱 Share with friends: http://192.168.29.43:${PORT}`);
});

// Graceful shutdown - save data before closing
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  
  // Save songs database
  await saveSongsToDB();
  
  console.log('✅ Data saved. Server closed.');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  
  // Save songs database
  await saveSongsToDB();
  
  console.log('✅ Data saved. Server closed.');
  process.exit(0);
});