// Main app orchestration

import { CONFIG } from './config.js';
import { initCamera, stopCamera, CameraError } from './camera.js';
import { MotionDetector } from './motion-detector.js';
import { BirdDetector } from './bird-detector.js';
import { Recorder, generateThumbnail } from './recorder.js';
import { initDB, saveClip, getAllClips, deleteClip, getStorageStats } from './storage.js';
import { UI } from './ui.js';

class App {
  constructor() {
    this.state = 'idle'; // idle, detecting, recording, cooldown, paused
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.previousFrame = null;
    this.currentClip = null;
    this.detectionInterval = null;
    this.recordingStartTime = null;
    this.lastBirdSeenTime = null;
    this.noMoreBirdTimeout = null;
    this.stopReason = null;

    this.ui = new UI();
    this.motionDetector = new MotionDetector();
    this.birdDetector = null; // Initialized after UI
    this.recorder = null;
    this.overlayCanvas = null;
    this.overlayCtx = null;
  }

  async init() {
    try {
      // Initialize UI
      this.ui.init();

      // Initialize storage
      await initDB();

      // Update initial clip count
      await this.updateClipCount();

      // Initialize bird detector with settings
      this.birdDetector = new BirdDetector({
        confidenceThreshold: this.ui.getSensitivity(),
      });

      // Set up UI event handlers
      this.ui.on({
        review: () => this.showReview(),
        back: () => this.showCamera(),
        closePlayer: () => this.ui.closePlayer(),
        download: () => this.downloadCurrentClip(),
        delete: () => this.deleteCurrentClip(),
        toggle: () => this.toggleDetection(),
        stop: () => this.stopRecordingEarly(),
        bitrateChange: (bitrate) => {
          if (this.recorder) {
            this.recorder.setBitrate(bitrate);
          }
        },
        sensitivityChange: (sensitivity) => {
          if (this.birdDetector) {
            this.birdDetector.setSensitivity(sensitivity);
          }
        },
      });

      // Initialize camera
      await this.initCamera();

      // Load bird detection model
      this.ui.setStatus('idle');
      console.log('Loading bird detection model...');
      await this.birdDetector.load();
      console.log('Model loaded, starting detection');

      // Start detection loop
      this.startDetection();

    } catch (error) {
      console.error('Failed to initialize app:', error);

      if (error instanceof CameraError) {
        this.ui.showError(error.userMessage);
      } else {
        this.ui.showError('Failed to initialize: ' + error.message);
      }
    }
  }

  async initCamera() {
    const { stream, video } = await initCamera();
    this.stream = stream;
    this.video = video;

    // Create canvas for frame capture
    this.canvas = document.createElement('canvas');
    this.canvas.width = CONFIG.FRAME_SAMPLE_WIDTH;
    this.canvas.height = CONFIG.FRAME_SAMPLE_HEIGHT;

    // Attach video to UI
    this.ui.attachVideo(video);

    // Initialize detection overlay canvas
    this.overlayCanvas = document.getElementById('detection-overlay');
    this.overlayCtx = this.overlayCanvas.getContext('2d');

    // Initialize recorder with bitrate from settings
    this.recorder = new Recorder(stream, { bitrate: this.ui.getBitrate() });
  }

  updateOverlaySize() {
    if (this.overlayCanvas && this.video) {
      this.overlayCanvas.width = this.video.videoWidth;
      this.overlayCanvas.height = this.video.videoHeight;
    }
  }

  drawDetections(detections) {
    if (!this.overlayCtx || !this.video) return;

    // Update canvas size to match video
    this.updateOverlaySize();

    const ctx = this.overlayCtx;
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);

    detections.forEach(det => {
      const [x, y, width, height] = det.bbox;
      const label = `${det.class} ${Math.round(det.score * 100)}%`;

      // Draw bounding box
      ctx.strokeStyle = '#4ecca3';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // Draw label background
      ctx.font = 'bold 16px sans-serif';
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = '#4ecca3';
      ctx.fillRect(x, y - 24, textWidth + 8, 24);

      // Draw label text
      ctx.fillStyle = '#000';
      ctx.fillText(label, x + 4, y - 6);
    });
  }

  clearDetections() {
    if (this.overlayCtx && this.overlayCanvas) {
      this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
  }

  startDetection() {
    this.detectionInterval = setInterval(
      () => this.detectionLoop(),
      CONFIG.DETECTION_INTERVAL
    );
  }

  stopDetection() {
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  async detectionLoop() {
    // Skip detection when not actively watching
    if (this.state === 'cooldown' || this.state === 'paused' || this.state === 'stopping') {
      this.ui.setBirdStatus('not-detecting');
      this.clearDetections();
      return;
    }

    try {
      // Get full detection results with bounding boxes
      const detections = await this.birdDetector.detect(this.video);
      const hasBird = detections.length > 0;

      // Draw bounding boxes
      if (hasBird) {
        this.drawDetections(detections);
      } else {
        this.clearDetections();
      }

      // During recording, keep checking for birds
      if (this.state === 'recording') {
        if (hasBird) {
          this.ui.setBirdStatus('found');
          this.lastBirdSeenTime = Date.now();
          // Clear any pending stop timeout
          if (this.noMoreBirdTimeout) {
            clearTimeout(this.noMoreBirdTimeout);
            this.noMoreBirdTimeout = null;
          }
        } else {
          this.ui.setBirdStatus('not-found');
          // Start countdown to stop if not already started
          if (!this.noMoreBirdTimeout && this.lastBirdSeenTime) {
            const timeSinceBird = Date.now() - this.lastBirdSeenTime;
            const remainingTime = Math.max(0, CONFIG.NO_BIRD_GRACE_PERIOD - timeSinceBird);
            this.ui.showLog('No bird, auto-stop in ' + Math.round(remainingTime/1000) + 's');
            this.noMoreBirdTimeout = setTimeout(() => {
              if (this.state === 'recording') {
                this.autoStopRecording();
              }
            }, remainingTime);
          }
        }
        return;
      }

      // Normal detection when not recording
      if (hasBird) {
        this.ui.setBirdStatus('found');
        this.lastBirdSeenTime = Date.now();
        this.state = 'detecting';
        this.ui.setStatus('detecting');
        await this.startRecording();
      } else {
        this.ui.setBirdStatus('not-found');
        if (this.state === 'detecting') {
          this.state = 'idle';
          this.ui.setStatus('idle');
        }
      }

    } catch (error) {
      this.ui.showError('Detection error: ' + error.message);
    }
  }

  async startRecording() {
    this.state = 'recording';
    this.stopReason = null;
    this.recordingStartTime = Date.now();

    // Start timer display
    this.ui.startRecordingTimer();

    try {
      // Start indefinite recording - we control when it stops
      const blob = await this.recorder.start({ indefinite: true });

      // === Recording stopped, now clean up ===
      this.ui.showLog('Got blob: ' + (blob ? blob.size + ' bytes' : 'null') + ', reason: ' + this.stopReason);

      // Stop timer and show saving status
      this.ui.stopRecordingTimer();
      this.ui.setStatus('stopping');

      // Clear any pending no-bird timeout
      if (this.noMoreBirdTimeout) {
        clearTimeout(this.noMoreBirdTimeout);
        this.noMoreBirdTimeout = null;
      }

      // Clear detection overlay
      this.clearDetections();

      // Check blob is valid
      if (!blob || blob.size === 0) {
        this.ui.showError('Recording empty - no data captured');
        this.state = 'idle';
        this.ui.setStatus('idle');
        return;
      }

      // Generate thumbnail
      let thumbnail = null;
      this.ui.showLog('Generating thumbnail...');
      try {
        thumbnail = await generateThumbnail(blob);
        this.ui.showLog('Thumbnail done');
      } catch (e) {
        this.ui.showLog('Thumbnail failed: ' + e.message);
        // Continue saving without thumbnail
      }

      // Save clip
      this.ui.showLog('Saving clip...');
      await saveClip(blob, thumbnail);
      await this.updateClipCount();
      this.ui.showLog('Clip saved! (' + Math.round(blob.size / 1024) + ' KB)');

      // Transition to final state
      if (this.stopReason === 'manual') {
        this.state = 'paused';
        this.ui.setStatus('paused');
        this.ui.showLog('Recording complete, now paused');
      } else {
        // Auto stop - brief cooldown then idle
        this.state = 'cooldown';
        this.ui.setStatus('cooldown');
        this.ui.showLog('Recording complete, entering cooldown');
        setTimeout(() => {
          if (this.state === 'cooldown') {
            this.state = 'idle';
            this.ui.setStatus('idle');
          }
        }, CONFIG.COOLDOWN_DURATION);
      }
      this.ui.setBirdStatus('not-detecting');

    } catch (error) {
      this.ui.showError('Save failed: ' + error.message);
      this.ui.stopRecordingTimer();
      if (this.noMoreBirdTimeout) {
        clearTimeout(this.noMoreBirdTimeout);
        this.noMoreBirdTimeout = null;
      }
      this.state = 'idle';
      this.ui.setStatus('idle');
    }
  }

  toggleDetection() {
    if (this.state === 'paused') {
      this.state = 'idle';
      this.ui.setStatus('idle');
      this.ui.showLog('Detection resumed');
    } else if (this.state === 'idle' || this.state === 'detecting') {
      this.state = 'paused';
      this.ui.setStatus('paused');
      this.ui.showLog('Detection paused');
    }
    // Don't allow toggling during recording or cooldown
  }

  // Manual stop button
  stopRecordingEarly() {
    if (this.state !== 'recording') return;
    this.ui.showLog('Manual stop triggered');
    this.state = 'stopping';
    this.ui.setStatus('stopping');
    this.stopReason = 'manual';
    this.recorder.stop(); // This resolves the promise in startRecording
  }

  // Auto stop when bird leaves
  autoStopRecording() {
    if (this.state !== 'recording') {
      this.ui.showError('autoStop: wrong state=' + this.state);
      return;
    }
    this.ui.showLog('Auto stop triggered');
    this.state = 'stopping';
    this.ui.setStatus('stopping');
    this.stopReason = 'auto';
    this.recorder.stop(); // This resolves the promise in startRecording
  }

  async updateClipCount() {
    const stats = await getStorageStats();
    this.ui.setClipCount(stats.clipCount);
  }

  async showReview() {
    // Stop detection
    this.stopDetection();

    // Actually stop camera tracks (turns off camera)
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    this.ui.showView('review');

    const clips = await getAllClips();
    const stats = await getStorageStats();

    this.ui.setStorageInfo(stats);
    this.ui.renderClips(clips, {
      onPlay: (clip) => this.playClip(clip),
      onDownload: (clip) => this.downloadClip(clip),
      onDelete: (clip) => this.deleteClipFromGrid(clip),
    });
  }

  async downloadClip(clip) {
    const ext = clip.blob.type.includes('mp4') ? 'mp4' : 'webm';
    const filename = `bird-${clip.timestamp}.${ext}`;

    // Try Web Share API first (works better on iOS for saving to Photos)
    if (navigator.share && navigator.canShare) {
      const file = new File([clip.blob], filename, { type: clip.blob.type });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Bird clip',
          });
          return;
        } catch (e) {
          // User cancelled or share failed, fall through to download
          if (e.name === 'AbortError') return;
        }
      }
    }

    // Fallback to download link
    const url = URL.createObjectURL(clip.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async deleteClipFromGrid(clip) {
    await deleteClip(clip.id);
    await this.showReview();
    await this.updateClipCount();
  }

  async showCamera() {
    this.ui.showView('camera');

    // Re-initialize camera if it was stopped
    if (!this.stream) {
      try {
        await this.initCamera();
      } catch (error) {
        this.ui.showError('Failed to restart camera: ' + error.message);
        return;
      }
    }

    // Resume detection
    if (!this.detectionInterval) {
      this.startDetection();
    }
  }

  playClip(clip) {
    this.currentClip = clip;
    this.ui.playClip(clip.blob);
  }

  async downloadCurrentClip() {
    if (!this.currentClip) return;
    await this.downloadClip(this.currentClip);
  }

  async deleteCurrentClip() {
    if (!this.currentClip) return;

    await deleteClip(this.currentClip.id);
    this.currentClip = null;
    this.ui.closePlayer();

    // Refresh review view
    await this.showReview();
    await this.updateClipCount();
  }

  destroy() {
    this.stopDetection();
    if (this.stream) {
      stopCamera(this.stream);
    }
  }
}

// Initialize app when DOM is ready
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
      app.destroy();
    });

    // Expose for debugging
    window.birdwatchingApp = app;
  });
}

export { App };
