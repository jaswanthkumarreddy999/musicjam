// Main application JavaScript
class MusicJamApp {
    constructor() {
        this.socket = null;
        this.userId = this.generateUserId();
        this.musicLibrary = [];
        this.currentUploads = [];
        
        this.init();
    }
    
    init() {
        this.initializeElements();
        this.bindEvents();
        this.initializePWA();
        this.loadMusicLibrary();
        
        // Hide loading screen after initialization
        setTimeout(() => {
            document.getElementById('loading-screen').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
        }, 1000);
    }
    
    initializeElements() {
        // Buttons
        this.createRoomBtn = document.getElementById('create-room-btn');
        this.joinRoomBtn = document.getElementById('join-room-btn');
        this.uploadBtn = document.getElementById('upload-btn');
        this.installBtn = document.getElementById('install-btn');

        // Inputs
        this.roomCodeInput = document.getElementById('room-code-input');
        this.fileInput = document.getElementById('file-input');

        // Upload UI
        this.uploadSection = document.getElementById('upload-section');
        this.uploadArea = document.getElementById('upload-area');
        this.uploadProgress = document.getElementById('upload-progress');

        // Progress elements
        this.progressFill = document.getElementById('progress-fill');
        this.progressText = document.getElementById('progress-text');

        // Modal elements
        this.modalOverlay = document.getElementById('modal-overlay');
        this.createdRoomCode = document.getElementById('created-room-code');
        this.copyCodeBtn = document.getElementById('copy-code-btn');
        this.enterRoomBtn = document.getElementById('enter-room-btn');
    }
    
    bindEvents() {
        // Room actions (with null checks)
        if (this.createRoomBtn) {
            this.createRoomBtn.addEventListener('click', () => this.createRoom());
        } else {
            console.error('Create Room button not found');
        }
        
        if (this.joinRoomBtn) {
            this.joinRoomBtn.addEventListener('click', () => this.joinRoom());
        } else {
            console.error('Join Room button not found');
        }
        
        if (this.roomCodeInput) {
            this.roomCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.joinRoom();
            });
        }
        
        // Upload actions
        if (this.uploadBtn) {
            this.uploadBtn.addEventListener('click', () => this.toggleUploadSection());
        }
        
        if (this.uploadArea) {
            this.uploadArea.addEventListener('click', () => this.fileInput.click());
        }
        
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => this.handleFileSelection(e));
        }
        
        // Drag and drop (with null checks)
        if (this.uploadArea) {
            this.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
            this.uploadArea.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            this.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));
        }
        
        // Modal actions (with null checks)
        if (this.copyCodeBtn) {
            this.copyCodeBtn.addEventListener('click', () => this.copyRoomCode());
        }
        
        if (this.enterRoomBtn) {
            this.enterRoomBtn.addEventListener('click', () => this.enterCreatedRoom());
        }
        
        // PWA install
        if (this.installBtn) {
            this.installBtn.addEventListener('click', () => this.installPWA());
        }
        
        // Room code input formatting
        if (this.roomCodeInput) {
            this.roomCodeInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
            });
        }
        
        // Refresh rooms button
        const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
        if (refreshRoomsBtn) {
            refreshRoomsBtn.addEventListener('click', () => this.loadActiveRooms());
        }
        
        // Library management buttons
        const refreshLibraryBtn = document.getElementById('refresh-library-btn');
        if (refreshLibraryBtn) {
            refreshLibraryBtn.addEventListener('click', () => this.loadMusicLibrary());
        }
        
        const clearLibraryBtn = document.getElementById('clear-library-btn');
        if (clearLibraryBtn) {
            clearLibraryBtn.addEventListener('click', () => this.clearAllSongs());
        }
        
        // Load active rooms and library on page load
        this.loadActiveRooms();
        this.loadMusicLibrary();
        
        console.log('All event listeners bound successfully');
    }
    
    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }
    
    async createRoom() {
        try {
            this.createRoomBtn.disabled = true;
            this.createRoomBtn.innerHTML = '<span class="btn-icon">⏳</span>Creating...';
            
            const response = await fetch('/api/rooms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showRoomCreatedModal(data.room.code, data.room.hostId);
                this.showToast('Room created successfully!', 'success');
            } else {
                throw new Error(data.message || 'Failed to create room');
            }
        } catch (error) {
            console.error('Error creating room:', error);
            this.showToast('Failed to create room. Please try again.', 'error');
        } finally {
            this.createRoomBtn.disabled = false;
            this.createRoomBtn.innerHTML = '<span class="btn-icon">🎵</span>Create Room';
        }
    }
    
    async joinRoom() {
        const roomCode = this.roomCodeInput.value.trim();
        
        if (!roomCode || roomCode.length !== 6) {
            this.showToast('Please enter a valid 6-digit room code', 'error');
            return;
        }
        
        if (!/^\d{6}$/.test(roomCode)) {
            this.showToast('Room code must contain only numbers', 'error');
            return;
        }
        
        // Check if room exists before navigating
        try {
            this.joinRoomBtn.disabled = true;
            this.joinRoomBtn.innerHTML = 'Checking...';
            
            const response = await fetch(`/api/rooms/${roomCode}`);
            const data = await response.json();
            
            if (data.success) {
                // Room exists, navigate to it
                window.location.href = `/room/${roomCode}?userId=${this.userId}`;
            } else {
                this.showToast('Room not found. Please check the code.', 'error');
            }
        } catch (error) {
            console.error('Error checking room:', error);
            this.showToast('Error checking room. Please try again.', 'error');
        } finally {
            this.joinRoomBtn.disabled = false;
            this.joinRoomBtn.innerHTML = 'Join';
        }
    }
    
    showRoomCreatedModal(roomCode, hostId) {
        this.createdRoomCode.textContent = roomCode;
        this.currentRoomCode = roomCode;
        this.currentHostId = hostId;
        this.modalOverlay.classList.remove('hidden');
    }
    
    copyRoomCode() {
        const roomCode = this.createdRoomCode.textContent;
        
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(roomCode).then(() => {
                this.showToast('Room code copied!', 'success');
                this.copyCodeBtn.textContent = 'Copied!';
                setTimeout(() => {
                    this.copyCodeBtn.textContent = 'Copy';
                }, 2000);
            });
        } else {
            // Fallback for older browsers or non-HTTPS
            const textArea = document.createElement('textarea');
            textArea.value = roomCode;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast('Room code copied!', 'success');
        }
    }
    
    enterCreatedRoom() {
        if (this.currentRoomCode) {
            window.location.href = `/room/${this.currentRoomCode}?userId=${this.currentHostId}`;
        }
    }
    
    closeModal() {
        this.modalOverlay.classList.add('hidden');
    }
    
    toggleUploadSection() {
        const isHidden = this.uploadSection.classList.contains('hidden');
        if (isHidden) {
            this.uploadSection.classList.remove('hidden');
            this.uploadBtn.innerHTML = '<span>✕</span> Cancel';
        } else {
            this.uploadSection.classList.add('hidden');
            this.uploadBtn.innerHTML = '<span>➕</span> Upload';
        }
    }
    
    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadArea.classList.add('dragover');
    }
    
    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadArea.classList.remove('dragover');
    }
    
    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        this.uploadArea.classList.remove('dragover');
        
        const files = Array.from(e.dataTransfer.files);
        console.log('Files dropped:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));
        
        // More permissive file filtering
        const audioFiles = files.filter(file => {
            const isAudioMime = file.type.startsWith('audio/');
            const hasAudioExt = /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i.test(file.name);
            return isAudioMime || hasAudioExt;
        });
        
        console.log('Audio files found:', audioFiles.length);
        
        if (audioFiles.length === 0) {
            this.showToast('Please drop audio files only (MP3, WAV, OGG, M4A, FLAC)', 'error');
            return;
        }
        
        if (files.length > audioFiles.length) {
            this.showToast(`Found ${audioFiles.length} audio files out of ${files.length} total`, 'warning');
        }
        
        this.uploadFiles(audioFiles);
    }
    
    handleFileSelection(e) {
        const files = Array.from(e.target.files);
        console.log('Files selected:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));
        this.uploadFiles(files);
    }
    
    async uploadFiles(files) {
        if (files.length === 0) return;
        
        this.uploadProgress.classList.remove('hidden');
        this.uploadArea.style.display = 'none';
        
        let uploadedCount = 0;
        const totalFiles = files.length;
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            
            try {
                this.progressText.textContent = `Uploading ${file.name}... (${i + 1}/${totalFiles})`;
                
                await this.uploadSingleFile(file, (progress) => {
                    const totalProgress = ((uploadedCount + progress / 100) / totalFiles) * 100;
                    this.progressFill.style.width = `${totalProgress}%`;
                });
                
                uploadedCount++;
                this.showToast(`Uploaded: ${file.name}`, 'success');
                
            } catch (error) {
                console.error(`Failed to upload ${file.name}:`, error);
                this.showToast(`Failed to upload ${file.name}: ${error.message}`, 'error');
            }
        }
        
        // Reset upload UI
        setTimeout(() => {
            this.uploadProgress.classList.add('hidden');
            this.uploadArea.style.display = '';
            this.progressFill.style.width = '0%';
            this.fileInput.value = '';

            // Reset upload button
            this.uploadSection.classList.add('hidden');
            this.uploadBtn.innerHTML = '<span>➕</span> Upload';

            // Reload library
            this.loadMusicLibrary();
        }, 1000);
    }
    
    uploadSingleFile(file, progressCallback) {
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('audio', file);
            
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    progressCallback(percentComplete);
                }
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        resolve(response.song);
                    } else {
                        reject(new Error(response.message || 'Upload failed'));
                    }
                } else {
                    reject(new Error(`HTTP ${xhr.status}`));
                }
            });
            
            xhr.addEventListener('error', () => {
                reject(new Error('Network error'));
            });
            
            xhr.open('POST', '/api/upload');
            xhr.send(formData);
        });
    }
    
    async loadMusicLibrary() {
        try {
            const response = await fetch('/api/library');
            const data = await response.json();
            
            if (data.success) {
                this.musicLibrary = data.songs;
                this.renderMusicLibrary();
                this.renderHomeLibrary(); // Also render on home page
            }
        } catch (error) {
            console.error('Error loading music library:', error);
        }
    }
    
    renderMusicLibrary() {
        // No-op: home page rendering handled by renderHomeLibrary()
    }
    
    formatDuration(seconds) {
        if (!seconds) return '0:00';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showToast(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container');
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${this.escapeHtml(message)}</span>
        `;
        
        toastContainer.appendChild(toast);
        
        // Auto-remove toast after 4 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 4000);
    }
    
    // PWA functionality
    initializePWA() {
        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => console.log('SW registered:', registration))
                .catch(err => console.log('SW registration failed:', err));
        }

        // Capture install prompt — must be assigned inside the handler
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;  // fixed: assign to this.deferredPrompt inside the event
            if (this.installBtn) this.installBtn.classList.remove('hidden');
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            if (this.installBtn) this.installBtn.classList.add('hidden');
        });
    }
    
    async installPWA() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            
            const { outcome } = await this.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                this.showToast('App installed successfully!', 'success');
            }
            
            this.deferredPrompt = null;
            if (this.installBtn) {
                this.installBtn.classList.add('hidden');
            }
        }
    }
    
    async loadActiveRooms() {
        try {
            const response = await fetch(`/api/rooms?userId=${this.userId}`);
            const data = await response.json();
            
            if (data.success) {
                this.renderActiveRooms(data.rooms);
            }
        } catch (error) {
            console.error('Error loading active rooms:', error);
        }
    }
    
    renderActiveRooms(rooms) {
        const roomsList = document.getElementById('rooms-list');
        const noRooms = document.getElementById('no-rooms');
        
        if (!roomsList || !noRooms) return;
        
        if (rooms.length === 0) {
            roomsList.innerHTML = '';
            noRooms.classList.remove('hidden');
            return;
        }
        
        noRooms.classList.add('hidden');
        
        roomsList.innerHTML = rooms.map(room => `
            <div class="room-card">
                <div class="room-card-header">
                    <span class="room-code">Room ${room.code}</span>
                    <div class="room-status">
                        <span class="status-indicator"></span>
                        <span>Active</span>
                    </div>
                </div>
                <div class="room-info">
                    <div class="room-users">
                        👥 ${room.userCount} listener${room.userCount !== 1 ? 's' : ''}
                    </div>
                    <div class="room-song">
                        ${room.currentSong ? 
                            `🎵 ${room.isPlaying ? 'Playing' : 'Paused'}: ${this.escapeHtml(room.currentSong.title)}` :
                            `📋 Queue: ${room.queueLength} song${room.queueLength !== 1 ? 's' : ''}`
                        }
                    </div>
                </div>
                <div class="room-actions">
                    <button class="btn btn-primary btn-small join-room-btn" data-room-code="${room.code}">
                        🚪 Join
                    </button>
                    ${room.isHost ? `
                        <button class="btn btn-outline btn-small delete-room-btn" data-room-code="${room.code}">
                            🗑️ Delete
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
        // Add event listeners for room actions
        this.bindRoomActions();
    }
    
    bindRoomActions() {
        const roomsList = document.getElementById('rooms-list');
        if (!roomsList) return;
        
        // Remove existing listeners by cloning the element
        const newRoomsList = roomsList.cloneNode(true);
        roomsList.parentNode.replaceChild(newRoomsList, roomsList);
        
        // Add event delegation for join and delete buttons
        newRoomsList.addEventListener('click', (e) => {
            const target = e.target;
            
            if (target.classList.contains('join-room-btn')) {
                const roomCode = target.getAttribute('data-room-code');
                this.joinRoomById(roomCode);
            }
            
            if (target.classList.contains('delete-room-btn')) {
                const roomCode = target.getAttribute('data-room-code');
                this.deleteRoom(roomCode);
            }
        });
    }
    
    // Room management methods
    async joinRoomById(roomCode) {
        try {
            // Validate room exists first
            const response = await fetch(`/api/rooms/${roomCode}`);
            const data = await response.json();
            
            if (data.success) {
                // Room exists, navigate to it
                window.location.href = `/room/${roomCode}?userId=${this.userId}`;
            } else {
                this.showToast('Room no longer exists', 'error');
                this.loadActiveRooms(); // Refresh the rooms list
            }
        } catch (error) {
            console.error('Error joining room:', error);
            this.showToast('Failed to join room', 'error');
        }
    }
    
    async deleteRoom(roomCode) {
        // Confirm deletion
        const confirmed = confirm(`Are you sure you want to delete Room ${roomCode}?\nAll users will be disconnected.`);
        if (!confirmed) return;
        
        try {
            const response = await fetch(`/api/rooms/${roomCode}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: this.userId
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('Room deleted successfully', 'success');
                this.loadActiveRooms(); // Refresh the rooms list
            } else {
                this.showToast(data.message || 'Failed to delete room', 'error');
            }
        } catch (error) {
            console.error('Error deleting room:', error);
            this.showToast('Failed to delete room', 'error');
        }
    }
    
    // Library management methods
    renderHomeLibrary() {
        const libraryList = document.getElementById('library-list');
        const noLibrary = document.getElementById('no-library');
        
        if (!libraryList || !noLibrary) return;
        
        if (this.musicLibrary.length === 0) {
            libraryList.innerHTML = '';
            noLibrary.classList.remove('hidden');
            return;
        }
        
        noLibrary.classList.add('hidden');
        
        libraryList.innerHTML = this.musicLibrary.map(song => `
            <div class="library-song-card">
                <div class="library-song-icon">🎵</div>
                <div class="library-song-info">
                    <div class="library-song-title">${this.escapeHtml(song.title)}</div>
                    <div class="library-song-meta">
                        <span class="meta-artist">${this.escapeHtml(song.artist)}</span>
                        <span class="meta-duration">${this.formatDuration(song.duration)}</span>
                    </div>
                </div>
                <button class="btn-delete delete-song-btn" data-song-id="${song.id}" aria-label="Delete ${this.escapeHtml(song.title)}">
                    🗑️
                </button>
            </div>
        `).join('');
        
        // Add event listeners for delete buttons
        this.bindLibraryActions();
    }
    
    bindLibraryActions() {
        const libraryList = document.getElementById('library-list');
        if (!libraryList) return;
        
        // Remove existing listeners by cloning the element
        const newLibraryList = libraryList.cloneNode(true);
        libraryList.parentNode.replaceChild(newLibraryList, libraryList);
        
        // Add event delegation for delete buttons
        newLibraryList.addEventListener('click', (e) => {
            const btn = e.target.closest('.delete-song-btn');
            if (btn) {
                const songId = btn.getAttribute('data-song-id');
                this.deleteSong(songId);
            }
        });
    }
    
    async deleteSong(songId) {
        const song = this.musicLibrary.find(s => s.id === songId);
        if (!song) return;
        
        const confirmed = confirm(`Are you sure you want to delete "${song.title}"?\nThis action cannot be undone.`);
        if (!confirmed) return;
        
        try {
            const response = await fetch(`/api/library/${songId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('Song deleted successfully', 'success');
                this.loadMusicLibrary(); // Refresh library
            } else {
                this.showToast(data.message || 'Failed to delete song', 'error');
            }
        } catch (error) {
            console.error('Error deleting song:', error);
            this.showToast('Failed to delete song', 'error');
        }
    }
    
    async clearAllSongs() {
        if (this.musicLibrary.length === 0) {
            this.showToast('No songs to delete', 'info');
            return;
        }
        
        const confirmed = confirm(`Are you sure you want to delete ALL ${this.musicLibrary.length} songs?\nThis action cannot be undone.`);
        if (!confirmed) return;
        
        try {
            // Delete all songs one by one
            const deletePromises = this.musicLibrary.map(song => 
                fetch(`/api/library/${song.id}`, { method: 'DELETE' })
            );
            
            await Promise.all(deletePromises);
            
            this.showToast('All songs deleted successfully', 'success');
            this.loadMusicLibrary(); // Refresh library
        } catch (error) {
            console.error('Error clearing library:', error);
            this.showToast('Failed to clear library', 'error');
        }
    }
}

// Global functions for modal handling (called from HTML)
function closeModal() {
    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
        modalOverlay.classList.add('hidden');
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing MusicJam app...');
    try {
        window.musicJamApp = new MusicJamApp();
        console.log('MusicJam app initialized successfully');
    } catch (error) {
        console.error('Failed to initialize MusicJam app:', error);
        // Show error to user
        document.body.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #fff; background: #121212; min-height: 100vh;">
                <h1>🎵 MusicJam</h1>
                <h2>Initialization Error</h2>
                <p>There was a problem loading the app. Please refresh the page.</p>
                <button onclick="window.location.reload()" style="padding: 10px 20px; margin-top: 20px; background: #1db954; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Refresh Page
                </button>
            </div>
        `;
    }
});