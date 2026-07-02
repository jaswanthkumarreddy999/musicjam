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

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      mediaSrc: ["'self'", "blob:", "data:"],
      connectSrc: ["'self'", "ws:", "wss:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]
    }
  }
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
const createUploadsDir = async () => {
  try {
    await fs.mkdir('uploads', { recursive: true });
    await fs.mkdir('public/uploads', { recursive: true });
  } catch (error) {
    console.log('Uploads directory already exists or created');
  }
};
createUploadsDir();

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log('File upload attempt:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    const allowedExtensions = /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i;
    const allowedMimeTypes = [
      'audio/mpeg',      // mp3
      'audio/wav',       // wav
      'audio/wave',      // wav alternative
      'audio/x-wav',     // wav alternative
      'audio/ogg',       // ogg
      'audio/mp4',       // m4a
      'audio/x-m4a',     // m4a alternative
      'audio/flac',      // flac
      'audio/x-flac',    // flac alternative
      'audio/aac',       // aac
      'audio/x-ms-wma',  // wma
      'application/octet-stream' // fallback for some audio files
    ];
    
    const filename = file.originalname.toLowerCase();
    const extname = allowedExtensions.test(filename);
    const mimetype = allowedMimeTypes.includes(file.mimetype);
    
    console.log('File validation:', {
      extname: extname,
      mimetype: mimetype,
      extension: path.extname(filename),
      mimeType: file.mimetype,
      filename: filename
    });
    
    if (extname || mimetype) {
      console.log('File accepted:', file.originalname);
      return cb(null, true);
    } else {
      console.log('File rejected:', file.originalname, 'Invalid type');
      cb(new Error(`Invalid file type. Expected audio file, got: ${file.mimetype}`));
    }
  }
});

// In-memory data storage
const rooms = new Map();
const songs = new Map();
const users = new Map(); // socketId -> { userId, roomCode, nickname, color }

// Persistent storage for songs
const SONGS_DB_FILE = path.join(__dirname, 'songs-db.json');

// Load songs from persistent storage
async function loadSongsFromDB() {
  try {
    const data = await fs.readFile(SONGS_DB_FILE, 'utf8');
    const songsData = JSON.parse(data);
    
    // Convert array back to Map and validate files still exist
    for (const song of songsData) {
      try {
        // Check if the file still exists
        await fs.access(song.path.replace('/uploads/', 'uploads/'));
        songs.set(song.id, song);
      } catch (fileError) {
        console.warn(`Song file not found, skipping: ${song.originalName}`);
      }
    }
    
    console.log(`Loaded ${songs.size} songs from database`);
  } catch (error) {
    console.log('No existing songs database found, attempting recovery...');
    await recoverSongsFromFiles();
  }
}

// Recover songs from existing files (migration function)
async function recoverSongsFromFiles() {
  try {
    const files = await fs.readdir('uploads');
    const audioFiles = files.filter(file => 
      /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i.test(file) && file !== '.gitkeep'
    );
    
    console.log(`Found ${audioFiles.length} audio files to recover`);
    
    for (const filename of audioFiles) {
      try {
        const filePath = path.join('uploads', filename);
        const stats = await fs.stat(filePath);
        
        // Extract metadata
        let metadata = {};
        try {
          metadata = await musicMetadata.parseFile(filePath);
        } catch (metadataError) {
          console.warn(`Failed to extract metadata for ${filename}`);
        }
        
        const song = {
          id: uuidv4(),
          filename: filename,
          originalName: metadata.common?.title || path.parse(filename).name,
          title: metadata.common?.title || path.parse(filename).name,
          artist: metadata.common?.artist || 'Unknown Artist',
          album: metadata.common?.album || 'Unknown Album',
          duration: metadata.format?.duration || 0,
          size: stats.size,
          uploadedAt: stats.birthtime.getTime(),
          path: `/uploads/${filename}`
        };
        
        songs.set(song.id, song);
        console.log(`Recovered: ${song.title}`);
      } catch (error) {
        console.warn(`Failed to recover ${filename}:`, error.message);
      }
    }
    
    if (songs.size > 0) {
      await saveSongsToDB();
      console.log(`✅ Recovered ${songs.size} songs and saved to database`);
    }
  } catch (error) {
    console.warn('Failed to recover songs from files:', error.message);
  }
}

// Save songs to persistent storage
async function saveSongsToDB() {
  try {
    const songsArray = Array.from(songs.values());
    await fs.writeFile(SONGS_DB_FILE, JSON.stringify(songsArray, null, 2));
    console.log(`Saved ${songsArray.length} songs to database`);
  } catch (error) {
    console.error('Failed to save songs to database:', error);
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
    this.skipVotes = new Set();   // socket IDs that voted to skip
    this.history = [];            // played songs history
    this.repeatMode = 'none';     // 'none' | 'one' | 'queue'
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
    this.queue.push({
      id: uuidv4(),
      ...song,
      addedBy: song.addedBy,
      addedAt: Date.now(),
      votes: 0,
      voters: []
    });
  }

  upvoteSong(queueItemId, socketId) {
    const item = this.queue.find(s => s.id === queueItemId);
    if (!item) return false;
    if (item.voters.includes(socketId)) return false; // already voted
    item.votes++;
    item.voters.push(socketId);
    // Re-sort: preserve song at index 0 (currently playing next), sort rest by votes desc
    if (this.queue.length > 1) {
      const [first, ...rest] = this.queue;
      rest.sort((a, b) => b.votes - a.votes);
      this.queue = [first, ...rest];
    }
    return true;
  }

  addSkipVote(socketId) {
    this.skipVotes.add(socketId);
    return this.skipVotes.size;
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

    if (this.currentSong) {
      this.history.push({ ...this.currentSong });
      if (this.history.length > 50) this.history.shift();
    }

    if (this.queue.length > 0) {
      if (this.repeatMode === 'queue' && this.currentSong) {
        this.queue.push({
          id: uuidv4(),
          title: this.currentSong.title,
          artist: this.currentSong.artist,
          album: this.currentSong.album,
          duration: this.currentSong.duration,
          filename: this.currentSong.filename,
          path: this.currentSong.path,
          addedBy: this.currentSong.addedBy,
          votes: 0,
          voters: []
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
      hasPrev: this.history.length > 0
    };
  }
}

// Force HTTP redirect for network access
app.use((req, res, next) => {
  // If accessed via HTTPS, redirect to HTTP (for local network)
  if (req.header('x-forwarded-proto') === 'https') {
    res.redirect(`http://${req.get('host')}${req.url}`);
  } else {
    next();
  }
});

// Routes
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

app.post('/api/upload', upload.single('audio'), async (req, res) => {
  console.log('Upload request received');
  console.log('Request file:', req.file);
  console.log('Request body:', req.body);
  
  try {
    if (!req.file) {
      console.log('No file in request');
      return res.status(400).json({
        success: false,
        message: 'No audio file provided'
      });
    }

    console.log('Processing file:', req.file.originalname);
    
    // Extract metadata
    let metadata = {};
    try {
      metadata = await musicMetadata.parseFile(req.file.path);
      console.log('Metadata extracted successfully:', metadata.common);
    } catch (metadataError) {
      console.warn('Failed to extract metadata, using defaults:', metadataError.message);
    }
    
    const song = {
      id: uuidv4(),
      filename: req.file.filename,
      originalName: req.file.originalname,
      title: metadata.common?.title || path.parse(req.file.originalname).name,
      artist: metadata.common?.artist || 'Unknown Artist',
      album: metadata.common?.album || 'Unknown Album',
      duration: metadata.format?.duration || 0,
      size: req.file.size,
      uploadedAt: Date.now(),
      path: `/uploads/${req.file.filename}`
    };
    
    songs.set(song.id, song);
    console.log('Song saved successfully:', song.title);
    
    // Save to persistent storage
    saveSongsToDB();
    
    res.json({
      success: true,
      song: song
    });
  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file if it was uploaded but processing failed
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
        console.log('Cleaned up failed upload file');
      } catch (cleanupError) {
        console.error('Failed to cleanup file:', cleanupError);
      }
    }
    
    res.status(500).json({
      success: false,
      message: `Failed to process audio file: ${error.message}`
    });
  }
});

app.get('/api/library', (req, res) => {
  const library = Array.from(songs.values()).sort((a, b) => b.uploadedAt - a.uploadedAt);
  res.json({
    success: true,
    songs: library
  });
});

app.delete('/api/library/:songId', async (req, res) => {
  const { songId } = req.params;
  const song = songs.get(songId);
  
  if (!song) {
    return res.status(404).json({
      success: false,
      message: 'Song not found'
    });
  }
  
  try {
    // Delete the file
    const filePath = path.join(__dirname, 'uploads', song.filename);
    await fs.unlink(filePath);
    
    // Remove from memory
    songs.delete(songId);
    
    // Save updated database
    await saveSongsToDB();
    
    console.log('Song deleted:', song.title);
    
    res.json({
      success: true,
      message: 'Song deleted successfully'
    });
  } catch (error) {
    console.error('Failed to delete song:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete song file'
    });
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

app.get('/uploads/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, 'uploads', filename);
  
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
  });
});

// Socket.IO handling
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
  
  socket.on('add-to-queue', (data) => {
    console.log('add-to-queue request received:', data);
    const { songId } = data;
    const user = users.get(socket.id);
    
    console.log('User info:', user);
    console.log('Current room:', socket.currentRoom);
    
    if (!user || !socket.currentRoom) {
      console.log('Error: Not in a room');
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
    const room = rooms.get(socket.currentRoom);
    const song = songs.get(songId);
    
    console.log('Room found:', !!room);
    console.log('Song found:', !!song);
    
    if (!room || !song) {
      console.log('Error: Room or song not found');
      socket.emit('error', { message: 'Room or song not found' });
      return;
    }
    
    console.log('Adding song to queue:', song.title);
    room.addToQueue({
      ...song,
      addedBy: user.userId
    });
    
    console.log('Queue updated, emitting to room:', socket.currentRoom);
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
    
    if (!room) {
      socket.emit('error', { message: 'Not in a room' });
      return;
    }
    
    const nextSong = room.nextSong();
    
    if (nextSong) {
      room.play();
    }
    
    io.to(socket.currentRoom).emit('playback-state', {
      isPlaying: !!nextSong,
      currentSong: room.currentSong,
      currentTime: 0,
      queue: room.queue,
      repeatMode: room.repeatMode,
      hasPrev: room.history.length > 0
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
      hasPrev: room.history.length > 0
    });
  });

  socket.on('set-repeat-mode', (data) => {
    const { mode } = data;
    const room = rooms.get(socket.currentRoom);
    if (!room) return;
    if (room.setRepeatMode(mode)) {
      io.to(socket.currentRoom).emit('repeat-mode-updated', {
        repeatMode: room.repeatMode
      });
    }
  });
  
  // Upvote a song in the queue (Feature 2)
  socket.on('upvote-song', (data) => {
    const { queueItemId } = data;
    const room = rooms.get(socket.currentRoom);
    if (!room) return;
    const changed = room.upvoteSong(queueItemId, socket.id);
    if (changed) {
      io.to(socket.currentRoom).emit('queue-updated', { queue: room.queue });
    }
  });

  // Drag-to-reorder queue (Feature 3)
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

  // Vote to skip current song (Feature 2)
  socket.on('vote-skip', () => {
    const room = rooms.get(socket.currentRoom);
    if (!room || !room.currentSong) return;
    const votes = room.addSkipVote(socket.id);
    const threshold = Math.ceil(room.users.size / 2);
    io.to(socket.currentRoom).emit('skip-vote-update', {
      votes,
      needed: threshold,
      voterSocketId: socket.id
    });
    if (votes >= threshold) {
      const nextSong = room.nextSong();
      if (nextSong) room.play();
      io.to(socket.currentRoom).emit('playback-state', {
        isPlaying: !!nextSong,
        currentSong: room.currentSong,
        currentTime: 0,
        queue: room.queue,
        repeatMode: room.repeatMode,
        hasPrev: room.history.length > 0
      });
      io.to(socket.currentRoom).emit('skip-vote-passed', {});
    }
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