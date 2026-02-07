// Configuration constants for bird detection PWA

export const CONFIG = {
  // Motion detection
  MOTION_THRESHOLD: 30,           // Pixel difference threshold (0-255)
  MOTION_PIXEL_PERCENT: 0.5,      // Percent of pixels that must change to trigger motion
  MOTION_SAMPLE_SIZE: 100,        // Number of pixels to sample for motion detection

  // Bird detection
  BIRD_CONFIDENCE_THRESHOLD: 0.5, // Minimum confidence for bird detection (0-1)
  DETECTION_CLASSES: ['bird'],    // COCO-SSD classes to detect
  DETECTION_TILE_GRID: 2,         // NxN grid of overlapping tiles (1 = no tiling, 2 = 2x2)
  DETECTION_TILE_OVERLAP: 0.25,   // Fraction of overlap between adjacent tiles
  NMS_IOU_THRESHOLD: 0.5,         // IoU threshold for non-max suppression

  // Recording
  RECORDING_DURATION: 10000,      // Recording duration in ms (10 seconds)
  NO_BIRD_GRACE_PERIOD: 10000,    // Stop recording after no bird for this long (10 seconds)
  COOLDOWN_DURATION: 2000,        // Brief cooldown after recording before watching again
  VIDEO_MIME_TYPE: 'video/webm;codecs=vp9',

  // Camera
  CAMERA_CONSTRAINTS: {
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  },

  // Storage
  DB_NAME: 'birdwatching-db',
  DB_VERSION: 1,
  STORE_NAME: 'clips',

  // Detection loop
  DETECTION_INTERVAL: 500,        // Ms between detection cycles
  FRAME_SAMPLE_WIDTH: 320,        // Width to sample frames for motion detection
  FRAME_SAMPLE_HEIGHT: 240,       // Height to sample frames for motion detection
};
