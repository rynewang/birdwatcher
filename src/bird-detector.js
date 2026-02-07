// TensorFlow.js COCO-SSD wrapper for bird detection

import { CONFIG } from './config.js';

export class BirdDetector {
  constructor(options = {}) {
    this.confidenceThreshold = options.confidenceThreshold ?? CONFIG.BIRD_CONFIDENCE_THRESHOLD;
    this.targetClasses = options.targetClasses ?? CONFIG.DETECTION_CLASSES;
    this.tileGrid = options.tileGrid ?? CONFIG.DETECTION_TILE_GRID;
    this.tileOverlap = options.tileOverlap ?? CONFIG.DETECTION_TILE_OVERLAP;
    this.nmsIouThreshold = options.nmsIouThreshold ?? CONFIG.NMS_IOU_THRESHOLD;
    this.model = null;
    this.isLoading = false;

    // Offscreen canvas for tiles
    this.tileCanvas = null;
    this.tileCtx = null;
  }

  /**
   * Set confidence threshold (sensitivity)
   * @param {number} threshold
   */
  setSensitivity(threshold) {
    this.confidenceThreshold = threshold;
  }

  /**
   * Load the COCO-SSD model
   * @returns {Promise<void>}
   */
  async load() {
    if (this.model) return;
    if (this.isLoading) {
      while (this.isLoading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    this.isLoading = true;

    try {
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
   * Detect objects using sliding window over the full frame.
   * Splits the frame into overlapping tiles, runs detection on each,
   * then merges results with non-max suppression.
   * @param {HTMLVideoElement|HTMLCanvasElement|HTMLImageElement} source
   * @returns {Promise<Array<{ class: string, score: number, bbox: number[] }>>}
   */
  async detect(source) {
    if (!this.model) {
      throw new Error('Model not loaded. Call load() first.');
    }

    const srcWidth = source.videoWidth || source.width;
    const srcHeight = source.videoHeight || source.height;

    // Single tile (grid=1): just run on the whole frame
    if (this.tileGrid <= 1) {
      const predictions = await this.model.detect(source);
      return this.filterPredictions(predictions);
    }

    // Multi-tile sliding window
    const grid = this.tileGrid;
    const overlap = this.tileOverlap;

    // Tile dimensions with overlap
    const tileW = Math.ceil(srcWidth / (grid - (grid - 1) * overlap));
    const tileH = Math.ceil(srcHeight / (grid - (grid - 1) * overlap));
    const stepX = Math.floor(tileW * (1 - overlap));
    const stepY = Math.floor(tileH * (1 - overlap));

    // Create/resize offscreen canvas for tiles
    if (!this.tileCanvas) {
      this.tileCanvas = document.createElement('canvas');
      this.tileCtx = this.tileCanvas.getContext('2d');
    }
    this.tileCanvas.width = tileW;
    this.tileCanvas.height = tileH;

    const allDetections = [];

    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        const sx = Math.min(col * stepX, srcWidth - tileW);
        const sy = Math.min(row * stepY, srcHeight - tileH);

        // Draw tile
        this.tileCtx.drawImage(
          source,
          sx, sy, tileW, tileH,
          0, 0, tileW, tileH
        );

        const predictions = await this.model.detect(this.tileCanvas);

        // Map bbox back to full-frame coordinates
        for (const pred of predictions) {
          if (this.targetClasses.includes(pred.class) &&
              pred.score >= this.confidenceThreshold) {
            allDetections.push({
              class: pred.class,
              score: pred.score,
              bbox: [
                pred.bbox[0] + sx,
                pred.bbox[1] + sy,
                pred.bbox[2],
                pred.bbox[3],
              ],
            });
          }
        }
      }
    }

    // Merge overlapping detections
    return this.nms(allDetections);
  }

  /**
   * Non-max suppression to merge overlapping detections from tiles
   * @param {Array} detections
   * @returns {Array}
   */
  nms(detections) {
    if (detections.length === 0) return [];

    // Sort by score descending
    detections.sort((a, b) => b.score - a.score);

    const kept = [];
    const suppressed = new Set();

    for (let i = 0; i < detections.length; i++) {
      if (suppressed.has(i)) continue;
      kept.push(detections[i]);

      for (let j = i + 1; j < detections.length; j++) {
        if (suppressed.has(j)) continue;
        if (detections[i].class === detections[j].class &&
            this.iou(detections[i].bbox, detections[j].bbox) > this.nmsIouThreshold) {
          suppressed.add(j);
        }
      }
    }

    return kept;
  }

  /**
   * Intersection over union of two bboxes [x, y, w, h]
   */
  iou(a, b) {
    const ax1 = a[0], ay1 = a[1], ax2 = a[0] + a[2], ay2 = a[1] + a[3];
    const bx1 = b[0], by1 = b[1], bx2 = b[0] + b[2], by2 = b[1] + b[3];

    const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
    const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);

    const intersection = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
    const union = a[2] * a[3] + b[2] * b[3] - intersection;

    return union > 0 ? intersection / union : 0;
  }

  /**
   * Filter predictions for target classes above confidence threshold
   * @param {Array} predictions - Raw COCO-SSD predictions
   * @returns {Array}
   */
  filterPredictions(predictions) {
    return predictions.filter(pred =>
      this.targetClasses.includes(pred.class) &&
      pred.score >= this.confidenceThreshold
    ).map(pred => ({
      class: pred.class,
      score: pred.score,
      bbox: [...pred.bbox],
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
