// Pixel differencing motion detection

import { CONFIG } from './config.js';

export class MotionDetector {
  constructor(options = {}) {
    this.threshold = options.threshold ?? CONFIG.MOTION_THRESHOLD;
    this.pixelPercent = options.pixelPercent ?? CONFIG.MOTION_PIXEL_PERCENT;
    this.sampleSize = options.sampleSize ?? CONFIG.MOTION_SAMPLE_SIZE;
  }

  /**
   * Detect motion between two frames
   * @param {ImageData} currentFrame - Current frame ImageData
   * @param {ImageData} previousFrame - Previous frame ImageData
   * @returns {{ detected: boolean, changedPercent: number, changedPixels: number }}
   */
  detect(currentFrame, previousFrame) {
    if (!currentFrame || !previousFrame) {
      return { detected: false, changedPercent: 0, changedPixels: 0 };
    }

    if (currentFrame.width !== previousFrame.width ||
        currentFrame.height !== previousFrame.height) {
      return { detected: false, changedPercent: 0, changedPixels: 0 };
    }

    const current = currentFrame.data;
    const previous = previousFrame.data;
    const totalPixels = current.length / 4;

    // Sample pixels for performance
    const step = Math.max(1, Math.floor(totalPixels / this.sampleSize));
    let changedPixels = 0;
    let sampledPixels = 0;

    for (let i = 0; i < current.length; i += step * 4) {
      const rDiff = Math.abs(current[i] - previous[i]);
      const gDiff = Math.abs(current[i + 1] - previous[i + 1]);
      const bDiff = Math.abs(current[i + 2] - previous[i + 2]);

      // Average difference across RGB channels
      const avgDiff = (rDiff + gDiff + bDiff) / 3;

      if (avgDiff > this.threshold) {
        changedPixels++;
      }
      sampledPixels++;
    }

    const changedPercent = (changedPixels / sampledPixels) * 100;
    const detected = changedPercent >= this.pixelPercent;

    return {
      detected,
      changedPercent,
      changedPixels,
      sampledPixels,
    };
  }

  /**
   * Create ImageData from a video element
   * @param {HTMLVideoElement} video
   * @param {HTMLCanvasElement} canvas
   * @returns {ImageData}
   */
  static captureFrame(video, canvas) {
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
}
