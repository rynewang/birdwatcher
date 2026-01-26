// MediaRecorder wrapper for capturing video clips

import { CONFIG } from './config.js';

export class Recorder {
  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType ?? CONFIG.VIDEO_MIME_TYPE;
    this.duration = options.duration ?? CONFIG.RECORDING_DURATION;
    this.bitrate = options.bitrate ?? 2500000;

    this.mediaRecorder = null;
    this.chunks = [];
    this.isRecording = false;
    this.recordingPromise = null;
  }

  /**
   * Update bitrate for next recording
   * @param {number} bitrate
   */
  setBitrate(bitrate) {
    this.bitrate = bitrate;
  }

  /**
   * Start recording
   * @param {Object} options
   * @param {boolean} options.indefinite - If true, don't auto-stop
   * @returns {Promise<Blob>} Resolves with video blob when recording completes
   */
  start({ indefinite = false } = {}) {
    if (this.isRecording) {
      return this.recordingPromise;
    }

    this.chunks = [];
    this.isRecording = true;

    // Find supported mime type
    const mimeType = this.getSupportedMimeType();

    this.recordingPromise = new Promise((resolve, reject) => {
      try {
        this.mediaRecorder = new MediaRecorder(this.stream, {
          mimeType,
          videoBitsPerSecond: this.bitrate,
        });

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.chunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          this.isRecording = false;
          if (this.chunks.length === 0) {
            reject(new Error('No data recorded - chunks empty'));
            return;
          }
          const blob = new Blob(this.chunks, { type: mimeType });
          if (blob.size === 0) {
            reject(new Error('Recording produced empty file'));
            return;
          }
          this.chunks = [];
          resolve(blob);
        };

        this.mediaRecorder.onerror = (event) => {
          this.isRecording = false;
          reject(event.error || new Error('MediaRecorder error'));
        };

        // Request data every second to avoid losing chunks
        this.mediaRecorder.start(1000);

        // Auto-stop after duration (unless indefinite)
        if (!indefinite) {
          setTimeout(() => {
            if (this.isRecording) {
              this.stop();
            }
          }, this.duration);
        }

      } catch (error) {
        this.isRecording = false;
        reject(error);
      }
    });

    return this.recordingPromise;
  }

  /**
   * Stop recording early
   */
  stop() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
    }
  }

  /**
   * Get supported mime type
   * Prefer MP4 for better iOS/Photos compatibility
   * @returns {string}
   */
  getSupportedMimeType() {
    const types = [
      'video/mp4',
      'video/mp4;codecs=h264',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log('Using video format:', type);
        return type;
      }
    }

    return '';
  }

  /**
   * Check if currently recording
   * @returns {boolean}
   */
  getIsRecording() {
    return this.isRecording;
  }
}

/**
 * Generate a thumbnail from video blob
 * @param {Blob} videoBlob
 * @returns {Promise<string>} Base64 data URL of thumbnail
 */
export async function generateThumbnail(videoBlob) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Timeout after 5 seconds
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Thumbnail timeout'));
    }, 5000);

    video.onloadeddata = () => {
      clearTimeout(timeout);
      canvas.width = 160;
      canvas.height = 90;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const thumbnail = canvas.toDataURL('image/jpeg', 0.7);
      URL.revokeObjectURL(video.src);
      resolve(thumbnail);
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video for thumbnail'));
    };

    video.src = URL.createObjectURL(videoBlob);
    video.muted = true;
    video.playsInline = true;
    video.load(); // Explicitly trigger load
  });
}
