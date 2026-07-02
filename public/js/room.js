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
                const upvoteBtn = e.target.closest('.queue-action-btn.upvote');
                if (upvoteBtn) { this.upvoteSong(upvoteBtn.dataset.queueId); return; }
            });
        }

        // Skip vote
        document.addEventListener('click', e => {
            if (e.target.id === 'skip-vote-btn') this.voteSkip();
        });

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
                const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|aac|wma)$/i.test(f.name));
                if (files.length) this.uploadFiles(files);
                else this.showToast('No audio files found', 'error');
            });
        }
        if (this.roomFileInput) {
            this.roomFileInput.addEventListener('change', e => this.uploadFiles(Array.from(e.target.files)));
        }

        document.addEventListener('keydown', e => this.handleKeyboardShortcuts(e));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isConnected) this.socket.emit('sync-request');
        });
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
            this.injectSkipVoteBtn();
        } else {
            this.audioPlayer.reset();
        }
        this.updateQueue(roomData.queue);
        if (roomData.userList) this.renderListeners(roomData.userList);
        if (roomData.repeatMode !== undefined) this.audioPlayer.updateRepeatUI(roomData.repeatMode);
        if (roomData.hasPrev !== undefined) this.audioPlayer.updatePrevButton(roomData.hasPrev);
    }

    /* ── Skip vote ── */
    injectSkipVoteBtn() {
        if (document.getElementById('skip-vote-btn')) return;
        const vs = document.querySelector('.volume-section');
        if (!vs) return;
        const btn = document.createElement('button');
        btn.id = 'skip-vote-btn';
        btn.className = 'btn btn-secondary btn-small skip-vote-btn';
        btn.textContent = '⏭ Vote Skip';
        vs.after(btn);
    }

    voteSkip() {
        if (this.hasVotedSkip) return;
        this.hasVotedSkip = true;
        this.socket.emit('vote-skip');
        const btn = document.getElementById('skip-vote-btn');
        if (btn) { btn.textContent = '✓ Voted'; btn.disabled = true; }
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
                        <div class="queue-song-artist">${this.escapeHtml(song.artist)}</div>
                    </div>
                    <div class="queue-vote-count" title="Upvotes">▲ ${song.votes || 0}</div>
                    <div class="queue-actions">
                        <button class="queue-action-btn upvote" data-queue-id="${song.id}" title="Upvote">▲</button>
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

    upvoteSong(queueItemId) { this.socket.emit('upvote-song', { queueItemId }); }

    handlePlaybackState(data) {
        if (data.currentSong) {
            // Keep roomData current song in sync for library filtering
            if (this.roomData) this.roomData.currentSong = data.currentSong;
            this.audioPlayer.loadSong(data.currentSong);
            this.injectSkipVoteBtn();
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
    }

    play()    { this.socket.emit('play'); }
    pause()   { this.socket.emit('pause'); }
    seek(t)   { this.socket.emit('seek', { time: t }); }
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
            this.roomProgressText.textContent = `${file.name} (${i + 1}/${files.length})`;
            try {
                await this.uploadSingleFile(file, pct => {
                    this.roomProgressFill.style.width = `${((uploaded + pct / 100) / files.length) * 100}%`;
                });
                uploaded++;
            } catch (e) {
                this.showToast(`Failed: ${file.name}`, 'error');
            }
        }

        setTimeout(() => {
            this.roomUploadProgress.classList.add('hidden');
            this.roomUploadArea.style.display = '';
            this.roomProgressFill.style.width = '0%';
            this.roomFileInput.value = '';
            this.roomUploadZone.classList.add('hidden');
            this.roomUploadBtn.textContent = '⬆ Upload';
            // library-updated socket event will refresh panel for all users
        }, 800);
    }

    uploadSingleFile(file, onProgress) {
        return new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append('audio', file);
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', e => {
                if (e.lengthComputable) onProgress((e.loaded / e.total) * 100);
            });
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    const r = JSON.parse(xhr.responseText);
                    r.success ? resolve(r.song) : reject(new Error(r.message));
                } else { reject(new Error(`HTTP ${xhr.status}`)); }
            });
            xhr.addEventListener('error', () => reject(new Error('Network error')));
            xhr.open('POST', '/api/upload');
            xhr.send(fd);
        });
    }

    /* ── Share modal ── */
    showShareModal() {
        if (this.shareRoomCode) this.shareRoomCode.textContent = this.roomCode;
        if (this.shareRoomUrl) this.shareRoomUrl.textContent = window.location.href;
        if (this.shareModal) this.shareModal.classList.remove('hidden');
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
