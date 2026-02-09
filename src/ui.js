// UI management - DOM updates, view switching

export class UI {
  constructor() {
    this.currentView = 'camera';
    this.elements = {};
    this.recordingTimerInterval = null;
    this.settings = {
      showLogs: false,
      bitrate: 2500000,
      sensitivity: 0.35,
      tileGrid: 3,
      maxDuration: 600000,
    };
  }

  /**
   * Initialize UI with DOM elements
   */
  init() {
    this.elements = {
      // Views
      cameraView: document.getElementById('camera-view'),
      reviewView: document.getElementById('review-view'),
      playerView: document.getElementById('player-view'),

      // Camera view elements
      videoContainer: document.getElementById('video-container'),
      statusIndicator: document.getElementById('status-indicator'),
      statusText: document.getElementById('status-text'),
      birdStatus: document.getElementById('bird-status'),
      clipCount: document.getElementById('clip-count'),
      reviewBtn: document.getElementById('review-btn'),
      toggleBtn: document.getElementById('toggle-btn'),
      stopBtn: document.getElementById('stop-btn'),

      // Review view elements
      clipsGrid: document.getElementById('clips-grid'),
      backBtn: document.getElementById('back-btn'),
      storageInfo: document.getElementById('storage-info'),

      // Player view elements
      videoPlayer: document.getElementById('video-player'),
      closePlayerBtn: document.getElementById('close-player-btn'),
      downloadBtn: document.getElementById('download-btn'),
      deleteBtn: document.getElementById('delete-btn'),
      playerShareBtn: document.getElementById('player-share-btn'),
      playerDownloadBtn: document.getElementById('player-download-btn'),

      // Settings elements
      settingsBtn: document.getElementById('settings-btn'),
      settingsPanel: document.getElementById('settings-panel'),
      closeSettingsBtn: document.getElementById('close-settings-btn'),
      showLogsCheckbox: document.getElementById('show-logs'),
      bitrateSelect: document.getElementById('bitrate'),
      sensitivitySelect: document.getElementById('sensitivity'),
      tileGridSelect: document.getElementById('tile-grid'),
      maxDurationSelect: document.getElementById('max-duration'),
      clearCacheBtn: document.getElementById('clear-cache-btn'),

      // Welcome popup
      welcomePopup: document.getElementById('welcome-popup'),
      welcomeCloseBtn: document.getElementById('welcome-close-btn'),
    };

    // Load settings from localStorage
    this.loadSettings();

    // Show welcome popup on first visit
    this.showWelcomeIfFirstVisit();

    return this;
  }

  /**
   * Switch between views
   * @param {'camera' | 'review' | 'player'} view
   */
  showView(view) {
    this.currentView = view;

    const views = ['camera', 'review', 'player'];
    views.forEach(v => {
      const element = this.elements[`${v}View`];
      if (element) {
        element.classList.toggle('hidden', v !== view);
      }
    });
  }

  /**
   * Update status indicator
   * @param {'idle' | 'detecting' | 'recording' | 'cooldown' | 'paused'} status
   * @param {string} [customText] - Optional custom text to display
   */
  setStatus(status, customText) {
    const { statusIndicator, statusText, toggleBtn, stopBtn } = this.elements;

    if (!statusIndicator || !statusText) return;

    // Remove all status classes
    statusIndicator.className = 'status-indicator';

    const statusMap = {
      idle: { class: 'idle', text: 'Watching' },
      detecting: { class: 'detecting', text: 'Motion detected' },
      recording: { class: 'recording', text: 'Recording' },
      stopping: { class: 'cooldown', text: 'Saving...' },
      cooldown: { class: 'cooldown', text: 'Cooldown' },
      paused: { class: 'paused', text: 'Paused' },
    };

    const config = statusMap[status] || statusMap.idle;
    statusIndicator.classList.add(config.class);
    statusText.textContent = customText || config.text;

    // Update toggle button icon
    if (toggleBtn) {
      toggleBtn.textContent = status === 'paused' ? '▶' : '⏸';
    }

    // Show/hide stop button during recording
    if (stopBtn) {
      stopBtn.classList.toggle('hidden', status !== 'recording');
    }
  }

  /**
   * Start recording timer display (counts up)
   */
  startRecordingTimer() {
    this.stopRecordingTimer();
    const startTime = Date.now();

    const update = () => {
      const elapsed = Date.now() - startTime;
      const totalSeconds = Math.floor(elapsed / 1000);
      const mins = Math.floor(totalSeconds / 60);
      const secs = totalSeconds % 60;
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
      this.setStatus('recording', `Recording ${timeStr}`);
    };

    update();
    this.recordingTimerInterval = setInterval(update, 1000);
  }

  /**
   * Stop recording timer display
   */
  stopRecordingTimer() {
    if (this.recordingTimerInterval) {
      clearInterval(this.recordingTimerInterval);
      this.recordingTimerInterval = null;
    }
  }

  /**
   * Update bird detection status
   * @param {'found' | 'not-found' | 'not-detecting'} status
   */
  setBirdStatus(status) {
    const { birdStatus } = this.elements;
    if (!birdStatus) return;

    birdStatus.className = 'bird-status';

    const statusMap = {
      'found': { class: 'bird-found', text: 'Bird found' },
      'not-found': { class: 'bird-not-found', text: 'No bird' },
      'not-detecting': { class: 'bird-not-detecting', text: 'Not detecting' },
    };

    const config = statusMap[status] || statusMap['not-detecting'];
    birdStatus.classList.add(config.class);
    birdStatus.textContent = config.text;
  }

  /**
   * Update clip count display
   * @param {number} count
   */
  setClipCount(count) {
    if (this.elements.clipCount) {
      this.elements.clipCount.textContent = count;
    }
  }

  /**
   * Attach video element to container
   * @param {HTMLVideoElement} video
   */
  attachVideo(video) {
    if (this.elements.videoContainer) {
      video.id = 'camera-feed';
      // Remove existing video but keep canvas
      const existingVideo = this.elements.videoContainer.querySelector('video');
      if (existingVideo) {
        existingVideo.remove();
      }
      // Insert video before canvas
      this.elements.videoContainer.insertBefore(video, this.elements.videoContainer.firstChild);
    }
  }

  /**
   * Render clips grid
   * @param {Array} clips
   * @param {Object} handlers - { onPlay, onDownload, onDelete }
   */
  renderClips(clips, handlers) {
    const { clipsGrid } = this.elements;
    if (!clipsGrid) return;

    clipsGrid.innerHTML = '';

    if (clips.length === 0) {
      clipsGrid.innerHTML = '<p class="empty-message">No clips recorded yet</p>';
      return;
    }

    clips.forEach(clip => {
      const item = document.createElement('div');
      item.className = 'clip-item';
      item.dataset.id = clip.id;

      const thumbnail = document.createElement('img');
      thumbnail.src = clip.thumbnail || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><rect fill="%23333" width="160" height="90"/><text x="80" y="50" fill="%23666" text-anchor="middle">No thumbnail</text></svg>';
      thumbnail.alt = 'Clip thumbnail';

      const info = document.createElement('div');
      info.className = 'clip-info';
      info.textContent = new Date(clip.timestamp).toLocaleString();

      const actions = document.createElement('div');
      actions.className = 'clip-actions';

      const playBtn = document.createElement('button');
      playBtn.className = 'clip-btn';
      playBtn.textContent = '▶';
      playBtn.title = 'Play';
      playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (handlers.onPlay) handlers.onPlay(clip);
      });

      const shareBtn = document.createElement('button');
      shareBtn.className = 'clip-btn clip-btn-share';
      shareBtn.textContent = '📤';
      shareBtn.title = 'Share';
      shareBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (handlers.onShare) handlers.onShare(clip);
      });

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'clip-btn';
      downloadBtn.textContent = '⬇';
      downloadBtn.title = 'Download';
      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (handlers.onDownload) handlers.onDownload(clip);
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'clip-btn clip-btn-danger';
      deleteBtn.textContent = '🗑';
      deleteBtn.title = 'Delete';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (handlers.onDelete) handlers.onDelete(clip);
      });

      actions.appendChild(playBtn);
      actions.appendChild(shareBtn);
      actions.appendChild(downloadBtn);
      actions.appendChild(deleteBtn);

      item.appendChild(thumbnail);
      item.appendChild(info);
      item.appendChild(actions);

      // Click thumbnail to play
      thumbnail.addEventListener('click', () => {
        if (handlers.onPlay) handlers.onPlay(clip);
      });

      clipsGrid.appendChild(item);
    });
  }

  /**
   * Update storage info display
   * @param {{ clipCount: number, totalSizeMB: string }} stats
   */
  setStorageInfo(stats) {
    if (this.elements.storageInfo) {
      this.elements.storageInfo.textContent = `${stats.clipCount} clips (${stats.totalSizeMB} MB)`;
    }
  }

  /**
   * Play clip in player view
   * @param {Blob} blob
   */
  playClip(blob) {
    const { videoPlayer } = this.elements;
    if (!videoPlayer) return;

    // Revoke previous URL
    if (videoPlayer.src) {
      URL.revokeObjectURL(videoPlayer.src);
    }

    videoPlayer.src = URL.createObjectURL(blob);
    videoPlayer.play();
    this.showView('player');
  }

  /**
   * Close player and return to review
   */
  closePlayer() {
    const { videoPlayer } = this.elements;
    if (videoPlayer) {
      videoPlayer.pause();
      URL.revokeObjectURL(videoPlayer.src);
      videoPlayer.src = '';
    }
    this.showView('review');
  }

  /**
   * Show error message (red)
   * @param {string} message
   */
  showError(message) {
    this._showToast(message, 'error');
  }

  /**
   * Show log message (green) - only if showLogs setting is enabled
   * @param {string} message
   */
  showLog(message) {
    if (this.settings.showLogs) {
      this._showToast(message, 'log');
    }
  }

  /**
   * Internal toast display
   * @param {string} message
   * @param {'error' | 'log'} type
   */
  _showToast(message, type) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'app-toast';
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.className = 'app-toast ' + type + ' visible';

    setTimeout(() => {
      toast.classList.remove('visible');
    }, 3000);
  }

  /**
   * Load settings from localStorage
   */
  loadSettings() {
    try {
      const saved = localStorage.getItem('birdwatcher-settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (e) {
      // Ignore localStorage errors
    }

    // Apply to UI elements
    if (this.elements.showLogsCheckbox) {
      this.elements.showLogsCheckbox.checked = this.settings.showLogs;
    }
    if (this.elements.bitrateSelect) {
      this.elements.bitrateSelect.value = this.settings.bitrate;
    }
    if (this.elements.sensitivitySelect) {
      this.elements.sensitivitySelect.value = this.settings.sensitivity;
    }
    if (this.elements.tileGridSelect) {
      this.elements.tileGridSelect.value = this.settings.tileGrid;
    }
    if (this.elements.maxDurationSelect) {
      this.elements.maxDurationSelect.value = this.settings.maxDuration || 600000;
    }
  }

  /**
   * Save settings to localStorage
   */
  saveSettings() {
    try {
      localStorage.setItem('birdwatcher-settings', JSON.stringify(this.settings));
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  /**
   * Open settings panel
   */
  openSettings() {
    if (this.elements.settingsPanel) {
      this.elements.settingsPanel.classList.remove('hidden');
    }
  }

  /**
   * Close settings panel
   */
  closeSettings() {
    if (this.elements.settingsPanel) {
      this.elements.settingsPanel.classList.add('hidden');
    }
  }

  /**
   * Get current bitrate setting
   * @returns {number}
   */
  getBitrate() {
    return this.settings.bitrate;
  }

  /**
   * Get current sensitivity setting
   * @returns {number}
   */
  getSensitivity() {
    return this.settings.sensitivity;
  }

  getTileGrid() {
    return this.settings.tileGrid;
  }

  getMaxDuration() {
    return this.settings.maxDuration || 600000;
  }

  /**
   * Show welcome popup if first visit
   */
  showWelcomeIfFirstVisit() {
    try {
      const hasSeenWelcome = localStorage.getItem('birdwatcher-welcomed');
      if (!hasSeenWelcome && this.elements.welcomePopup) {
        this.elements.welcomePopup.classList.remove('hidden');

        if (this.elements.welcomeCloseBtn) {
          this.elements.welcomeCloseBtn.addEventListener('click', () => {
            this.elements.welcomePopup.classList.add('hidden');
            localStorage.setItem('birdwatcher-welcomed', 'true');
          });
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }

  /**
   * Register event handlers
   * @param {Object} handlers
   */
  on(handlers) {
    const { reviewBtn, backBtn, closePlayerBtn, downloadBtn, deleteBtn, toggleBtn, stopBtn } = this.elements;

    if (reviewBtn && handlers.review) {
      reviewBtn.addEventListener('click', handlers.review);
    }

    if (backBtn && handlers.back) {
      backBtn.addEventListener('click', handlers.back);
    }

    if (closePlayerBtn && handlers.closePlayer) {
      closePlayerBtn.addEventListener('click', handlers.closePlayer);
    }

    if (downloadBtn && handlers.download) {
      downloadBtn.addEventListener('click', handlers.download);
    }

    if (deleteBtn && handlers.delete) {
      deleteBtn.addEventListener('click', handlers.delete);
    }

    const { playerShareBtn, playerDownloadBtn } = this.elements;
    if (playerShareBtn && handlers.playerShare) {
      playerShareBtn.addEventListener('click', handlers.playerShare);
    }
    if (playerDownloadBtn && handlers.download) {
      playerDownloadBtn.addEventListener('click', handlers.download);
    }

    if (toggleBtn && handlers.toggle) {
      toggleBtn.addEventListener('click', handlers.toggle);
    }

    if (stopBtn && handlers.stop) {
      stopBtn.addEventListener('click', handlers.stop);
    }

    // Settings handlers
    const { settingsBtn, closeSettingsBtn, showLogsCheckbox, bitrateSelect } = this.elements;

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openSettings());
    }

    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => this.closeSettings());
    }

    if (showLogsCheckbox) {
      showLogsCheckbox.addEventListener('change', (e) => {
        this.settings.showLogs = e.target.checked;
        this.saveSettings();
      });
    }

    if (bitrateSelect) {
      bitrateSelect.addEventListener('change', (e) => {
        this.settings.bitrate = parseInt(e.target.value, 10);
        this.saveSettings();
        if (handlers.bitrateChange) {
          handlers.bitrateChange(this.settings.bitrate);
        }
      });
    }

    const { sensitivitySelect, tileGridSelect } = this.elements;

    if (sensitivitySelect) {
      sensitivitySelect.addEventListener('change', (e) => {
        this.settings.sensitivity = parseFloat(e.target.value);
        this.saveSettings();
        if (handlers.sensitivityChange) {
          handlers.sensitivityChange(this.settings.sensitivity);
        }
      });
    }

    if (tileGridSelect) {
      tileGridSelect.addEventListener('change', (e) => {
        this.settings.tileGrid = parseInt(e.target.value);
        this.saveSettings();
        if (handlers.tileGridChange) {
          handlers.tileGridChange(this.settings.tileGrid);
        }
      });
    }

    const { maxDurationSelect } = this.elements;
    if (maxDurationSelect) {
      maxDurationSelect.addEventListener('change', (e) => {
        this.settings.maxDuration = parseInt(e.target.value);
        this.saveSettings();
        if (handlers.maxDurationChange) {
          handlers.maxDurationChange(this.settings.maxDuration);
        }
      });
    }

    const { clearCacheBtn } = this.elements;
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', async () => {
        try {
          // Clear all caches
          if ('caches' in window) {
            const names = await caches.keys();
            await Promise.all(names.map(name => caches.delete(name)));
          }
          // Unregister service workers
          if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(reg => reg.unregister()));
          }
          // Hard reload
          window.location.reload(true);
        } catch (e) {
          window.location.reload(true);
        }
      });
    }
  }
}
