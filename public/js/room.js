// Room Management and Socket Communication
class RoomSocketManager {
    constructor() {
        this.socket = null;
        this.roomCode = null;
        this.userId = null;
        this.nickname = '';
        this.color = '';
        this.isHost = false;
        this.isConnected = false;
        this.roomData = null;
        this.musicLibrary = [];
        this.hasVotedSkip = false;
        this.dragSrcIndex = null;

        // Preset avatar colors
        this.COLORS = [
            '#00f59b', '#00b4d8', '#e040fb', '#ff6b6b',
            '#ffb703', '#f77f00', '#06d6a0', '#a29bfe'
        ];

        this.initializeFromURL();
        this.initializeElements();
        this.showNicknameModal();
    }

    initializeFromURL() {
        const pathParts = window.location.pathname.split('/');
        this.roomCode = pathParts[2];

        const urlParams = new URLSearchParams(window.location.search);
        this.userId = urlParams.get('userId') || this.generateUserId();

        if (!this.roomCode || this.roomCode.length !== 6) {
            this.showToast('Invalid room code', 'error');
            setTimeout(() => { window.location.href = '/'; }, 2000);
        }
    }

    /* ── Nickname modal ────────────────────────────────── */
    showNicknameModal() {
        const modal = document.getElementById('nickname-modal');
        const swatchContainer = document.getElementById('color-swatches');
        const input = document.getElementById('nickname-input');
        const confirmBtn = document.getElementById('nickname-confirm-btn');

        // Try restoring from sessionStorage for repeat visitors in same tab
        const saved = sessionStorage.getItem('mj_nickname');
        const savedColor = sessionStorage.getItem('mj_color');
        if (saved) input.value = saved;

        // Build color swatches
        this.color = savedColor || this.COLORS[0];
        swatchContainer.innerHTML = this.COLORS.map(c => `
            <div class="color-swatch ${c === this.color ? 'active' : ''}"
                 style="background:${c};" data-color="${c}"></div>
        `).join('');

        swatchContainer.addEventListener('click', e => {
            const swatch = e.target.closest('.color-swatch');
            if (!swatch) return;
            this.color = swatch.dataset.color;
            swatchContainer.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        });

        const confirm = () => {
            const raw = input.value.trim();
            this.nickname = raw || 'Listener';
            sessionStorage.setItem('mj_nickname', this.nickname);
            sessionStorage.setItem('mj_color', this.color);
            modal.classList.add('hidden');
            this.initializeElements();
            this.bindEvents();
            this.initializeSocket();
            this.loadMusicLibrary();
            this.audioPlayer = new AudioPlayer(this);
        };

        confirmBtn.addEventListener('click', confirm);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
        setTimeout(() => input.focus(), 100);
    }

    initializeElements() {
        this.backBtn = document.getElementById('back-btn');
        this.roomCodeDisplay = document.getElementById('room-code-display');
        this.userCount = document.getElementById('user-count');
        this.connectionStatus = document.getElementById('connection-status');
        this.shareRoomBtn = document.getElementById('share-room-btn');
        this.addMusicBtn = document.getElementById('add-music-btn');
        this.listenersBar = document.getElementById('listeners-bar');

        this.queueCount = document.getElementById('queue-count');
        this.queueContent = document.getElementById('queue-content');
        this.queueEmpty = document.getElementById('queue-empty');
        this.queueList = document.getElementById('queue-list');

        this.addMusicModal = document.getElementById('add-music-modal');
        this.shareModal = document.getElementById('share-modal');
        this.libraryContentModal = document.getElementById('library-content-modal');
        this.musicSearch = document.getElementById('music-search');

        this.shareRoomCode = document.getElementById('share-room-code');
        this.shareRoomUrl = document.getElementById('share-room-url');
        this.copyShareCodeBtn = document.getElementById('copy-share-code-btn');
        this.copyShareUrlBtn = document.getElementById('copy-share-url-btn');
        this.shareNativeBtn = document.getElementById('share-native-btn');

        if (this.roomCodeDisplay) this.roomCodeDisplay.textContent = this.roomCode;
    }

    bindEvents() {
        if (this.backBtn) this.backBtn.addEventListener('click', () => { window.location.href = '/'; });
        if (this.shareRoomBtn) this.shareRoomBtn.addEventListener('click', () => this.showShareModal());
        if (this.addMusicBtn) this.addMusicBtn.addEventListener('click', () => this.showAddMusicModal());
        if (this.copyShareCodeBtn) this.copyShareCodeBtn.addEventListener('click', () => this.copyToClipboard(this.roomCode, 'Room code copied!'));
        if (this.copyShareUrlBtn) this.copyShareUrlBtn.addEventListener('click', () => this.copyToClipboard(window.location.href, 'Room URL copied!'));
        if (this.musicSearch) this.musicSearch.addEventListener('input', e => this.filterMusicLibrary(e.target.value));

        // Library modal: Add songs
        if (this.libraryContentModal) {
            this.libraryContentModal.addEventListener('click', e => {
                if (e.target.classList.contains('add-song-btn')) {
                    this.addToQueue(e.target.getAttribute('data-song-id'));
                }
            });
        }

        // Queue: remove + upvote + drag-to-reorder
        if (this.queueList) {
            this.queueList.addEventListener('click', e => {
                const removeBtn = e.target.closest('.queue-action-btn.remove');
                if (removeBtn) { this.removeFromQueue(removeBtn.getAttribute('data-song-id')); return; }
                const upvoteBtn = e.target.closest('.queue-action-btn.upvote');
                if (upvoteBtn) { this.upvoteSong(upvoteBtn.getAttribute('data-queue-id')); return; }
            });
        }

        // Skip vote button (injected into player controls)
        document.addEventListener('click', e => {
            if (e.target.id === 'skip-vote-btn') this.voteSkip();
        });

        // Modal close
        if (this.addMusicModal) {
            this.addMusicModal.addEventListener('click', e => {
                if (e.target === this.addMusicModal || e.target.getAttribute('data-action') === 'close-add-music') this.closeAddMusicModal();
            });
        }
        if (this.shareModal) {
            this.shareModal.addEventListener('click', e => {
                if (e.target === this.shareModal || e.target.getAttribute('data-action') === 'close-share') this.closeShareModal();
            });
        }

        if (navigator.share && this.shareNativeBtn) {
            this.shareNativeBtn.style.display = 'block';
            this.shareNativeBtn.addEventListener('click', () => this.shareNative());
        }

        document.addEventListener('keydown', e => this.handleKeyboardShortcuts(e));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isConnected) this.socket.emit('sync-request');
        });
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    /* ── Socket ────────────────────────────────────────── */
    initializeSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.joinRoom();
        });

        this.socket.on('disconnect', () => {
            this.updateConnectionStatus(false);
        });

        this.socket.on('room-joined', data => {
            if (data.success) {
                this.isConnected = true;
                this.roomData = data.room;
                this.isHost = data.room.hostId === this.userId;
                this.updateConnectionStatus(true);
                this.updateRoomState(data.room);
                this.renderListeners(data.room.userList || []);
                this.showToast(`Welcome, ${this.nickname}! 🎵`, 'success');
                
                // Hide loading screen and show room app
                const loader = document.getElementById('loading-screen');
                if (loader) loader.classList.add('hidden');
                const app = document.getElementById('room-app');
                if (app) app.classList.remove('hidden');
            }
        });

        this.socket.on('user-joined', data => {
            this.updateUserCount(data.userCount);
            this.renderListeners(data.userList || []);
            const name = data.nickname || 'Someone';
            this.showToast(`${name} joined the room 👋`, 'info');
        });

        this.socket.on('user-left', data => {
            this.updateUserCount(data.userCount);
            this.renderListeners(data.userList || []);
            this.showToast('Someone left the room', 'info');
        });

        this.socket.on('queue-updated', data => { this.updateQueue(data.queue); });

        this.socket.on('playback-state', data => { this.handlePlaybackState(data); });

        this.socket.on('seek-update', data => {
            this.audioPlayer.syncPlayback(data.currentTime, !this.audioPlayer.audio.paused, data.timestamp);
        });

        // Skip vote updates
        this.socket.on('skip-vote-update', data => {
            const btn = document.getElementById('skip-vote-btn');
            if (btn) btn.textContent = `⏭ Skip (${data.votes}/${data.needed})`;
        });

        this.socket.on('skip-vote-passed', () => {
            this.hasVotedSkip = false;
            this.showToast('Skip vote passed! ⏭', 'success');
            const btn = document.getElementById('skip-vote-btn');
            if (btn) { btn.textContent = '⏭ Vote Skip'; btn.disabled = false; }
        });

        this.socket.on('error', data => { this.showToast(data.message || 'An error occurred', 'error'); });

        this.socket.on('repeat-mode-updated', data => {
            if (this.roomData) this.roomData.repeatMode = data.repeatMode;
            if (this.audioPlayer) this.audioPlayer.updateRepeatUI(data.repeatMode);
        });

        this.socket.on('room-deleted', () => {
            this.showToast('Room has been deleted by the host', 'error');
            setTimeout(() => { window.location.href = '/'; }, 3000);
        });
    }

    joinRoom() {
        this.socket.emit('join-room', {
            roomCode: this.roomCode,
            userId: this.userId,
            nickname: this.nickname,
            color: this.color
        });
    }

    updateConnectionStatus(connected) {
        this.isConnected = connected;
        if (this.connectionStatus) {
            this.connectionStatus.textContent = connected ? 'Connected' : 'Disconnected';
            this.connectionStatus.className = connected ? 'status-connected' : 'status-disconnected';
        }
    }

    updateUserCount(count) {
        if (this.userCount) this.userCount.textContent = count;
    }

    /* ── Listeners bar & panel ─────────────────────────── */
    renderListeners(userList) {
        if (!userList || !userList.length) return;

        // Header mini-avatars
        if (this.listenersBar) {
            this.listenersBar.innerHTML = userList.slice(0, 8).map(u => `
                <div class="listener-avatar" style="background:${u.color};" title="${this.escapeHtml(u.nickname)}">
                    ${u.nickname.charAt(0).toUpperCase()}
                </div>
            `).join('') + (userList.length > 8 ? `<div class="listener-avatar more">+${userList.length - 8}</div>` : '');
        }

        // Listeners panel inside queue section
        const qlList = document.getElementById('ql-list');
        if (qlList) {
            qlList.innerHTML = userList.map(u => `
                <div class="ql-item">
                    <div class="ql-avatar" style="background:${u.color};">${u.nickname.charAt(0).toUpperCase()}</div>
                    <span class="ql-name">${this.escapeHtml(u.nickname)}</span>
                </div>
            `).join('');
        }
    }

    updateRoomState(roomData) {
        this.roomData = roomData;
        this.updateUserCount(roomData.userCount);
        if (roomData.currentSong) {
            this.audioPlayer.loadSong(roomData.currentSong);
            this.audioPlayer.syncPlayback(roomData.currentTime, roomData.isPlaying, Date.now());
            this.injectSkipVoteBtn();
        } else {
            this.audioPlayer.reset();
        }
        this.updateQueue(roomData.queue);
        if (roomData.userList) this.renderListeners(roomData.userList);
        
        // Sync repeat states and back button
        if (roomData.repeatMode !== undefined) this.audioPlayer.updateRepeatUI(roomData.repeatMode);
        if (roomData.hasPrev !== undefined) this.audioPlayer.updatePrevButton(roomData.hasPrev);
    }

    /* ── Skip Vote ─────────────────────────────────────── */
    injectSkipVoteBtn() {
        if (document.getElementById('skip-vote-btn')) return;
        const volumeSection = document.querySelector('.volume-section');
        if (!volumeSection) return;
        const btn = document.createElement('button');
        btn.id = 'skip-vote-btn';
        btn.className = 'btn btn-secondary btn-small skip-vote-btn';
        btn.textContent = '⏭ Vote Skip';
        volumeSection.after(btn);
    }

    voteSkip() {
        if (this.hasVotedSkip) return;
        this.hasVotedSkip = true;
        this.socket.emit('vote-skip');
        const btn = document.getElementById('skip-vote-btn');
        if (btn) { btn.textContent = '✓ Voted'; btn.disabled = true; }
    }

    /* ── Queue ─────────────────────────────────────────── */
    updateQueue(queue) {
        if (!this.queueCount) return;
        this.queueCount.textContent = `${queue.length} song${queue.length !== 1 ? 's' : ''}`;

        if (queue.length === 0) {
            this.queueEmpty.classList.remove('hidden');
            this.queueList.classList.add('hidden');
            return;
        }

        this.queueEmpty.classList.add('hidden');
        this.queueList.classList.remove('hidden');

        this.queueList.innerHTML = queue.map((song, index) => `
            <div class="queue-item" data-song-id="${song.id}" data-index="${index}" draggable="true">
                <span class="queue-number">${index + 1}</span>
                <div class="drag-handle" title="Drag to reorder">⠿</div>
                <div class="queue-song-info">
                    <div class="queue-song-title">${this.escapeHtml(song.title)}</div>
                    <div class="queue-song-artist">${this.escapeHtml(song.artist)}</div>
                </div>
                <div class="queue-vote-count" title="Upvotes">
                    ▲ ${song.votes || 0}
                </div>
                <div class="queue-actions">
                    <button class="queue-action-btn upvote" data-queue-id="${song.id}" title="Upvote">▲</button>
                    <button class="queue-action-btn remove" data-song-id="${song.id}" title="Remove">✕</button>
                </div>
            </div>
        `).join('');

        this.bindDragToReorder();
    }

    /* ── Feature 3: Drag-to-reorder ────────────────────── */
    bindDragToReorder() {
        const items = this.queueList.querySelectorAll('.queue-item');

        items.forEach(item => {
            item.addEventListener('dragstart', e => {
                this.dragSrcIndex = parseInt(item.dataset.index);
                item.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                this.queueList.querySelectorAll('.queue-item').forEach(i => i.classList.remove('drag-over'));
            });

            item.addEventListener('dragover', e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                this.queueList.querySelectorAll('.queue-item').forEach(i => i.classList.remove('drag-over'));
                item.classList.add('drag-over');
            });

            item.addEventListener('drop', e => {
                e.preventDefault();
                const destIndex = parseInt(item.dataset.index);
                if (this.dragSrcIndex !== null && this.dragSrcIndex !== destIndex) {
                    this.socket.emit('reorder-queue', {
                        fromIndex: this.dragSrcIndex,
                        toIndex: destIndex
                    });
                }
                this.dragSrcIndex = null;
            });
        });
    }

    /* ── Feature 2: Upvoting ───────────────────────────── */
    upvoteSong(queueItemId) {
        this.socket.emit('upvote-song', { queueItemId });
    }

    handlePlaybackState(data) {
        if (data.currentSong) {
            this.audioPlayer.loadSong(data.currentSong);
            this.injectSkipVoteBtn();
        }
        if (data.isPlaying) { this.audioPlayer.play(); }
        else { this.audioPlayer.pause(); }
        if (data.currentTime !== undefined) this.audioPlayer.seek(data.currentTime);
        if (data.queue) this.updateQueue(data.queue);

        // Sync repeat states and back button status
        if (data.repeatMode !== undefined) {
            if (this.roomData) this.roomData.repeatMode = data.repeatMode;
            this.audioPlayer.updateRepeatUI(data.repeatMode);
        }
        if (data.hasPrev !== undefined) this.audioPlayer.updatePrevButton(data.hasPrev);
    }

    /* ── Audio control methods ─────────────────────────── */
    play()    { this.socket.emit('play'); }
    pause()   { this.socket.emit('pause'); }
    seek(t)   { this.socket.emit('seek', { time: t }); }
    nextSong(){ this.socket.emit('next-song'); }

    /* ── Queue management ──────────────────────────────── */
    addToQueue(songId) {
        if (!this.socket || !this.isConnected) { this.showToast('Not connected to room', 'error'); return; }
        this.socket.emit('add-to-queue', { songId });
        this.closeAddMusicModal();
        this.showToast('Added to queue! 🎵', 'success');
    }

    removeFromQueue(songId) {
        this.socket.emit('remove-from-queue', { songId });
    }

    /* ── Music library ─────────────────────────────────── */
    async loadMusicLibrary() {
        try {
            const res = await fetch('/api/library');
            const data = await res.json();
            if (data.success) { this.musicLibrary = data.songs; this.renderMusicLibrary(); }
        } catch (e) { console.error('Error loading music library:', e); }
    }

    renderMusicLibrary(filteredSongs = null) {
        const songs = filteredSongs || this.musicLibrary;
        if (songs.length === 0) {
            this.libraryContentModal.innerHTML = `
                <div class="library-empty">
                    <div class="empty-icon">🎵</div>
                    <h4>No music found</h4>
                    <p>${filteredSongs ? 'No songs match your search' : 'Go back to upload some music first'}</p>
                </div>`;
            return;
        }
        this.libraryContentModal.innerHTML = songs.map(song => `
            <div class="library-song-item" data-song-id="${song.id}">
                <div class="library-song-info">
                    <div class="library-song-title">${this.escapeHtml(song.title)}</div>
                    <div class="library-song-meta">
                        <span class="library-song-artist">${this.escapeHtml(song.artist)}</span>
                        <span class="library-song-duration">${this.formatDuration(song.duration)}</span>
                    </div>
                </div>
                <button class="add-song-btn" data-song-id="${song.id}">Add</button>
            </div>
        `).join('');
    }

    filterMusicLibrary(term) {
        if (!term.trim()) { this.renderMusicLibrary(); return; }
        const t = term.toLowerCase();
        this.renderMusicLibrary(this.musicLibrary.filter(s =>
            s.title.toLowerCase().includes(t) ||
            s.artist.toLowerCase().includes(t) ||
            s.album.toLowerCase().includes(t)
        ));
    }

    /* ── Modals ────────────────────────────────────────── */
    showAddMusicModal() {
        if (this.addMusicModal) {
            this.addMusicModal.classList.remove('hidden');
            this.loadMusicLibrary();
            if (this.musicSearch) this.musicSearch.focus();
        }
    }
    closeAddMusicModal() {
        if (this.addMusicModal) {
            this.addMusicModal.classList.add('hidden');
            if (this.musicSearch) this.musicSearch.value = '';
        }
    }
    showShareModal() {
        this.shareRoomCode.textContent = this.roomCode;
        this.shareRoomUrl.textContent = window.location.href;
        this.shareModal.classList.remove('hidden');
    }
    closeShareModal() { this.shareModal.classList.add('hidden'); }

    async copyToClipboard(text, successMessage) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed'; ta.style.left = '-999999px';
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand('copy'); ta.remove();
            }
            this.showToast(successMessage, 'success');
        } catch (e) { this.showToast('Failed to copy', 'error'); }
    }

    async shareNative() {
        if (navigator.share) {
            try { await navigator.share({ title: 'Join my MusicJam room!', text: `Join room ${this.roomCode} on MusicJam`, url: window.location.href }); }
            catch (e) {}
        }
    }

    handleKeyboardShortcuts(e) {
        if (e.target.tagName.toLowerCase() === 'input') return;
        switch (e.code) {
            case 'Space': e.preventDefault(); this.audioPlayer.handlePlayPause(); break;
            case 'ArrowRight': if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.nextSong(); } break;
            case 'KeyM': if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.showAddMusicModal(); } break;
            case 'KeyS': if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.showShareModal(); } break;
        }
    }

    /* ── Utilities ─────────────────────────────────────── */
    formatDuration(s) {
        if (!s) return '0:00';
        return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    }

    escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${this.escapeHtml(message)}</span>`;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 4000);
    }
}

// Initialize room when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            window.roomManager = new RoomSocketManager();
        } catch (error) {
            console.error('Failed to initialize room manager:', error);
            document.body.innerHTML = `
                <div style="padding:20px;text-align:center;color:#fff;background:#121212;min-height:100vh;">
                    <h1>🎵 MusicJam Room</h1>
                    <h2>Initialization Error</h2>
                    <p>There was a problem loading the room. Please refresh.</p>
                    <p style="color:#ff4444;font-family:monospace;font-size:12px;margin-top:20px;">${error.message}</p>
                    <button onclick="window.location.reload()" style="padding:10px 20px;margin-top:20px;background:#1db954;color:white;border:none;border-radius:5px;cursor:pointer;">Refresh Page</button>
                    <a href="/" style="display:block;margin-top:10px;color:#1db954;text-decoration:none;">← Back to Home</a>
                </div>`;
        }
    }, 100);
});