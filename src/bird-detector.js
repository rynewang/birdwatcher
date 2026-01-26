// TensorFlow.js COCO-SSD wrapper for bird detection

import { CONFIG } from './config.js';

export class BirdDetector {
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? CONFIG.BIRD_CONFIDENCE_THRESHOLD;
    this.targetClasses = options.targetClasses ?? CONFIG.DETECTION_CLASSES;
    this.zoom = options.zoom ?? 1;
    this.model = null;
    this.isLoading = false;

    // Offscreen canvas for zoom cropping
    this.zoomCanvas = null;
    this.zoomCtx = null;
  }

  /**
   * Set confidence threshold (sensitivity)
   * @param {number} threshold
   */
  setSensitivity(threshold) {
    this.confidenceThreshold = threshold;
  }

  /**
   * Set detection zoom level
   * @param {number} zoom
   */
  setZoom(zoom) {
    this.zoom = zoom;
  }

  /**
   * Load the COCO-SSD model
   * @returns {Promise<void>}
   */
  async load() {
    if (this.model) return;
    if (this.isLoading) {
      // Wait for existing load to complete
      while (this.isLoading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isLoading = true;

    try {
      // cocoSsd is loaded from CDN and available globally
      if (typeof cocoSsd === 'undefined') {
        throw new Error('COCO-SSD library not loaded. Include it via CDN.');
      }

      this.model = await cocoSsd.load();
      console.log('COCO-SSD model loaded');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Detect objects in video frame
   * @param {HTMLVideoElement|HTMLCanvasElement|HTMLImageElement} source
   * @param {{ x: number, y: number }} offset - Normalized offset (0-1) for crop center
   * @returns {Promise<Array<{ class: string, score: number, bbox: number[] }>>}
   */
  async detect(source, offset = { x: 0.5, y: 0.5 }) {
    if (!this.model) {
      throw new Error('Model not loaded. Call load() first.');
    }

    // Get source dimensions
    const srcWidth = source.videoWidth || source.width;
    const srcHeight = source.videoHeight || source.height;

    let detectSource = source;
    let cropOffsetX = 0;
    let cropOffsetY = 0;

    // Apply zoom by cropping at specified offset
    if (this.zoom > 1) {
      const cropWidth = srcWidth / this.zoom;
      const cropHeight = srcHeight / this.zoom;

      // Calculate crop position from normalized offset (0-1)
      // Clamp so crop region stays within frame
      const maxOffsetX = srcWidth - cropWidth;
      const maxOffsetY = srcHeight - cropHeight;
      cropOffsetX = offset.x * maxOffsetX;
      cropOffsetY = offset.y * maxOffsetY;

      // Create/resize offscreen canvas
      if (!this.zoomCanvas) {
        this.zoomCanvas = document.createElement('canvas');
        this.zoomCtx = this.zoomCanvas.getContext('2d');
      }
      this.zoomCanvas.width = cropWidth;
      this.zoomCanvas.height = cropHeight;

      // Draw cropped region
      this.zoomCtx.drawImage(
        source,
        cropOffsetX, cropOffsetY, cropWidth, cropHeight,  // source rect
        0, 0, cropWidth, cropHeight                        // dest rect
      );

      detectSource = this.zoomCanvas;
    }

    const predictions = await this.model.detect(detectSource);

    // Filter and adjust bbox coordinates back to original frame
    return this.filterPredictions(predictions, cropOffsetX, cropOffsetY);
  }

  /**
   * Filter predictions for birds above confidence threshold
   * @param {Array} predictions - Raw COCO-SSD predictions
   * @param {number} offsetX - X offset to add to bbox (for zoom)
   * @param {number} offsetY - Y offset to add to bbox (for zoom)
   * @returns {Array}
   */
  filterPredictions(predictions, offsetX = 0, offsetY = 0) {
    return predictions.filter(pred =>
      this.targetClasses.includes(pred.class) &&
      pred.score >= this.confidenceThreshold
    ).map(pred => ({
      class: pred.class,
      score: pred.score,
      bbox: [
        pred.bbox[0] + offsetX,  // x
        pred.bbox[1] + offsetY,  // y
        pred.bbox[2],            // width
        pred.bbox[3],            // height
      ],
    }));
  }

  /**
   * Check if any birds were detected
   * @param {HTMLVideoElement|HTMLCanvasElement|HTMLImageElement} source
   * @returns {Promise<boolean>}
   */
  async hasBird(source) {
    const detections = await this.detect(source);
    return detections.length > 0;
  }

  /**
   * Check if model is ready
   * @returns {boolean}
   */
  isReady() {
    return this.model !== null;
  }
}

// For testing - create detector with mock model
export function createMockBirdDetector(mockModel) {
  const detector = new BirdDetector();
  detector.model = mockModel;
  return detector;
}
