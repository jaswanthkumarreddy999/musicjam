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
            const isAudioMime  = file.type.startsWith('audio/');
            const isVideoMime  = file.type.startsWith('video/');
            const hasAudioExt  = /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i.test(file.name);
            const hasVideoExt  = /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);
            return isAudioMime || isVideoMime || hasAudioExt || hasVideoExt;
        });

        if (audioFiles.length === 0) {
            this.showToast('Please drop audio or video files only', 'error');
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

        // ── Duplicate detection (client-side) ──
        // Compare by normalised filename against existing library
        const existingNames = new Set(
            this.musicLibrary.map(s => (s.originalName || s.title || '').toLowerCase().trim())
        );
        const dupes = [];
        const toUpload = [];
        for (const file of files) {
            const name = file.name.toLowerCase().trim();
            const noExt = name.replace(/\.[^.]+$/, '');
            if (existingNames.has(name) || existingNames.has(noExt)) {
                dupes.push(file.name);
            } else {
                const isMedia = file.type.startsWith('audio/') || file.type.startsWith('video/') ||
                    /\.(mp3|wav|ogg|m4a|flac|aac|wma|mp4|webm|mov)$/i.test(file.name);
                if (isMedia) toUpload.push(file);
            }
        }

        if (dupes.length > 0) {
            this.showToast(`Skipped ${dupes.length} duplicate${dupes.length > 1 ? 's' : ''}: ${dupes.slice(0, 2).join(', ')}${dupes.length > 2 ? '…' : ''}`, 'warning');
        }
        if (toUpload.length === 0) {
            this.showToast('All selected files already exist in your library', 'info');
            return;
        }

        this.uploadProgress.classList.remove('hidden');
        this.uploadArea.style.display = 'none';

        let uploadedCount = 0;
        const totalFiles = toUpload.length;

        for (let i = 0; i < toUpload.length; i++) {
            const file = toUpload[i];

            try {
                this.progressText.textContent = `Uploading ${file.name}… (${i + 1}/${totalFiles})`;

                await this.uploadSingleFile(file, (progress) => {
                    const totalProgress = ((uploadedCount + progress / 100) / totalFiles) * 100;
                    this.progressFill.style.width = `${totalProgress}%`;
                }, (statusMsg) => {
                    this.progressText.textContent = `${statusMsg} (${i + 1}/${totalFiles})`;
                });

                uploadedCount++;
                this.showToast(`Uploaded: ${file.name}`, 'success');

            } catch (error) {
                console.error(`Failed to upload ${file.name}:`, error);
                this.showToast(`Failed: ${file.name} — ${error.message}`, 'error');
            }
        }

        // Reset upload UI
        setTimeout(() => {
            this.uploadProgress.classList.add('hidden');
            this.uploadArea.style.display = '';
            this.progressFill.style.width = '0%';
            this.fileInput.value = '';
            this.uploadSection.classList.add('hidden');
            this.uploadBtn.innerHTML = '<span>➕</span> Upload';
            this.loadMusicLibrary();
        }, 1000);
    }
    
    uploadSingleFile(file, progressCallback, statusCallback) {
        const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('audio', file);
            
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = (e.loaded / e.total) * 100;
                    progressCallback(percentComplete);
                    // Once bytes are all sent, server is transcoding (video only)
                    if (isVideo && percentComplete >= 99 && statusCallback) {
                        statusCallback('🎬 Converting to HLS segments…');
                    }
                }
            });
            
            xhr.addEventListener('load', () => {
                let response;
                try { response = JSON.parse(xhr.responseText); } catch(e) {
                    return reject(new Error('Invalid server response'));
                }
                if (xhr.status === 409) {
                    // Server-side duplicate — resolve silently (client already warned)
                    resolve(null);
                } else if (xhr.status === 200 && response.success) {
                    resolve(response.song);
                } else {
                    reject(new Error(response.message || `HTTP ${xhr.status}`));
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
                    <span class="room-code">${room.code}</span>
                    <div class="room-status">
                        <span class="status-indicator"></span>
                        Active
                    </div>
                </div>
                <div class="room-meta">
                    <div class="room-users">${room.userCount} listener${room.userCount !== 1 ? 's' : ''}</div>
                    <div class="room-song">
                        ${room.currentSong ?
                            `${room.isPlaying ? '▶' : '⏸'} ${this.escapeHtml(room.currentSong.title)}` :
                            `${room.queueLength} song${room.queueLength !== 1 ? 's' : ''} in queue`
                        }
                    </div>
                </div>
                <div class="room-actions">
                    <button class="btn btn-primary btn-small join-room-btn" data-room-code="${room.code}">
                        Join
                    </button>
                    ${room.isHost ? `
                        <button class="btn btn-ghost btn-small delete-room-btn" data-room-code="${room.code}" style="border-color:hsla(4,80%,60%,.25);color:var(--red)">
                            Delete
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
            // Hide bulk actions
            const ba = document.getElementById('bulk-actions');
            if (ba) ba.classList.add('hidden');
            return;
        }

        noLibrary.classList.add('hidden');

        // Show / update bulk action bar
        this.renderBulkActionBar();

        libraryList.innerHTML = this.musicLibrary.map(song => `
            <div class="library-song-card" data-song-id="${song.id}">
                <label class="song-checkbox-wrap">
                    <input type="checkbox" class="song-checkbox" data-song-id="${song.id}" data-filename="${this.escapeHtml(song.filename)}" data-title="${this.escapeHtml(song.title)}">
                    <span class="checkbox-custom"></span>
                </label>
                <div class="library-song-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div class="library-song-info">
                    <div class="library-song-title">${this.escapeHtml(song.title)}</div>
                    <div class="library-song-meta">
                        <span class="meta-artist">${this.escapeHtml(song.artist)}</span>
                        <span class="meta-duration">${this.formatDuration(song.duration)}</span>
                    </div>
                </div>
                <div class="song-card-actions">
                    <button class="btn-icon-action download-song-btn" data-filename="${this.escapeHtml(song.filename)}" data-title="${this.escapeHtml(song.title)}" title="Download">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    </button>
                    <button class="btn-delete delete-song-btn" data-song-id="${song.id}" aria-label="Delete ${this.escapeHtml(song.title)}" title="Delete">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                </div>
            </div>
        `).join('');

        this.bindLibraryActions();
    }

    renderBulkActionBar() {
        // Create bar if not exists
        let bar = document.getElementById('bulk-actions');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'bulk-actions';
            bar.className = 'bulk-actions';
            bar.innerHTML = `
                <label class="bulk-select-all-wrap">
                    <input type="checkbox" id="select-all-songs">
                    <span class="checkbox-custom"></span>
                    <span class="bulk-select-label">Select all</span>
                </label>
                <span class="bulk-selected-count" id="bulk-selected-count"></span>
                <div class="bulk-btns">
                    <button id="download-selected-btn" class="btn btn-outline btn-small" disabled>Download selected</button>
                    <button id="download-all-btn" class="btn btn-ghost btn-small">Download all</button>
                </div>
            `;
            // Insert before library-list
            const libraryList = document.getElementById('library-list');
            libraryList.parentNode.insertBefore(bar, libraryList);
        }
        bar.classList.remove('hidden');

        // Wire up events (replace node to avoid duplicate listeners)
        const newBar = bar.cloneNode(true);
        bar.parentNode.replaceChild(newBar, bar);

        newBar.querySelector('#select-all-songs').addEventListener('change', (e) => {
            document.querySelectorAll('.song-checkbox').forEach(cb => { cb.checked = e.target.checked; });
            this.updateBulkUI();
        });
        newBar.querySelector('#download-selected-btn').addEventListener('click', () => this.downloadSelected());
        newBar.querySelector('#download-all-btn').addEventListener('click', () => this.downloadAll());
    }

    updateBulkUI() {
        const checked = document.querySelectorAll('.song-checkbox:checked');
        const total = document.querySelectorAll('.song-checkbox');
        const countEl = document.getElementById('bulk-selected-count');
        const dlBtn = document.getElementById('download-selected-btn');
        const selectAll = document.getElementById('select-all-songs');

        if (countEl) countEl.textContent = checked.length > 0 ? `${checked.length} selected` : '';
        if (dlBtn) dlBtn.disabled = checked.length === 0;
        if (selectAll) {
            selectAll.indeterminate = checked.length > 0 && checked.length < total.length;
            selectAll.checked = total.length > 0 && checked.length === total.length;
        }
    }

    async downloadSelected() {
        const checked = [...document.querySelectorAll('.song-checkbox:checked')];
        if (!checked.length) return;
        this.showToast(`Downloading ${checked.length} song${checked.length > 1 ? 's' : ''}…`, 'info');
        for (const cb of checked) {
            await this._triggerDownload(cb.dataset.filename, cb.dataset.title);
        }
    }

    async downloadAll() {
        if (!this.musicLibrary.length) return;
        this.showToast(`Downloading all ${this.musicLibrary.length} songs…`, 'info');
        for (const song of this.musicLibrary) {
            await this._triggerDownload(song.filename, song.title);
        }
    }

    _triggerDownload(filename, title) {
        return new Promise(resolve => {
            const a = document.createElement('a');
            a.href = `/uploads/${encodeURIComponent(filename)}`;
            a.download = title ? `${title}${filename.match(/\.[^.]+$/)?.[0] || '.mp3'}` : filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            // Small delay so browser doesn't block multiple downloads
            setTimeout(resolve, 400);
        });
    }
    
    bindLibraryActions() {
        const libraryList = document.getElementById('library-list');
        if (!libraryList) return;

        const newList = libraryList.cloneNode(true);
        libraryList.parentNode.replaceChild(newList, libraryList);

        newList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.delete-song-btn');
            if (deleteBtn) { this.deleteSong(deleteBtn.dataset.songId); return; }

            const dlBtn = e.target.closest('.download-song-btn');
            if (dlBtn) { this._triggerDownload(dlBtn.dataset.filename, dlBtn.dataset.title); return; }
        });

        newList.addEventListener('change', (e) => {
            if (e.target.classList.contains('song-checkbox')) this.updateBulkUI();
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