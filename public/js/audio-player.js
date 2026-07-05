// Media Player — handles both audio and video via Cloudinary URLs
class AudioPlayer {
    constructor(socketManager) {
        this.socket = socketManager.socket;
        this.socketManager = socketManager;
        this.audioEl = document.getElementById('audio-element');
        this.videoEl = document.getElementById('video-element');
        this.media = this.audioEl; // active element, switches on loadSong
        this.isHost = false;
        this.isSyncing = false;
        this.lastSyncTime = 0;
        this.syncThreshold = 1.0;
        this.currentMediaType = 'audio';

        this.initializeElements();
        this.bindEvents();
        this.setupMediaListeners(this.audioEl);
        this.setupMediaListeners(this.videoEl);
        this.setupMobileUnlock();
    }

    initializeElements() {
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.prevBtn      = document.getElementById('prev-btn');
        this.nextBtn      = document.getElementById('next-btn');
        this.volumeBtn    = document.getElementById('volume-btn');
        this.repeatBtn    = document.getElementById('repeat-btn');
        this.repeatBadge  = document.getElementById('repeat-badge');
        this.progressBar  = document.getElementById('progress-bar');
        this.progressFill = document.getElementById('progress-fill');
        this.progressHandle = document.getElementById('progress-handle');
        this.currentTimeEl  = document.getElementById('current-time');
        this.totalTimeEl    = document.getElementById('total-time');
        this.volumeRange    = document.getElementById('volume-range');
        this.playIcon  = this.playPauseBtn.querySelector('.play-icon');
        this.pauseIcon = this.playPauseBtn.querySelector('.pause-icon');

        this.audioEl.volume = 0.5;
        this.videoEl.volume = 0.5;
        this.volumeRange.value = 50;
    }

    bindEvents() {
        this.playPauseBtn.addEventListener('click', () => this.handlePlayPause());
        this.nextBtn.addEventListener('click',      () => this.handleNext());
        this.prevBtn.addEventListener('click',      () => this.handlePrev());
        if (this.repeatBtn) this.repeatBtn.addEventListener('click', () => this.handleRepeatToggle());
        this.progressBar.addEventListener('click',      e => this.handleSeek(e));
        this.progressBar.addEventListener('mousedown',  e => this.startDrag(e));
        this.progressBar.addEventListener('touchstart', e => this.startDrag(e));
        this.volumeRange.addEventListener('input', e => this.handleVolumeChange(e));
        this.volumeBtn.addEventListener('click',   () => this.toggleMute());
    }

    setupMediaListeners(el) {
        el.addEventListener('loadedmetadata', () => {
            if (el === this.media) this.updateTotalTime();
        });
        el.addEventListener('timeupdate', () => {
            if (el === this.media && !this.isSyncing) {
                this.updateCurrentTime();
                this.updateProgress();
            }
        });
        el.addEventListener('ended', () => {
            if (el === this.media) {
                this.socketManager.showToast('Playing next…', 'info');
                this.socketManager.nextSong();
            }
        });
        el.addEventListener('error', () => {
            if (el === this.media) this.socketManager.showToast('Playback error', 'error');
        });
    }

    setupMobileUnlock() {
        const unlock = () => {
            [this.audioEl, this.videoEl].forEach(el => {
                el.play().then(() => { el.pause(); el.currentTime = 0; }).catch(() => {});
            });
            document.removeEventListener('touchstart', unlock);
            document.removeEventListener('click', unlock);
        };
        document.addEventListener('touchstart', unlock);
        document.addEventListener('click', unlock);
    }

    // ── Switch active media element based on song type ──────────
    _switchMedia(mediaType) {
        if (mediaType === 'video') {
            this.audioEl.pause();
            this.audioEl.style.display = 'none';
            this.videoEl.style.display = 'block';
            this.media = this.videoEl;
            this.currentMediaType = 'video';
            // Hide vinyl artwork, show video element in its place
            const artwork = document.getElementById('song-artwork');
            if (artwork) artwork.style.display = 'none';
        } else {
            this.videoEl.pause();
            this.videoEl.style.display = 'none';
            this.audioEl.style.display = 'none'; // hidden — audio doesn't show visually
            this.media = this.audioEl;
            this.currentMediaType = 'audio';
            const artwork = document.getElementById('song-artwork');
            if (artwork) artwork.style.display = '';
        }
    }

    handlePlayPause() {
        if (this.media.paused) this.socketManager.play();
        else this.socketManager.pause();
    }
    handleNext() { this.socketManager.nextSong(); }
    handlePrev() { this.socket.emit('prev-song'); }

    handleRepeatToggle() {
        const modes = ['none', 'one', 'queue'];
        const cur = this.socketManager.roomData?.repeatMode || 'none';
        const next = modes[(modes.indexOf(cur) + 1) % modes.length];
        this.socket.emit('set-repeat-mode', { mode: next });
    }

    handleSeek(e) {
        const rect = this.progressBar.getBoundingClientRect();
        const pct  = (e.clientX - rect.left) / rect.width;
        const t    = pct * this.media.duration;
        if (isFinite(t)) this.socketManager.seek(t);
    }

    startDrag(e) {
        e.preventDefault();
        const move = ev => {
            const rect = this.progressBar.getBoundingClientRect();
            const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
            const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
            const t = pct * this.media.duration;
            if (isFinite(t)) this.updateProgress(t);
        };
        const end = ev => {
            const rect = this.progressBar.getBoundingClientRect();
            const x = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
            const pct = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
            const t = pct * this.media.duration;
            if (isFinite(t)) this.socketManager.seek(t);
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', end);
            document.removeEventListener('touchmove', move);
            document.removeEventListener('touchend', end);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', end);
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', end);
    }

    handleVolumeChange(e) {
        const v = e.target.value / 100;
        this.audioEl.volume = v;
        this.videoEl.volume = v;
        this.updateVolumeIcon(v);
    }

    toggleMute() {
        const v = this.media.volume;
        if (v > 0) {
            this.previousVolume = v;
            this.audioEl.volume = 0;
            this.videoEl.volume = 0;
            this.volumeRange.value = 0;
        } else {
            const restore = this.previousVolume || 0.5;
            this.audioEl.volume = restore;
            this.videoEl.volume = restore;
            this.volumeRange.value = restore * 100;
        }
        this.updateVolumeIcon(this.media.volume);
    }

    updateVolumeIcon(v) {
        const icon = this.volumeBtn.querySelector('svg');
        if (v === 0) {
            icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        } else if (v < 0.5) {
            icon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
        } else {
            icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        }
    }

    loadSong(song) {
        if (!song) return;
        const mediaType = song.mediaType || 'audio';
        const url = song.url || song.path;

        this._switchMedia(mediaType);

        this.media.src = url;
        this.media.load();

        document.getElementById('song-title').textContent  = song.title;
        document.getElementById('song-artist').textContent = song.artist;
        document.getElementById('song-album').textContent  = song.album || '';

        // Show media type badge
        const badge = document.getElementById('media-type-badge');
        if (badge) {
            badge.textContent = mediaType === 'video' ? '▶ Video' : '♪ Audio';
            badge.className = `media-badge media-badge-${mediaType}`;
        }

        document.getElementById('no-song-display').classList.add('hidden');
        document.getElementById('song-display').classList.remove('hidden');
    }

    play() {
        this.playIcon.classList.add('hidden');
        this.pauseIcon.classList.remove('hidden');
        document.getElementById('song-display')?.classList.add('playing');
        const p = this.media.play();
        if (p) p.catch(err => {
            console.error('Play failed:', err);
            this.socketManager.showToast('Tap to play', 'info');
            this.playIcon.classList.remove('hidden');
            this.pauseIcon.classList.add('hidden');
        });
    }

    pause() {
        this.media.pause();
        this.playIcon.classList.remove('hidden');
        this.pauseIcon.classList.add('hidden');
        document.getElementById('song-display')?.classList.remove('playing');
    }

    seek(time) {
        this.isSyncing = true;
        this.media.currentTime = time;
        this.updateCurrentTime();
        this.updateProgress();
        setTimeout(() => { this.isSyncing = false; }, 100);
    }

    syncPlayback(serverTime, isPlaying, timestamp) {
        const latency = (Date.now() - timestamp) / 1000;
        const adjusted = serverTime + latency;
        if (Math.abs(this.media.currentTime - adjusted) > this.syncThreshold) {
            this.seek(adjusted);
        }
        if (isPlaying && this.media.paused)  this.play();
        if (!isPlaying && !this.media.paused) this.pause();
        this.lastSyncTime = Date.now();
    }

    updateCurrentTime() { this.currentTimeEl.textContent = this.formatTime(this.media.currentTime); }
    updateTotalTime()   { this.totalTimeEl.textContent   = this.formatTime(this.media.duration); }

    updateProgress(customTime = null) {
        const t = customTime !== null ? customTime : this.media.currentTime;
        const d = this.media.duration;
        if (isFinite(d) && d > 0) {
            this.progressFill.style.width = `${(t / d) * 100}%`;
            if (customTime !== null) this.currentTimeEl.textContent = this.formatTime(t);
        }
    }

    formatTime(s) {
        if (!isFinite(s) || s < 0) return '0:00';
        return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
    }

    reset() {
        [this.audioEl, this.videoEl].forEach(el => { el.src = ''; el.load(); });
        this.videoEl.style.display = 'none';
        this.audioEl.style.display = 'none';
        const artwork = document.getElementById('song-artwork');
        if (artwork) artwork.style.display = '';
        this.media = this.audioEl;
        this.playIcon.classList.remove('hidden');
        this.pauseIcon.classList.add('hidden');
        this.progressFill.style.width = '0%';
        this.currentTimeEl.textContent = '0:00';
        this.totalTimeEl.textContent   = '0:00';
        document.getElementById('song-display')?.classList.remove('playing', 'hidden');
        document.getElementById('song-display')?.classList.add('hidden');
        document.getElementById('no-song-display')?.classList.remove('hidden');
    }

    updateRepeatUI(mode) {
        if (!this.repeatBtn) return;
        this.repeatBtn.classList.toggle('active-theme', mode !== 'none');
        if (this.repeatBadge) this.repeatBadge.style.display = mode === 'one' ? 'flex' : 'none';
        this.repeatBtn.title = `Repeat: ${mode}`;
    }

    updatePrevButton(hasPrev) {
        if (this.prevBtn) this.prevBtn.disabled = !hasPrev;
    }

    get audio() { return this.media; } // backwards compat
}
