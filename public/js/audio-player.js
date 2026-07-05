// Media Player — handles audio (vinyl view) and video (overlay controls)
class AudioPlayer {
    constructor(socketManager) {
        this.socket = socketManager.socket;
        this.socketManager = socketManager;
        this.audioEl = document.getElementById('audio-element');
        this.videoEl = document.getElementById('video-element');
        this.media = this.audioEl;
        this.isSyncing = false;
        this.syncThreshold = 1.0;
        this.currentMediaType = 'audio';
        this._overlayTimer = null;
        this._isFullscreen = false;

        this.initializeElements();
        this.bindEvents();
        this.setupMediaListeners(this.audioEl);
        this.setupMediaListeners(this.videoEl);
        this.setupVideoOverlay();
        this.setupMobileUnlock();
    }

    initializeElements() {
        // Main controls
        this.playPauseBtn   = document.getElementById('play-pause-btn');
        this.prevBtn        = document.getElementById('prev-btn');
        this.nextBtn        = document.getElementById('next-btn');
        this.volumeBtn      = document.getElementById('volume-btn');
        this.repeatBtn      = document.getElementById('repeat-btn');
        this.repeatBadge    = document.getElementById('repeat-badge');
        this.progressBar    = document.getElementById('progress-bar');
        this.progressFill   = document.getElementById('progress-fill');
        this.progressHandle = document.getElementById('progress-handle');
        this.currentTimeEl  = document.getElementById('current-time');
        this.totalTimeEl    = document.getElementById('total-time');
        this.volumeRange    = document.getElementById('volume-range');
        this.playIcon       = this.playPauseBtn.querySelector('.play-icon');
        this.pauseIcon      = this.playPauseBtn.querySelector('.pause-icon');

        // Video overlay elements
        this.videoContainer    = document.getElementById('video-container');
        this.videoOverlay      = document.getElementById('video-overlay');
        this.videoCenterPlay   = document.getElementById('video-center-play');
        this.videoProgressBar  = document.getElementById('video-progress-bar');
        this.videoProgressFill = document.getElementById('video-progress-fill');
        this.videoCurrentEl    = document.getElementById('video-current');
        this.videoTotalEl      = document.getElementById('video-total');
        this.videoFullscreenBtn= document.getElementById('video-fullscreen-btn');
        this.vcPlayIcon        = this.videoCenterPlay?.querySelector('.vc-play-icon');
        this.vcPauseIcon       = this.videoCenterPlay?.querySelector('.vc-pause-icon');

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
        this.progressBar.addEventListener('mousedown',  e => this.startDrag(e, false));
        this.progressBar.addEventListener('touchstart', e => this.startDrag(e, false), { passive: false });
        this.volumeRange.addEventListener('input', e => this.handleVolumeChange(e));
        this.volumeBtn.addEventListener('click',   () => this.toggleMute());
    }

    /* ── Video overlay setup ── */
    setupVideoOverlay() {
        if (!this.videoContainer) return;

        // Show/hide overlay on hover (desktop) and tap (mobile)
        this.videoContainer.addEventListener('mouseenter', () => this._showOverlay());
        this.videoContainer.addEventListener('mouseleave', () => this._hideOverlay());
        this.videoContainer.addEventListener('mousemove',  () => this._showOverlayTemp());
        this.videoContainer.addEventListener('click',      () => this._toggleOverlay());

        // Center play/pause click
        if (this.videoCenterPlay) {
            this.videoCenterPlay.addEventListener('click', e => {
                e.stopPropagation();
                this.handlePlayPause();
            });
        }

        // Video progress bar
        if (this.videoProgressBar) {
            this.videoProgressBar.addEventListener('click',     e => this._videoSeek(e));
            this.videoProgressBar.addEventListener('mousedown', e => this.startDrag(e, true));
            this.videoProgressBar.addEventListener('touchstart',e => this.startDrag(e, true), { passive: false });
        }

        // Fullscreen
        if (this.videoFullscreenBtn) {
            this.videoFullscreenBtn.addEventListener('click', e => {
                e.stopPropagation();
                this.toggleFullscreen();
            });
        }

        // Listen for native fullscreen change
        document.addEventListener('fullscreenchange',       () => this._onFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this._onFullscreenChange());
    }

    _showOverlay() {
        if (!this.videoOverlay) return;
        this.videoOverlay.classList.add('visible');
        clearTimeout(this._overlayTimer);
    }
    _hideOverlay() {
        if (!this.videoOverlay) return;
        clearTimeout(this._overlayTimer);
        if (!this.media.paused) this.videoOverlay.classList.remove('visible');
    }
    _showOverlayTemp() {
        this._showOverlay();
        clearTimeout(this._overlayTimer);
        this._overlayTimer = setTimeout(() => {
            if (!this.media.paused) this._hideOverlay();
        }, 2800);
    }
    _toggleOverlay() {
        if (!this.videoOverlay) return;
        const visible = this.videoOverlay.classList.contains('visible');
        if (visible) this._hideOverlay();
        else this._showOverlayTemp();
    }

    _videoSeek(e) {
        const rect = this.videoProgressBar.getBoundingClientRect();
        const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const t    = pct * this.media.duration;
        if (isFinite(t)) this.socketManager.seek(t);
    }

    /* ── Fullscreen ── */
    toggleFullscreen() {
        const el = this.videoContainer;
        if (!el) return;
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
        } else {
            (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        }
    }

    _onFullscreenChange() {
        this._isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        const enterIcon = this.videoFullscreenBtn?.querySelector('.fs-icon-enter');
        const exitIcon  = this.videoFullscreenBtn?.querySelector('.fs-icon-exit');
        if (enterIcon) enterIcon.classList.toggle('hidden', this._isFullscreen);
        if (exitIcon)  exitIcon.classList.toggle('hidden', !this._isFullscreen);
    }

    /* ── Media listeners ── */
    setupMediaListeners(el) {
        el.addEventListener('loadedmetadata', () => {
            if (el !== this.media) return;
            this.updateTotalTime();
            if (this.currentMediaType === 'video' && this.videoTotalEl) {
                this.videoTotalEl.textContent = this.formatTime(el.duration);
            }
        });
        el.addEventListener('timeupdate', () => {
            if (el !== this.media || this.isSyncing) return;
            this.updateCurrentTime();
            this.updateProgress();
            if (this.currentMediaType === 'video') {
                if (this.videoCurrentEl) this.videoCurrentEl.textContent = this.formatTime(el.currentTime);
                if (this.videoProgressFill && isFinite(el.duration) && el.duration > 0) {
                    this.videoProgressFill.style.width = `${(el.currentTime / el.duration) * 100}%`;
                }
            }
        });
        el.addEventListener('ended', () => {
            if (el !== this.media) return;
            this.socketManager.nextSong();
        });
        el.addEventListener('error', () => {
            if (el !== this.media) return;
            this.socketManager.showToast('Playback error', 'error');
        });
        el.addEventListener('waiting', () => {
            if (el !== this.media) return;
            // Could show buffering indicator here
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

    /* ── Switch between audio and video mode ── */
    _switchMedia(mediaType) {
        const audioDisplay = document.getElementById('audio-display');
        const videoDisplay = document.getElementById('video-display');
        const songDisplay  = document.getElementById('song-display');
        const audioPlayerEl = document.getElementById('audio-player');

        if (mediaType === 'video') {
            this.audioEl.pause();
            // Hide audio vinyl view, show video player
            if (audioDisplay) audioDisplay.classList.add('hidden');
            if (videoDisplay) videoDisplay.classList.remove('hidden');
            if (songDisplay)  songDisplay.classList.remove('hidden');
            // Hide the audio-player controls bar — video has its own overlay
            if (audioPlayerEl) audioPlayerEl.classList.add('hidden');
            this.media = this.videoEl;
            this.currentMediaType = 'video';
        } else {
            this.videoEl.pause();
            if (this.videoEl) this.videoEl.src = '';
            // Show audio vinyl view
            if (audioDisplay) audioDisplay.classList.remove('hidden');
            if (videoDisplay) videoDisplay.classList.add('hidden');
            if (songDisplay)  songDisplay.classList.remove('hidden');
            if (audioPlayerEl) audioPlayerEl.classList.remove('hidden');
            this.media = this.audioEl;
            this.currentMediaType = 'audio';
        }
    }

    /* ── Controls ── */
    handlePlayPause() {
        if (this.media.paused) this.socketManager.play();
        else this.socketManager.pause();
    }
    handleNext() { this.socketManager.nextSong(); }
    handlePrev() { this.socket.emit('prev-song'); }

    handleRepeatToggle() {
        const modes = ['none', 'one', 'queue'];
        const cur   = this.socketManager.roomData?.repeatMode || 'none';
        const next  = modes[(modes.indexOf(cur) + 1) % modes.length];
        this.socket.emit('set-repeat-mode', { mode: next });
    }

    handleSeek(e) {
        const rect = this.progressBar.getBoundingClientRect();
        const pct  = (e.clientX - rect.left) / rect.width;
        const t    = pct * this.media.duration;
        if (isFinite(t)) this.socketManager.seek(t);
    }

    startDrag(e, isVideoBar) {
        e.preventDefault();
        const bar = isVideoBar ? this.videoProgressBar : this.progressBar;
        const move = ev => {
            const rect = bar.getBoundingClientRect();
            const x    = ev.touches ? ev.touches[0].clientX : ev.clientX;
            const pct  = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
            const t    = pct * this.media.duration;
            if (isFinite(t)) {
                if (isVideoBar) {
                    if (this.videoProgressFill) this.videoProgressFill.style.width = `${pct * 100}%`;
                    if (this.videoCurrentEl) this.videoCurrentEl.textContent = this.formatTime(t);
                } else {
                    this.updateProgress(t);
                }
            }
        };
        const end = ev => {
            const rect = bar.getBoundingClientRect();
            const x    = ev.changedTouches ? ev.changedTouches[0].clientX : ev.clientX;
            const pct  = Math.max(0, Math.min(1, (x - rect.left) / rect.width));
            const t    = pct * this.media.duration;
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
            this.audioEl.volume = 0; this.videoEl.volume = 0;
            this.volumeRange.value = 0;
        } else {
            const r = this.previousVolume || 0.5;
            this.audioEl.volume = r; this.videoEl.volume = r;
            this.volumeRange.value = r * 100;
        }
        this.updateVolumeIcon(this.media.volume);
    }

    updateVolumeIcon(v) {
        const icon = this.volumeBtn?.querySelector('svg');
        if (!icon) return;
        if (v === 0) {
            icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        } else if (v < 0.5) {
            icon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
        } else {
            icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        }
    }

    /* ── Load song ── */
    loadSong(song) {
        if (!song) return;
        const mediaType = song.mediaType || 'audio';
        const url = song.url || song.path;

        this._switchMedia(mediaType);
        this.media.src = url;
        this.media.load();

        // Audio view info
        document.getElementById('song-title').textContent  = song.title;
        document.getElementById('song-artist').textContent = song.artist;
        document.getElementById('song-album').textContent  = song.album || '';

        // Media badge
        const badge = document.getElementById('media-type-badge');
        if (badge) {
            badge.textContent = mediaType === 'video' ? 'Video' : 'Audio';
            badge.className   = `media-badge media-badge-${mediaType}`;
        }

        // Video overlay info
        if (document.getElementById('video-title-text'))  document.getElementById('video-title-text').textContent  = song.title;
        if (document.getElementById('video-song-name'))   document.getElementById('video-song-name').textContent   = song.title;
        if (document.getElementById('video-song-artist')) document.getElementById('video-song-artist').textContent = song.artist;

        document.getElementById('no-song-display').classList.add('hidden');
    }

    /* ── Play / Pause ── */
    play() {
        this.playIcon.classList.add('hidden');
        this.pauseIcon.classList.remove('hidden');
        if (this.vcPlayIcon)  this.vcPlayIcon.classList.add('hidden');
        if (this.vcPauseIcon) this.vcPauseIcon.classList.remove('hidden');
        document.getElementById('song-display')?.classList.add('playing');
        const p = this.media.play();
        if (p) p.catch(err => {
            this.socketManager.showToast('Tap to play', 'info');
            this.playIcon.classList.remove('hidden');
            this.pauseIcon.classList.add('hidden');
            if (this.vcPlayIcon)  this.vcPlayIcon.classList.remove('hidden');
            if (this.vcPauseIcon) this.vcPauseIcon.classList.add('hidden');
        });
        // Auto-hide overlay when playing video
        if (this.currentMediaType === 'video') {
            setTimeout(() => this._hideOverlay(), 2000);
        }
    }

    pause() {
        this.media.pause();
        this.playIcon.classList.remove('hidden');
        this.pauseIcon.classList.add('hidden');
        if (this.vcPlayIcon)  this.vcPlayIcon.classList.remove('hidden');
        if (this.vcPauseIcon) this.vcPauseIcon.classList.add('hidden');
        document.getElementById('song-display')?.classList.remove('playing');
        // Keep overlay visible when paused
        if (this.currentMediaType === 'video') this._showOverlay();
    }

    seek(time) {
        this.isSyncing = true;
        this.media.currentTime = time;
        this.updateCurrentTime();
        this.updateProgress();
        setTimeout(() => { this.isSyncing = false; }, 100);
    }

    syncPlayback(serverTime, isPlaying, timestamp) {
        const adjusted = serverTime + (Date.now() - timestamp) / 1000;
        if (Math.abs(this.media.currentTime - adjusted) > this.syncThreshold) {
            this.seek(adjusted);
        }
        if (isPlaying && this.media.paused)   this.play();
        if (!isPlaying && !this.media.paused) this.pause();
    }

    /* ── Progress / time updates ── */
    updateCurrentTime() { if (this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(this.media.currentTime); }
    updateTotalTime()   { if (this.totalTimeEl)   this.totalTimeEl.textContent   = this.formatTime(this.media.duration); }

    updateProgress(customTime = null) {
        const t = customTime !== null ? customTime : this.media.currentTime;
        const d = this.media.duration;
        if (isFinite(d) && d > 0) {
            this.progressFill.style.width = `${(t / d) * 100}%`;
            if (customTime !== null && this.currentTimeEl) this.currentTimeEl.textContent = this.formatTime(t);
        }
    }

    formatTime(s) {
        if (!isFinite(s) || s < 0) return '0:00';
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        if (h > 0) return `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    reset() {
        [this.audioEl, this.videoEl].forEach(el => { el.src = ''; el.load(); });
        const audioDisplay  = document.getElementById('audio-display');
        const videoDisplay  = document.getElementById('video-display');
        const audioPlayerEl = document.getElementById('audio-player');
        const songDisplay   = document.getElementById('song-display');
        if (audioDisplay)  audioDisplay.classList.remove('hidden');
        if (videoDisplay)  videoDisplay.classList.add('hidden');
        if (audioPlayerEl) audioPlayerEl.classList.remove('hidden');
        if (songDisplay)   { songDisplay.classList.remove('playing'); songDisplay.classList.add('hidden'); }
        document.getElementById('no-song-display')?.classList.remove('hidden');
        this.media = this.audioEl;
        this.currentMediaType = 'audio';
        this.playIcon.classList.remove('hidden');
        this.pauseIcon.classList.add('hidden');
        this.progressFill.style.width = '0%';
        this.currentTimeEl.textContent = '0:00';
        this.totalTimeEl.textContent   = '0:00';
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

    get audio() { return this.media; }
}
