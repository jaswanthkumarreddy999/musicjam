// Audio Player Management
class AudioPlayer {
    constructor(socketManager) {
        this.socket = socketManager.socket;
        this.socketManager = socketManager;
        this.audio = document.getElementById('audio-element');
        this.isHost = false;
        this.isSyncing = false;
        this.lastSyncTime = 0;
        this.syncThreshold = 1.0; // 1 second threshold for sync correction
        
        this.initializeElements();
        this.bindEvents();
        this.setupAudioEventListeners();
    }
    
    initializeElements() {
        // Controls
        this.playPauseBtn = document.getElementById('play-pause-btn');
        this.prevBtn = document.getElementById('prev-btn');
        this.nextBtn = document.getElementById('next-btn');
        this.volumeBtn = document.getElementById('volume-btn');
        this.repeatBtn = document.getElementById('repeat-btn');
        this.repeatBadge = document.getElementById('repeat-badge');
        
        // Progress
        this.progressBar = document.getElementById('progress-bar');
        this.progressFill = document.getElementById('progress-fill');
        this.progressHandle = document.getElementById('progress-handle');
        this.currentTimeEl = document.getElementById('current-time');
        this.totalTimeEl = document.getElementById('total-time');
        
        // Volume
        this.volumeRange = document.getElementById('volume-range');
        
        // Icons
        this.playIcon = this.playPauseBtn.querySelector('.play-icon');
        this.pauseIcon = this.playPauseBtn.querySelector('.pause-icon');
        
        // Set initial volume
        this.audio.volume = 0.5;
        this.volumeRange.value = 50;
    }
    
    bindEvents() {
        // Control buttons
        this.playPauseBtn.addEventListener('click', () => this.handlePlayPause());
        this.nextBtn.addEventListener('click', () => this.handleNext());
        this.prevBtn.addEventListener('click', () => this.handlePrev());
        if (this.repeatBtn) {
            this.repeatBtn.addEventListener('click', () => this.handleRepeatToggle());
        }
        
        // Progress bar
        this.progressBar.addEventListener('click', (e) => this.handleSeek(e));
        this.progressBar.addEventListener('mousedown', (e) => this.startDrag(e));
        
        // Volume
        this.volumeRange.addEventListener('input', (e) => this.handleVolumeChange(e));
        this.volumeBtn.addEventListener('click', () => this.toggleMute());
        
        // Touch events for mobile
        this.progressBar.addEventListener('touchstart', (e) => this.startDrag(e));
    }
    
    setupAudioEventListeners() {
        this.audio.addEventListener('loadedmetadata', () => {
            this.updateTotalTime();
        });
        
        this.audio.addEventListener('timeupdate', () => {
            if (!this.isSyncing) {
                this.updateCurrentTime();
                this.updateProgress();
            }
        });
        
        this.audio.addEventListener('ended', () => {
            if (this.isHost) {
                this.socketManager.nextSong();
            }
        });
        
        this.audio.addEventListener('loadstart', () => {
            console.log('Audio loading started');
        });
        
        this.audio.addEventListener('canplay', () => {
            console.log('Audio can start playing');
        });
        
        this.audio.addEventListener('error', (e) => {
            console.error('Audio error:', e);
            this.socketManager.showToast('Audio playback error', 'error');
        });
        
        // Handle mobile audio unlock
        this.setupMobileAudioUnlock();
    }
    
    setupMobileAudioUnlock() {
        // iOS/Safari requires user interaction to enable audio
        const unlockAudio = () => {
            this.audio.play().then(() => {
                this.audio.pause();
                this.audio.currentTime = 0;
                console.log('Audio unlocked for mobile');
            }).catch(() => {
                console.log('Audio unlock failed, will retry on next interaction');
            });
            
            // Remove listeners after first successful unlock
            document.removeEventListener('touchstart', unlockAudio);
            document.removeEventListener('click', unlockAudio);
        };
        
        document.addEventListener('touchstart', unlockAudio);
        document.addEventListener('click', unlockAudio);
    }
    
    handlePlayPause() {
        if (this.audio.paused) {
            this.socketManager.play();
        } else {
            this.socketManager.pause();
        }
    }
    
    handleNext() {
        this.socketManager.nextSong();
    }
    
    handlePrev() {
        this.socket.emit('prev-song');
    }
    
    handleRepeatToggle() {
        const modes = ['none', 'one', 'queue'];
        const currentMode = this.socketManager.roomData?.repeatMode || 'none';
        const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length;
        const nextMode = modes[nextIndex];
        
        this.socket.emit('set-repeat-mode', { mode: nextMode });
    }
    
    handleSeek(e) {
        const rect = this.progressBar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const seekTime = percent * this.audio.duration;
        
        if (isFinite(seekTime)) {
            this.socketManager.seek(seekTime);
        }
    }
    
    startDrag(e) {
        e.preventDefault();
        
        const handleMove = (moveEvent) => {
            const rect = this.progressBar.getBoundingClientRect();
            let clientX;
            
            if (moveEvent.touches) {
                clientX = moveEvent.touches[0].clientX;
            } else {
                clientX = moveEvent.clientX;
            }
            
            const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const seekTime = percent * this.audio.duration;
            
            if (isFinite(seekTime)) {
                this.updateProgress(seekTime);
            }
        };
        
        const handleEnd = (endEvent) => {
            const rect = this.progressBar.getBoundingClientRect();
            let clientX;
            
            if (endEvent.changedTouches) {
                clientX = endEvent.changedTouches[0].clientX;
            } else {
                clientX = endEvent.clientX;
            }
            
            const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            const seekTime = percent * this.audio.duration;
            
            if (isFinite(seekTime)) {
                this.socketManager.seek(seekTime);
            }
            
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.removeEventListener('touchmove', handleMove);
            document.removeEventListener('touchend', handleEnd);
        };
        
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
        document.addEventListener('touchmove', handleMove, { passive: false });
        document.addEventListener('touchend', handleEnd);
    }
    
    handleVolumeChange(e) {
        const volume = e.target.value / 100;
        this.audio.volume = volume;
        this.updateVolumeIcon(volume);
    }
    
    toggleMute() {
        if (this.audio.volume > 0) {
            this.previousVolume = this.audio.volume;
            this.audio.volume = 0;
            this.volumeRange.value = 0;
        } else {
            this.audio.volume = this.previousVolume || 0.5;
            this.volumeRange.value = (this.previousVolume || 0.5) * 100;
        }
        this.updateVolumeIcon(this.audio.volume);
    }
    
    updateVolumeIcon(volume) {
        const icon = this.volumeBtn.querySelector('svg');
        if (volume === 0) {
            icon.innerHTML = '<path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>';
        } else if (volume < 0.5) {
            icon.innerHTML = '<path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>';
        } else {
            icon.innerHTML = '<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>';
        }
    }
    
    loadSong(song) {
        if (!song) return;
        
        console.log('Loading song:', song.title);
        
        // Update audio source
        this.audio.src = song.path;
        this.audio.load();
        
        // Update display
        document.getElementById('song-title').textContent = song.title;
        document.getElementById('song-artist').textContent = song.artist;
        document.getElementById('song-album').textContent = song.album || '';
        
        // Show song display, hide no-song
        document.getElementById('no-song-display').classList.add('hidden');
        document.getElementById('song-display').classList.remove('hidden');
    }
    
    play() {
        this.playIcon.classList.add('hidden');
        this.pauseIcon.classList.remove('hidden');
        
        const songDisplay = document.getElementById('song-display');
        if (songDisplay) {
            songDisplay.classList.add('playing');
        }
        
        // Play with error handling for mobile
        const playPromise = this.audio.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error('Playback failed:', error);
                this.socketManager.showToast('Playback failed. Tap to retry.', 'error');
                
                // Revert button state
                this.playIcon.classList.remove('hidden');
                this.pauseIcon.classList.add('hidden');
            });
        }
    }
    
    pause() {
        this.audio.pause();
        this.playIcon.classList.remove('hidden');
        this.pauseIcon.classList.add('hidden');
        
        const songDisplay = document.getElementById('song-display');
        if (songDisplay) {
            songDisplay.classList.remove('playing');
        }
    }
    
    seek(time) {
        this.isSyncing = true;
        this.audio.currentTime = time;
        this.updateCurrentTime();
        this.updateProgress();
        
        // Reset sync flag after a short delay
        setTimeout(() => {
            this.isSyncing = false;
        }, 100);
    }
    
    syncPlayback(serverTime, isPlaying, timestamp) {
        const now = Date.now();
        const latency = now - timestamp;
        const adjustedTime = serverTime + (latency / 1000);
        
        const timeDiff = Math.abs(this.audio.currentTime - adjustedTime);
        
        // Only sync if difference is significant
        if (timeDiff > this.syncThreshold) {
            console.log(`Syncing playback: ${timeDiff.toFixed(2)}s difference`);
            this.seek(adjustedTime);
        }
        
        // Handle play/pause state
        if (isPlaying && this.audio.paused) {
            this.play();
        } else if (!isPlaying && !this.audio.paused) {
            this.pause();
        }
        
        this.lastSyncTime = now;
    }
    
    updateCurrentTime() {
        const currentTime = this.audio.currentTime;
        this.currentTimeEl.textContent = this.formatTime(currentTime);
    }
    
    updateTotalTime() {
        const duration = this.audio.duration;
        this.totalTimeEl.textContent = this.formatTime(duration);
    }
    
    updateProgress(customTime = null) {
        const currentTime = customTime !== null ? customTime : this.audio.currentTime;
        const duration = this.audio.duration;
        
        if (isFinite(duration) && duration > 0) {
            const percent = (currentTime / duration) * 100;
            this.progressFill.style.width = `${percent}%`;
            
            if (customTime !== null) {
                this.currentTimeEl.textContent = this.formatTime(currentTime);
            }
        }
    }
    
    formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) return '0:00';
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    setHost(isHost) {
        this.isHost = isHost;
        
        // Enable/disable controls based on host status
        // For now, everyone can control playback (like Spotify Jam)
        // You could restrict controls to host only here
    }
    
    reset() {
        this.audio.src = '';
        this.audio.load();
        
        // Reset UI
        this.playIcon.classList.remove('hidden');
        this.pauseIcon.classList.add('hidden');
        this.progressFill.style.width = '0%';
        this.currentTimeEl.textContent = '0:00';
        this.totalTimeEl.textContent = '0:00';
        
        // Show no-song display
        const songDisplay = document.getElementById('song-display');
        if (songDisplay) {
            songDisplay.classList.remove('playing');
            songDisplay.classList.add('hidden');
        }
        document.getElementById('no-song-display').classList.remove('hidden');
    }

    updateRepeatUI(mode) {
        if (!this.repeatBtn) return;
        
        if (mode === 'none') {
            this.repeatBtn.classList.remove('active-theme');
            if (this.repeatBadge) this.repeatBadge.style.display = 'none';
            this.repeatBtn.title = 'Repeat Mode: Off';
        } else if (mode === 'one') {
            this.repeatBtn.classList.add('active-theme');
            if (this.repeatBadge) this.repeatBadge.style.display = 'flex';
            this.repeatBtn.title = 'Repeat Mode: One (Single Track)';
        } else if (mode === 'queue') {
            this.repeatBtn.classList.add('active-theme');
            if (this.repeatBadge) this.repeatBadge.style.display = 'none';
            this.repeatBtn.title = 'Repeat Mode: Queue (Cycle Playlist)';
        }
    }
    
    updatePrevButton(hasPrev) {
        if (!this.prevBtn) return;
        this.prevBtn.disabled = !hasPrev;
    }
}