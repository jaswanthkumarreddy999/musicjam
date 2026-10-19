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
        this.dragSrcIndex = null;
        this.autoRequeue = false;
        this.noDuplicates = false;

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

    /* ── Nickname modal ── */
    showNicknameModal() {
        const modal = document.getElementById('nickname-modal');
        const swatchContainer = document.getElementById('color-swatches');
        const input = document.getElementById('nickname-input');
        const confirmBtn = document.getElementById('nickname-confirm-btn');

        const saved = sessionStorage.getItem('mj_nickname');
        const savedColor = sessionStorage.getItem('mj_color');
        if (saved) input.value = saved;

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
        this.shareRoomBtn = document.getElementById('share-room-btn');
        this.listenersBar = document.getElementById('listeners-bar');
        this.userCount = document.getElementById('user-count');
        this.connectionStatus = document.getElementById('connection-status');
        this.roomCodeDisplay = document.getElementById('room-code-display');
        this.queueCount = document.getElementById('queue-count');
        this.queueEmpty = document.getElementById('queue-empty');
        this.queueList = document.getElementById('queue-list');
        this.shareModal = document.getElementById('share-modal');
        this.shareRoomCode = document.getElementById('share-room-code');
        this.shareRoomUrl = document.getElementById('share-room-url');
        this.copyShareCodeBtn = document.getElementById('copy-share-code-btn');
        this.copyShareUrlBtn = document.getElementById('copy-share-url-btn');
        this.shareNativeBtn = document.getElementById('share-native-btn');
        // Library panel
        this.libraryPanelList = document.getElementById('library-panel-list');
        this.libraryPanelEmpty = document.getElementById('library-panel-empty');
        this.librarySearch = document.getElementById('library-search');
        // Upload
        this.roomUploadBtn = document.getElementById('room-upload-btn');
        this.roomUploadZone = document.getElementById('room-upload-zone');
        this.roomUploadArea = document.getElementById('room-upload-area');
        this.roomFileInput = document.getElementById('room-file-input');
        this.roomUploadProgress = document.getElementById('room-upload-progress');
        this.roomProgressFill = document.getElementById('room-progress-fill');
        this.roomProgressText = document.getElementById('room-progress-text');
        // Toggles
        this.autoRequeueBtn = document.getElementById('auto-requeue-btn');
        this.noDuplicatesBtn = document.getElementById('no-duplicates-btn');
        // Watch Together
        this.wtToggleBtn      = document.getElementById('wt-toggle-btn');
        this.wtZone           = document.getElementById('wt-zone');
        this.wtIdle           = document.getElementById('wt-idle');
        this.wtUploadArea     = document.getElementById('wt-upload-area');
        this.wtFileInput      = document.getElementById('wt-file-input');
        this.wtUploadProgress = document.getElementById('wt-upload-progress');
        this.wtProgressFill   = document.getElementById('wt-progress-fill');
        this.wtProgressText   = document.getElementById('wt-progress-text');
        this.wtLoaded         = document.getElementById('wt-loaded');
        this.wtFilename       = document.getElementById('wt-filename');
        this.wtMeta           = document.getElementById('wt-meta');
        this.wtViewerCount    = document.getElementById('wt-viewer-count');
        this.wtEndBtn         = document.getElementById('wt-end-btn');
        this.wtGuestWaiting   = document.getElementById('wt-guest-waiting');
        this.wtGuestFilename  = document.getElementById('wt-guest-filename');
        this.wtFormatWarn     = document.getElementById('wt-format-warn');
        // Watch Together state
        this.wtSessionVideoId = null;
        this.wtMode           = 'none'; // 'none' | 'host' | 'guest'

        if (this.roomCodeDisplay) this.roomCodeDisplay.textContent = this.roomCode;
    }

    bindEvents() {
        if (this.backBtn) this.backBtn.addEventListener('click', () => { window.location.href = '/'; });
        if (this.shareRoomBtn) this.shareRoomBtn.addEventListener('click', () => this.showShareModal());
        if (this.copyShareCodeBtn) this.copyShareCodeBtn.addEventListener('click', () => this.copyToClipboard(this.roomCode, 'Code copied!'));
        if (this.copyShareUrlBtn) this.copyShareUrlBtn.addEventListener('click', () => this.copyToClipboard(window.location.href, 'URL copied!'));

        if (navigator.share && this.shareNativeBtn) {
            this.shareNativeBtn.style.display = 'block';
            this.shareNativeBtn.addEventListener('click', () => this.shareNative());
        }

        if (this.shareModal) {
            this.shareModal.addEventListener('click', e => {
                if (e.target === this.shareModal || e.target.getAttribute('data-action') === 'close-share') this.closeShareModal();
            });
        }

        // Library search (delegated)
        document.addEventListener('input', e => {
            if (e.target.id === 'library-search') this.filterLibraryPanel(e.target.value);
        });

        // Library panel — click ➕ to add (delegated, works even if panel was hidden at bind time)
        document.addEventListener('click', e => {
            const btn = e.target.closest('.lp-add-btn');
            if (btn) this.addToQueue(btn.dataset.songId);
        });

        // Queue actions
        if (this.queueList) {
            this.queueList.addEventListener('click', e => {
                const removeBtn = e.target.closest('.queue-action-btn.remove');
                if (removeBtn) { this.removeFromQueue(removeBtn.dataset.songId); return; }
            });
        }

        // Toggle buttons
        if (this.autoRequeueBtn) {
            this.autoRequeueBtn.addEventListener('click', () => {
                this.autoRequeue = !this.autoRequeue;
                this.socket.emit('set-auto-requeue', { enabled: this.autoRequeue });
                this.updateToggleUI();
            });
        }
        if (this.noDuplicatesBtn) {
            this.noDuplicatesBtn.addEventListener('click', () => {
                this.noDuplicates = !this.noDuplicates;
                this.socket.emit('set-no-duplicates', { enabled: this.noDuplicates });
                this.updateToggleUI();
            });
        }

        // Upload
        if (this.roomUploadBtn) {
            this.roomUploadBtn.addEventListener('click', () => this.toggleUploadZone());
        }
        if (this.roomUploadArea) {
            this.roomUploadArea.addEventListener('click', () => this.roomFileInput.click());
            this.roomUploadArea.addEventListener('dragover', e => { e.preventDefault(); this.roomUploadArea.classList.add('dragover'); });
            this.roomUploadArea.addEventListener('dragleave', () => this.roomUploadArea.classList.remove('dragover'));
            this.roomUploadArea.addEventListener('drop', e => {
                e.preventDefault();
                this.roomUploadArea.classList.remove('dragover');
                const files = Array.from(e.dataTransfer.files).filter(f =>
                    f.type.startsWith('audio/') || f.type.startsWith('video/') ||
                    /\.(mp3|wav|ogg|m4a|flac|aac|wma|mp4|webm|mov|mkv|avi)$/i.test(f.name)
                );
                if (files.length) this.uploadFiles(files);
                else this.showToast('No audio or video files found', 'error');
            });
        }
        if (this.roomFileInput) {
            this.roomFileInput.addEventListener('change', e => this.uploadFiles(Array.from(e.target.files)));
        }

        document.addEventListener('keydown', e => this.handleKeyboardShortcuts(e));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isConnected) this.socket.emit('sync-request');
        });

        // History toggle
        const historyToggle = document.getElementById('history-toggle');
        if (historyToggle) {
            historyToggle.addEventListener('click', () => {
                const list = document.getElementById('history-list');
                const chevron = historyToggle.querySelector('.history-chevron');
                if (list) {
                    const open = !list.classList.contains('hidden');
                    list.classList.toggle('hidden', open);
                    if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
                }
            });
        }

        // ── Watch Together ──────────────────────────────────────
        if (this.wtToggleBtn) {
            this.wtToggleBtn.addEventListener('click', () => this.toggleWatchTogether());
        }
        if (this.wtUploadArea) {
            this.wtUploadArea.addEventListener('click', () => this.wtFileInput && this.wtFileInput.click());
            this.wtUploadArea.addEventListener('dragover', e => {
                e.preventDefault();
                this.wtUploadArea.classList.add('dragover');
            });
            this.wtUploadArea.addEventListener('dragleave', () => {
                this.wtUploadArea.classList.remove('dragover');
            });
            this.wtUploadArea.addEventListener('drop', e => {
                e.preventDefault();
                this.wtUploadArea.classList.remove('dragover');
                const files = Array.from(e.dataTransfer.files).filter(f =>
                    f.type.startsWith('video/') ||
                    /\.(mp4|webm|mov|mkv|avi)$/i.test(f.name)
                );
                if (files.length) this.uploadSessionVideo(files[0]);
                else this.showToast('Please drop a video file', 'error');
            });
        }
        if (this.wtFileInput) {
            this.wtFileInput.addEventListener('change', e => {
                if (e.target.files[0]) this.uploadSessionVideo(e.target.files[0]);
            });
        }
        if (this.wtEndBtn) {
            this.wtEndBtn.addEventListener('click', () => this.endWatchSession());
        }
    }

    generateUserId() {
        return 'user_' + Math.random().toString(36).substr(2, 9);
    }

    /* ── Socket ── */
    initializeSocket() {
        this.socket = io();

        this.socket.on('connect', () => { this.joinRoom(); });

        this.socket.on('disconnect', () => { this.updateConnectionStatus(false); });

        this.socket.on('room-joined', data => {
            if (data.success) {
                this.isConnected = true;
                this.roomData = data.room;
                this.isHost = data.room.hostId === this.userId;
                this.autoRequeue = !!data.room.autoRequeue;
                this.noDuplicates = !!data.room.noDuplicates;
                this.updateConnectionStatus(true);
                this.updateToggleUI();
                this.updateRoomState(data.room);
                this.renderListeners(data.room.userList || []);
                this.showToast(`Welcome, ${this.nickname}! 🎵`, 'success');
                document.getElementById('loading-screen').classList.add('hidden');
                document.getElementById('room-app').classList.remove('hidden');
                // Re-render library now that the panel is visible in the DOM
                this.renderLibraryPanel();
            }
        });

        this.socket.on('user-joined', data => {
            this.updateUserCount(data.userCount);
            this.renderListeners(data.userList || []);
            this.showToast(`${data.nickname || 'Someone'} joined 👋`, 'info');
        });

        this.socket.on('user-left', data => {
            this.updateUserCount(data.userCount);
            this.renderListeners(data.userList || []);
        });

        this.socket.on('queue-updated', data => { this.updateQueue(data.queue); });

        this.socket.on('playback-state', data => { this.handlePlaybackState(data); });

        this.socket.on('seek-update', data => {
            this.audioPlayer.syncPlayback(data.currentTime, !this.audioPlayer.audio.paused, data.timestamp);
        });

        this.socket.on('repeat-mode-updated', data => {
            if (this.roomData) this.roomData.repeatMode = data.repeatMode;
            if (this.audioPlayer) this.audioPlayer.updateRepeatUI(data.repeatMode);
        });

        this.socket.on('room-settings-updated', data => {
            this.autoRequeue = !!data.autoRequeue;
            this.noDuplicates = !!data.noDuplicates;
            this.updateToggleUI();
        });

        // New song uploaded by anyone in the room — refresh library panel live
        this.socket.on('library-updated', data => {
            this.musicLibrary.unshift(data.song);
            this.renderLibraryPanel();
            this.showToast(`"${data.song.title}" added to library 🎵`, 'info');
        });

        this.socket.on('error', data => { this.showToast(data.message || 'An error occurred', 'error'); });

        this.socket.on('room-deleted', () => {
            this.showToast('Room deleted by host', 'error');
            setTimeout(() => { window.location.href = '/'; }, 3000);
        });

        // ── Watch Together socket events ─────────────────────────
        // A session video was loaded by the host — everyone loads it
        this.socket.on('session-video-loaded', data => {
            const { videoId, filename, duration } = data;
            this.wtSessionVideoId = videoId;
            // Load into the player as a direct-URL video (no HLS, no Cloudinary)
            const fakeSessionSong = {
                id: `session-${videoId}`,
                title: this._wtStripExtension(filename),
                artist: 'Watch Together Session',
                album: '',
                duration,
                mediaType: 'video',
                url: `/api/session-video/${videoId}`,
                path: `/api/session-video/${videoId}`,
                isHLS: false,
                isSession: true
            };
            this.audioPlayer.loadSong(fakeSessionSong);

            if (this.wtMode === 'guest') {
                // Guest: show the guest-waiting panel with filename
                this._wtShowState('guest');
                if (this.wtGuestFilename) this.wtGuestFilename.textContent = filename;
            } else if (this.wtMode === 'host') {
                // Host: update the loaded panel with probed duration from server
                this._wtUpdateLoadedPanel(filename, duration);
            } else {
                // Someone else's session started — make us a guest and open the WT zone
                this.wtMode = 'guest';
                if (this.wtZone) {
                    this.wtZone.classList.remove('hidden');
                    this.wtToggleBtn.classList.add('wt-active');
                }
                this._wtShowState('guest');
                if (this.wtGuestFilename) this.wtGuestFilename.textContent = filename;
                this.showToast(`🎬 Watch Together started: ${this._wtStripExtension(filename)}`, 'info');
            }
        });

        // Playback state for session video (play/pause/seek synced separately)
        this.socket.on('session-playback-state', data => {
            const { isPlaying, currentTime, timestamp } = data;
            // Compute lag-corrected time
            const lag = (Date.now() - timestamp) / 1000;
            const corrected = isPlaying ? currentTime + lag : currentTime;
            this.audioPlayer.syncPlayback(corrected, isPlaying, timestamp);
        });

        // Session ended by host
        this.socket.on('session-video-ended', () => {
            this.wtSessionVideoId = null;
            this.audioPlayer.reset();
            if (this.wtMode === 'guest') {
                this._wtShowState('idle');
                this.showToast('Watch Together session ended by host', 'info');
            }
            if (this.wtMode === 'host') {
                this._wtShowState('idle');
            }
            this.wtMode = 'none';
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
        // Keep WT viewer count fresh
        if (this.wtSessionVideoId) this._wtUpdateViewerCount();
    }

    /* ── Toggle buttons UI ── */
    updateToggleUI() {
        if (this.autoRequeueBtn) {
            this.autoRequeueBtn.classList.toggle('toggle-active', this.autoRequeue);
            this.autoRequeueBtn.title = `Auto-requeue: ${this.autoRequeue ? 'ON' : 'OFF'} — finished songs rejoin queue`;
        }
        if (this.noDuplicatesBtn) {
            this.noDuplicatesBtn.classList.toggle('toggle-active', this.noDuplicates);
            this.noDuplicatesBtn.title = `No duplicates: ${this.noDuplicates ? 'ON' : 'OFF'} — same song can't be queued twice`;
        }
    }

    /* ── Listeners ── */
    renderListeners(userList) {
        if (!userList) return;
        if (this.listenersBar) {
            this.listenersBar.innerHTML = userList.slice(0, 8).map(u => `
                <div class="listener-avatar" style="background:${u.color};" title="${this.escapeHtml(u.nickname)}">
                    ${u.nickname.charAt(0).toUpperCase()}
                </div>
            `).join('') + (userList.length > 8 ? `<div class="listener-avatar more">+${userList.length - 8}</div>` : '');
        }
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
        } else {
            this.audioPlayer.reset();
        }
        this.updateQueue(roomData.queue);
        if (roomData.userList) this.renderListeners(roomData.userList);
        if (roomData.repeatMode !== undefined) this.audioPlayer.updateRepeatUI(roomData.repeatMode);
        if (roomData.hasPrev !== undefined) this.audioPlayer.updatePrevButton(roomData.hasPrev);
        if (roomData.history) this.renderHistory(roomData.history);
    }

    /* ── Queue ── */
    updateQueue(queue) {
        if (!this.queueCount) return;
        this.queueCount.textContent = queue.length;

        // Keep roomData in sync so library panel knows what's queued
        if (this.roomData) this.roomData.queue = queue;

        if (queue.length === 0) {
            this.queueEmpty.classList.remove('hidden');
            this.queueList.classList.add('hidden');
        } else {
            this.queueEmpty.classList.add('hidden');
            this.queueList.classList.remove('hidden');

            this.queueList.innerHTML = queue.map((song, index) => `
                <div class="queue-item" data-song-id="${song.id}" data-index="${index}" draggable="true">
                    <span class="queue-number">${index + 1}</span>
                    <div class="drag-handle" title="Drag to reorder">⠿</div>
                    <div class="queue-song-info">
                        <div class="queue-song-title">${this.escapeHtml(song.title)}</div>
                        <div class="queue-song-artist">
                            ${this.escapeHtml(song.artist)}
                            ${song.mediaType === 'video' ? ' <span class="media-type-pill video">video</span>' : ''}
                        </div>
                    </div>
                    <div class="queue-actions">
                        <button class="queue-action-btn remove" data-song-id="${song.id}" title="Remove">✕</button>
                    </div>
                </div>
            `).join('');

            this.bindDragToReorder();
        }

        // Re-render library to hide/show songs based on queue state
        this.renderLibraryPanel();
    }

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
                    this.socket.emit('reorder-queue', { fromIndex: this.dragSrcIndex, toIndex: destIndex });
                }
                this.dragSrcIndex = null;
            });
        });
    }

    handlePlaybackState(data) {
        if (data.currentSong) {
            if (this.roomData) this.roomData.currentSong = data.currentSong;
            this.audioPlayer.loadSong(data.currentSong);
        }
        if (data.isPlaying) { this.audioPlayer.play(); }
        else { this.audioPlayer.pause(); }
        if (data.currentTime !== undefined) this.audioPlayer.seek(data.currentTime);
        if (data.queue) this.updateQueue(data.queue);
        if (data.repeatMode !== undefined) {
            if (this.roomData) this.roomData.repeatMode = data.repeatMode;
            this.audioPlayer.updateRepeatUI(data.repeatMode);
        }
        if (data.hasPrev !== undefined) this.audioPlayer.updatePrevButton(data.hasPrev);
        if (data.history) this.renderHistory(data.history);
    }

    /* ── History panel ── */
    renderHistory(history) {
        const el = document.getElementById('history-list');
        if (!el) return;
        if (!history || history.length === 0) {
            el.innerHTML = '<p class="history-empty">No songs played yet</p>';
            return;
        }
        el.innerHTML = history.map(song => `
            <div class="history-item">
                <div class="history-song-info">
                    <div class="history-song-title">${this.escapeHtml(song.title)}</div>
                    <div class="history-song-artist">${this.escapeHtml(song.artist)}</div>
                </div>
            </div>
        `).join('');
    }

    play()    {
        if (this.wtSessionVideoId) { this.socket.emit('session-video-play'); return; }
        this.socket.emit('play');
    }
    pause()   {
        if (this.wtSessionVideoId) { this.socket.emit('session-video-pause'); return; }
        this.socket.emit('pause');
    }
    seek(t)   {
        if (this.wtSessionVideoId) { this.socket.emit('session-video-seek', { time: t }); return; }
        this.socket.emit('seek', { time: t });
    }
    nextSong(){ this.socket.emit('next-song'); }

    addToQueue(songId) {
        if (!this.socket || !this.isConnected) { this.showToast('Not connected to room', 'error'); return; }
        this.socket.emit('add-to-queue', { songId });
    }

    removeFromQueue(songId) {
        this.socket.emit('remove-from-queue', { songId });
    }

    /* ── Library panel ── */
    async loadMusicLibrary() {
        try {
            const res = await fetch('/api/library');
            const data = await res.json();
            if (data.success) {
                this.musicLibrary = data.songs;
                this.renderLibraryPanel();
            }
        } catch (e) { console.error('Error loading library:', e); }
    }

    renderLibraryPanel(filtered = null) {
        // Always look up fresh — element may have been hidden (display:none) at init time
        const list = document.getElementById('library-panel-list');
        if (!list) return;

        // Build set of song IDs already in queue or currently playing
        const queuedIds = new Set();
        if (this.roomData) {
            if (this.roomData.currentSong) {
                queuedIds.add(this.roomData.currentSong.originalSongId || this.roomData.currentSong.id);
            }
            (this.roomData.queue || []).forEach(q => {
                queuedIds.add(q.originalSongId || q.id);
            });
        }

        let songs = filtered !== null ? filtered : this.musicLibrary;
        // Hide songs already queued (unless a search term is active — user may want to see them)
        if (filtered === null) {
            songs = songs.filter(s => !queuedIds.has(s.id));
        }

        if (songs.length === 0) {
            list.innerHTML = `
                <div class="lp-empty">
                    <div class="empty-icon">🎵</div>
                    <p>${filtered !== null ? 'No songs match' : (this.musicLibrary.length === 0 ? 'No songs yet — upload some!' : 'All songs are in the queue!')}</p>
                </div>`;
            return;
        }

        list.innerHTML = songs.map(song => `
            <div class="lp-song-row" data-song-id="${song.id}">
                <div class="lp-song-info">
                    <div class="lp-song-title">${this.escapeHtml(song.title)}</div>
                    <div class="lp-song-meta">
                        <span class="lp-artist">${this.escapeHtml(song.artist)}</span>
                        <span class="lp-duration">${this.formatDuration(song.duration)}</span>
                        ${song.mediaType === 'video' ? '<span class="media-type-pill video">video</span>' : ''}
                    </div>
                </div>
                <button class="lp-add-btn" data-song-id="${song.id}" aria-label="Add to queue">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </button>
            </div>
        `).join('');
    }

    filterLibraryPanel(term) {
        if (!term.trim()) { this.renderLibraryPanel(); return; }
        const t = term.toLowerCase();
        this.renderLibraryPanel(this.musicLibrary.filter(s =>
            s.title.toLowerCase().includes(t) ||
            s.artist.toLowerCase().includes(t) ||
            (s.album || '').toLowerCase().includes(t)
        ));
    }

    /* ── Upload from room ── */
    toggleUploadZone() {
        const hidden = this.roomUploadZone.classList.contains('hidden');
        this.roomUploadZone.classList.toggle('hidden', !hidden);
        this.roomUploadBtn.textContent = hidden ? '✕ Cancel' : '⬆ Upload';
    }

    async uploadFiles(files) {
        if (!files.length) return;
        this.roomUploadZone.classList.remove('hidden');
        this.roomUploadArea.style.display = 'none';
        this.roomUploadProgress.classList.remove('hidden');
        this.roomUploadBtn.textContent = 'Uploading…';

        let uploaded = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);
            this.roomProgressText.textContent = `${isVideo ? '🎬 ' : ''}Uploading ${file.name}… (0% - 0.0 MB / ${(file.size / 1024 / 1024).toFixed(1)} MB) (${i + 1}/${files.length})`;
            try {
                await this.uploadSingleFile(file, (adjPct, loaded, total) => {
                    this.roomProgressFill.style.width = `${((uploaded + adjPct / 100) / files.length) * 100}%`;
                    const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
                    const totalMB = (total / (1024 * 1024)).toFixed(1);
                    this.roomProgressText.textContent = `${isVideo ? '🎬 ' : ''}Uploading ${file.name}… ${Math.round(adjPct * 2)}% (${loadedMB} MB / ${totalMB} MB) (${i + 1}/${files.length})`;
                }, i, files.length, uploaded);
                uploaded++;
            } catch (e) {
                this.showToast(`Failed: ${file.name} — ${e.message}`, 'error');
            }
        }

        setTimeout(() => {
            this.roomUploadProgress.classList.add('hidden');
            this.roomUploadArea.style.display = '';
            this.roomProgressFill.style.width = '0%';
            this.roomFileInput.value = '';
            this.roomUploadZone.classList.add('hidden');
            this.roomUploadBtn.textContent = '⬆ Upload';
        }, 800);
    }

    uploadSingleFile(file, onProgress, index, totalFiles, uploadedCount) {
        const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi)$/i.test(file.name);
        return new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append('audio', file);
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', e => {
                if (e.lengthComputable) {
                    const pct = (e.loaded / e.total) * 100;
                    const adjPct = isVideo ? pct / 2 : pct; // videos take transcription phase
                    onProgress(adjPct, e.loaded, e.total);
                }
            });
            xhr.addEventListener('load', () => {
                const r = JSON.parse(xhr.responseText);
                if (xhr.status === 409) {
                    this.showToast(`Skipped: ${r.message}`, 'warning');
                    resolve(null);
                } else if (xhr.status === 200 && r.success) {
                    if (r.isAsync) {
                        this.pollUploadStatus(r.jobId, resolve, reject, index, totalFiles, uploadedCount);
                    } else {
                        resolve(r.song);
                    }
                } else {
                    reject(new Error(r.message || `HTTP ${xhr.status}`));
                }
            });
            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.open('POST', '/api/upload');
            xhr.send(fd);
        });
    }

    pollUploadStatus(jobId, resolve, reject, index, totalFiles, uploadedCount) {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/upload/status/${jobId}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                
                if (data.success) {
                    if (data.status === 'transcoding') {
                        this.roomProgressText.textContent = `🎬 Converting to HLS… (${data.progress}%) (${index + 1}/${totalFiles})`;
                        const currentProgress = 50 + (data.progress / 2);
                        this.roomProgressFill.style.width = `${((uploadedCount + currentProgress / 100) / totalFiles) * 100}%`;
                    } else if (data.status === 'uploading') {
                        this.roomProgressText.textContent = `📤 Uploading segments to Cloudinary… (${index + 1}/${totalFiles})`;
                    } else if (data.status === 'completed') {
                        clearInterval(interval);
                        resolve(data.song);
                    } else if (data.status === 'failed') {
                        clearInterval(interval);
                        reject(new Error(data.error || 'Conversion failed'));
                    }
                } else {
                    clearInterval(interval);
                    reject(new Error(data.message || 'Status check failed'));
                }
            } catch (err) {
                clearInterval(interval);
                reject(err);
            }
        }, 1500);
    }

    /* ── Watch Together ─────────────────────────────────────── */

    toggleWatchTogether() {
        if (!this.wtZone) return;
        const open = !this.wtZone.classList.contains('hidden');
        if (open) {
            // Close — but only if no active session
            if (this.wtSessionVideoId) {
                this.showToast('End the session first before closing', 'info');
                return;
            }
            this.wtZone.classList.add('hidden');
            this.wtToggleBtn.classList.remove('wt-active');
        } else {
            // Also close music upload zone if open
            if (this.roomUploadZone && !this.roomUploadZone.classList.contains('hidden')) {
                this.roomUploadZone.classList.add('hidden');
                if (this.roomUploadBtn) this.roomUploadBtn.textContent = '⬆ Upload';
            }
            this.wtZone.classList.remove('hidden');
            this.wtToggleBtn.classList.add('wt-active');
            // Decide which sub-state to show
            if (this.wtSessionVideoId) {
                this._wtShowState(this.wtMode === 'host' ? 'loaded' : 'guest');
            } else {
                this._wtShowState('idle');
            }
        }
    }

    // Show one of three sub-states: 'idle' | 'loaded' | 'guest'
    _wtShowState(state) {
        if (this.wtIdle)         this.wtIdle.classList.toggle('hidden', state !== 'idle');
        if (this.wtLoaded)       this.wtLoaded.classList.toggle('hidden', state !== 'loaded');
        if (this.wtGuestWaiting) this.wtGuestWaiting.classList.toggle('hidden', state !== 'guest');
    }

    _wtStripExtension(filename) {
        return filename.replace(/\.[^.]+$/, '');
    }

    _wtFormatDuration(s) {
        if (!s) return '';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${sec}s`;
    }

    _wtUpdateLoadedPanel(filename, duration) {
        if (this.wtFilename) this.wtFilename.textContent = filename;
        if (this.wtMeta) {
            const sizeMB = ''; // size not sent back, omit
            const dur = this._wtFormatDuration(duration);
            this.wtMeta.textContent = dur ? `Duration: ${dur}` : 'Session active';
        }
        this._wtUpdateViewerCount();
        this._wtShowState('loaded');
    }

    _wtUpdateViewerCount() {
        if (!this.wtViewerCount || !this.roomData) return;
        const n = this.roomData.userCount || (this.roomData.users ? this.roomData.users.length : 2);
        this.wtViewerCount.textContent = `${n} watching`;
    }

    async uploadSessionVideo(file) {
        if (!file) return;

        // Warn for MKV
        const isMkv = /\.mkv$/i.test(file.name);
        if (this.wtFormatWarn) {
            this.wtFormatWarn.style.display = isMkv ? 'block' : 'none';
        }

        // Show progress UI
        if (this.wtUploadArea) this.wtUploadArea.style.display = 'none';
        if (this.wtUploadProgress) this.wtUploadProgress.classList.remove('hidden');
        if (this.wtProgressText) this.wtProgressText.textContent =
            `Uploading ${file.name}… (0% — 0.0 MB / ${(file.size / 1024 / 1024).toFixed(1)} MB)`;

        const fd = new FormData();
        fd.append('video', file);
        fd.append('roomCode', this.roomCode);

        try {
            const videoId = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.upload.addEventListener('progress', e => {
                    if (!e.lengthComputable) return;
                    const pct = (e.loaded / e.total) * 100;
                    if (this.wtProgressFill) this.wtProgressFill.style.width = `${pct}%`;
                    const loadedMB = (e.loaded / 1024 / 1024).toFixed(1);
                    const totalMB  = (e.total  / 1024 / 1024).toFixed(1);
                    if (this.wtProgressText)
                        this.wtProgressText.textContent = `Uploading ${file.name}… ${Math.round(pct)}% (${loadedMB} MB / ${totalMB} MB)`;
                });
                xhr.addEventListener('load', () => {
                    let r;
                    try { r = JSON.parse(xhr.responseText); } catch { return reject(new Error('Bad response')); }
                    if (xhr.status === 200 && r.success) resolve(r.video.id);
                    else reject(new Error(r.message || `HTTP ${xhr.status}`));
                });
                xhr.addEventListener('error', () => reject(new Error('Network error')));
                xhr.open('POST', '/api/session-upload');
                xhr.send(fd);
            });

            // Upload done — now broadcast to the room
            this.wtSessionVideoId = videoId;
            this.wtMode = 'host';
            this.socket.emit('session-video-load', {
                videoId,
                filename: file.name,
                duration: 0 // server probes it; client gets it back via session-video-loaded
            });

            // The 'session-video-loaded' event will come back to us too (server broadcasts to ALL)
            // and _wtUpdateLoadedPanel will be called from there.
            // Show loaded panel immediately so host doesn't see a blank state
            this._wtUpdateLoadedPanel(file.name, 0);
            this.showToast('🎬 Watch Together session started!', 'success');

        } catch (err) {
            this.showToast(`Upload failed: ${err.message}`, 'error');
        } finally {
            // Reset progress UI
            if (this.wtUploadArea) this.wtUploadArea.style.display = '';
            if (this.wtUploadProgress) this.wtUploadProgress.classList.add('hidden');
            if (this.wtProgressFill) this.wtProgressFill.style.width = '0%';
            if (this.wtFileInput) this.wtFileInput.value = '';
        }
    }

    async endWatchSession() {
        if (!this.wtSessionVideoId) return;
        const vid = this.wtSessionVideoId;
        this.wtSessionVideoId = null;
        this.wtMode = 'none';

        // Tell everyone session is done
        this.socket.emit('session-video-end');

        // Delete the file from the server
        await fetch(`/api/session-video/${vid}`, { method: 'DELETE' }).catch(() => {});

        // Reset player
        this.audioPlayer.reset();

        // Reset WT UI back to idle
        this._wtShowState('idle');
        if (this.wtFormatWarn) this.wtFormatWarn.style.display = 'none';
        this.showToast('Watch Together session ended — file deleted', 'success');
    }

    /* ── Share modal ── */
    showShareModal() {
        if (this.shareRoomCode) this.shareRoomCode.textContent = this.roomCode;
        if (this.shareRoomUrl) this.shareRoomUrl.textContent = window.location.href;
        if (this.shareModal) this.shareModal.classList.remove('hidden');

        // Generate QR code
        const qrEl = document.getElementById('share-qr');
        if (qrEl && window.QRCode) {
            qrEl.innerHTML = '';
            new window.QRCode(qrEl, {
                text: window.location.href,
                width: 140,
                height: 140,
                colorDark: '#ffffff',
                colorLight: '#0d0c18',
                correctLevel: window.QRCode.CorrectLevel.M
            });
        }
    }
    closeShareModal() { if (this.shareModal) this.shareModal.classList.add('hidden'); }

    async copyToClipboard(text, msg) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                const ta = document.createElement('textarea');
                ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
                document.body.appendChild(ta); ta.focus(); ta.select();
                document.execCommand('copy'); ta.remove();
            }
            this.showToast(msg, 'success');
        } catch { this.showToast('Failed to copy', 'error'); }
    }

    async shareNative() {
        if (navigator.share) {
            try { await navigator.share({ title: 'Join my MusicJam room!', text: `Room ${this.roomCode}`, url: window.location.href }); }
            catch {}
        }
    }

    handleKeyboardShortcuts(e) {
        if (e.target.tagName.toLowerCase() === 'input') return;
        switch (e.code) {
            case 'Space': e.preventDefault(); this.audioPlayer.handlePlayPause(); break;
            case 'ArrowRight': if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.nextSong(); } break;
        }
    }

    /* ── Utilities ── */
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

// Init
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            window.roomManager = new RoomSocketManager();
        } catch (error) {
            console.error('Failed to init room:', error);
            document.body.innerHTML = `
                <div style="padding:20px;text-align:center;color:#fff;background:#0a0918;min-height:100vh;">
                    <h1>🎵 MusicJam</h1>
                    <p style="color:#ff4444;margin:16px 0;">${error.message}</p>
                    <button onclick="location.reload()" style="padding:10px 20px;background:#00f59b;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Retry</button>
                    <a href="/" style="display:block;margin-top:10px;color:#00f59b;">← Home</a>
                </div>`;
        }
    }, 100);
});
