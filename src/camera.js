// Camera access wrapper using getUserMedia

import { CONFIG } from './config.js';

/**
 * Initialize camera and return stream
 * @param {MediaStreamConstraints} constraints
 * @returns {Promise<{ stream: MediaStream, video: HTMLVideoElement }>}
 */
export async function initCamera(constraints = CONFIG.CAMERA_CONSTRAINTS) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    const video = document.createElement('video');
    video.srcObject = stream;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;

    // Wait for video to be ready
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => {
        video.play().then(resolve).catch(reject);
      };
      video.onerror = reject;
    });

    return { stream, video };
  } catch (error) {
    throw new CameraError(error.message, error.name);
  }
}

/**
 * Stop camera stream
 * @param {MediaStream} stream
 */
export function stopCamera(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

/**
 * Check if camera is available
 * @returns {Promise<boolean>}
 */
export async function isCameraAvailable() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === 'videoinput');
  } catch {
    return false;
  }
}

/**
 * Get list of available cameras
 * @returns {Promise<MediaDeviceInfo[]>}
 */
export async function getCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter(device => device.kind === 'videoinput');
}

/**
 * Custom error class for camera errors
 */
export class CameraError extends Error {
  constructor(message, name) {
    super(message);
    this.name = 'CameraError';
    this.originalName = name;

    // Provide user-friendly messages
    if (name === 'NotAllowedError') {
      this.userMessage = 'Camera permission denied. Please allow camera access.';
    } else if (name === 'NotFoundError') {
      this.userMessage = 'No camera found. Please connect a camera.';
    } else if (name === 'NotReadableError') {
      this.userMessage = 'Camera is in use by another application.';
    } else {
      this.userMessage = 'Failed to access camera: ' + message;
    }
  }
}
