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

        this.mediaRecorder.onstop = async () => {
          this.isRecording = false;
          if (this.chunks.length === 0) {
            reject(new Error('No data recorded - chunks empty'));
            return;
          }
          let blob = new Blob(this.chunks, { type: mimeType });
          if (blob.size === 0) {
            reject(new Error('Recording produced empty file'));
            return;
          }
          this.chunks = [];

          // Fix webm duration metadata if needed
          if (mimeType.includes('webm') && this._startTime) {
            const duration = Date.now() - this._startTime;
            try {
              blob = await fixWebmDuration(blob, duration);
            } catch (e) {
              console.warn('Failed to fix webm duration:', e);
              // Continue with unfixed blob
            }
          }

          resolve(blob);
        };

        this.mediaRecorder.onerror = (event) => {
          this.isRecording = false;
          reject(event.error || new Error('MediaRecorder error'));
        };

        // Track start time for duration fix
        this._startTime = Date.now();

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
 * Fix WebM duration metadata.
 * MediaRecorder produces WebM files without a duration in the Segment>Info header.
 * This injects the duration so players can show length and allow seeking.
 *
 * Approach: Find the EBML Info element (ID 0x1549A966), then look for an existing
 * Duration element (ID 0x4489) or inject one. The duration is stored as a float64.
 */
async function fixWebmDuration(blob, durationMs) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);

  // Find Segment>Info element (EBML ID: 0x15 0x49 0xA9 0x66)
  const infoId = [0x15, 0x49, 0xA9, 0x66];
  let infoPos = -1;
  for (let i = 0; i < Math.min(bytes.length, 4096); i++) {
    if (bytes[i] === infoId[0] && bytes[i+1] === infoId[1] &&
        bytes[i+2] === infoId[2] && bytes[i+3] === infoId[3]) {
      infoPos = i;
      break;
    }
  }

  if (infoPos === -1) return blob; // Can't find Info, return as-is

  // Find Duration element (ID: 0x44 0x89) within Info
  const durId = [0x44, 0x89];
  let durPos = -1;
  // Search within a reasonable range after Info start
  for (let i = infoPos; i < Math.min(infoPos + 256, bytes.length - 10); i++) {
    if (bytes[i] === durId[0] && bytes[i+1] === durId[1]) {
      durPos = i;
      break;
    }
  }

  if (durPos === -1) {
    // No existing Duration element — can't safely inject without rewriting sizes
    // Just return the original blob
    return blob;
  }

  // Duration element: 0x44 0x89 [size] [float64 value]
  // Size byte should be 0x88 (8 bytes, float64)
  const sizePos = durPos + 2;
  const size = bytes[sizePos];
  if ((size & 0x80) === 0 || (size & 0x7F) !== 8) {
    // Unexpected size encoding, bail
    return blob;
  }

  // Write duration as float64 in milliseconds (WebM timescale is typically 1ms)
  const dataPos = sizePos + 1;
  const view = new DataView(buf);
  view.setFloat64(dataPos, durationMs, false); // big-endian

  return new Blob([buf], { type: blob.type });
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
      // Seek to 1s to avoid dark first frame (camera warmup)
      video.currentTime = Math.min(1, video.duration || 1);
    };

    video.onseeked = () => {
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
