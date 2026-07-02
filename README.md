# MusicJam - Collaborative Music Streaming Platform

A real-time collaborative music streaming platform where users can create rooms, share music, and control playback together - similar to Spotify Jam but with manually uploaded songs.

## 🎵 Features

- **Room Creation**: Create music rooms with unique codes
- **Real-time Collaboration**: Multiple users can join rooms and control playback
- **Music Upload**: Manually add music files to your library
- **Queue Management**: Add, remove, and reorder songs in the queue
- **Playback Controls**: Play, pause, skip, and seek tracks
- **Synchronized Listening**: All users hear the same music at the same time
- **Room Codes**: Simple 6-digit codes for easy room sharing

## 🏗️ Project Structure

```
musicjam/
├── README.md
├── package.json
├── server.js                    # Express server entry point
├── public/                      # Static frontend files
│   ├── index.html              # Main landing page
│   ├── room.html               # Room interface
│   ├── css/
│   │   ├── style.css           # Main styles
│   │   └── room.css            # Room-specific styles
│   ├── js/
│   │   ├── app.js              # Main application logic
│   │   ├── room.js             # Room functionality
│   │   ├── audio-player.js     # Audio playback management
│   │   └── socket-client.js    # WebSocket client handling
│   └── uploads/                # Directory for uploaded music files
├── src/
│   ├── routes/
│   │   ├── api.js              # API routes (rooms, music)
│   │   └── upload.js           # File upload handling
│   ├── models/
│   │   ├── Room.js             # Room data structure
│   │   ├── Song.js             # Song metadata structure
│   │   └── User.js             # User session management
│   ├── services/
│   │   ├── roomManager.js      # Room creation and management
│   │   ├── musicLibrary.js     # Music file management
│   │   └── socketHandler.js    # WebSocket event handling
│   └── utils/
│       ├── fileValidator.js    # Audio file validation
│       └── roomCodeGenerator.js # Unique room code generation
├── config/
│   └── server.json             # Server configuration
└── uploads/                    # Music file storage directory
```

## 🛠️ Technology Stack

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **Socket.IO** - Real-time WebSocket communication
- **Multer** - File upload handling
- **UUID** - Unique identifier generation

### Frontend
- **HTML5** - Structure and audio elements
- **CSS3** - Mobile-first responsive design with PWA support
- **Vanilla JavaScript** - Client-side logic
- **Socket.IO Client** - Real-time communication
- **Web Audio API** - Advanced audio control
- **Progressive Web App (PWA)** - Mobile app-like experience

### Storage
- **File System** - Music file storage
- **In-Memory** - Room and session data (can be upgraded to Redis/Database)

## 🚀 Core Functionality

### 1. Room Management
- Generate unique 6-digit room codes
- Create and join rooms
- Room host privileges (room creator has additional controls)
- Automatic room cleanup when empty

### 2. Music Library
- Upload audio files (MP3, WAV, OGG supported)
- Extract metadata (title, artist, duration)
- File validation and size limits
- Organized storage system

### 3. Real-time Synchronization
- Synchronized playback across all clients
- Real-time queue updates
- Playback state broadcasting (play/pause/seek)
- User join/leave notifications

### 4. Queue Management
- Add songs to queue
- Reorder queue items (drag & drop)
- Remove songs from queue
- Current song highlighting
- Auto-advance to next song

### 5. Audio Controls
- Play/Pause synchronization
- Seek to specific time positions
- Volume control (local to each user)
- Next/Previous track navigation
- Shuffle and repeat modes

## 📱 User Interface

### Landing Page (`index.html`)
- Room creation button
- Join room input (6-digit code)
- Music library/upload interface
- Recently created rooms list

### Room Interface (`room.html`)
- Current song display with artwork/metadata
- Audio player controls
- Queue management panel
- Connected users list
- Room code sharing
- Chat functionality (optional feature)

## 🔧 API Endpoints

### Room Management
- `POST /api/rooms` - Create new room
- `GET /api/rooms/:code` - Get room details
- `POST /api/rooms/:code/join` - Join existing room
- `DELETE /api/rooms/:code/leave` - Leave room

### Music Management
- `POST /api/upload` - Upload music file
- `GET /api/library` - Get user's music library
- `POST /api/rooms/:code/queue` - Add song to room queue
- `DELETE /api/rooms/:code/queue/:songId` - Remove from queue

### Playback Control
- `POST /api/rooms/:code/play` - Start playback
- `POST /api/rooms/:code/pause` - Pause playback
- `POST /api/rooms/:code/seek` - Seek to position
- `POST /api/rooms/:code/next` - Skip to next song

## 🌐 WebSocket Events

### Client to Server
- `join-room` - Join a music room
- `leave-room` - Leave current room
- `play-song` - Start/resume playback
- `pause-song` - Pause playback
- `seek-song` - Seek to position
- `add-to-queue` - Add song to queue
- `remove-from-queue` - Remove song from queue
- `reorder-queue` - Change queue order

### Server to Client
- `room-joined` - Confirmation of room join
- `room-state` - Current room state sync
- `queue-updated` - Queue changes
- `playback-state` - Play/pause/seek updates
- `user-joined` - New user notification
- `user-left` - User disconnect notification
- `song-ended` - Auto-advance trigger

## 🔒 Security Considerations

- File type validation for uploads
- File size limits (e.g., 50MB max)
- Rate limiting on API endpoints
- Room code collision prevention
- XSS protection in user inputs
- CORS configuration for cross-origin requests

## 📦 Installation & Setup

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd musicjam
   npm install
   ```

2. **Create Upload Directory**
   ```bash
   mkdir -p uploads
   mkdir -p public/uploads
   ```

3. **Start Development Server**
   ```bash
   npm start
   ```

4. **Access Application**
   - Open browser to `http://localhost:3000`
   - Create a room or join with a code
   - Upload music and start jamming!

## 🎯 Development Phases

### Phase 1: Core Infrastructure
- [x] Project setup and structure
- [ ] Basic Express server
- [ ] Static file serving
- [ ] Socket.IO integration

### Phase 2: Room Management
- [ ] Room creation and joining
- [ ] Room code generation
- [ ] Basic room state management
- [ ] User session handling

### Phase 3: Music Upload & Library
- [ ] File upload functionality
- [ ] Audio metadata extraction
- [ ] Music library interface
- [ ] File validation

### Phase 4: Real-time Playback
- [ ] Audio player implementation
- [ ] Synchronization logic
- [ ] Playback controls
- [ ] Queue management

### Phase 5: User Interface
- [ ] Responsive design
- [ ] Room interface
- [ ] Queue visualization
- [ ] User experience polish

### Phase 6: Advanced Features
- [ ] Drag & drop queue reordering
- [ ] Chat functionality
- [ ] Room history
- [ ] User profiles

## 🤝 Contributing

This project is designed for collaborative music experiences. Feel free to contribute ideas, report bugs, or submit pull requests!

## 📝 License

MIT License - Feel free to use this project for personal or commercial purposes.

---

**Ready to start jamming?** 🎵 Follow the installation steps above and create your first music room!